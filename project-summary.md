# 弈 (Yì) — AI Agent 系统 · 项目摘要

> 此文档用于将项目上下文传递给 AI 助手进行后续分析。涵盖项目愿景、架构、技术栈、实现状态与设计方向。

---

## 一、项目定位

**弈**是一个融合了 OpenCode 执行流程、Hermes 人格进化与知识花园理念的 AI Agent 系统。核心理念来自围棋——人类布大局（策略），AI 落子执行（操作），双方在对弈中互相成就。

五个关键词：
- **有灵魂** — 每个 Agent 拥有独立人格（Soul）、记忆，用户可与不同角色对话
- **有策略** — Plan（只读分析）/ Ask（执行前确认）/ Bypass（自主执行）三种模式手动切换
- **有分身** — 主 Agent 可委托 Sub-agent 并行处理子任务，结果自动回收
- **有工具** — Agent 携带 read/write/grep/bash/webfetch/websearch/edit/glob 等工具，可绑定白名单约束
- **会进化** — 成功执行轨迹可沉淀为 Skill，经验不流失

版本：v0.1.0，早期开发阶段。

---

## 二、系统架构

### 2.1 总体布局

```
弈/
├── apps/
│   ├── client/          Vue 3 前端 — Chat 界面、角色/模型选择、设置面板
│   └── server/          Hono + Socket.IO 后端 — 双循环 Agent 引擎、LLM 通信、工具执行
├── skills/              技能库（SKILL.md 渐进式披露）
├── docs/                架构与状态文档
└── default-workspace/   默认工作区
```

### 2.2 后端核心：双循环引擎

**外层循环（Session Loop ~490 行）**
- 加载身份/角色（Soul + Memory + Skills 索引 + 工具绑定）
- 管理会话状态与上下文历史
- 处理 Sub-agent 信号（拉起 → 回收 → 注入主上下文）
- 上下文压缩（OpenCode-style Compaction）
- 顿悟检测（Epiphany）

**内层循环（Processor Loop ~400 行）**
- LLM 推理（支持流式、Tool Call）
- 检测 Tool Call → **两阶段权限校验** → 执行 → 结果追加到 Prompt
- 检测到 `delegate_task` 工具调用 → 返回 Sub-agent 信号给外层
- Doom Loop 检测（连续 6 次失败时提示换方案）

### 2.3 权限模型：两阶段校验

| 阶段 | 归属引擎 | 检查内容 |
|:---|:---|:---|
| L1 身份绑定 | 身份引擎 | 工具是否在 Agent 的 `tool_bindings` 中？约束条件（路径/命令/只读/文件大小）是否满足？ |
| L2 策略拦截 | 策略引擎 | 当前策略是否允许？Plan 拒绝危险工具，Ask 需用户确认，Bypass 放行 |

危险工具列表（硬编码）：`write`, `edit`, `delete`, `patch`, `bash`, `execute`, `mcp_exec`, `delegate_task`

### 2.4 工具系统（插件式）

每个工具是独立目录，包含 `index.ts` + `tool.json`，由 Registry 自动发现并动态 `import()` 加载。Registry 启动时扫描 `src/tools/` 下所有含 `tool.json` 的子目录，跳过 `_template/`。

**普通工具**（Agent 直接调用）：

| 工具 | 说明 | 危险 |
|:---|:---|:---:|
| `read` | 读取文件内容 | 否 |
| `write` | 写入文件 | 是 |
| `edit` | 编辑文件（精确替换） | 是 |
| `grep` | 内容搜索 | 否 |
| `glob` | 文件模式匹配 | 否 |
| `bash` | 执行 shell 命令 | 是 |
| `webfetch` | 获取 URL 内容 | 否 |
| `websearch` | 联网搜索 | 否 |

**信号工具**（`signal: true`，不由 Executor 执行，由引擎层面拦截处理）：

| 工具 | 说明 | 机制 |
|:---|:---|:---|
| `delegate_task` | 委托子任务给同组 sub 角色 | LLM 调用后外层循环捕获信号，拉起新 Sub-agent 会话，结果压缩回收 |
| `task_complete` | 标记任务完成，结束本轮会话 | LLM 调用后引擎终止内层循环，附带摘要返回外层 |

