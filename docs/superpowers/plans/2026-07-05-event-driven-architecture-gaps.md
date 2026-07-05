# 事件驱动架构补全计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有的事件驱动架构从"session 结束后发一条固定审批事件"升级为完整的感知-决策-执行流水线：while 循环内在线顿悟检测、session 结束时三态路由（off/confirm/auto 进化模式）、离线挖掘、前端通知。

**Tech Stack:** TypeScript, better-sqlite3, socket.io

---

## 已就绪（不在本规划范围）

以下事件驱动基础设施已完整实现，规划仅做消费，无需重复建设：

| 组件 | 状态 |
|---|---|
| `routes/events.ts` — 完整 CRUD（GET/POST/PATCH/DELETE） | ✅ 已实现 |
| `eventScheduler.ts` — 10s 间隔轮询 pending 事件，状态机流转 | ✅ 已实现 |
| `eventExecutor.ts` — 创建只读 session，走 sessionLoop，更新结果 | ✅ 已实现 |
| `eventService.ts` — create/list/getPending/updateStatus/incrementRetry/delete | ✅ 已实现 |
| `event/types.ts` — EventRow、EventPayload、EventStatus 类型 | ✅ 已实现 |
| Events 表 DDL（`schema.ts`: events） | ✅ 已实现 |
| Sessions 扩展字段（`session_type`、`event_id`、`is_readonly`） | ✅ 已实现 |
| 只读 session 守卫（`ws/chat.ts`、`outer.ts`） | ✅ 已实现 |
| 前端只读 UI（`ChatArea.vue`、`ChatInput.vue`） | ✅ 已实现 |

## 文件改动总览（仅待办）

| 文件 | 改动 |
|---|---|
| `apps/server/src/db/characterStore.ts` | 删 `DEFAULT_CHARACTERS` + `seedDefaultCharacters()`；CharacterRecord 加 `evolution_mode`/`auto_quota_daily` |
| `apps/server/src/character/store.ts` | 删 `DEFAULT_CONTENT` + `seedDefaultCharacterContent()` |
| `apps/server/src/index.ts` | 删两处 seed 调用 |
| `apps/server/data/characters/4/` | 重命名为 `master_yi/`，id 改为 `master_yi` |
| `apps/server/src/agent/outer.ts` | `'sys_evolver'` → `'master_yi'`；while 循环接入 `detectInsight`；`dispatchSessionCompletedEvent` 三态路由；auto 配额 |
| `apps/server/src/scheduler/cronRegistry.ts` | `'sys_evolver'` → `'master_yi'` |
| `apps/server/src/db/sessionStore.ts` | 新增 `getRecent(days)` 方法 |
| `apps/server/src/evolution/miningPipeline.ts` | **新建** — 从 sessions + messages 拉数据的离线挖掘 |
| `apps/server/src/event/eventExecutor.ts` | Cron 事件分流走程序化挖掘流水线 |
| `apps/server/src/event/types.ts` | `EventPayload` 加 `lookback_days` 字段 |

---

### Task 0: 删除全部种子数据逻辑，角色 ID `sys_evolver` → `master_yi`

**Files:**
- Modify: `apps/server/src/db/characterStore.ts` — 删 `DEFAULT_CHARACTERS` 数组、`seedDefaultCharacters()` 函数、`NOW` 常量
- Modify: `apps/server/src/character/store.ts` — 删 `DEFAULT_CONTENT` 对象、`seedDefaultCharacterContent()` 函数
- Modify: `apps/server/src/index.ts:6-7,24-25` — 删两处 import 和两处调用
- Modify: `apps/server/src/agent/outer.ts:506` — `'sys_evolver'` → `'master_yi'`
- Modify: `apps/server/src/scheduler/cronRegistry.ts:36` — `'sys_evolver'` → `'master_yi'`
- Modify: `apps/server/data/characters/4/character.json` — 磁盘 id `4` → `master_yi`，改目录名

**背景：** `DEFAULT_CHARACTERS` / `DEFAULT_CONTENT` 和对应的 `seed*` 函数是旧时代脚手架，前端从未使用过这些默认角色。用户的真实角色（小红/呆子/小师妹/易大师/结先生）通过前端 UI 写入磁盘。全部删干净，不再自动创建任何角色。

`sys_evolver` 即易大师，`sys_curator` 即结先生，不再是隐藏系统角色，全部改为引用真实角色 ID。

- [ ] **Step 1: 删除 `db/characterStore.ts` 的种子逻辑**

