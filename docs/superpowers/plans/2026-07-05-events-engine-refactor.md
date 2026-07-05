# Events Engine Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor events engine so event is a lightweight "instruction package" that triggers a normal session on execution.

**Architecture:** Event stores all session-needed fields (model, provider_id, workspace) at top level, not in payload. Event creation only inserts into `events` table. On trigger (immediate or scheduled), executor creates a normal session (with `session_type: 'event'` flag, no `is_readonly`), injects instruction as first user message, runs sessionLoop. Scheduler is configurable-interval singleton. Status machine: pending → running → completed/failed → archived.

**Tech Stack:** TypeScript, Hono, better-sqlite3, Vue 3, socket.io

## Global Constraints

- All new fields added via `ALTER TABLE` (matches existing pattern in schema.ts)
- Settings stored in localStorage (matches existing `blockEventInterrupt` pattern)
- Event status CHECK constraint in SQLite rebuilt rather than altered
- Session IDs for triggered events: `evts_{event.id}_{timestamp}`

---

### Task 1: Types — EventStatus, CreateEventInput, EventRow, EventPayload

**Files:**
- Modify: `apps/server/src/event/types.ts`
- Modify: `apps/client/src/api/events.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `EventStatus` (new union), `CreateEventInput` (add model/provider_id/workspace), `EventRow` (same), `EventPayload` (simplify)

- [ ] **Step 1: Update server types.ts**

Replace `EventStatus`:
```typescript
export type EventStatus = 'pending' | 'running' | 'completed' | 'failed' | 'archived'
```

Replace `EventPayload`:
```typescript
export interface EventPayload {
  instruction: string
}
```

Add fields to `EventRow` after `assigned_group_id`:
```typescript
  model: string | null
  provider_id: string | null
  workspace: string | null
```

Add fields to `CreateEventInput`:
```typescript
  model?: string
  provider_id?: string
  workspace?: string
```

- [ ] **Step 2: Update client api/events.ts**

Update `CreateEventInput` to match server (add model/provider_id/workspace, simplify payload).

Update `EventRecord` status union and add model/provider_id/workspace fields.

---

### Task 2: DB Schema — Add columns, migrate status constraint

**Files:**
- Modify: `apps/server/src/db/schema.ts`

- [ ] **Step 1: Add ALTER TABLE calls for new columns**

After the existing `is_readonly` ALTER (line 19), add:
```typescript
try { db.exec('ALTER TABLE events ADD COLUMN model TEXT') } catch { }
try { db.exec('ALTER TABLE events ADD COLUMN provider_id TEXT') } catch { }
try { db.exec('ALTER TABLE events ADD COLUMN workspace TEXT') } catch { }
```

- [ ] **Step 2: Rebuild events table to update CHECK constraint**

Replace the existing `CREATE TABLE IF NOT EXISTS events (...)` block (lines 50-71) with the new schema. Since the table may already exist and contain data, wrap in a migration:

```typescript
// Migrate events status constraint — remove paused/expired, add completed/archived
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events_new (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL CHECK(source_type IN ('user', 'agent', 'system')),
      source_id TEXT,
      source_meta TEXT,
      assigned_agent_id TEXT NOT NULL,
      assigned_group_id TEXT,
      model TEXT,
      provider_id TEXT,
      workspace TEXT,
      type TEXT NOT NULL CHECK(type IN ('once', 'cron')),
      cron_expr TEXT,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      priority INTEGER DEFAULT 0,
      scheduled_at INTEGER,
      started_at INTEGER,
      finished_at INTEGER,
      result_summary TEXT,
      error_log TEXT,
      parent_event_id TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      created_at INTEGER NOT NULL
    );
    INSERT INTO events_new SELECT * FROM events;
    DROP TABLE events;
    ALTER TABLE events_new RENAME TO events;
  `)
} catch { }
```

Note: Use `CREATE TABLE IF NOT EXISTS events_new` so this is idempotent. On subsequent runs the table already exists and the migration is skipped.

Keep the indexes after the CREATE:
```typescript
db.exec('CREATE INDEX IF NOT EXISTS idx_events_status_schedule ON events(status, scheduled_at)')
db.exec('CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_type, source_id)')
```

