# MCP 工具执行 — Phase 4.5 设计文档

> 实现 MCP（Model Context Protocol）工具的执行能力，补齐「弈」项目中跳过的 Phase 4.5。

## 设计目标

- 角色通过 `tools` 白名单声明使用哪些 MCP server (`mcp:server_name`)
- session 启动时自动连接 MCP server、发现工具、暴露给 LLM
- session 结束时自动断开清理
- 工具命名：`mcp:{server_name}/{tool_name}`

## 架构

```
outer.ts (session lifecycle)
  │
  ├── mcp-client.ts (NEW)
  │     ├── connectMCPServer(config) → MCPClient
  │     ├── disconnectMCPServer(client) → void
  │
  ├── executor.ts (MODIFY)
  │     └── executeTool() → mcp: 前缀路由到 MCP client
  │
  └── outer.ts 集成层
        ├── 扫描角色 tools → 发现 mcp:* → 连接
        ├── 合并 MCP tool definitions 到工具列表
        └── session 结束 → 断开所有
```

### 数据流

1. `outer.ts` 读取 `charMeta.tools` → 过滤出 `mcp:server_name` 条目
2. 查询 `mcpServerStore.getByName()` 获取 server 配置
3. `connectMCPServer(config)` → spawn 子进程 → MCP initialize → tools/list
4. MCP 工具映射为 `mcp:{server_name}/{tool_name}` 格式
5. 合并到 `toolDefs` → 传给 `innerLoop` → LLM 看到完整工具列表
6. LLM 调用 `mcp:{server}/{tool}` → `executor.ts` 按前缀路由 → `callTool()`
7. session 结束 → 遍历 `mcpClients` → `disconnectMCPServer()`

## 渐进式披露

角色配置只需声明 `mcp:server_name`，不需要知道 server 的具体工具列表：

```json
{
  "tools": [
    { "name": "read" },
    { "name": "mcp:playwright" }
  ]
}
```

`mcpservers.json` 存储 server 的启动配置：

```json
{
  "id": "playwright",
  "name": "playwright",
  "command": "npx",
  "args": ["@playwright/mcp"],
  "env": {}
}
```

运行时自动展开为 `mcp:playwright/navigate`、`mcp:playwright/click` 等。

## 新文件：`mcp-client.ts`

### 类型

```typescript
interface MCPClient {
  serverName: string
  tools: MCPToolDef[]
  executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>
  disconnect(): Promise<void>
}

interface MCPToolDef {
  name: string
  description: string
  inputSchema: Record<string, any>
}
```

### 函数

| 函数 | 行数 | 职责 |
|------|------|------|
| `connectMCPServer(config)` | ~50 | spawn 子进程 → StdioClientTransport → Client.connect() → initialize → listTools() |
| `disconnectMCPServer(client)` | ~10 | client.close()，自动终止子进程 |
| `executeMCPTool(client, name, args)` | ~30 | callTool() → 解析结果 → 返回 ToolResult |

### 实现要点

- 使用 `@modelcontextprotocol/sdk` 的 `Client`、`StdioClientTransport`
- `Client` 注册 `ListRootsRequestSchema` handler 返回工作目录作为 root URI
- `callTool` 超时默认 300s
- `result.isError` → 提取 text content → 作为 `ToolResult.error`
- disconnect 时 SDK 自动关闭 stdio、终止子进程

### 错误处理

- 连接失败 → 返回 error（不 crash），该 server 的工具不暴露
- 运行时错误 → 返回到 ToolResult.error，LLM 自行重试
- session 异常中断 → outer.ts 的 try/finally 保证清理

## 修改现有文件

### `executor.ts`

```typescript
export async function executeTool(
  name: string, args: Record<string, string>,
  workspace: string, signal?: AbortSignal,
  mcpClients?: Map<string, MCPClient>
): Promise<ToolResult> {
  if (name.startsWith('mcp:'))
    return executeMCPToolByName(name, args, mcpClients)
  // ... 现有逻辑
}
```

### `outer.ts`

在 `sessionLoop` 中新增：

1. **加载后**：遍历 `charMeta.tools`，对 `mcp:*` 条目执行连接 + 发现
2. **工具合并**：MCP 工具定义追加到 `toolDefs`
3. **执行传递**：`mcpClients` Map 传入 `executeTool`
4. **finally**：session 结束或异常时断开所有 MCP client

### 不改动

- `inner.ts` — MCP 工具通过 `checkToolBinding` 的 `mcp:` 前缀匹配自动放行
- `definitions.ts` — 工具定义在 `outer.ts` 层合并，无需修改
- `routes/tools.ts` — CRUD 已就绪，无需改动

## 边界情况

| 场景 | 处理 |
|------|------|
| MCP server 连接超时/失败 | 跳过该 server，不暴露其工具，不影响 session |
| server 进程崩溃 | SDK 触发 onclose → 标记 failed，后续调用返回 error |
| 角色未引用 mcp server | 不影响，MCP 模块不启动 |
| 角色引用不存在的 server | 跳过，不报错 |
| 并发工具调用 | MCP stdio 串行，按写工具方式排队执行 |
| session 异常终止 | try/finally 保证全部断开 |

## 工作量

| 文件 | 改动 | 行数 |
|------|------|------|
| 新建 `mcp-client.ts` | 全部 | ~120 |
| 修改 `executor.ts` | 新增参数 + MCP 路由 | ~15 |
| 修改 `outer.ts` | 连接/合并/断开 | ~50 |
| `npm install` | `@modelcontextprotocol/sdk` | - |
| **合计** | | **~185 行** |
