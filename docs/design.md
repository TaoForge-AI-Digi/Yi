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
│               │  GET/POST     │                    │
│               │  /api/*       │  SQLite / JSON     │
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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,            -- 'user' | 'assistant' | 'tool'
  content TEXT NOT NULL DEFAULT '',
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

### Character (文件系统)

```
data/characters/{id}/
├── soul.md       -- 角色身份/指令
├── user.md       -- 用户画像/偏好
└── memory.md     -- 长期记忆（运行中更新）
```

System prompt 组装: `soul.md` + `\n\n` + `user.md` + `\n\n` + `memory.md`

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
    └── SettingsModal.vue         -- Provider CRUD 弹窗
```

## 4. Agent Loop

```
chat-run
  │
  ▼ buildMessages()
  ├─ system prompt = soul + user + memory + workspace
  └─ 历史消息从 SQLite 加载
  │
  ▼ callLLM(stream=true) ────► message.delta (to client)
  │
  ▼ parseToolCalls()
  ├─ 无 tool_call → run.completed
  └─ 有 tool_call ──► 逐个执行
        │
        ▼ checkPermission(tool_name)
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
| `bash` | `{ command }` | 执行 shell 命令 |
| `grep` | `{ pattern, path? }` | 搜索文件内容 |
| `glob` | `{ pattern }` | 文件名模式匹配 |

## 6. Permission

```typescript
type PermissionLevel = 'allow' | 'ask' | 'deny'

interface Character {
  permissions: {
    files: PermissionLevel   // read/write/grep/glob
    bash: PermissionLevel    // bash/sh
  }
}
```

| Level | 行为 |
|-------|------|
| `allow` | 自动执行，结果推 client |
| `ask` | 暂停 loop，推 `approval.requested`，等待 client 响应 |
| `deny` | 直接拒绝，错误提示返回 LLM |

### 内置 Character 预设

| ID | files | bash |
|----|-------|------|
| general | allow | deny |
| coder | allow | ask |
| reviewer | deny | deny |
| explorer | allow | deny |

## 7. Socket.IO 协议

### Client → Server

| 事件 | Payload | 说明 |
|------|---------|------|
| `chat-run` | `{ session_id, input }` | 发送消息，启动 agent |
| `abort` | `{ session_id }` | 中止当前运行 |
| `approval.respond` | `{ session_id, tool_call_id, choice: 'allow'\|'deny' }` | 审批响应 |

### Server → Client

| 事件 | Payload | 说明 |
|------|---------|------|
| `run.started` | `{ session_id }` | 运行开始 |
| `message.delta` | `{ session_id, delta }` | 流式文本 |
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
| GET | `/api/characters` | 列出所有 character |
| GET | `/api/sessions` | 列出会话 |
| POST | `/api/sessions` | 创建会话 |
| DELETE | `/api/sessions/:id` | 删除会话 |
| GET | `/api/sessions/:id/messages` | 获取消息列表 |

## 9. 技术栈

- **前端**: Vue 3 + Vite + TypeScript + Socket.IO Client
- **后端**: Node.js + Hono + Socket.IO + better-sqlite3
- **存储**: SQLite (sessions/messages) + JSON (providers) + MD files (characters)

