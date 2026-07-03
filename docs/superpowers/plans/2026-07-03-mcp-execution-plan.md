# MCP 工具执行 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 MCP server 的进程管理、工具发现和工具执行，补齐 Phase 4.5。

**Architecture:** outer.ts 在 session 启动时按角色 tools 白名单连接 MCP server → tools/list 发现工具 → 合并到工具定义列表 → executor.ts 按 `mcp:` 前缀路由到 MCP client。

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, Node.js child_process (SDK 内部)

## Global Constraints

- 使用 `@modelcontextprotocol/sdk`（npm 包），不手写 JSON-RPC
- 工具命名格式：`mcp:{server_name}/{tool_name}`
- MCP server 生命周期跟随 session（启动时连接，结束时断开）
- Session-level 生命周期，非全局常驻

---

### Task 1: 安装依赖 + 创建 `mcp-client.ts`

**Files:**
- Modify: `apps/server/package.json` — 添加依赖
- Create: `apps/server/src/tools/mcp-client.ts`

**Interfaces:**
- Produces: `connectMCPServer(config)`, `disconnectMCPServer(client)`, type `MCPClient`

- [ ] **Step 1: 安装 @modelcontextprotocol/sdk**

```bash
cd apps/server && npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: 创建 `mcp-client.ts`**

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ListRootsRequestSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { pathToFileURL } from 'url'
import type { ToolResult } from './types.js'

export interface MCPToolDef {
  name: string
  description: string
  inputSchema: Record<string, any>
}

export interface MCPClient {
  serverName: string
  tools: MCPToolDef[]
  executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>
  disconnect(): Promise<void>
}

interface MCPServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
}

export async function connectMCPServer(config: MCPServerConfig, workspace?: string): Promise<MCPClient> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...process.env, ...config.env } as Record<string, string>,
    stderr: 'pipe',
  })

  const client = new Client(
    { name: 'yi-lin-mcp', version: '0.1.0' },
    { capabilities: {} }
  )

  client.setRequestHandler(ListRootsRequestSchema, () =>
    Promise.resolve({ roots: workspace ? [{ uri: pathToFileURL(workspace).href }] : [] })
  )

  await client.connect(transport)

  const toolsResult = await client.listTools()
  const tools: MCPToolDef[] = (toolsResult.tools || []).map(t => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema as Record<string, any>,
  }))

  return {
    serverName: config.name,
    tools,
    async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const result = await client.callTool(
          { name: toolName, arguments: args },
          CallToolResultSchema,
          { timeout: 300_000 }
        )
        if (result.isError) {
          const text = (result.content || [])
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n')
          return { output: '', error: text || 'MCP tool returned an error' }
        }
        const output = (result.content || [])
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n')
        return { output }
      } catch (err: any) {
        return { output: '', error: `MCP call failed: ${err.message || String(err)}` }
      }
    },
    async disconnect(): Promise<void> {
      await client.close()
    },
  }
}

export async function disconnectMCPServer(mcp: MCPClient): Promise<void> {
  try {
    await mcp.disconnect()
  } catch {
    // ignore close errors
  }
}
```

- [ ] **Step 3: 验证编译**

```bash
cd apps/server && npx tsc --noEmit
```

预期：无错误（可能需要对 SDK 的 `.js` 扩展名做 skipLibCheck，已有）。

---

### Task 2: 修改 `executor.ts` 支持 MCP 路由

**Files:**
- Modify: `apps/server/src/tools/executor.ts`
- Interfaces: `connectMCPServer`, `MCPClient`, `MCPToolDef` 来自 `./mcp-client.js`

- [ ] **Step 1: 修改 `executor.ts`**