**管理员具**（Agent 自主管理技能和 MCP）：

| 工具 | 操作 | 说明 |
|:---|:---|:---|
| `skill_manager` | `view` | 查看技能完整内容（基于角色白名单） |
| | `create` | 创建新技能到 `skills/user/{name}/SKILL.md` |
| | `edit` | 编辑已有技能的 SKILL.md |
| | `delete` | 删除整个技能目录 |
| | `write_file` | 写入技能附属文件（如图片、数据） |
| | `remove_file` | 删除技能附属文件 |
| `mcp_manager` | `list` | 列出已注册的 MCP 服务器 |
| | `view` | 查看单个 MCP 服务器配置（命令、参数、环境变量） |
| | `create` | 注册新的 MCP 服务器（需指定 command，可选 args/env） |
| | `edit` | 修改已有 MCP 服务器配置 |
| | `delete` | 删除 MCP 服务器 |

**约束校验**：每个工具可声明 `constraintFields[]`，定义参数级约束规则（路径通配、命令白名单/黑名单、字节上限、只读检测等）。约束校验在 `definitions.ts:validateConstraints()` 中统一执行，与 L2 策略拦截构成两阶段权限模型。

### 2.5 Agent 模型

```
AgentRegistration:
  id, role (main/sub/both), group
  identity: { soul_path, memory_path, user_memory_path? }
  bindings: { skills[], tools[含约束], knowledge? }
  default_strategy
```

### 2.6 Sub-agent 分形

- 通过 `delegate_task` 工具拉起同组 Sub-agent
- Sub-agent 拥有独立上下文（隔离执行）
- 支持多实例并发
- 结果压缩回收（参考 OpenCode summarizeSubResult）
- 最大递归深度 3 层（孙代理移除 delegate_task 防止无限递归）

---

## 三、技术栈

### 后端
| 组件 | 选型 |
|:---|:---|
| 运行时 | Node.js 18+, TypeScript, ESM |
| HTTP | Hono (`@hono/node-server`) |
| WebSocket | Socket.IO |
| 数据库 | SQLite (`better-sqlite3`) |
| MCP | `@modelcontextprotocol/sdk` |
| 开发 | `tsx` (热重载), TypeScript |

### 前端
| 组件 | 选型 |
|:---|:---|
| 框架 | Vue 3 + TypeScript |
| 构建 | Vite 6 |
| 状态 | Pinia |
| 路由 | Vue Router 4 |
| 实时通信 | Socket.IO Client |
| 渲染 | markdown-it + highlight.js |
| 国际化 | vue-i18n |

---

## 四、前端界面

### 路由结构
- `/c` — 主聊天界面（默认）
- `/c/:id` — 指定会话
- `/c/:id/files` — 工作区文件浏览
- `/c/:id/outline` — 会话大纲
- `/role` — 角色/Agent 管理
- `/skill` — 技能浏览与管理
- `/tool` — 工具配置
- `/market` — 弈林市场（预留）
- `/mcp` — MCP 服务器管理
- `/settings` — 设置

### 核心交互
- 左侧边栏：会话列表、角色切换
- 中间：聊天区域（流式消息渲染、Tool Call 显示、思维链展示）
- 右上：Plan/Ask/Bypass 策略切换
- 右下：工具批准对话框（Ask 模式下）

---

## 五、设计纲领（"三大总纲"）

### 弈设计总纲.md — 核心引擎
定义五大引擎：
1. **身份引擎** — Agent 注册、Soul/记忆/技能/工具绑定
2. **策略引擎** — Plan/Ask/Bypass 三种模式、工具拦截
3. **调度引擎** — 双层循环 + Sub-agent 分形委托
4. **能力引擎** — Tool / Skill 统一调用
5. **进化引擎** — 顿悟触发、Skill 沉淀

