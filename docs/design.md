# Yi-Lin 设计文档

Coding Agent 聊天应用。Server 运行完整 Agent Loop，Client 只做展示和交互。

---

## 1. 架构

```
┌───────────────┐   Socket.IO    ┌──────────────────┐
│  Vue 3 Client │◄─────────────►│  Hono Server       │
│               │  chat-run /    │  + Socket.IO       │
│  展示消息      │  message.delta│                    │
│  发送输入      │  tool.* /     │  Agent Loop        │
│  管理配置      │  approval.*   │  ┌─ callLLM ──┐   │
│               │               │  │ parseTool  │   │
│               │     HTTP      │  │ executeTool│   │
│               │◄─────────────►│  └────────────┘   │
│               │  GET/PUT/POST │                    │
│               │  /api/*       │  SQLite / JSON /   │
│               │               │  Markdown files    │
└───────────────┘               └──────────────────┘
```

## 2. 数据模型

### Session (SQLite)

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL DEFAULT '',
  model TEXT,
  provider_id TEXT,
  workspace TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,            -- 'user' | 'assistant' | 'tool'
  content TEXT NOT NULL DEFAULT '',
  reasoning_content TEXT,        -- 思考过程内容
  tool_name TEXT,
  tool_input TEXT,               -- JSON
  tool_output TEXT,              -- JSON
  tool_status TEXT,              -- 'running' | 'done' | 'error'
  created_at INTEGER NOT NULL
);
```

### Provider (JSON 文件)

`data/providers.json`:

```json
[
  {
    "id": "opencode-go",
    "name": "OpenCode Go",
    "base_url": "https://opencode.ai/zen/go/v1/",
    "api_key": "",
    "models": [
      { "id": "deepseek-v4-flash", "name": "DeepSeek V4 Flash" }
    ]
  }
]
```

### Character (分片存储)

**元数据** → `data/characters.json`：

```typescript
interface CharacterRecord {
  id: string
  name: string
  description?: string
  avatar?: string           // emoji / URL
  color?: string            // 显示色
  memory?: CharacterMemory
  model?: string
  provider?: string
  tools?: Record<string, boolean>
  permissions?: CharacterPermission
  maxSteps?: number
  mode?: 'primary' | 'subagent' | 'all'
  enabled?: boolean
  builtIn?: boolean
  createdAt?: number
  updatedAt?: number
}

interface CharacterMemory {
  enabled: boolean
  selfEvolution?: boolean
  charLimit?: number          // 默认 2200
  maxEntries?: number
}