```typescript
import { execute as registryExecute } from './registry.js'
import { PathEscapeError } from './utils.js'
import type { ToolResult } from './types.js'
import type { MCPClient } from './mcp-client.js'

function parseMCPToolName(name: string): { serverName: string; toolName: string } | null {
  // format: mcp:{server_name}/{tool_name}
  const m = name.match(/^mcp:(.+?)\/(.+)$/)
  if (!m) return null
  return { serverName: m[1], toolName: m[2] }
}

export async function executeTool(
  name: string,
  args: Record<string, string>,
  workspace: string,
  signal?: AbortSignal,
  mcpClients?: Map<string, MCPClient>,
): Promise<ToolResult> {
  // MCP routing
  if (name.startsWith('mcp:') && mcpClients) {
    const parsed = parseMCPToolName(name)
    if (!parsed) return { output: '', error: `Invalid MCP tool name: ${name}` }
    const client = mcpClients.get(parsed.serverName)
    if (!client) return { output: '', error: `MCP server "${parsed.serverName}" not connected` }
    return client.executeTool(parsed.toolName, args)
  }

  try {
    return await registryExecute(name, args, { workspace, signal })
  } catch (err: any) {
    if (err instanceof PathEscapeError) {
      return { output: '', error: err.message, escaped: true }
    }
    return { output: '', error: `${name}: ${err.message || String(err)}` }
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
cd apps/server && npx tsc --noEmit
```

---

### Task 3: 修改 `outer.ts` 集成 MCP lifecycle

**Files:**
- Modify: `apps/server/src/agent/outer.ts`
- Consumes: `connectMCPServer`, `disconnectMCPServer` from `./mcp-client.js`

- [ ] **Step 1: 添加 import 和 MCP 连接逻辑**

在 `outer.ts` 顶部添加 import：

```typescript
import { connectMCPServer, disconnectMCPServer } from '../tools/mcp-client.js'
import { mcpServerStore } from '../db/toolStore.js'
import type { MCPClient } from '../tools/mcp-client.js'
```

- [ ] **Step 2: 在 `sessionLoop` 中添加 MCP 连接逻辑**

在 `const toolDefs = getCharacterToolDefinitions(charMeta.tools)` 之后、`const tools = toolDefs.length > 0 ? toolDefs : undefined` 之前，插入：

```typescript
// ── MCP tools discovery ──
const mcpClients = new Map<string, MCPClient>()
if (charMeta.tools) {
  const mcpEntries = charMeta.tools.filter(t => t.name.startsWith('mcp:'))
  for (const entry of mcpEntries) {
    const serverName = entry.name.slice(4) // remove 'mcp:' prefix
    const config = mcpServerStore.getAll().find(s => s.name === serverName)
    if (!config) {
      console.warn(`[mcp] Server "${serverName}" referenced but not configured`)
      continue
    }
    try {
      const client = await connectMCPServer(config, session.workspace)
      mcpClients.set(serverName, client)
      // Add MCP tool definitions
      for (const tool of client.tools) {
        const fullName = `mcp:${serverName}/${tool.name}`
        toolDefs.push({
          type: 'function' as const,
          function: {
            name: fullName,
            description: tool.description,
            parameters: tool.inputSchema as any,
          },
        })
      }
      console.log(`[mcp] Connected "${serverName}" (${client.tools.length} tools)`)
    } catch (err: any) {
      console.warn(`[mcp] Failed to connect "${serverName}": ${err.message}`)
    }
  }
}
```

- [ ] **Step 3: 修改 `executeTool` 调用，传入 `mcpClients`**

在 `inner.ts` 中修改 `runOne` 函数，需要把 `mcpClients` 传进去。这里有两个选择：

**方案 A：** 将 `mcpClients` 传过 `innerLoop` → `runOne`（改动大）
**方案 B：** 在 `outer.ts` 层处理 MCP 工具调用，不经过 inner.ts

选方案 B 更简洁：

在 `outer.ts` 中，找到 `result.type === 'final_answer'` 的判断之后、工具执行之前的位置。但实际上 inner.ts 的 `runOne` 直接调 `executeTool`。最简单的做法是把 `mcpClients` 作为参数传递：

修改 `inner.ts` 的 `innerLoop` 签名：

```typescript
export async function innerLoop(
  messages: LLMMessage[],
  tools: any[] | undefined,
  provider: { base_url: string; api_key: string },
  model: string,
  characterId: string,
  workspace: string | undefined,
  io?: Server,
  socket?: Socket,
  sessionId?: string,
  signal?: AbortSignal,
  opts: { thinking?: boolean; reasoning_effort?: string } = {},
  turn: number = 0,
  mcpClients?: Map<string, MCPClient>,  // NEW
): Promise<InnerResult> {
```

