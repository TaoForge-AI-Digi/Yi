# MVP Agent Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working coding agent chat: user picks character + LLM + workspace, types a message, agent runs loop with tools, replies stream back.

**Architecture:** Vue 3 client (thin) → Socket.IO → Hono server runs agent loop (LLM → tool calls → execute → loop). Data stored in SQLite (sessions/messages), JSON (providers), markdown files (characters).

**Tech Stack:** Vue 3 + Vite + socket.io-client (frontend), Node.js + Hono + Socket.IO + better-sqlite3 (backend)

## Global Constraints

- No auth (MVP). No user management.
- All file operations scoped to session's `workspace` directory.
- Tool paths with `..` or symlink escapes trigger approval flow (same as `ask`).
- LLM API: OpenAI-compatible `/chat/completions` with `stream: true`.
- Tool calling format: OpenAI function calling (`tools` parameter in chat completion).
- Provider API keys stored in JSON file (plaintext, MVP).

---
## File Structure

```
Yi-Lin/
├── apps/
│   ├── client/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── App.vue
│   │       ├── api/
│   │       │   ├── client.ts         — base HTTP fetch wrapper
│   │       │   ├── socket.ts         — Socket.IO connection + event types
│   │       │   ├── providers.ts      — provider CRUD
│   │       │   ├── sessions.ts       — session CRUD
│   │       │   └── characters.ts     — character list
│   │       ├── stores/
│   │       │   ├── chat.ts           — session + messages + streaming state
│   │       │   ├── providers.ts      — provider list state
│   │       │   └── characters.ts     — character list state
│   │       └── components/
│   │           ├── Sidebar.vue
│   │           ├── SessionList.vue
│   │           ├── SettingsBtn.vue
│   │           ├── SettingsModal.vue
│   │           ├── ChatArea.vue
│   │           ├── ConfigBar.vue
│   │           ├── MessageList.vue
│   │           ├── MessageItem.vue
│   │           ├── ChatInput.vue
│   │           └── ApprovalDialog.vue
│   └── server/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts              — Hono app + Socket.IO setup
│           ├── agent/
│           │   ├── loop.ts           — agent run loop
│           │   ├── llm.ts            — LLM streaming client
│           │   └── tools.ts          — tool executor (read/write/bash/grep/glob)
│           ├── store/
│           │   ├── schema.ts         — SQLite schema init
│           │   ├── sessions.ts       — session + message CRUD
│           │   ├── providers.ts      — JSON provider store
│           │   └── characters.ts     — character metadata store (characters.json)
│           ├── character/
│           │   └── store.ts          — reads soul/user/memory .md files
│           ├── routes/
│           │   ├── providers.ts      — /api/providers CRUD
│           │   ├── sessions.ts       — /api/sessions CRUD
│           │   └── characters.ts     — /api/characters list
│           └── ws/
│               └── chat.ts           — Socket.IO event handlers
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/client/package.json`
- Create: `apps/client/tsconfig.json`
- Create: `apps/client/vite.config.ts`
- Create: `apps/client/index.html`
- Create: `apps/client/src/main.ts`
- Create: `apps/client/src/App.vue`
- Create: `apps/server/src/index.ts` (minimal: Hono hello world)
- Write: `apps/server/data/providers.json` (seed OpenCode Go)
- Create: `apps/server/data/characters/general/soul.md`
- Create: `apps/server/data/characters/coder/soul.md`
- Create: `apps/server/data/characters/reviewer/soul.md`
- Create: `apps/server/data/characters/explorer/soul.md`

**Step 1: Create server package.json**

```json
{
  "name": "yi-lin-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "hono": "^4.0",
    "@hono/node-server": "^1.0",
    "socket.io": "^4.8",
    "better-sqlite3": "^12.0",
    "glob": "^11.0"
  },
  "devDependencies": {
    "tsx": "^4.19",
    "typescript": "^5.6",
    "@types/better-sqlite3": "^7.6",
    "@types/glob": "^8.1"
  }
}
```

**Step 2: Create server tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 3: Create client package.json**

```json
{
  "name": "yi-lin-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.5",
    "socket.io-client": "^4.8",
    "vue-router": "^4.5",
    "pinia": "^3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0",
    "vite": "^6.0",
    "typescript": "^5.6",
    "vue-tsc": "^2.0"
  }
}
```

**Step 4: Create client tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

**Step 5: Create client vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', changeOrigin: true, ws: true },
    },
  },
})
```

**Step 6: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Yi-Lin</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

**Step 7: Create minimal main.ts**

```typescript
import { createApp } from 'vue'
import App from './App.vue'
createApp(App).mount('#app')
```

**Step 8: Create minimal App.vue**

```vue
<template>
  <div id="app-root">
    <h1>Yi-Lin</h1>
  </div>
</template>
```

**Step 9: Create minimal server entry**

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()
app.get('/health', (c) => c.json({ ok: true }))

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('Yi-Lin server on :3001')
})
```

**Step 10: Seed providers.json**

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

**Step 11: Create character data files**

`soul.md` for each built-in character (from design spec). Create directories:
- `data/characters/general/`
- `data/characters/coder/`
- `data/characters/reviewer/`
- `data/characters/explorer/`

Each gets a `soul.md`, `user.md` (empty), `memory.md` (empty).

**Step 12: Install dependencies and verify**

```bash
cd apps/server && npm install
cd apps/client && npm install
cd apps/server && npx tsx src/index.ts
# Verify: curl localhost:3001/health → {"ok":true}
```

---

### Task 2: Server Data Layer

**Files:**
- Create: `apps/server/src/store/schema.ts`
- Create: `apps/server/src/store/sessions.ts`
- Create: `apps/server/src/store/providers.ts`
- Create: `apps/server/src/store/characters.ts`
- Create: `apps/server/src/character/store.ts`

**Interfaces:**
- `getDb()` → `Database` (singleton, creates tables on first call)
- `sessionStore.list()` / `getById()` / `create()` / `delete()` / `update()`
- `sessionStore.getMessages(sessionId, limit?)` / `addMessage()` / `getMessageCount()`
- `providerStore.getAll()` / `getById()` / `create()` / `update()` / `delete()`
- `characterMetaStore.getAll()` / `getById()` → list from `characters.json`
- `characterContentStore.get(agentId)` → `{ soul, user, memory }` from `.md` files

- [ ] **Step 1: Create schema.ts** — Initialize SQLite DB with sessions + messages tables

```typescript
import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const DATA_DIR = resolve(import.meta.dirname, '../../data')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  mkdirSync(DATA_DIR, { recursive: true })
  db = new Database(resolve(DATA_DIR, 'sessions.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
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
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tool_name TEXT,
      tool_input TEXT,
      tool_output TEXT,
      tool_status TEXT,
      created_at INTEGER NOT NULL
    );
  `)
  return db
}
```

- [ ] **Step 2: Create sessions.ts**

```typescript
import { getDb } from './schema.js'
import type Database from 'better-sqlite3'

export interface SessionRow {
  id: string; character_id: string; title: string
  model: string | null; provider_id: string | null; workspace: string | null
  input_tokens: number; output_tokens: number
  created_at: number; updated_at: number
}

export interface MessageRow {
  id: number; session_id: string; role: string; content: string
  tool_name: string | null; tool_input: string | null
  tool_output: string | null; tool_status: string | null
  created_at: number
}