---

### Task 3: EventService — New methods, update create/updateStatus

**Files:**
- Modify: `apps/server/src/event/eventService.ts`

**Interfaces:**
- Consumes: new types from Task 1, migrated DB from Task 2
- Produces: `eventService.archive(id)`, `eventService.archiveOldEvents(hours)`, `eventService.completeAndRequeue(id)`, updated `create()`, `updateStatus()`

- [ ] **Step 1: Update `create()` to write model/provider_id/workspace**

Add to the INSERT row object (after `assigned_group_id`):
```typescript
      model: input.model || null,
      provider_id: input.provider_id || null,
      workspace: input.workspace || null,
```

Add to the INSERT column/value list:
```sql
model, provider_id, workspace, ... VALUES @model, @provider_id, @workspace, ...
```

- [ ] **Step 2: Add `archive(id)` method**

```typescript
  archive(id: string): EventRow | null {
    return this.updateStatus(id, 'archived', { finished_at: Date.now() })
  },
```

- [ ] **Step 3: Add `archiveOldEvents(hours)` method**

```typescript
  archiveOldEvents(hours: number): number {
    const cutoff = Date.now() - hours * 3600000
    const result = getDb().prepare(
      "UPDATE events SET status = 'archived', finished_at = ? WHERE status IN ('completed', 'failed') AND finished_at IS NOT NULL AND finished_at < ?"
    ).run(Date.now(), cutoff)
    return result.changes
  },
```

- [ ] **Step 4: Add `completeAndRequeue(id)` method**

```typescript
  completeAndRequeue(id: string): EventRow | null {
    const evt = this.getById(id)
    if (!evt) return null
    if (evt.type === 'cron' && evt.cron_expr) {
      // Parse cron and compute next scheduled_at (simple approach: +1 day for daily patterns, +1 hour for hourly)
      // For now, requeue as pending with scheduled_at = now + 1 day
      const next = Date.now() + 86400000
      getDb().prepare('UPDATE events SET status = ?, scheduled_at = ? WHERE id = ?').run('pending', next, id)
      return { ...evt, status: 'pending', scheduled_at: next }
    }
    return this.updateStatus(id, 'completed')
  },
```

- [ ] **Step 5: Update `updateStatus()`** to handle `completed` and `archived` statuses for `finished_at` auto-set:

```typescript
    if (status === 'completed' || status === 'failed' || status === 'archived') patch.finished_at = now
```

---

### Task 4: EventScheduler — Rewrite with configurable interval + scheduleImmediate

**Files:**
- Modify: `apps/server/src/event/eventScheduler.ts`

**Interfaces:**
- Consumes: `eventService` from Task 3, `executeEvent` from Task 5
- Produces: `startEventScheduler(io, interval?)`, `stopEventScheduler()`, `scheduleImmediate(eventId)`, `setSchedulerInterval(seconds)`

- [ ] **Step 1: Rewrite eventScheduler.ts**

Store `io` reference so `scheduleImmediate` can be called from routes without passing io.

```typescript
import { eventService } from './eventService.js'
import { executeEvent } from './eventExecutor.js'
import type { Server } from 'socket.io'

let pollTimer: ReturnType<typeof setInterval> | null = null
let isPolling = false
let currentIntervalMs = 10000
let ioRef: Server | null = null
const MAX_CONCURRENT = 5

export function startEventScheduler(io: Server, intervalMs?: number) {
  if (pollTimer) return
  ioRef = io
  if (intervalMs) currentIntervalMs = intervalMs
  console.log('[event-scheduler] Starting (poll every %dms)', currentIntervalMs)
  pollTimer = setInterval(() => poll(), currentIntervalMs)
  poll()
}

export function stopEventScheduler() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  ioRef = null
  isPolling = false
}

export function setSchedulerInterval(seconds: number) {
  currentIntervalMs = seconds * 1000
}

export async function scheduleImmediate(eventId: string) {
  const io = ioRef
  if (!io) return
  const evt = eventService.getById(eventId)
  if (!evt || evt.status !== 'pending') return
  eventService.updateStatus(evt.id, 'running')
  io.emit('event:status_changed', { eventId: evt.id, status: 'running' })
  executeEvent(evt, io)
}

async function poll() {
  const io = ioRef
  if (!io || isPolling) return
  isPolling = true
  try {
    const events = eventService.getPending(MAX_CONCURRENT)
    for (const evt of events) {
      eventService.updateStatus(evt.id, 'running')
      io.emit('event:status_changed', { eventId: evt.id, status: 'running' })
      executeEvent(evt, io).catch(async (err) => {
        console.error('[event-scheduler] Event %s failed:', evt.id, err)
        eventService.incrementRetry(evt.id)
        io.emit('event:status_changed', { eventId: evt.id, status: 'failed', error: err.message })
      })
    }
  } finally {
    isPolling = false
  }
}
```