删除：
- `NOW` 常量（如果 `DEFAULT_CHARACTERS` 是唯一引用者）
- `DEFAULT_CHARACTERS` 数组（含 general/coder/reviewer/explorer/sys_evolver/sys_curator）
- `seedDefaultCharacters()` 函数

- [ ] **Step 2: 删除 `character/store.ts` 的种子逻辑**

删除：
- `DEFAULT_CONTENT` 对象（含 general/coder/reviewer/explorer/sys_evolver/sys_curator）
- `seedDefaultCharacterContent()` 函数

- [ ] **Step 3: 更新 `index.ts` 启动入口**

将：
```typescript
import { seedDefaultCharacters } from './db/characterStore.js'
import { seedDefaultCharacterContent } from './character/store.js'
// ...
seedDefaultCharacters()
seedDefaultCharacterContent()
```
删掉这两行 import 和两行调用。

- [ ] **Step 4: 代码中 `'sys_evolver'` 改为 `'master_yi'`**

```typescript
// outer.ts:506
assigned_agent_id: 'master_yi',

// cronRegistry.ts:36
assigned_agent_id: 'master_yi',
```

- [ ] **Step 5: 磁盘角色重命名**

将 `apps/server/data/characters/4/` 目录重命名为 `apps/server/data/characters/master_yi/`，同时将其中 `character.json` 的 `id` 字段从 `"4"` 改为 `"master_yi"`。

### Task 1: `CharacterRecord` 加 `evolution_mode` 字段

**Files:**
- Modify: `apps/server/src/db/characterStore.ts:19-38` — CharacterRecord 接口加两个可选字段

**Interfaces:**
- Produces: `CharacterRecord.evolution_mode?: 'off' | 'confirm' | 'auto'`
- Produces: `CharacterRecord.auto_quota_daily?: number`

- [ ] **Step 1: CharacterRecord 加进化字段**

```typescript
export interface CharacterRecord {
  // ... existing fields ...
  evolution_mode?: 'off' | 'confirm' | 'auto'
  auto_quota_daily?: number
}
```

---

### Task 2: 在线顿悟检测

**Files:**
- Modify: `apps/server/src/agent/outer.ts` — while 循环内调用 `detectInsight`

**Interfaces:**
- Consumes: `detectInsight(toolCallHistory, sessionId, agentId): InsightEvent | null`

- [ ] **Step 1: 添加 import**

```typescript
import { detectInsight } from '../evolution/detectors/onlineDetector.js'
```

- [ ] **Step 2: while 循环内接入顿悟检测**

在 `outer.ts:458-465`（doom loop 检测块）之后、context compaction 块之前，或现有 `result.type === 'final_answer'/break` 之前，插入：

```typescript
const insight = detectInsight(toolCallHistory, sessionId, session.character_id)
if (insight) {
  const charMeta = characterMetaStore.getById(session.character_id)
  const evoMode = charMeta?.evolution_mode || 'confirm'

  if (evoMode !== 'off') {
    const evt = eventService.create({
      source_type: 'agent',
      source_id: session.character_id,
      source_meta: { session_id: session.id, trigger: insight.type },
      assigned_agent_id: 'master_yi',
      type: 'once',
      payload: { instruction: `Analyze patterns from session ${session.id}: ${insight.description}` },
      status: evoMode === 'auto' ? 'pending' : 'paused',
      scheduled_at: Date.now(),
    })

    if (evoMode === 'confirm') {
      socket.emit('event:require_approval', { eventId: evt.id, summary: insight.description })
    }
    // auto 模式：status='pending'，调度器 10s 内自动拉起
  }
}
```

注意：`eventService.create()` 的 `payload` 和 `source_meta` 支持传对象，内部做 `JSON.stringify`。

- [ ] **Step 3: 验证**

触发一次高频工具调用（连续 6+ 次同类工具），确认 `events` 表新增一条 `source_type='agent'` 的记录。

---

### Task 3: 三态路由 + auto 配额

**Files:**
- Modify: `apps/server/src/agent/outer.ts` — `dispatchSessionCompletedEvent` 增加三态判断和配额限制

- [ ] **Step 1: 添加配额追踪器**

在 `outer.ts` 顶部（import 之后）添加：

```typescript
const autoQuotaTracker = new Map<string, { date: string; count: number }>()

function checkAutoQuota(characterId: string, maxDaily: number): boolean {
  const today = new Date().toISOString().slice(0, 10)
  const entry = autoQuotaTracker.get(characterId)
  if (!entry || entry.date !== today) {
    autoQuotaTracker.set(characterId, { date: today, count: 1 })
    return true
  }
  if (entry.count >= maxDaily) return false
  entry.count++
  return true
}
```

