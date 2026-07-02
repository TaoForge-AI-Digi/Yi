# Yi-Lin vs opencode vs Hermes Agent — 三方对比

| 维度 | Yi-Lin | opencode-dev | hermes-agent-main |
|---|---|---|---|
| **角色** | 你正在开发的轻量 agent server | opencode CLI/平台的 TypeScript 核心代码 | opencode 嵌入的 Python agent 引擎 |
| **语言** | TypeScript | TypeScript (Effect 生态) | Python |
| **文件数** | 81 | 6924 | 6924（与 opencode 共享仓库） |
| **代码图节点** | 835 | 150149 | 150149 |
| **包管理** | 单包 npm | pnpm workspaces (31 包) | Python uv/poetry + pnpm |
| **架构** | hono + socket.io server | Effect 函数式 + 分层工具/协议/插件 | 单体 Python + SQLite |

---

## 1. 架构层次

```
Yi-Lin:                    opencode-dev:              hermes-agent-main:
┌─────────────┐           ┌─────────────┐            ┌─────────────────┐
│   client     │           │   cli/tui   │            │   CLI (hermes)  │
│  (React)     │           │  (ink+React)│            │  (argparse+TUI) │
└──────┬──────┘           └──────┬──────┘            └───────┬─────────┘
       │ WebSocket               │ 进程通信                    │ stdio/pipe
       ▼                          ▼                           ▼
┌─────────────┐           ┌─────────────┐            ┌─────────────────┐
│  server     │           │  server      │            │  run_agent.py   │
│  hono+ws    │           │ (Effect +    │            │  (主循环)        │
│  8 文件     │           │  Hono/Express)│            │                  │
└──────┬──────┘           └──────┬──────┘            └───────┬─────────┘
       │                         │                           │
       ▼                         ▼                           ▼
┌─────────────┐           ┌─────────────┐            ┌─────────────────┐
│  agent/     │           │  core/      │            │  agent/         │
│  outer+inner │           │  (session   │            │  (prompt+tools  │
│  ~600 行    │           │   runner)    │            │   +context)     │
└─────────────┘           └─────────────┘            └─────────────────┘
       │                         │                           │
       ▼                         ▼                           ▼
┌─────────────┐           ┌─────────────┐            ┌─────────────────┐
│  tools/     │           │  plugin/    │            │  tools/         │
│  8 个硬编码  │           │  tool/  +  │            │  85+ 个分类工具  │
│  switch-case │           │  protocol/  │            │  + registry     │
└─────────────┘           └─────────────┘            └─────────────────┘
       │                         │                           │
       ▼                         ▼                           │
┌─────────────┐           ┌─────────────┐                    │
│  db/ LLM/  │           │  llm/       │─────────────────────┘
│  直接调用   │           │  (抽象层)    │  → hermes-agent 的 providers/
└─────────────┘           └─────────────┘
```

---

## 2. Agent 引擎对比

| 功能 | Yi-Lin | opencode-dev (core) | hermes-agent-main |
|---|---|---|---|
| **外层循环** | `outer.ts` while + abort | `session-runner.ts` Effect 队列 | `run_agent.py` 状态机 |
| **内层调用** | `inner.ts` 单次 stream | `llm/Session.ts` 流式 | `turn_context.py` + `chat_completion_helpers.py` |
| **工具调度** | 硬编码并行组 | `tool/tool.ts` Effect 链 | `tool_executor.py` 线程池 |
| **系统提示** | 字符串拼接 + 引导块 | `prompt_builder.py` 3 层结构 | `prompt_builder.py` 3 层结构 |
| **压缩** | 简单丢弃旧消息 | `context_compressor.py` | `context_compressor.py` LLM 摘要 |
| **重试** | 指数退避 3 次 | 无（agent 层） | `retry_utils.py` + `error_classifier.py` |
| **错误分类** | 无 | 无 | `error_classifier.py` 9 种分类 |
| **子代理** | `sub-agent.ts` 基本 | `function/spawn.ts` | `delegate_tool.py` + `process_registry.py` |
| **验证** | 引导块提要求 | 无 | `verification_evidence.py` + `verification_stop.py` |
| **安全检查** | `validateConstraints()` | `withPermission()` 装饰器 | `tool_guardrails.py` + `approval.py` + `tirith_security.py` |

---

## 3. 工具系统对比

| 方面 | Yi-Lin | opencode-dev | hermes-agent-main |
|---|---|---|---|
| **定义方式** | `getToolDefinitions()` 手写 JSON | `Tool.make()` + Effect Schema 自动生成 | Python 类 + `registry.py` 注册 |
| **Schema 校验** | TypeScript 类型（运行时不校验） | Effect Schema → JSON Schema 自动推导 | Pydantic + runtime schema check |
| **数量** | 8 | ~20（核心）+ 插件扩展 | ~85 |
| **分组** | 无 | `toolset_distributions.py` | `toolsets.py` + 概率分布 |
| **并行** | 硬编码只读集合 | Effect 自动依赖分析 | 规则引擎 + 路径重叠检测 |

### Yi-Lin 缺失的关键工具

| 工具 | 可移植难度 | 价值 |
|---|---|---|
| `task_complete` | **低**（~50 行） | agent 主动结束+摘要 |
| `memory_tool` | **低**（~150 行） | 跨会话持久记忆 |
| `patch_file` / `apply_diff` | **低**（~80 行） | 精确行级编辑 |
| `session_search` | **中**（~200 行） | 跨会话引用 |
| `skill_manage` | **中** | 运行时行为切换 |
| `browser` | **高** | 浏览器自动化 |
| `git` 系列 | **中** | Git 全流程 |
| `cronjob` | **低** | 计划任务 |

---

## 4. 构建工具 vs 运行时工具