- [ ] **Step 2: Update event/index.ts exports**

Add `scheduleImmediate` and `setSchedulerInterval` to exports.

---

### Task 5: EventExecutor — Wire completeAndRequeue

**Files:**
- Modify: `apps/server/src/event/eventExecutor.ts`

**Interfaces:**
- Consumes: `eventService.completeAndRequeue(id)` from Task 3
- Produces: nothing new (keeps `executeEvent` signature)

- [ ] **Step 1: Replace terminal status update with completeAndRequeue**

In `executeEvent()`, change the end (after sessionLoop completes) from:
```typescript
  const status = result.status === 'cancelled' ? 'failed' : 'success'
  ...
  await eventService.updateStatus(evt.id, status, { result_summary: resultSummary })
```
to:
```typescript
  if (result.status === 'cancelled') {
    await eventService.updateStatus(evt.id, 'failed', { result_summary: 'Cancelled' })
    io.emit('event:status_changed', { eventId: evt.id, status: 'failed' })
    return
  }
  await eventService.completeAndRequeue(evt.id)
```

---

### Task 6: Routes — New endpoints (trigger, archive, archive-old)

**Files:**
- Modify: `apps/server/src/routes/events.ts`

**Interfaces:**
- Consumes: `eventService.archive()`, `eventService.archiveOldEvents()` from Task 3, `scheduleImmediate()` from Task 4

- [ ] **Step 1: Add POST /:id/trigger endpoint**

```typescript
import { scheduleImmediate } from '../event/eventScheduler.js'

router.post('/:id/trigger', (c) => {
  const evt = eventService.getById(c.req.param('id'))
  if (!evt) return c.json({ error: 'Not found' }, 404)
  if (evt.status !== 'pending') return c.json({ error: 'Event is not pending' }, 400)
  scheduleImmediate(evt.id)
  return c.json({ ok: true })
})
```

`scheduleImmediate` uses the `ioRef` stored internally by `startEventScheduler`.

- [ ] **Step 2: Add POST /:id/archive endpoint**

```typescript
router.post('/:id/archive', (c) => {
  const updated = eventService.archive(c.req.param('id'))
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})
```

- [ ] **Step 3: Add POST /archive-old endpoint**

```typescript
router.post('/archive-old', async (c) => {
  const body = await c.req.json()
  const hours = body.hours ?? 24
  const count = eventService.archiveOldEvents(hours)
  return c.json({ archived: count })
})
```

---

### Task 7: Client API — New methods + types