export const sessionStore = {
  list(limit = 50): SessionRow[] {
    return getDb().prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?').all(limit) as SessionRow[]
  },
  getById(id: string): SessionRow | null {
    return getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | null
  },
  create(data: Partial<SessionRow> & { id: string }): SessionRow {
    const now = Date.now()
    const row: SessionRow = {
      id: data.id, character_id: data.character_id || 'general',
      title: data.title || '', model: data.model || null,
      provider_id: data.provider_id || null, workspace: data.workspace || null,
      input_tokens: data.input_tokens || 0, output_tokens: data.output_tokens || 0,
      created_at: now, updated_at: now,
    }
    getDb().prepare(`INSERT INTO sessions (id, character_id, title, model, provider_id, workspace, input_tokens, output_tokens, created_at, updated_at) VALUES (@id, @character_id, @title, @model, @provider_id, @workspace, @input_tokens, @output_tokens, @created_at, @updated_at)`).run(row)
    return row
  },
  update(id: string, patch: Partial<SessionRow>): SessionRow | null {
    const existing = this.getById(id)
    if (!existing) return null
    const updated = { ...existing, ...patch, updated_at: Date.now() }
    getDb().prepare(`UPDATE sessions SET character_id=@character_id, title=@title, model=@model, provider_id=@provider_id, workspace=@workspace, input_tokens=@input_tokens, output_tokens=@output_tokens, updated_at=@updated_at WHERE id=@id`).run(updated)
    return updated
  },
  delete(id: string): boolean {
    getDb().prepare('DELETE FROM messages WHERE session_id = ?').run(id)
    return getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id).changes > 0
  },

  getMessages(sessionId: string, limit = 200): MessageRow[] {
    return getDb().prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC LIMIT ?').all(sessionId, limit) as MessageRow[]
  },
  getMessageCount(sessionId: string): number {
    const r = getDb().prepare('SELECT COUNT(*) as c FROM messages WHERE session_id = ?').get(sessionId) as { c: number }
    return r.c
  },
  addMessage(sessionId: string, data: Partial<MessageRow> & { role: string }): MessageRow {
    const now = Date.now()
    const row: MessageRow = {
      id: 0, session_id: sessionId, role: data.role, content: data.content || '',
      tool_name: data.tool_name || null, tool_input: data.tool_input || null,
      tool_output: data.tool_output || null, tool_status: data.tool_status || null,
      created_at: now,
    }
    const result = getDb().prepare(`INSERT INTO messages (session_id, role, content, tool_name, tool_input, tool_output, tool_status, created_at) VALUES (@session_id, @role, @content, @tool_name, @tool_input, @tool_output, @tool_status, @created_at)`).run(row)
    row.id = Number(result.lastInsertRowid)
    getDb().prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId)
    return row
  },
}
```

- [ ] **Step 3: Create providers.ts** (JSON file store)

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const DATA_DIR = resolve(import.meta.dirname, '../../data')
const FILE = resolve(DATA_DIR, 'providers.json')
mkdirSync(DATA_DIR, { recursive: true })

export interface ProviderRecord {
  id: string; name: string; base_url: string; api_key: string
  models: Array<{ id: string; name: string }>
}

function readAll(): ProviderRecord[] {
  if (!existsSync(FILE)) return []
  return JSON.parse(readFileSync(FILE, 'utf-8'))
}
function writeAll(items: ProviderRecord[]) {
  writeFileSync(FILE, JSON.stringify(items, null, 2), 'utf-8')
}

export const providerStore = {
  getAll: () => readAll(),
  getById: (id: string) => readAll().find(p => p.id === id) || null,
  create: (data: ProviderRecord) => { const all = readAll(); all.push(data); writeAll(all); return data },
  update: (id: string, patch: Partial<ProviderRecord>) => {
    const all = readAll(); const idx = all.findIndex(p => p.id === id)
    if (idx < 0) return null
    all[idx] = { ...all[idx], ...patch, id }; writeAll(all); return all[idx]
  },
  delete: (id: string) => { const all = readAll(); const filtered = all.filter(p => p.id !== id); if (filtered.length === all.length) return false; writeAll(filtered); return true },
}
```

- [ ] **Step 4: Create character/store.ts** — reads soul/user/memory .md files

```typescript
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const CHAR_DIR = resolve(import.meta.dirname, '../../data/characters')

export const characterContentStore = {
  get(agentId: string) {
    const dir = resolve(CHAR_DIR, agentId)
    const read = (section: string) => {
      const f = resolve(dir, `${section}.md`)
      return existsSync(f) ? readFileSync(f, 'utf-8') : ''
    }
    return { soul: read('soul'), user: read('user'), memory: read('memory') }
  },
}
```

- [ ] **Step 5: Create store/characters.ts** — metadata (characters.json)

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const DATA_DIR = resolve(import.meta.dirname, '../../data')
const FILE = resolve(DATA_DIR, 'characters.json')
mkdirSync(DATA_DIR, { recursive: true })

export interface CharacterRecord {
  id: string; name: string; description?: string; color?: string
  permissions: { files: 'allow' | 'ask' | 'deny'; bash: 'allow' | 'ask' | 'deny' }
  builtIn?: boolean
}

function readAll(): CharacterRecord[] {
  if (!existsSync(FILE)) return []
  try { return JSON.parse(readFileSync(FILE, 'utf-8')) } catch { return [] }
}
function writeAll(items: CharacterRecord[]) { writeFileSync(FILE, JSON.stringify(items, null, 2), 'utf-8') }

const BUILTIN: CharacterRecord[] = [
  { id: 'general', name: 'General', description: '通用助手', color: '#6366f1', permissions: { files: 'allow', bash: 'deny' }, builtIn: true },
  { id: 'coder', name: 'Coder', description: '编程专家', color: '#10b981', permissions: { files: 'allow', bash: 'ask' }, builtIn: true },
  { id: 'reviewer', name: 'Reviewer', description: '代码审查', color: '#f59e0b', permissions: { files: 'deny', bash: 'deny' }, builtIn: true },
  { id: 'explorer', name: 'Explorer', description: '代码探索', color: '#8b5cf6', permissions: { files: 'allow', bash: 'deny' }, builtIn: true },
]

export function seedBuiltinCharacters() {
  const all = readAll()
  const existing = new Set(all.map(a => a.id))
  let changed = false
  for (const c of BUILTIN) {
    if (!existing.has(c.id)) { all.push(c); changed = true }
  }
  if (changed) writeAll(all)
}

export const characterMetaStore = {
  getAll: () => readAll(),
  getById: (id: string) => readAll().find(a => a.id === id) || null,
}
```

---

### Task 3: LLM Client

**Files:**
- Create: `apps/server/src/agent/llm.ts`

**Interfaces:**
- `streamChatCompletion(opts)` → `AsyncGenerator<LLMChunk>`
- `LLMMessage = { role: 'system'|'user'|'assistant'; content: string; tool_calls?: ToolCall[] }`
- `LLMChunk = { type: 'delta'|'done'|'error'; text?; finish_reason?; usage?; tool_calls? }`

- [ ] **Step 1: Create llm.ts**

```typescript
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface LLMChunk {
  type: 'delta' | 'done' | 'error'
  text?: string
  finish_reason?: string
  usage?: { input_tokens: number; output_tokens: number }
  tool_calls?: ToolCall[]
}