opencode-dev 和 hermes-agent-main 是同一项目的两层：

```
opencode-dev (TypeScript 框架层)
├── packages/cli/      → CLI 入口
├── packages/core/     → agent 运行时的 Effect 绑定
├── packages/llm/      → LLM 抽象层（provider 无关）
├── packages/plugin/   → 插件注册系统
├── packages/protocol/ → ACP 协议
├── packages/server/   → API server
├── packages/sdk/      → 客户端 SDK
├── packages/tui/      → terminal UI
├── packages/ui/       → React 组件
└── packages/desktop/  → Electron 桌面

hermes-agent-main (Python 运行时层)
├── agent/             → 代理引擎（循环/提示/压缩/调度/分类）
├── tools/             → 85+ 工具实现
├── plugins/           → Python 插件
├── providers/         → LLM 提供商（OpenAI/Anthropic/Nous/Ollama/本地）
├── skills/            → 技能包
├── gateway/           → 多用户网关
├── hermes_cli/        → CLI 入口
└── web/               → Web 管理界面
```

Yi-Lin 试图用 TypeScript 单体替代上面两层——用 81 个文件覆盖 Python 版的 agent + tools + providers。

---

## 5. 功能矩阵

| 功能 | Yi-Lin | opencode-dev | hermes |
|---|---|---|---|
| LLM 流式调用 | ✅ | ✅ | ✅ |
| 工具调用 | ✅ 8 个 | ✅ 可扩展 | ✅ 85+ |
| 文件读写 | ✅ | ✅ | ✅ |
| Web 搜索 | ✅ DuckDuckGo | ✅ 多渠道 | ✅ 多渠道 |
| 子代理 | ✅ 基础 | ✅ spawn | ✅ delegate+registry |
| 错误重试 | ✅ 刚加 | ❌ | ✅ 全功能 |
| 提示分层 | ❌ 扁平 | ✅ | ✅ |
| 上下文压缩 | ❌ 丢弃 | ✅ LLM摘要 | ✅ LLM摘要 |
| 工具 guardrails | ❌ | ✅ | ✅ |
| 安全审计 | ❌ | ❌ | ✅ tirith |
| 技能系统 | ❌ 空壳 | ❌ | ✅ 完整 |
| MCP 支持 | ❌ | ✅ | ✅ |
| 浏览器 | ❌ | ❌ | ✅ Playwright |
| 记忆持久化 | ❌ | ❌ | ✅ |
| 任务完成信号 | ❌ | ❌ | ✅ task_complete |
| 测试 | ❌ | ✅ | ✅ pytest |
| 多模型提供商 | ✅ 自定义 API | ✅ 多提供商 | ✅ 10+ 提供商 |
| 角色/人格 | ✅ 基础 | ✅ | ✅ |
| 跨平台 | ❌ Linux only | ✅ Win/Mac/Linux | ✅ Win/Mac/Linux |

---

## 6. 代码量估算

| 模块 | Yi-Lin (行数) | opencode-dev | hermes-agent |
|---|---|---|---|
| Agent 循环 | ~600 | ~2000 (session-runner) | ~3000 (run_agent + tools) |
| 工具 | 600 (8 个) | ~1000 (核心) | ~15000 (85 个) |
| 提示/压缩 | 0 | ~1500 | ~2500 |
| 错误/重试 | ~50 (刚加) | ~200 | ~1000 |
| 安全 | ~80 | ~300 | ~2000 |
| 插件/MCP | 0 | ~2000 | ~3000 |
| CLI/UI | ~1000 (React) | ~5000 | ~20000 |
| 测试 | 0 | ~3000 | ~5000 |
| **合计** | **~2500** | **~15000** | **~52000** |

---

## 7. 关键架构差异

### 7.1 工具注册 vs 硬编码

```
Yi-Lin:                              opencode/hermes:
getToolDefinitions() → JSON[]        registry.py / tool.ts
  ↓                                     ↓
executeTool(name, args)              Tool.make({name, input, output, execute})
  switch-case 8 个分支                  ↓
  ↓                                  Runtime.settle(call, context)
  return ToolResult                   ↓
                                      Effect<ToolOutput, ToolFailure>
```

### 7.2 提示构建

```
Yi-Lin:                              hermes:
buildSystemPrompt():                  prompt_builder.py:
  character.prompt                      stable: 角色定义（不变）
  + toolDefs 序列化                    + context: 当前任务/文件（半变）
  + 最近 token 估算                    + volatile: 工具定义/记忆（全变）
  + guidance 块                        + skill_preprocessing 注入
  = 扁平字符串                         = 层次化字典 → LLM format
```

### 7.3 错误处理链条

```
Yi-Lin:                              hermes:
try { innerLoop() }                   error_classifier.py:
catch(err) → {                         classify_api_error():
  if (consecutive < 2) retry             → status 401 → rotate_credential
  else abort                             → status 429 → rate_limit backoff
}                                       → status 413 → compress_context
                                        → status 402 → billing check
                                        → message match → fallback provider
                                        → SSL error → retry once
```

---

## 8. 优先级建议

### 立即（低风险，~300 行）
1. **`task_complete`** — 结束信号 + 输出摘要
2. **`memory_tool`** — 基于 SQLite 的 key-value 持久化
3. **`patch_file`** — 精确行级编辑

### 中期（中风险，~1000 行）
4. **错误分类器** — 区分 401/429/413/5xx，不同应对策略
5. **工具注册中心** — 替换 switch-case，支持热注册
6. **Session 搜索** — 跨历史对话发现

### 长期（高风险，~5000+ 行）
7. **上下文压缩** — LLM 摘要压缩中间对话
8. **技能系统** — 将技能路由从空壳实现到真实执行
9. **MCP 插件** — 允许第三方扩展