### 弈林设计总纲.md — 生态市场（延后）
组件分享、排行榜、一键安装、知识交易（预留）、**合流进化（Confluence）**——多个用户的 Skill 变体可上传提案，经人工审核合并形成公共新版本。

### 藏经阁设计总纲.md — 知识库（延后）
基于 `ISutraKeeper` 接口的知识管理模块：典籍编纂（语义切分）、混合检索（向量 + BM25 + RRF）、图谱扩散、原文溯源。当前阶段使用 NoOp 空实现。

---

## 六、实现状态

| 模块 | 状态 | 说明 |
|:---|:---|:---|
| 前端框架 | ✅ 完成 | Vue 3 + Pinia + Router，7 个视图页，19+ 组件 |
| 聊天流式 | ✅ 完成 | Socket.IO 实时通信、流式渲染、思维链展示 |
| 角色管理 | ✅ 完成 | 角色 CRUD、soul/memory/user 文件系统存储 |
| 策略切换 | ✅ 完成 | Plan/Ask/Bypass + L2 策略拦截 |
| 双循环引擎 | ✅ 完成 | Session Loop + Processor Loop |
| 工具系统 | ✅ 完成 | 插件式注册 + L1 约束校验 |
| Sub-agent | ✅ 完成 | delegate_task + 组校验 + 结果回收 |
| MCP 集成 | ✅ 完成 | MCP 服务器连接管理 |
| Skill 系统 | ✅ 完成 | 渐进式披露（索引加载 + 完整加载） |
| 上下文引用 | ✅ 完成 | @file/@folder/@url 引用解析 |
| 进化引擎 | ❌ 未开始 | 顿悟检测与 Skill 自动生成 |
| 集成测试 | ❌ 未开始 | 无测试框架，无单元/端到端测试 |
| 藏经阁 | ⏳ 延后 | NoOp 空实现，接口已定义 |
| 弈林市场 | ⏳ 延后 | 接口预留，未实现 |
| 合流进化 | ⏳ 延后 | 需弈林基础就绪 |

---

## 七、关键数据流

```
用户 → 选择 Main Agent → 会话启动
  → 加载身份 (Soul/Memory/技能索引/工具绑定)
  → 进入外层循环
    → 组装 System Prompt（含已批准工具上下文）
    → 进入内层循环
      → LLM 推理
      → 有 Tool Call?
        → 两阶段校验 (L1 + L2)
        → delegate_task? → 返回 Sub-agent 信号给外层
        → 其他工具 → 执行 → 追加结果
      → Doom Loop 检测 → 继续/结束
    → 外层捕获 Sub-agent 信号 → 拉起 → 回收 → 注入
    → 上下文压缩 / 顿悟检测
    → 输出结果
```

---

## 八、给 AI 分析者的提示

以下方向值得关注：

1. **进化引擎实现** — 顿悟触发条件已定义（tool_call >= 3 + success / 用户纠正 / 自我纠正），洞察提取和 Skill 自动生成待编码。需要决定：变体存储（覆盖式还是 `.evolved/` 多版本并存）。

2. **测试覆盖率** — 完全空白。最优先需要端到端测试（角色加载 → 策略切换 → 工具执行 → Sub-agent 分形），其次是约束校验边界测试和 Doom Loop 测试。

3. **藏经阁实现** — 如果启动，需要嵌入向量数据库（Chroma/Qdrant Lite）、语义切分器和经络链接抽取。与弈林市场的典籍集分享联动。

4. **弈林市场** — 远程注册表服务（排行榜、搜索、安装）、CLI 命令、`package.yaml` 规范。合流进化是独特卖点。

5. **Permission UX** — 当前约束校验在 L1 硬编码，未来需 UI 配置界面（路径白名单、命令黑白名单等）。

6. **MCP 生态** — 已有 MCP 连接框架，可接入外部工具服务器（数据库查询、API 调用等）。

---

## 九、参考资源

### 藏经阁 / 知识库参考
- **思源知识库 (Susan Knowledge Base)** — `https://www.susan.net.cn/project/knowledge/1.info.html`
  - 后续搭建知识库时可参考其知识组织方式、分类体系与展示结构
