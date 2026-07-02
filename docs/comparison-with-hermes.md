# Yi-Lin vs Hermes Agent (opencode) 全面对比

> 对比基准：Yi-Lin（TypeScript, 81 文件） vs hermes-agent-main（Python, 6924 文件）+ opencode-dev（TypeScript monorepo）  
> 日期：2026-07-02

---

## 1. 架构规模

| 维度 | Yi-Lin | hermes-agent-main |
|---|---|---|
| **总文件数** | 81 | 6924 |
| **语言** | TypeScript（单包） | Python（单体）+ TypeScript（packages） |
| **项目结构** | `apps/server/` 单体 server | `agent/` + `tools/` + `cli/` + `gateway/` + `plugins/` + `web/` + 桌面端 |
| **代码图节点** | 835 | 150149 |
| **依赖** | hono, socket.io, better-sqlite3 | 数百个 Python 包 + npm 包 |
| **构建** | tsc 单包编译 | pnpm workspaces 31 包 + Python uv/poetry |

Hermes 是一个完整的 AI 代理平台（CLI + 桌面 + 网关 + 插件体系），Yi-Lin 是一个更轻量的 server-only 结构。

---

## 2. 工具系统

| 方面 | Yi-Lin | Hermes |
|---|---|---|
| **工具数量** | 8 个硬编码 | ~85 个分类注册 |
| **定义方式** | `definitions.ts` 中手动写 JSON schema | Python 类 + 装饰器 + Schema 校验 + `registry.py` 注册中心 |
| **工具分组** | 无 | `toolsets.py` 分层组合（core / web / browser / file / coding / 平台专属） |
| **权限控制** | `DANGEROUS_TOOLS` 列表 + `allowed_paths`/`denied_paths` | `write_approval` + `approval.py` + 细粒度约束 + `tool_guardrails.py` 防循环 |
| **并行执行** | 仅 read/grep/glob/webfetch 并行 | 完整规则引擎：`_PARALLEL_SAFE_TOOLS` + `_PATH_SCOPED_TOOLS` + 路径重叠检测 |
| **执行引擎** | switch-case 同步调用 + `execSync` | 线程池 `concurrent.futures` + 顺序执行路径 + 中断支持 |
| **Schema 校验** | 手写 JSON（typescript `parameters` 字段） | `Tool.make()` + Effect Schema + JSON Schema 自动生成 |
| **guardrails** | 无 | 重试保护、回路检测、安全门控、MCP 子网关 |
| **错误处理** | 简单 try-catch | `error_classifier.py`（9 种分类）+ `retry_utils.py`（指数退避） |

### Yi-Lin 工具
| 工具 | 同步/异步 | 并行安全 |
|---|---|---|
| read | 同步 fs | ✅ |
| write | 同步 fs | ❌ |
| edit | 同步 fs | ❌ |
| bash | 同步 execSync | ❌ |
| grep | 同步 rg 封装 | ✅ |
| glob | 同步 globSync | ✅ |
| webfetch | 异步 fetch | ✅ |
| websearch | 异步 fetch | ✅ |
| delegate_task | 异步 | ❌ |

### Hermes 关键工具（Yi-Lin 缺失）

| 缺失工具 | 作用 | 重要程度 |
|---|---|---|
| `task_complete` | agent 主动结束会话并输出结果摘要 | **高** - 解决"不知道做完了"问题 |
| `memory_tool` | 持久化跨会话知识（笔记/用户画像） | **高** - 长期记忆 |
| `patch_file` / `apply_diff` | 统一 diff 格式的行级编辑 | **中高** - 比 edit 更精确 |
| `skill_manage` | 运行时加载/卸载技能 | **中** - 行为切换 |
| `session_search` | 跨历史会话语义搜索 | **中** - 自我引用能力 |
| `browser` | Playwright 浏览器自动化 | **中** - E2E / 爬虫 |
| `git` 工具集 | commit/push/branch/PR | **中** - GitOps |
| `cronjob` | 计划任务调度 | **低** |
| `discord/feishu/slack/telegram` | 消息平台集成 | **低** |
| `voice/tts/stt` | 语音交互 | **低** |
| `image_gen` / `video_gen` | AI 媒体生成 | **低** |

---

## 3. 代理循环