**Files:**
- Modify: `apps/client/src/api/events.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `triggerEvent(id)`, `archiveEvent(id)`, `archiveOldEvents(hours)`, updated types

- [ ] **Step 1: Add API methods**

```typescript
export const triggerEvent = (id: string) => apiPost<{ ok: boolean }>(`/api/events/${id}/trigger`)
export const archiveEvent = (id: string) => apiPost<EventRecord>(`/api/events/${id}/archive`)
export const archiveOldEvents = (hours?: number) => apiPost<{ archived: number }>('/api/events/archive-old', { hours })
```

Add `sessionId` to `EventRecord` for viewSession navigation.

---

### Task 8: EventsView — Rewrite columns, form, operations

**Files:**
- Modify: `apps/client/src/views/EventsView.vue`

**Interfaces:**
- Consumes: API methods from Task 7

- [ ] **Step 1: Rewrite status columns**

Replace with: `pending`, `running`, `completed`, `failed`, `archived`.

Update `statusColors`, `statusColumns`, `groupedByStatus`.

- [ ] **Step 2: Update card actions**

- pending: "立即触发" (calls `triggerEvent(evt.id)`), "放弃" (calls `deleteEvent(evt.id)`)
- running: readonly display (no actions)
- completed/failed: "查看" (router.push `/c/${evt.sessionId}`), "归档" (calls `archiveEvent(evt.id)`), "删除"
- archived: "删除" only

- [ ] **Step 3: Update create form**

Add model/provider_id/workspace as dropdown selects (reusing the provider store & selectedProviderModels logic that already exists).

Remove context-building logic from `handleCreate()` — just pass `{ instruction }` as payload.

- [ ] **Step 4: Update viewSession()**

```typescript
function viewSession(evt: EventRecord) {
  router.push(`/c/${evt.sessionId}`)
}
```

- [ ] **Step 5: Remove paused/expired filters from filter dropdown**

---

### Task 9: Settings — Event config panel + ChatInput readonly

**Files:**
- Modify: `apps/client/src/components/settings/SessionSettings.vue`
- Modify: `apps/client/src/components/ChatInput.vue`
- Modify: `apps/client/src/stores/chat.ts`

- [ ] **Step 1: Add event settings to SessionSettings.vue**

```vue
<SettingRow label="Scheduler 轮询间隔(秒)" hint="事件调度器检查待执行事件的间隔">
  <input type="number" v-model="eventPollInterval" @change="savePollInterval" min="1" style="width:80px" />
</SettingRow>
<SettingRow label="自动归档时间(小时)" hint="完成后超过此时长自动归档">
  <input type="number" v-model="eventAutoArchiveHours" @change="saveAutoArchive" min="1" style="width:80px" />
</SettingRow>
```

With:
```typescript
const eventPollInterval = ref(parseInt(localStorage.getItem('eventPollInterval') || '10'))
const eventAutoArchiveHours = ref(parseInt(localStorage.getItem('eventAutoArchiveHours') || '24'))
function savePollInterval() { localStorage.setItem('eventPollInterval', String(eventPollInterval.value)) }
function saveAutoArchive() { localStorage.setItem('eventAutoArchiveHours', String(eventAutoArchiveHours.value)) }
```

- [ ] **Step 2: ChatInput.vue — already has event readonly logic, verify it works**

The existing code at lines 12-16 already handles this:
```typescript
const isEventSession = computed(() => chatStore.activeSession?.session_type === 'event')
const blockEventInterrupt = localStorage.getItem('blockEventInterrupt') === 'true'
const permitEventInput = ref(false)
function permitInput() { permitEventInput.value = true }
const inputDisabled = computed(() => isReadonly.value || (isEventSession.value && blockEventInterrupt && !permitEventInput.value))
```

No changes needed — this already matches the new design where `is_readonly` on event sessions is `0` and readonly is purely frontend-driven.

- [ ] **Step 3: Update chat.ts session:new handler — remove hardcoded is_readonly: 1**

Change line 183 from `is_readonly: 1` to `is_readonly: 0`.

---

### Task 10: CronRegistry — Align event creation with new types

**Files:**
- Modify: `apps/server/src/scheduler/cronRegistry.ts`

- [ ] **Step 1: Update eventService.create() calls**

The cron registry creates events with `eventService.create()`. Ensure the calls pass only `{ instruction }` as payload (no context): already correctly structured as `payload: { instruction: ..., lookback_days: 7 }` — no change needed.

---

### Task 11: Verify and cleanup

- [ ] **Step 1: Run TypeScript check**

```bash
cd apps/server; npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Restart dev server and test flow**

- Create an event via UI
- Verify it appears in pending column
- Click "立即触发" → verify status changes to running, session appears in sidebar
- Verify session is NOT readonly (can type into chat)
- Verify cron event is requeued to pending after completion
- Archive a completed event, verify it moves to archived
- Verify auto-archive works after configured hours

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/event/ apps/server/src/routes/events.ts apps/server/src/db/schema.ts apps/server/src/scheduler/cronRegistry.ts apps/client/src/
git commit -m "refactor: events engine - event triggers normal session, simplified state machine"
```