export interface LLMOptions {
  baseUrl: string
  apiKey: string
  model: string
  messages: LLMMessage[]
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }>
  signal?: AbortSignal
  onChunk?: (chunk: LLMChunk) => void
}

export async function* streamChatCompletion(opts: LLMOptions): AsyncGenerator<LLMChunk> {
  const { baseUrl, apiKey, model, messages, tools, signal } = opts
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const body: Record<string, unknown> = {
    model, messages, stream: true, stream_options: { include_usage: true },
  }
  if (tools && tools.length > 0) body.tools = tools

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    yield { type: 'error', text: `LLM API ${res.status}: ${text}` }
    return
  }

  const reader = res.body?.getReader()
  if (!reader) { yield { type: 'error', text: 'No response body' }; return }
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') { yield { type: 'done' }; return }

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta || {}
        const finish = parsed.choices?.[0]?.finish_reason

        if (delta.content) {
          yield { type: 'delta', text: delta.content }
        }
        if (delta.tool_calls) {
          // Accumulate tool calls across chunks
          yield { type: 'delta', tool_calls: delta.tool_calls.map((tc: any) => ({
            id: tc.id || '',
            type: 'function' as const,
            function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' },
          }))}
        }
        if (finish) {
          yield {
            type: 'done',
            finish_reason: finish,
            usage: parsed.usage ? {
              input_tokens: parsed.usage.prompt_tokens || parsed.usage.input_tokens || 0,
              output_tokens: parsed.usage.completion_tokens || parsed.usage.output_tokens || 0,
            } : undefined,
          }
          return
        }
      } catch { /* skip malformed SSE lines */ }
    }
  }
  yield { type: 'done' }
}
```

---

### Task 4: Tool Definitions and Executor

**Files:**
- Create: `apps/server/src/agent/tools.ts`

**Interfaces:**
- `getToolDefinitions()` → array of OpenAI tool definitions for read/write/bash/grep/glob
- `executeTool(name, args, workspace)` → `Promise<ToolResult>`
- `ToolResult = { output: string; error?: string; escaped?: boolean }`

- [ ] **Step 1: Create tools.ts**

```typescript
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { resolve, relative, normalize } from 'path'
import { globSync } from 'glob'  // npm install glob

export interface ToolResult {
  output: string
  error?: string
  escaped?: boolean  // true if path escaped workspace
}

function isPathSafe(target: string, workspace: string): boolean {
  const rel = relative(workspace, resolve(workspace, target))
  return !rel.startsWith('..') && !rel.startsWith('/')
}

function assertPathSafe(path: string, workspace: string): void {
  if (!isPathSafe(path, workspace)) {
    throw new PathEscapeError(`Path escapes workspace: ${path}`)
  }
}

export class PathEscapeError extends Error {
  constructor(msg: string) { super(msg); this.name = 'PathEscapeError' }
}