在 `inner.ts` 中改 `runOne` 调用：

```typescript
result = await executeTool(p.name, p.args, workspace || process.cwd(), signal, mcpClients)
```

在 `outer.ts` 中传参：

```typescript
const result = await innerLoop(
  messages, tools, provider, model, session.character_id,
  session.workspace || undefined, io, socket, sessionId, signal, opts, turn,
  mcpClients,  // NEW
)
```

- [ ] **Step 4: 在 session 结束时断开 MCP 连接**

在 `outer.ts` 的 `sessionLoop` 函数结束前（return 之前），添加清理：

```typescript
// ── Cleanup MCP connections ──
for (const [name, client] of mcpClients) {
  await disconnectMCPServer(client).catch(() => {})
}
console.log(`[mcp] Disconnected ${mcpClients.size} server(s)`)
```

在函数开头的错误返回路径中也加上 try/finally。把整个函数体包裹在 try/finally 中以确保清理。

实际上更好的做法是在 `sessionLoop` 函数的最后放一个 finally 块。但因为函数有多个 `return` 路径，可以用一个 `const runResult = ...` 模式：

将函数体主要逻辑移到 try 块中，finally 中做清理。

或者更简单的：在函数最开始声明 `let mcpClients: Map<string, MCPClient> | undefined`，然后在函数结束前的每个 return 之前都调用清理。但这样容易遗漏。

最干净的方案是在现有代码中，在 `sessionLoop` 函数的底部（return 之前）加一个 try/finally：

```typescript
  // ── Cleanup MCP connections ──
  for (const [, client] of mcpClients) {
    await disconnectMCPServer(client).catch(() => {})
  }

  return { status: completedStatus, sessionId, totalInputTokens, totalOutputTokens }
}
```

以及 `task_complete` 的 return 之前也加：

```typescript
  // ── Cleanup MCP connections ──
  for (const [, client] of mcpClients) {
    await disconnectMCPServer(client).catch(() => {})
  }

  return { status: 'task_complete', sessionId, totalInputTokens, totalOutputTokens }
```

- [ ] **Step 5: 验证编译**

```bash
cd apps/server && npx tsc --noEmit
```

---

### Task 4: 快速手动验证

- [ ] **Step 1: 准备测试 MCP server**

创建一个简单的 echo MCP server 用于测试，或者用社区已有的 MCP server（如 Playwright MCP、filesystem MCP）。

简化验证：直接用只能测编译通过和基本逻辑。

- [ ] **Step 2: 添加一个测试角色或修改现有角色**

编辑 `characterStore.ts` 中的 `general` 角色，添加 MCP 工具引用：

```typescript
{ id: 'general', name: 'General', description: '通用助手 (with MCP)',
  color: '#6366f1', role: 'both', maxSteps: 10,
  enabled: true, createdAt: NOW, updatedAt: NOW,
  skills: ['echo-test'],
  tools: [{ name: 'read' }, { name: 'write' }, { name: 'mcp:echo-server' }] },
```

- [ ] **Step 3: 配置 MCP server**

创建一个 echo MCP server，或者手动写 `mcpservers.json`：

```json
[
  {
    "id": "echo-server",
    "name": "echo-server",
    "command": "node",
    "args": ["-e", "const {Server} = require('@modelcontextprotocol/sdk/server/index.js'); const {StdioServerTransport} = require('@modelcontextprotocol/sdk/server/stdio.js'); const {z} = require('zod'); const server = new Server({name:'echo',version:'1'},{capabilities:{tools:{}}}); server.setToolHandler(z.object({text:z.string()}), async (args)=>({content:[{type:'text',text:`echo: ${args.text}`}]})); const t = new StdioServerTransport(); server.connect(t);"],
    "env": {}
  }
]
```

- [ ] **Step 4: 启动应用并发送消息**

```bash
cd apps/server && npm run dev
```

然后通过 WebSocket 发送消息到 `general` 角色，检查工具列表中是否包含 `mcp:echo-server/echo`。