interface CharacterPermission {
  edit?: 'ask' | 'allow' | 'deny'
  bash?: 'ask' | 'allow' | 'deny'
  webfetch?: 'allow' | 'deny'
}
```

**内容** → `data/characters/{id}/*.md`：

```
data/characters/{id}/
├── soul.md       -- 角色身份/指令
├── user.md       -- 用户画像/偏好
└── memory.md     -- 长期记忆（运行中更新）
```

API 层在读写时自动合并/拆分：`GET /api/characters/:id` 返回内容字段（soul/userProfile/memoryContent），`POST/PUT` 自动将内容字段写入 `.md` 文件，元数据写入 `characters.json`。

### 聊天默认值（localStorage）

```typescript
// localStorage key: 'yi-lin-chat-defaults'
{
  character_id: string
  provider_id: string
  model: string
  workspace: string
  activeSessionId: string
}
```

每次切换 character/provider/model/workspace 时自动持久化，页面加载时从 localStorage 恢复。

## 3. Client 组件

```
App.vue
└── ChatPage.vue
    ├── Sidebar.vue
    │   ├── SessionList.vue       -- 会话列表，点击切换
    │   └── SettingsBtn.vue       -- 左下角 ⚙️ 按钮 → SettingsModal
    ├── ChatArea.vue
    │   ├── ConfigBar.vue         -- Character 下拉 / Model 下拉 / 工作路径
    │   ├── MessageList.vue       -- 消息列表
    │   │   └── MessageItem.vue   -- 用户/assistant/tool 卡片
    │   └── ChatInput.vue         -- 输入框 + 发送
    ├── SettingsModal.vue         -- Provider CRUD 弹窗
    └── RoleSettings.vue          -- 角色详情配置（全屏覆盖）
        ├── CharacterSelector     -- 左侧角色列表（搜索/创建/编辑/删除）
        └── 右侧详情面板
            ├── 基础              -- 头像/颜色/名称/描述/启用/Soul/UserProfile/权限
            ├── 记忆              -- 记忆启用/自进化/字数限制/记忆内容编辑
            ├── 技能              -- (占位)
            └── 知识              -- (占位)
```

### RoleSettings 子标签

| 标签 | 功能 |
|------|------|
| 基础 | 左栏：头像(emoji)+颜色选择；右栏：名称+描述+启用开关+自进化开关，Soul/UserProfile 卡片式内联编辑，工具权限（edit/bash/webfetch） |
| 记忆 | 记忆启用开关+自进化开关+字数限制(默认2200)，记忆内容内联编辑（仅在启用时显示） |
| 技能 | 占位 |
| 知识 | 占位 |

### 自我进化（Self-Evolution）

- 角色级别配置字段（非 UI 门控）
- 作用于记忆模块：启用时 Agent 可自动更新 memory.md
- 字数限制（charLimit）控制记忆最大长度，默认 2200

## 4. Agent Loop

```
chat-run
  │
  ▼ 更新 Session（character_id / model / workspace 从请求同步）
  ▼ 构建 System Prompt
  ├─ ## Character (soul.md)     -- 角色设定
  ├─ ## User Info (user.md)     -- 用户画像
  └─ ## Memory (memory.md)      -- 长期记忆
  │
  ▼ 加载历史消息（从 SQLite）
  ├─ system prompt (role: system)
  └─ 消息历史（role: user/assistant/tool）
  │
  ▼ callLLM(stream=true) ────► message.delta (to client)
  │
  ▼ parseToolCalls()
  ├─ 无 tool_call → run.completed
  └─ 有 tool_call ──► 逐个执行
        │
        ▼ checkPermission(tool_name, character)
        ├─ 'deny' → 直接拒绝，加入"权限不足"消息
        ├─ 'ask'  → emit approval.requested → 等待用户响应
        │           ├─ allow → 执行
        │           └─ deny  → 拒绝
        └─ 'allow' → 直接执行
        │
        ▼ executeTool()
        ├─ emit tool.started
        ├─ 执行工具（限 workspace 内）
        └─ emit tool.completed
        │
        ▼ 结果追加到消息列表 → loop callLLM
```

## 5. 工具定义

所有文件操作限制在 `workspace` 目录内。路径解析规则：
- 相对路径相对于 workspace 根目录解析
- 路径中包含 `..` 或符号链接逃逸 workspace 的，触发审批询问（同 `ask` 级别）
- bash 命令的工作目录设为 workspace 根目录

| 工具 | 参数 | 行为 |
|------|------|------|
| `read` | `{ path }` | 读文件内容 |
| `write` | `{ path, content }` | 写文件 |
| `edit` | `{ path, oldString, newString }` | 精确字符串替换编辑 |
| `bash` | `{ command }` | 执行 shell 命令 |
| `grep` | `{ pattern, path? }` | 搜索文件内容 |
| `glob` | `{ pattern }` | 文件名模式匹配 |
| `webfetch` | `{ url }` | 获取网页内容 |
| `websearch` | `{ query }` | 搜索网络（默认 DuckDuckGo，可配置 `SEARCH_API_URL` 环境变量） |

## 6. Permission

```typescript
type PermissionLevel = 'allow' | 'ask' | 'deny'

interface CharacterPermission {
  edit?: PermissionLevel      // read/write/edit/grep/glob
  bash?: PermissionLevel      // bash/sh
  webfetch?: 'allow' | 'deny' // webfetch, websearch
}
```

| Level | 行为 |
|-------|------|
| `allow` | 自动执行，结果推 client |
| `ask` | 暂停 loop，推 `approval.requested`，等待 client 响应 |
| `deny` | 直接拒绝，错误提示返回 LLM |

### 内置 Character 预设

| ID | edit | bash | webfetch |
|----|------|------|----------|
| general | ask | deny | allow |
| coder | ask | ask | allow |
| reviewer | deny | deny | deny |
| explorer | allow | deny | allow |

## 7. Socket.IO 协议

### Client → Server

| 事件 | Payload | 说明 |
|------|---------|------|
| `chat-run` | `{ session_id, character_id, input, model?, provider_id?, workspace?, thinking?, reasoning_effort? }` | 发送消息，启动 agent |
| `abort` | `{ session_id }` | 中止当前运行 |
| `approval.respond` | `{ session_id, tool_call_id, choice: 'allow'\|'deny' }` | 审批响应 |

### Server → Client

| 事件 | Payload | 说明 |
|------|---------|------|
| `run.started` | `{ session_id }` | 运行开始 |
| `message.delta` | `{ session_id, delta }` | 流式文本 |
| `message.reasoning` | `{ session_id, delta }` | 思考过程流式文本 |
| `tool.started` | `{ session_id, tool_call_id, tool_name, tool_input }` | 工具执行开始 |
| `tool.completed` | `{ session_id, tool_call_id, tool_name, tool_output, duration_ms }` | 工具完成 |
| `approval.requested` | `{ session_id, tool_call_id, tool_name, description }` | 请求审批 |
| `run.completed` | `{ session_id, usage: { input_tokens, output_tokens } }` | 运行完成 |
| `run.failed` | `{ session_id, error }` | 运行失败 |

## 8. HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/providers` | 列出所有 provider |
| POST | `/api/providers` | 创建 provider |
| PUT | `/api/providers/:id` | 更新 provider |
| DELETE | `/api/providers/:id` | 删除 provider |
| GET | `/api/characters` | 列出所有 character（仅元数据） |
| GET | `/api/characters/:id` | 获取 character 详情（含 soul/userProfile/memoryContent） |
| POST | `/api/characters` | 创建 character（body 中 soul/userProfile/memoryContent 写入 .md） |
| PUT | `/api/characters/:id` | 更新 character |
| DELETE | `/api/characters/:id` | 删除 character（内置角色不可删除） |
| GET | `/api/sessions` | 列出会话 |
| POST | `/api/sessions` | 创建会话 |
| DELETE | `/api/sessions/:id` | 删除会话 |
| GET | `/api/sessions/:id/messages` | 获取消息列表 |

## 9. 技术栈

- **前端**: Vue 3 + Vite + TypeScript + Socket.IO Client + Pinia + vue-i18n
- **后端**: Node.js + Hono + Socket.IO + better-sqlite3
- **存储**: SQLite (sessions/messages) + JSON (providers/characters metadata) + MD files (character content)

## 10. 文件结构

```
Yi-Lin/
├── apps/
│   ├── client/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.ts
│   │       ├── App.vue
│   │       ├── api/
│   │       │   ├── client.ts         -- HTTP fetch wrapper
│   │       │   ├── socket.ts         -- Socket.IO connection
│   │       │   ├── providers.ts
│   │       │   ├── sessions.ts
│   │       │   └── characters.ts     -- Character + CharacterConfig types, CRUD
│   │       ├── stores/
│   │       │   ├── chat.ts           -- session + messages + localStorage persistence
│   │       │   ├── providers.ts
│   │       │   └── characters.ts     -- character CRUD store
│   │       ├── i18n/
│   │       │   ├── en.json
│   │       │   └── zh.json
│   │       ├── types/
│   │       │   └── ...               -- shared types
│   │       └── components/
│   │           ├── ChatPage.vue
│   │           ├── Sidebar.vue
│   │           ├── SessionList.vue
│   │           ├── SettingsBtn.vue
│   │           ├── SettingsModal.vue
│   │           ├── ChatArea.vue
│   │           ├── ConfigBar.vue
│   │           ├── CharacterSelector.vue
│   │           ├── MessageList.vue
│   │           ├── MessageItem.vue
│   │           ├── ChatInput.vue
│   │           ├── ApprovalDialog.vue
│   │           └── settings/
│   │               └── RoleSettings.vue   -- 全屏角色配置（子标签页布局）
│   └── server/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts              -- Hono + Socket.IO + seed
│           ├── agent/
│           │   ├── loop.ts           -- agent run loop（含 system prompt 组装）
│           │   ├── tools.ts          -- tool executor
│           │   └── llm.ts            -- LLM streaming client（OpenAI-compatible）
│           ├── db/
│           │   ├── schema.ts         -- SQLite schema init
│           │   ├── sessionStore.ts   -- session + message CRUD
│           │   ├── providerStore.ts  -- JSON provider store
│           │   └── characterStore.ts -- CharacterRecord + metadata CRUD + built-in seeds
│           ├── character/
│           │   └── store.ts          -- characterContentStore (read/write .md + fallback)
│           ├── routes/
│           │   ├── providers.ts
│           │   ├── sessions.ts
│           │   └── characters.ts     -- 拆分 soul/userProfile/memoryContent 到 .md
│           └── ws/
│               └── chat.ts           -- Socket.IO event handlers
```