export function getToolDefinitions() {
  return [
    {
      type: 'function' as const,
      function: {
        name: 'read',
        description: 'Read file contents from the workspace',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Path relative to workspace' } },
          required: ['path'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'write',
        description: 'Write content to a file in the workspace',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Path relative to workspace' }, content: { type: 'string', description: 'File content' } },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'bash',
        description: 'Execute a shell command in the workspace directory',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string', description: 'Shell command to execute' } },
          required: ['command'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'grep',
        description: 'Search file contents using a regex pattern',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern' },
            path: { type: 'string', description: 'Directory to search, relative to workspace (optional)' },
          },
          required: ['pattern'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'glob',
        description: 'Find files matching a glob pattern',
        parameters: {
          type: 'object',
          properties: { pattern: { type: 'string', description: 'Glob pattern, relative to workspace' } },
          required: ['pattern'],
        },
      },
    },
  ]
}

export async function executeTool(name: string, args: Record<string, string>, workspace: string): Promise<ToolResult> {
  const start = Date.now()
  try {
    switch (name) {
      case 'read': {
        const p = args.path || ''
        assertPathSafe(p, workspace)
        const fullPath = resolve(workspace, p)
        if (!existsSync(fullPath)) return { output: '', error: `File not found: ${p}` }
        if (statSync(fullPath).size > 1024 * 1024) return { output: '', error: 'File too large (>1MB)' }
        const content = readFileSync(fullPath, 'utf-8')
        return { output: content }
      }
      case 'write': {
        const p = args.path || ''
        assertPathSafe(p, workspace)
        const fullPath = resolve(workspace, p)
        writeFileSync(fullPath, args.content || '', 'utf-8')
        return { output: `Written ${(args.content || '').length} bytes to ${p}` }
      }
      case 'bash': {
        const cmd = args.command || ''
        const output = execSync(cmd, { cwd: workspace, encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 30000 })
        return { output: output.trim() }
      }
      case 'grep': {
        const p = args.path ? resolve(workspace, args.path) : workspace
        assertPathSafe(args.path || '.', workspace)
        const { execSync } = await import('child_process')
        const cmd = `grep -rn "${args.pattern}" "${p}" --include="*" 2>/dev/null || true`
        const output = execSync(cmd, { cwd: workspace, encoding: 'utf-8', maxBuffer: 1024 * 1024 })
        return { output: output.trim() || 'No matches found' }
      }
      case 'glob': {
        const matches = globSync(args.pattern || '', { cwd: workspace, dot: true })
        return { output: matches.join('\n') || 'No files matched' }
      }
      default:
        return { output: '', error: `Unknown tool: ${name}` }
    }
  } catch (err: any) {
    if (err instanceof PathEscapeError) {
      return { output: '', error: err.message, escaped: true }
    }
    return { output: '', error: err.message || String(err) }
  }
}
```

---

### Task 5: Agent Loop

**Files:**
- Create: `apps/server/src/agent/loop.ts`

**Interfaces:**
- `runAgent(io, socket, sessionId, signal)` — orchestrates the full loop: build messages → call LLM → parse tools → execute → loop
- `buildMessages(sessionId, systemPrompt)` → `LLMMessage[]`
- `checkPermission(characterId, toolName)` → `'allow' | 'ask' | 'deny'`

- [ ] **Step 1: Create loop.ts**

```typescript
import { Server, Socket } from 'socket.io'
import { sessionStore, type SessionRow } from '../store/sessions.js'
import { characterContentStore } from '../character/store.js'
import { characterMetaStore } from '../store/characters.js'
import { streamChatCompletion, type LLMMessage, type ToolCall } from './llm.js'
import { getToolDefinitions, executeTool } from './tools.js'

function buildMessages(session: SessionRow): LLMMessage[] {
  const character = characterContentStore.get(session.character_id)
  const parts = [character.soul, character.user, character.memory].filter(Boolean)
  let systemPrompt = parts.join('\n\n')
  if (session.workspace) {
    systemPrompt += `\n\nYou are working in the workspace directory: ${session.workspace}`
  }

  const msgs: LLMMessage[] = [{ role: 'system', content: systemPrompt }]
  const history = sessionStore.getMessages(session.id, 100)
  for (const m of history) {
    if (m.role === 'tool') continue // tool results added as part of running turn
    const msg: LLMMessage = { role: m.role as 'user' | 'assistant', content: m.content }
    if (m.role === 'assistant' && m.tool_name) {
      msg.tool_calls = [{ id: m.tool_name, type: 'function', function: { name: m.tool_name, arguments: m.tool_input || '{}' } }]
    }
    msgs.push(msg)
  }
  return msgs
}

function checkPermission(characterId: string, toolName: string): 'allow' | 'ask' | 'deny' {
  const character = characterMetaStore.getById(characterId)
  if (!character) return 'allow'
  const category = toolName === 'bash' ? 'bash' : 'files'
  return character.permissions[category]
}

async function processToolCalls(
  toolCalls: ToolCall[],
  session: SessionRow,
  io: Server,
  socket: Socket,
): Promise<LLMMessage[]> {
  const results: LLMMessage[] = []
  for (const tc of toolCalls) {
    const name = tc.function.name
    let args: Record<string, string> = {}
    try { args = JSON.parse(tc.function.arguments) } catch { args = {} }

    // Check permission
    const permission = checkPermission(session.character_id, name)
    if (permission === 'deny') {
      results.push({
        role: 'tool',
        content: JSON.stringify({ error: `Tool ${name} is not permitted for this character` }),
        tool_calls: [{ ...tc, function: { ...tc.function, arguments: JSON.stringify(args) } }],
      })
      continue
    }

    if (permission === 'ask') {
      // Request approval from user
      const approved = await new Promise<boolean>((resolve) => {
        socket.emit('approval.requested', {
          session_id: session.id,
          tool_call_id: tc.id,
          tool_name: name,
          description: JSON.stringify(args),
        })
        const onResponse = (data: { tool_call_id: string; choice: 'allow' | 'deny' }) => {
          if (data.tool_call_id === tc.id) {
            socket.off('approval.respond', onResponse)
            resolve(data.choice === 'allow')
          }
        }
        socket.on('approval.respond', onResponse)
        // Timeout after 60s — deny
        setTimeout(() => { socket.off('approval.respond', onResponse); resolve(false) }, 60000)
      })
      if (!approved) {
        results.push({
          role: 'tool',
          content: JSON.stringify({ error: `Tool ${name} was denied by user` }),
          tool_calls: [{ ...tc, function: { ...tc.function, arguments: JSON.stringify(args) } }],
        })
        continue
      }
    }

    // Execute tool
    socket.emit('tool.started', {
      session_id: session.id, tool_call_id: tc.id, tool_name: name, tool_input: JSON.stringify(args),
    })
    const ws = session.workspace || process.cwd()
    const result = await executeTool(name, args, ws)
    socket.emit('tool.completed', {
      session_id: session.id, tool_call_id: tc.id, tool_name: name,
      tool_output: result.error || result.output,
      duration_ms: 0,
    })

    // Save tool message
    sessionStore.addMessage(session.id, {
      role: 'tool',
      tool_name: name,
      tool_input: JSON.stringify(args),
      tool_output: result.error || result.output,
      tool_status: result.error ? 'error' : 'done',
    })

    results.push({
      role: 'tool',
      content: JSON.stringify({ output: result.error ? `Error: ${result.error}` : result.output }),
      tool_calls: [tc],
    })
  }
  return results
}

export async function runAgent(
  io: Server, socket: Socket, sessionId: string, signal: AbortSignal,
) {
  const session = sessionStore.getById(sessionId)
  if (!session) { socket.emit('run.failed', { session_id: sessionId, error: 'Session not found' }); return }

  socket.emit('run.started', { session_id: sessionId })
  let turnCount = 0
  const maxTurns = 20

  while (turnCount < maxTurns) {
    turnCount++
    const messages = buildMessages(session)

    // Resolve provider + model
    const providerId = session.provider_id
    const providers = JSON.parse(await import('fs').then(fs => fs.readFileSync(
      new URL('../../data/providers.json', import.meta.url), 'utf-8'
    )))
    const provider = providers.find((p: any) => p.id === providerId) || providers[0]
    const baseUrl = provider?.base_url || ''
    const apiKey = provider?.api_key || ''
    const model = session.model || provider?.models?.[0]?.id || ''

    // Stream LLM response
    let fullContent = ''
    let accumulatedToolCalls: ToolCall[] = []

    const stream = streamChatCompletion({
      baseUrl, apiKey, model, messages,
      tools: getToolDefinitions(),
      signal,
    })

    for await (const chunk of stream) {
      if (signal.aborted) {
        socket.emit('run.completed', { session_id: sessionId, status: 'cancelled' })
        return
      }
      if (chunk.type === 'delta') {
        if (chunk.text) {
          fullContent += chunk.text
          socket.emit('message.delta', { session_id: sessionId, delta: chunk.text })
        }
        if (chunk.tool_calls) {
          // Accumulate streaming tool call deltas
          for (const tc of chunk.tool_calls) {
            const existing = accumulatedToolCalls.find(e => e.id === tc.id && e.id !== '')
            if (existing) {
              existing.function.name += tc.function.name
              existing.function.arguments += tc.function.arguments
            } else {
              accumulatedToolCalls.push(tc)
            }
          }
        }
      }
      if (chunk.type === 'done') {
        // Save assistant message
        if (fullContent || accumulatedToolCalls.length > 0) {
          sessionStore.addMessage(session.id, {
            role: 'assistant',
            content: fullContent,
            tool_name: accumulatedToolCalls[0]?.function.name || null,
            tool_input: accumulatedToolCalls[0]?.function.arguments || null,
          })
        }
        if (chunk.usage) {
          sessionStore.update(session.id, {
            input_tokens: (session.input_tokens || 0) + chunk.usage.input_tokens,
            output_tokens: (session.output_tokens || 0) + chunk.usage.output_tokens,
          })
        }

        // Process tool calls if any
        if (accumulatedToolCalls.length > 0) {
          const toolResults = await processToolCalls(accumulatedToolCalls, session, io, socket)
          messages.push(...toolResults)
          accumulatedToolCalls = []
          continue // loop back to call LLM with tool results
        }

        socket.emit('run.completed', {
          session_id: sessionId,
          usage: chunk.usage,
        })
        return
      }
      if (chunk.type === 'error') {
        socket.emit('run.failed', { session_id: sessionId, error: chunk.text })
        return
      }
    }
  }

  socket.emit('run.completed', { session_id: sessionId, status: 'max_turns' })
}
```

---

### Task 6: Socket.IO Handlers

**Files:**
- Create: `apps/server/src/ws/chat.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Create ws/chat.ts**

```typescript
import { Server, Socket } from 'socket.io'
import { sessionStore } from '../store/sessions.js'
import { runAgent } from '../agent/loop.js'

const activeRuns = new Map<string, { abort: () => void }>()

export function registerChatSocket(io: Server, socket: Socket) {
  socket.on('chat-run', async (data: Record<string, unknown>, ack?: (resp: unknown) => void) => {
    try {
      const sessionId = data.session_id as string
      if (!sessionId) { ack?.({ error: 'No session_id' }); return }

      // Auto-create session if needed
      let session = sessionStore.getById(sessionId)
      if (!session) {
        session = sessionStore.create({
          id: sessionId,
          character_id: (data.character_id as string) || 'general',
          title: (data.title as string) || '',
          model: (data.model as string) || undefined,
          provider_id: (data.provider_id as string) || undefined,
          workspace: (data.workspace as string) || undefined,
        })
      }

      // Save user message
      const input = (data.input as string) || ''
      if (input.trim()) {
        sessionStore.addMessage(sessionId, { role: 'user', content: input })
      }

      const abortController = new AbortController()
      activeRuns.set(sessionId, { abort: () => abortController.abort() })
      ack?.({ run_id: `run_${sessionId}_${Date.now()}`, status: 'started' })

      await runAgent(io, socket, sessionId, abortController.signal)
    } catch (err) {
      console.error('chat-run error:', err)
      socket.emit('run.failed', { session_id: data.session_id, error: String(err) })
    } finally {
      if (data.session_id) activeRuns.delete(data.session_id as string)
    }
  })

  socket.on('abort', (data: { session_id?: string }) => {
    const sid = data.session_id
    if (sid && activeRuns.has(sid)) {
      activeRuns.get(sid)!.abort()
      activeRuns.delete(sid)
    }
  })
}
```

- [ ] **Step 2: Update server index.ts** — wire up Hono routes, Socket.IO, seed data

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { Server } from 'socket.io'
import { seedBuiltinCharacters } from './store/characters.js'
import { registerChatSocket } from './ws/chat.js'
import providersRouter from './routes/providers.js'
import sessionsRouter from './routes/sessions.js'
import charactersRouter from './routes/characters.js'
import { getDb } from './store/schema.js'

seedBuiltinCharacters()
getDb()

const app = new Hono()
app.use('*', cors())
app.route('/api/providers', providersRouter)
app.route('/api/sessions', sessionsRouter)
app.route('/api/characters', charactersRouter)
app.get('/health', (c) => c.json({ ok: true }))

const port = 3001
const httpServer = serve({ fetch: app.fetch, port }, () => {
  console.log(`Yi-Lin server on :${port}`)
})

const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } })
io.on('connection', (socket) => registerChatSocket(io, socket))
```

---

### Task 7: HTTP Routes

**Files:**
- Create: `apps/server/src/routes/providers.ts`
- Create: `apps/server/src/routes/sessions.ts`
- Create: `apps/server/src/routes/characters.ts`

- [ ] **Step 1: Create routes/providers.ts**

```typescript
import { Hono } from 'hono'
import { providerStore } from '../store/providers.js'