| 方面 | Yi-Lin | Hermes |
|---|---|---|
| **外层循环** | `outer.ts` - 手动 while 循环 + abort 信号 | `run_agent.py` - 完善的状态机 |
| **内层循环** | `inner.ts` - 单次 LLM 调用 + 处理响应 | `conversation_loop.py` + `turn_context.py` - 多轮会话管理 |
| **系统提示** | 硬编码字符串拼接（刚加了 6 个引导块） | `prompt_builder.py` - 3 层结构（stable/context/volatile）+ `system_prompt.py` |
| **上下文跟踪** | 手动 token 计数 + 简单阈值 | `context_compressor.py` 自动压缩 + `context_engine.py` 上下文字典 |
| **会话管理** | `session.ts` 基本状态 | `session.py` + `turn_context.py` + `turn_finalizer.py` 复杂生命周期 |
| **重试逻辑** | 刚加的指数退避（3 次） | `retry_utils.py` 全功能退避 + `error_classifier.py` 智能分类 + 凭证轮换 + 提供商回退 |
| **验证** | 引导块中有相关规则 | `verification_evidence.py` + `verification_stop.py` 验证闭环 |
| **压缩** | 简单丢弃旧消息 | `context_compressor.py` LLM 摘要压缩 + `conversation_compression.py` 压缩提示语 |
| **子代理** | `sub-agent.ts` 基本委托 | `delegate_tool.py` + `process_registry.py` + 隔离上下文 |
| **中断** | AbortSignal | `interrupt.py` 完整中断机制 + 取消传播 |
| **预算控制** | 无 | `budget_config.py` + `iteration_budget.py` - 按 token / step 限制 |

### 代理循环对比

**Yi-Lin 流程：**
```
outer.ts: session loop → 构建 system prompt → inner.ts: LLM call → 
解析 response → 处理 tool calls（并行读/串行写）→ 追加结果 → 
检查错误（consecutiveErrors）→ 循环
```

**Hermes 流程：**
```
run_agent.py: process_bootstrap → agent_init → 
conversation_loop: 收取用户输入 → 检查 context → 可能压缩 → 
构建 prompt（prompt_builder + context_engine）→ LLM stream → 
turn_finalizer → tool_dispatch（顺序或并发）→ 
tool_guardrails（安全检查）→ 追加结果 → 检查 budget → 循环
```

Hermes 在每一轮有更精细的生命周期：agent > session > turn > step，并且每一层都有对应的钩子。

---

## 4. 提示工程

| 方面 | Yi-Lin | Hermes |
|---|---|---|
| **分层 prompt** | ❌ 扁平字符串 | ✅ stable/context/volatile 三层 |
| **角色/人格** | `character/` 模块 | `prompt_builder.py` personality hooks |
| **动态工具描述** | 全部列出 | 按角色/场景过滤 |
| **技能注入** | 无 | `skill_preprocessing.py` + `skill_bundles.py` |
| **多语言** | 无 | `i18n.py` + `locales/` 国际化 |
| **例子/少样本** | 无 | 可配置 few-shot |
| **记忆注入** | 无 | `memory_manager.py` 注入相关记忆 |
| **上下文引用** | 无 | `context_references.py` 项目上下文字典 |

---

## 5. 技能系统

| 方面 | Yi-Lin | Hermes |
|---|---|---|
| **技能框架** | ❌ 无 | ✅ 完整技能系统 |
| **技能管理** | REST API（`routes/skills.ts`） | `skill_manager_tool.py` CRUD + `skills_hub.py` 远程仓库 |
| **运行时加载** | ❌ 固定 | ✅ `skill_manage` 热加载/热卸载 |
| **安全审计** | 无 | `skills_ast_audit.py` AST 审计 + `skills_guard.py` 沙箱 |
| **来源追踪** | 无 | `skill_provenance.py` 来源链 |
| **使用分析** | 无 | `skill_usage.py` 使用统计 |

Yi-Lin 的 `routes/skills.ts` 暴露了 REST API，但 agent 层并没有任何技能相关的逻辑——这是空的架子。

---

## 6. 插件 / MCP