- [ ] **Step 2: 更新 `dispatchSessionCompletedEvent` 三态路由**

将 `outer.ts:499-515` 的 `dispatchSessionCompletedEvent` 替换为：

```typescript
function dispatchSessionCompletedEvent(session: import('../db/sessionStore.js').SessionRow) {
  if (session.session_type === 'event') return

  const charMeta = characterMetaStore.getById(session.character_id)
  const evoMode = charMeta?.evolution_mode || 'confirm'
  const autoQuota = charMeta?.auto_quota_daily ?? 3

  if (evoMode === 'off') return

  if (evoMode === 'auto') {
    if (!checkAutoQuota(session.character_id, autoQuota)) {
      console.log(`[quota] Auto-dispatch skipped for ${session.character_id}: daily limit ${autoQuota} reached`)
      return
    }
  }

  try {
    eventService.create({
      source_type: 'agent',
      source_id: session.character_id,
      source_meta: { session_id: session.id, trigger: 'session.completed' },
      assigned_agent_id: 'master_yi',
      type: 'once',
      payload: { instruction: `Session ${session.id} completed, analyze for potential insight extraction` },
      status: evoMode === 'auto' ? 'pending' : 'paused',
      scheduled_at: Date.now(),
    })
  } catch (err) {
    console.warn('[session.completed] Failed to dispatch event:', err)
  }
}
```

---

### Task 4: 离线挖掘流水线

**Files:**
- Modify: `apps/server/src/db/sessionStore.ts` — 新增 `getRecent(days)` 方法
- Create: `apps/server/src/evolution/miningPipeline.ts` — 从 sessions + messages 拉数据的程序化流水线
- Modify: `apps/server/src/event/eventExecutor.ts` — Cron 事件分流
- Modify: `apps/server/src/event/types.ts` — `EventPayload` 加 `lookback_days` 字段

- [ ] **Step 1: 给 sessionStore 加 `getRecent`**

在 `apps/server/src/db/sessionStore.ts` 的 `sessionStore` 对象中新增：

```typescript
getRecent(days: number): SessionRow[] {
  const cutoff = Date.now() - days * 86400000
  return getDb().prepare('SELECT * FROM sessions WHERE created_at >= ? ORDER BY created_at DESC').all(cutoff) as SessionRow[]
},
```

- [ ] **Step 2: 创建 miningPipeline.ts**

```typescript
import { sessionStore } from '../db/sessionStore.js'
import { messageStore } from '../db/messageStore.js'
import { OfflineMiner } from './detectors/offlineMiner.js'
import { InsightExtractor } from './extractors/insightExtractor.js'
import { SkillGenerator } from './generators/skillGenerator.js'

export interface MiningResult {
  clusters_found: number
  skills_generated: string[]
  summary: string
}

function buildToolCallsFromMessages(sessionId: string): { name: string; args: Record<string, any>; result: string; success: boolean; duration: number }[] {
  const msgs = messageStore.getMessages(sessionId)
  const calls: any[] = []
  for (const m of msgs) {
    if (m.role === 'assistant' && m.tool_input) {
      try {
        const parsed = JSON.parse(m.tool_input)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        for (const tc of arr) {
          calls.push({
            name: tc.function?.name || tc.name || 'unknown',
            args: tc.function?.arguments ? JSON.parse(typeof tc.function.arguments === 'string' ? tc.function.arguments : tc.function.arguments) : {},
            result: '',
            success: true,
            duration: 0,
          })
        }
      } catch {}
    } else if (m.role === 'tool' && m.tool_status === 'error') {
      if (calls.length > 0) calls[calls.length - 1].success = false
      if (calls.length > 0) calls[calls.length - 1].result = m.content || ''
    } else if (m.role === 'tool') {
      if (calls.length > 0) calls[calls.length - 1].result = m.content || ''
    }
  }
  return calls
}

export async function runMiningPipeline(lookbackDays = 7): Promise<MiningResult> {
  const sessions = sessionStore.getRecent(lookbackDays)
  if (sessions.length === 0) {
    return { clusters_found: 0, skills_generated: [], summary: 'No sessions found in the last ' + lookbackDays + ' days' }
  }

  const fakeTrajectories = sessions
    .map(s => {
      const toolCalls = buildToolCallsFromMessages(s.id)
      if (toolCalls.length === 0) return null
      return {
        id: s.id,
        session_id: s.id,
        agent_id: s.character_id,
        user_goal: null,
        tool_calls: JSON.stringify(toolCalls),
        summary: null,
        success_rate: null,
        created_at: s.created_at,
      }
    })
    .filter(Boolean) as any[]

  if (fakeTrajectories.length === 0) {
    return { clusters_found: 0, skills_generated: [], summary: 'No tool-using sessions found' }
  }

  const clusters = OfflineMiner.mine(fakeTrajectories, 0.65, 3)
  const results: string[] = []

  for (const c of clusters) {
    const draft = InsightExtractor.extract(c)
    const path = SkillGenerator.generate(draft)
    results.push(draft.name)
  }

  return {
    clusters_found: clusters.length,
    skills_generated: results,
    summary: `Found ${clusters.length} clusters, generated ${results.length} skills: ${results.join(', ')}`,
  }
}
```