const router = new Hono()

router.get('/', (c) => c.json(providerStore.getAll()))
router.post('/', async (c) => {
  const body = await c.req.json()
  return c.json(providerStore.create(body), 201)
})
router.put('/:id', async (c) => {
  const body = await c.req.json()
  const updated = providerStore.update(c.req.param('id'), body)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})
router.delete('/:id', (c) => {
  if (!providerStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

export default router
```

- [ ] **Step 2: Create routes/sessions.ts**

```typescript
import { Hono } from 'hono'
import { sessionStore } from '../store/sessions.js'

const router = new Hono()

router.get('/', (c) => c.json(sessionStore.list()))
router.post('/', async (c) => {
  const body = await c.req.json()
  const session = sessionStore.create({ id: body.id, ...body })
  return c.json(session, 201)
})
router.delete('/:id', (c) => {
  if (!sessionStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})
router.get('/:id/messages', (c) => {
  const id = c.req.param('id')
  const session = sessionStore.getById(id)
  if (!session) return c.json({ error: 'Not found' }, 404)
  const messages = sessionStore.getMessages(id)
  return c.json({
    session,
    messages,
    total: sessionStore.getMessageCount(id),
  })
})

export default router
```

- [ ] **Step 3: Create routes/characters.ts**

```typescript
import { Hono } from 'hono'
import { characterMetaStore } from '../store/characters.js'

const router = new Hono()
router.get('/', (c) => c.json(characterMetaStore.getAll()))
export default router
```

---

### Task 8: Client API Layer

**Files:**
- Create: `apps/client/src/api/client.ts`
- Create: `apps/client/src/api/socket.ts`
- Create: `apps/client/src/api/providers.ts`
- Create: `apps/client/src/api/sessions.ts`
- Create: `apps/client/src/api/characters.ts`

- [ ] **Step 1: Create api/client.ts** — base HTTP fetch wrapper

```typescript
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`)
  return res.json()
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`)
  return res.json()
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`)
  return res.json()
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(path, { method: 'DELETE' })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`)
}
```

- [ ] **Step 2: Create api/socket.ts** — Socket.IO client + event types

```typescript
import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'], autoConnect: false })
  }
  return socket
}

export function connectSocket() { const s = getSocket(); if (!s.connected) s.connect(); return s }
export function disconnectSocket() { socket?.disconnect(); socket = null }

export interface RunEvent {
  session_id: string
  delta?: string
  tool_call_id?: string
  tool_name?: string
  tool_input?: string
  tool_output?: string
  error?: string
  usage?: { input_tokens: number; output_tokens: number }
}
```

- [ ] **Step 3: Create api/providers.ts**

```typescript
import { apiGet, apiPost, apiPut, apiDelete } from './client'

export interface Provider {
  id: string; name: string; base_url: string; api_key: string
  models: Array<{ id: string; name: string }>
}

export const fetchProviders = () => apiGet<Provider[]>('/api/providers')
export const createProvider = (data: Partial<Provider>) => apiPost<Provider>('/api/providers', data)
export const updateProvider = (id: string, data: Partial<Provider>) => apiPut<Provider>(`/api/providers/${id}`, data)
export const deleteProvider = (id: string) => apiDelete(`/api/providers/${id}`)
```

- [ ] **Step 4: Create api/sessions.ts**

```typescript
import { apiGet, apiPost, apiDelete } from './client'

export interface SessionSummary {
  id: string; character_id: string; title: string
  model: string | null; provider_id: string | null; workspace: string | null
  created_at: number; updated_at: number
}

export type { SessionRow as SessionDetail, MessageRow as MessageDetail } from '../../server/src/store/sessions.js'

export const fetchSessions = () => apiGet<SessionSummary[]>('/api/sessions')
export const createSession = (data: Partial<SessionSummary> & { id: string }) => apiPost<SessionSummary>('/api/sessions', data)
export const deleteSession = (id: string) => apiDelete(`/api/sessions/${id}`)
export const fetchSessionMessages = (id: string) => apiGet<{ session: SessionSummary; messages: any[]; total: number }>(`/api/sessions/${id}/messages`)
```

- [ ] **Step 5: Create api/characters.ts**

```typescript
import { apiGet } from './client'

export interface Character {
  id: string; name: string; description?: string; color?: string
  permissions: { files: string; bash: string }
  builtIn?: boolean
}