| 方面 | Yi-Lin | Hermes |
|---|---|---|
| **MCP 支持** | 无 | `mcp_tool.py` + `mcp_oauth.py` + `mcp_oauth_manager.py` |
| **插件架构** | 无 | `plugins/` 目录 + `registration.ts`（Effect + Promise 双模式） |
| **生命周期钩子** | 无 | `hooks.py` pre/post tool call 等 |
| **第三方工具** | 无 | `managed_tool_gateway.py` MCP 代理网关 |

---

## 7. 平台支持

| 方面 | Yi-Lin | Hermes |
|---|---|---|
| **CLI** | 无（仅 WebSocket API） | `hermes_cli/` 完整 CLI（子命令 + TUI + 配置管理） |
| **Web UI** | 客户端 `apps/client/` | `web/` + `ui-tui/` + desktop app |
| **网关** | 无 | `gateway/` 多用户网关 + Auth + Relay |
| **桌面** | 无 | `apps/desktop/` Electron 桌面端 |
| **API 服务器** | hono + socket.io | `web_server.py` + 多渠道 |
| **支持平台** | CLI 单用户 | CLI + 桌面 + 网关 + Discord + Telegram + Slack + 微信/企业微信 |

---

## 8. 质量保障

| 方面 | Yi-Lin | Hermes |
|---|---|---|
| **测试框架** | 无 | `tests/` pytest 测试套件 |
| **错误分类** | 无 | `error_classifier.py` 9 种分类 + 恢复策略 |
| **速率限制** | 无 | `rate_limit_tracker.py` + `nous_rate_guard.py` |
| **安全审计** | 路径转义检查 | `security_audit.py` + `threat_patterns.py` + `tirith_security.py` |
| **日志** | 无 | `hermes_logging.py` 全面日志 |
| **遥测** | 无 | 可配置遥测 + 使用统计 |
| **凭证管理** | 无 | `credential_pool.py` + `credential_sources.py` + `credential_persistence.py` |

---

## 9. 小结与建议

### 可立即移植（低风险）
1. **`task_complete` 工具** — 加一个工具让 agent 主动结束，附带输出摘要（~50 行代码）
2. **`memory_tool` 工具** — 基于已有 SQLite 存储加 CRUD 工具（~150 行代码）
3. **`patch_file` 工具** — 支持统一 diff 格式编辑（~80 行代码，参考 Hermes `patch_parser.py`）
4. **错误轮转** — 当前重试后不换模型/凭证，可以加 `rotate_model` 策略

### 值得架构级跟进（中风险）
1. **工具注册中心** — 把硬编码 switch-case 改成可注册的工具工厂，支持第三方工具通过 MCP 热插
2. **技能系统打通** — 前端 skill CRUD 和后端 agent skill 执行挂钩
3. **上下文压缩** — 用 LLM 做摘要压缩替代简单丢弃

### 暂不建议（高成本低收益）
1. **网关/多用户** — 除非有 SaaS 需求
2. **全功能 CLI** — 除非需要独立部署
3. **消息平台接入** — 除非有运营需求

---

## 附录：文件映射

| Yi-Lin 文件 | Hermes 对应 | 功能 |
|---|---|---|
| `agent/outer.ts` | `agent/conversation_loop.py` + `run_agent.py` | 外层循环 |
| `agent/inner.ts` | `agent/turn_context.py` + `agent/tool_executor.py` | 内层调用 |
| `agent/sub-agent.ts` | `tools/delegate_tool.py` + `tools/process_registry.py` | 子代理 |
| `agent/session.ts` | `gateway/session.py` + `agent/turn_context.py` | 会话管理 |
| `agent/loop.ts` | `agent/conversation_loop.py` | 入口 |
| `tools/definitions.ts` | `toolset_distributions.py` + `toolsets.py` | 工具定义 |
| `tools/executor.ts` | `agent/tool_executor.py` + `tools/registry.py` | 工具执行 |
| `tools/grep.ts` | `tools/file_tools.py` 中的 grep | grep 实现 |
| `llm/client.ts` | `providers/` + `agent/chat_completion_helpers.py` | LLM 客户端 |
| `db/schema.ts` | `hermes_state.py` + SQLite 模型 | 数据库 schema |
| `character/store.ts` | `agent/prompt_builder.py` 角色部分 | 角色管理 |
| `routes/skills.ts` | `tools/skill_manager_tool.py` | 技能 API（空壳） |