- [ ] **Step 3: 修正 SkillGenerator 写盘路径**

将 `apps/server/src/evolution/generators/skillGenerator.ts` 的 `SKILLS_DIR` 改为与 `skill-loader.ts` 同目录（`data/skills`），使生成的 skill 文件能被自动加载。

- [ ] **Step 4: `EventPayload` 加 `lookback_days` 字段**

```typescript
export interface EventPayload {
  instruction: string
  context?: Record<string, any>
  ttl?: number
  lookback_days?: number
  [key: string]: any
}
```

- [ ] **Step 5: 更新 eventExecutor 分流**

在 `apps/server/src/event/eventExecutor.ts` 的 `executeEvent` 函数顶部，创建 session 之前添加：

```typescript
const payload = JSON.parse(evt.payload || '{}')
if (payload.lookback_days) {
  const { runMiningPipeline } = await import('../evolution/miningPipeline.js')
  try {
    const result = await runMiningPipeline(payload.lookback_days)
    const summary = JSON.stringify(result)
    await eventService.updateStatus(evt.id, 'success', { result_summary: summary })
    io.emit('event:status_changed', { eventId: evt.id, status: 'success', result_summary: summary })
  } catch (err: any) {
    await eventService.updateStatus(evt.id, 'failed', { error_log: err.message })
    io.emit('event:status_changed', { eventId: evt.id, status: 'failed', error: err.message })
  }
  return
}
// 原有 sessionLoop 逻辑继续...
```

- [ ] **Step 6: 模拟触发验证**

```bash
curl -X POST http://localhost:PORT/api/events \
  -H "Content-Type: application/json" \
   -d '{"source_type":"system","assigned_agent_id":"master_yi","type":"cron","cron_expr":"0 2 * * *","payload":{"instruction":"test","lookback_days":7},"status":"pending","scheduled_at":0}'
```

确认 events 表状态流转为 pending → running → success，`result_summary` 包含 clusters_found。

---

### Task 5: 审批通知

**Files:**
- Client: 添加 socket 监听 `event:require_approval`

- [ ] **Step 1: 前端监听 `event:require_approval`**

在 `apps/client/src/stores/chat.ts` 或一个独立的 notification store 中添加：

```typescript
socket.on('event:require_approval', (data: { eventId: string; summary: string }) => {
  showNotification({
    title: '新事件待审批',
    message: data.summary,
    action: () => router.push('/events'),
  })
})
```

实际实现取决于前端现有的 notification 机制（Toast、Message、Modal 等）。如果已有通知组件，直接调用。

- [ ] **Step 2: 验证**

在 confirm 模式下触发顿悟，确认前端弹出提示，事件列表出现 `status=paused` 的记录。

---

### Task 6: QA 验证

- [ ] **Off 模式**：角色设 `evolution_mode: 'off'`，高频调用工具 → 无事件产生，无通知
- [ ] **Confirm + 审批**：触发顿悟 → events 表新增 `status=paused`，前端弹出提示 → 手动改 `status=pending` → 调度器拉起只读会话
- [ ] **Auto + 自动执行**：角色设 `evolution_mode: 'auto'` → 事件 `status=pending` → 调度器 10s 内拉起
- [ ] **离线复盘**：手动 `POST /api/events` 带 `lookback_days: 7` → pipeline 执行成功 → skill 文件生成
- [ ] **只读隔离**：`ws/chat.ts` 验证只读会话无法发消息（已有，确认）
- [ ] **Auto 配额上限**：同一角色触发多次，确认达到 `auto_quota_daily` 后不再投递