export const fetchCharacters = () => apiGet<Character[]>('/api/characters')
```

---

### Task 9: Client Stores

**Files:**
- Create: `apps/client/src/stores/chat.ts`
- Create: `apps/client/src/stores/providers.ts`
- Create: `apps/client/src/stores/characters.ts`

- [ ] **Step 1: Create stores/chat.ts** — Pinia store for sessions, messages, streaming

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { connectSocket, getSocket, type RunEvent } from '@/api/socket'
import * as sessionsApi from '@/api/sessions'

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export interface Message {
  id: string; role: 'user' | 'assistant' | 'tool'; content: string
  tool_name?: string; tool_input?: string; tool_output?: string
  tool_status?: 'running' | 'done' | 'error'
  is_streaming?: boolean
  timestamp: number
}

export interface Session {
  id: string; character_id: string; title: string; messages: Message[]
  model?: string; provider_id?: string; workspace?: string
  created_at: number; updated_at: number
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<Session[]>([])
  const activeSessionId = ref<string | null>(null)
  const activeSession = computed(() => sessions.value.find(s => s.id === activeSessionId.value) || null)
  const isStreaming = ref(false)
  const pendingApproval = ref<{ tool_call_id: string; tool_name: string; description: string } | null>(null)

  async function loadSessions() {
    const list = await sessionsApi.fetchSessions()
    sessions.value = list.map(s => ({ ...s, messages: [] }))
  }

  function createSession(opts: { character_id?: string; model?: string; provider_id?: string; workspace?: string } = {}): Session {
    const session: Session = {
      id: uid(), character_id: opts.character_id || 'general', title: '',
      model: opts.model, provider_id: opts.provider_id, workspace: opts.workspace,
      messages: [], created_at: Date.now(), updated_at: Date.now(),
    }
    sessions.value.unshift(session)
    return session
  }

  async function switchSession(id: string) {
    activeSessionId.value = id
    const s = sessions.value.find(s => s.id === id)
    if (!s || s.messages.length > 0 || s.title) return
    try {
      const data = await sessionsApi.fetchSessionMessages(id)
      s.messages = data.messages.map(m => ({
        id: String(m.id), role: m.role as any, content: m.content,
        tool_name: m.tool_name || undefined, tool_input: m.tool_input || undefined,
        tool_output: m.tool_output || undefined, tool_status: m.tool_status as any || undefined,
        timestamp: m.created_at,
      }))
    } catch { /* new session */ }
  }

  function sendMessage(input: string) {
    let session = activeSession.value
    if (!session) {
      session = createSession()
      activeSessionId.value = session.id
    }

    const userMsg: Message = { id: uid(), role: 'user', content: input, timestamp: Date.now() }
    session.messages.push(userMsg)
    isStreaming.value = true

    const socket = connectSocket()
    socket.emit('chat-run', {
      session_id: session.id,
      character_id: session.character_id,
      input,
      model: session.model || undefined,
      provider_id: session.provider_id || undefined,
      workspace: session.workspace || undefined,
    })

    // Set up one-time handler per run
    const onDelta = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      const last = session!.messages[session!.messages.length - 1]
      if (last?.role === 'assistant' && last.is_streaming) {
        last.content += data.delta || ''
      } else {
        session!.messages.push({
          id: uid(), role: 'assistant', content: data.delta || '',
          is_streaming: true, timestamp: Date.now(),
        })
      }
    }
    const onToolStarted = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      session!.messages.push({
        id: uid(), role: 'tool', content: '',
        tool_name: data.tool_name, tool_input: data.tool_input,
        tool_status: 'running', timestamp: Date.now(),
      })
    }
    const onToolCompleted = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      const tools = session!.messages.filter(m => m.role === 'tool' && m.tool_name === data.tool_name)
      const last = tools[tools.length - 1]
      if (last) { last.tool_status = 'done'; last.tool_output = data.tool_output }
    }
    const onApprovalRequested = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      pendingApproval.value = {
        tool_call_id: data.tool_call_id!, tool_name: data.tool_name!, description: data.tool_input || '',
      }
    }
    const onCompleted = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      const last = session!.messages[session!.messages.length - 1]
      if (last?.is_streaming) last.is_streaming = false
      isStreaming.value = false
      cleanup()
    }
    const onFailed = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      session!.messages.push({ id: uid(), role: 'assistant', content: `Error: ${data.error || 'Unknown'}`, timestamp: Date.now() })
      isStreaming.value = false
      cleanup()
    }

    function cleanup() {
      socket.off('message.delta', onDelta)
      socket.off('tool.started', onToolStarted)
      socket.off('tool.completed', onToolCompleted)
      socket.off('approval.requested', onApprovalRequested)
      socket.off('run.completed', onCompleted)
      socket.off('run.failed', onFailed)
    }

    socket.on('message.delta', onDelta)
    socket.on('tool.started', onToolStarted)
    socket.on('tool.completed', onToolCompleted)
    socket.on('approval.requested', onApprovalRequested)
    socket.on('run.completed', onCompleted)
    socket.on('run.failed', onFailed)
  }

  function respondApproval(choice: 'allow' | 'deny') {
    if (!pendingApproval.value) return
    const socket = getSocket()
    if (socket?.connected && activeSessionId.value) {
      socket.emit('approval.respond', {
        session_id: activeSessionId.value,
        tool_call_id: pendingApproval.value.tool_call_id,
        choice,
      })
    }
    pendingApproval.value = null
  }

  function abortRun() {
    const socket = getSocket()
    if (socket?.connected && activeSessionId.value) {
      socket.emit('abort', { session_id: activeSessionId.value })
    }
  }

  return {
    sessions, activeSessionId, activeSession, isStreaming, pendingApproval,
    loadSessions, createSession, switchSession, sendMessage, respondApproval, abortRun,
  }
})
```

- [ ] **Step 2: Create stores/providers.ts**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '@/api/providers'

export const useProvidersStore = defineStore('providers', () => {
  const providers = ref<api.Provider[]>([])
  async function load() { providers.value = await api.fetchProviders() }
  async function create(data: Partial<api.Provider>) { const p = await api.createProvider(data); providers.value.push(p) }
  async function update(id: string, data: Partial<api.Provider>) {
    const p = await api.updateProvider(id, data)
    const idx = providers.value.findIndex(x => x.id === id)
    if (idx >= 0) providers.value[idx] = p
  }
  async function remove(id: string) { await api.deleteProvider(id); providers.value = providers.value.filter(x => x.id !== id) }
  return { providers, load, create, update, remove }
})
```

- [ ] **Step 3: Create stores/characters.ts**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '@/api/characters'

export const useCharactersStore = defineStore('characters', () => {
  const characters = ref<api.Character[]>([])
  const activeId = ref('general')
  const active = computed(() => characters.value.find(c => c.id === activeId.value) || characters.value[0])

  async function load() { characters.value = await api.fetchCharacters() }
  function setActive(id: string) { activeId.value = id }

  return { characters, activeId, active, load, setActive }
})
```

---

### Task 10: Client Layout + Sidebar

**Files:**
- Create: `apps/client/src/components/Sidebar.vue`
- Create: `apps/client/src/components/SessionList.vue`
- Create: `apps/client/src/components/SettingsBtn.vue`
- Modify: `apps/client/src/App.vue` (layout shell)

- [ ] **Step 1: Update App.vue** — left sidebar + main area layout

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useProvidersStore } from '@/stores/providers'
import { useCharactersStore } from '@/stores/characters'
import Sidebar from '@/components/Sidebar.vue'
import ChatArea from '@/components/ChatArea.vue'

const chatStore = useChatStore()
const providersStore = useProvidersStore()
const charactersStore = useCharactersStore()

onMounted(async () => {
  await Promise.all([
    providersStore.load(),
    charactersStore.load(),
    chatStore.loadSessions(),
  ])
  if (chatStore.sessions.length === 0) {
    chatStore.createSession()
  }
  chatStore.switchSession(chatStore.sessions[0].id)
})
</script>

<template>
  <div class="app-layout">
    <Sidebar />
    <ChatArea />
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; }
.app-layout { display: flex; height: 100%; }
</style>
```

- [ ] **Step 2: Create Sidebar.vue**

```vue
<script setup lang="ts">
import SessionList from './SessionList.vue'
import SettingsBtn from './SettingsBtn.vue'
</script>

<template>
  <aside class="sidebar">
    <SessionList />
    <SettingsBtn />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px; min-width: 260px;
  display: flex; flex-direction: column;
  border-right: 1px solid #e0e0e0;
  background: #f8f9fa;
}
</style>
```

- [ ] **Step 3: Create SessionList.vue**

```vue
<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
const chatStore = useChatStore()
</script>

<template>
  <div class="session-list">
    <div class="session-list-header">
      <span class="title">Sessions</span>
      <button class="new-btn" @click="chatStore.createSession(); chatStore.switchSession(chatStore.sessions[0].id)">+</button>
    </div>
    <div
      v-for="s in chatStore.sessions"
      :key="s.id"
      class="session-item"
      :class="{ active: s.id === chatStore.activeSessionId }"
      @click="chatStore.switchSession(s.id)"
    >
      <span class="session-title">{{ s.title || 'New Chat' }}</span>
    </div>
  </div>
</template>

<style scoped>
.session-list { flex: 1; overflow-y: auto; padding: 8px; }
.session-list-header { display: flex; justify-content: space-between; align-items: center; padding: 4px 0 8px; }
.title { font-weight: 600; font-size: 14px; }
.new-btn { background: none; border: 1px solid #ccc; border-radius: 4px; padding: 2px 8px; cursor: pointer; }
.session-item { padding: 8px; border-radius: 6px; cursor: pointer; font-size: 13px; margin-bottom: 2px; }
.session-item:hover { background: #e9ecef; }
.session-item.active { background: #d0ebff; font-weight: 500; }
</style>
```

- [ ] **Step 4: Create SettingsBtn.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import SettingsModal from './SettingsModal.vue'

const showSettings = ref(false)
</script>

<template>
  <div class="settings-btn-area">
    <button class="settings-btn" @click="showSettings = true">⚙️ Settings</button>
    <SettingsModal v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.settings-btn-area { padding: 8px; border-top: 1px solid #e0e0e0; }
.settings-btn { width: 100%; padding: 6px; background: none; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 13px; }
.settings-btn:hover { background: #e9ecef; }
</style>
```

---

### Task 11: Client Chat Components (ConfigBar, MessageList, ChatInput)

**Files:**
- Create: `apps/client/src/components/ChatArea.vue`
- Create: `apps/client/src/components/ConfigBar.vue`
- Create: `apps/client/src/components/MessageList.vue`
- Create: `apps/client/src/components/MessageItem.vue`
- Create: `apps/client/src/components/ChatInput.vue`
- Create: `apps/client/src/components/ApprovalDialog.vue`

- [ ] **Step 1: Create ChatArea.vue** — main container

```vue
<script setup lang="ts">
import ConfigBar from './ConfigBar.vue'
import MessageList from './MessageList.vue'
import ChatInput from './ChatInput.vue'
import ApprovalDialog from './ApprovalDialog.vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
</script>

<template>
  <main class="chat-area">
    <ConfigBar />
    <MessageList />
    <ChatInput />
    <ApprovalDialog
      v-if="chatStore.pendingApproval"
      :approval="chatStore.pendingApproval"
      @allow="chatStore.respondApproval('allow')"
      @deny="chatStore.respondApproval('deny')"
    />
  </main>
</template>

<style scoped>
.chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
</style>
```

- [ ] **Step 2: Create ConfigBar.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useCharactersStore } from '@/stores/characters'
import { useProvidersStore } from '@/stores/providers'

const chatStore = useChatStore()
const charactersStore = useCharactersStore()
const providersStore = useProvidersStore()

const session = computed(() => chatStore.activeSession)

function onCharacterChange(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  charactersStore.setActive(id)
  if (session.value) session.value.character_id = id
}
function onModelChange(e: Event) {
  if (session.value) session.value.model = (e.target as HTMLSelectElement).value
}
function onProviderChange(e: Event) {
  if (session.value) session.value.provider_id = (e.target as HTMLSelectElement).value
}
function onWorkspaceChange(e: Event) {
  if (session.value) session.value.workspace = (e.target as HTMLSelectElement).value
}
</script>

<template>
  <div v-if="session" class="config-bar">
    <label>Character
      <select :value="session.character_id" @change="onCharacterChange">
        <option v-for="c in charactersStore.characters" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </label>
    <label>Model
      <select :value="session.model || ''" @change="onModelChange">
        <option value="">Default</option>
        <option v-for="p in providersStore.providers" :key="p.id" :value="p.models[0]?.id">{{ p.models[0]?.name || p.models[0]?.id }}</option>
      </select>
    </label>
    <label>Provider
      <select :value="session.provider_id || ''" @change="onProviderChange">
        <option value="">Default</option>
        <option v-for="p in providersStore.providers" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </label>
    <label>Workspace
      <input type="text" :value="session.workspace || ''" @change="onWorkspaceChange" placeholder="/path/to/project" />
    </label>
  </div>
</template>

<style scoped>
.config-bar { display: flex; gap: 12px; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; flex-wrap: wrap; }
.config-bar label { font-size: 12px; color: #666; display: flex; flex-direction: column; gap: 2px; }
.config-bar select, .config-bar input { font-size: 13px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; }
.config-bar input { min-width: 200px; }
</style>
```

- [ ] **Step 3: Create MessageList.vue**

```vue
<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageItem from './MessageItem.vue'

const chatStore = useChatStore()
const listRef = ref<HTMLDivElement>()

watch(() => chatStore.activeSession?.messages.length, async () => {
  await nextTick()
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
})
</script>

<template>
  <div ref="listRef" class="message-list">
    <div v-if="!chatStore.activeSession" class="empty">Select a session</div>
    <MessageItem v-for="msg in chatStore.activeSession?.messages" :key="msg.id" :message="msg" />
  </div>
</template>

<style scoped>
.message-list { flex: 1; overflow-y: auto; padding: 16px; }
.empty { text-align: center; color: #999; margin-top: 40px; }
</style>
```

- [ ] **Step 4: Create MessageItem.vue**

```vue
<script setup lang="ts">
defineProps<{ message: import('@/stores/chat').Message }>()
</script>

<template>
  <div class="message" :class="message.role">
    <div class="bubble">
      <div v-if="message.role === 'tool'" class="tool-card">
        <span class="tool-name">🔧 {{ message.tool_name }}</span>
        <span v-if="message.tool_status === 'running'" class="badge running">running...</span>
        <pre v-if="message.tool_input" class="tool-detail">{{ message.tool_input }}</pre>
        <pre v-if="message.tool_output" class="tool-detail output">{{ message.tool_output }}</pre>
      </div>
      <div v-else class="text-content">
        <span v-if="message.is_streaming && !message.content" class="cursor-blink">▊</span>
        <span style="white-space: pre-wrap">{{ message.content }}</span>
        <span v-if="message.is_streaming && message.content" class="cursor-blink">▊</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message { margin-bottom: 12px; display: flex; }
.message.user { justify-content: flex-end; }
.message.assistant .bubble { background: #f0f0f0; }
.message.user .bubble { background: #007aff; color: white; }
.bubble { max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
.tool-card { font-size: 13px; }
.tool-name { font-weight: 600; }
.badge.running { color: #666; font-size: 12px; margin-left: 8px; }
.tool-detail { background: #f5f5f5; padding: 8px; border-radius: 6px; margin-top: 6px; font-size: 12px; overflow-x: auto; }
.tool-detail.output { background: #e8f5e9; }
.cursor-blink { animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
</style>
```

- [ ] **Step 5: Create ChatInput.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const text = ref('')
const sending = ref(false)

async function handleSend() {
  const input = text.value.trim()
  if (!input || sending.value) return
  sending.value = true
  text.value = ''
  chatStore.sendMessage(input)
  // Reset sending after a short delay to prevent double-send
  setTimeout(() => { sending.value = false }, 500)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
}
</script>

<template>
  <div class="chat-input-area">
    <div class="input-row">
      <textarea
        v-model="text"
        placeholder="Type a message..."
        rows="3"
        @keydown="onKeydown"
      />
      <div class="actions">
        <button v-if="chatStore.isStreaming" class="btn abort" @click="chatStore.abortRun()">■ Stop</button>
        <button v-else class="btn send" @click="handleSend" :disabled="!text.trim()">Send</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-input-area { border-top: 1px solid #e0e0e0; padding: 12px; }
.input-row { display: flex; gap: 8px; align-items: flex-end; }
textarea { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 8px; font-size: 14px; resize: none; font-family: inherit; }
.actions { display: flex; gap: 4px; }
.btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
.btn.send { background: #007aff; color: white; }
.btn.send:disabled { opacity: 0.5; cursor: default; }
.btn.abort { background: #ff3b30; color: white; }
</style>
```

- [ ] **Step 6: Create ApprovalDialog.vue**

```vue
<script setup lang="ts">
defineProps<{ approval: { tool_name: string; description: string } }>()
const emit = defineEmits<{ allow: []; deny: [] }>()
</script>

<template>
  <div class="approval-overlay">
    <div class="approval-dialog">
      <div class="approval-title">Approve Tool: {{ approval.tool_name }}</div>
      <pre class="approval-detail">{{ approval.description }}</pre>
      <div class="approval-actions">
        <button class="btn deny" @click="emit('deny')">Deny</button>
        <button class="btn allow" @click="emit('allow')">Allow</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.approval-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 80px; z-index: 100; }
.approval-dialog { background: white; border-radius: 12px; padding: 20px; min-width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.approval-title { font-weight: 600; font-size: 16px; margin-bottom: 8px; }
.approval-detail { background: #f5f5f5; padding: 12px; border-radius: 8px; font-size: 13px; max-height: 200px; overflow: auto; margin-bottom: 16px; }
.approval-actions { display: flex; gap: 8px; justify-content: flex-end; }
.btn { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
.allow { background: #007aff; color: white; }
.deny { background: #e0e0e0; color: #333; }
</style>
```

---

### Task 12: Settings Modal

**Files:**
- Create: `apps/client/src/components/SettingsModal.vue`

- [ ] **Step 1: Create SettingsModal.vue** — provider CRUD modal

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useProvidersStore } from '@/stores/providers'

const emit = defineEmits<{ close: [] }>()
const store = useProvidersStore()
const editing = ref<{ id?: string; name: string; base_url: string; api_key: string; model_id: string; model_name: string }>({
  name: '', base_url: '', api_key: '', model_id: '', model_name: '',
})

function editProvider(p: any) {
  editing.value = {
    id: p.id, name: p.name, base_url: p.base_url, api_key: p.api_key,
    model_id: p.models[0]?.id || '', model_name: p.models[0]?.name || '',
  }
}
function newProvider() {
  editing.value = { name: '', base_url: '', api_key: '', model_id: '', model_name: '' }
}
async function save() {
  const models = editing.value.model_id ? [{ id: editing.value.model_id, name: editing.value.model_name || editing.value.model_id }] : []
  if (editing.value.id) {
    await store.update(editing.value.id, { name: editing.value.name, base_url: editing.value.base_url, api_key: editing.value.api_key, models })
  } else {
    await store.create({ name: editing.value.name, base_url: editing.value.base_url, api_key: editing.value.api_key, models })
  }
  editing.value = { name: '', base_url: '', api_key: '', model_id: '', model_name: '' }
}
async function remove(id: string) {
  if (confirm('Delete this provider?')) await store.remove(id)
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Provider Settings</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <div v-for="p in store.providers" :key="p.id" class="provider-row">
          <div class="provider-info">
            <strong>{{ p.name }}</strong>
            <span class="url">{{ p.base_url }}</span>
          </div>
          <button @click="editProvider(p)">Edit</button>
          <button @click="remove(p.id)" v-if="!p.builtIn">Delete</button>
        </div>
        <button class="add-btn" @click="newProvider">+ Add Provider</button>
        <div v-if="editing.name || editing.base_url" class="edit-form">
          <input v-model="editing.name" placeholder="Provider name" />
          <input v-model="editing.base_url" placeholder="Base URL" />
          <input v-model="editing.api_key" placeholder="API Key" type="password" />
          <input v-model="editing.model_id" placeholder="Model ID (e.g. deepseek-v4-flash)" />
          <input v-model="editing.model_name" placeholder="Model name (display)" />
          <button @click="save">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 200; }
.modal { background: white; border-radius: 12px; width: 500px; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; }
.modal-body { padding: 16px 20px; }
.provider-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
.provider-info { flex: 1; }
.provider-info .url { font-size: 12px; color: #666; display: block; }
.add-btn, .edit-form { margin-top: 12px; }
.edit-form input { display: block; width: 100%; padding: 6px; margin-bottom: 6px; border: 1px solid #ccc; border-radius: 4px; }
.close-btn { background: none; border: none; font-size: 18px; cursor: pointer; }
</style>
```

---

### Task 13: Self-Review

- [ ] **Step 1: Spec coverage check**

Cross-reference each spec section against tasks:
- Architecture (1) → Task 2 (data layer), Task 3 (LLM), Task 4 (tools), Task 5 (loop), Task 6 (socket)
- Data model (2) → Task 2
- Client components (3) → Tasks 10, 11, 12
- Agent Loop (4) → Task 5
- Tools (5) → Task 4
- Permission (6) → Task 4 (checkPermission in loop.ts), Task 11 (ApprovalDialog.vue), Task 9 (approval respond in chat store)
- Socket.IO protocol (7) → Task 6, Task 9
- HTTP API (8) → Task 7
- Tech stack (9) → Task 1

- [ ] **Step 2: Placeholder scan**
Task list is free of TBDs, TODOs, or vague directives.

- [ ] **Step 3: Type consistency**
- `sessionStore.create()` returns `SessionRow` → matches Task 5 usage
- `session.character_id` used consistently throughout
- `checkPermission` returns `'allow'|'ask'|'deny'` → matches Task 5 loop logic
- Socket.IO event names match between Task 6 server and Task 9 client

---

### Task 14: Integration Smoke Test

- [ ] **Step 1: Start server** — `cd apps/server && npx tsx src/index.ts`
- [ ] **Step 2: Start client** — `cd apps/client && npx vite`
- [ ] **Step 3: Open browser** to `localhost:5173`
- [ ] **Step 4: Verify** — page loads, sidebar shows session, config bar shows characters & providers
- [ ] **Step 5: Type a message** and hit Send — should see streaming response
- [ ] **Step 6: Test tool execution** — ask agent "list files in workspace" or "read package.json"
- [ ] **Step 7: Test permission** — use 'coder' character, ask agent to run a bash command → should show approval dialog
- [ ] **Step 8: Test abort** — click Stop while streaming
- [ ] **Step 9: Test session persistence** — refresh page, sessions should be restored from SQLite
