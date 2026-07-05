# Debug Turn Merger Implementation Plan

**Goal:** Auto-merge debug turn files older than 24h into consolidated session files, with a general-purpose cron task registry.

**Architecture:** Two files: `merge-turns.ts` for merge logic, `cronRegistry.ts` as a general task registry. The merge task registers itself for daily execution at 02:30.

**Tech Stack:** Node.js/TypeScript, fs/path (no additional deps)

## Global Constraints

- Follow existing code style (no comments, async/await where appropriate)
- Use `import.meta.dirname` for relative paths (existing pattern)
- Merge format: `{ turns: [{ request, response, timestamp }, ...] }`

---

### Task 1: Rewrite cronRegistry as general task registry

**Files:**
- Modify: `apps/server/src/scheduler/cronRegistry.ts`

**Interfaces:**
- Produces: `registerCronTask(name, handler, hour, minute)`, `startCronRegistry()`, `stopCronRegistry()`

- [ ] Rewrite `cronRegistry.ts` to support multiple registered tasks with per-task dedup

```typescript
import { eventService } from '../event/eventService.js'
import { mergeOldDebugTurns } from '../debug/merge-turns.js'

interface CronTask {
  name: string
  handler: () => void
  hour: number
  minute: number
}

let cronTimer: ReturnType<typeof setInterval> | null = null
const tasks: CronTask[] = []
const lastRunByTask = new Map<string, string>()

export function registerCronTask(name: string, handler: () => void, hour: number, minute: number) {
  tasks.push({ name, handler, hour, minute })
}

export function startCronRegistry() {
  if (cronTimer) return
  console.log('[cron-registry] Starting (check every 60s)')
  registerCronTask('daily-review', () => {
    console.log('[cron-registry] Dispatching daily review event')
    try {
      eventService.create({
        source_type: 'system',
        source_id: 'cron_daemon',
        assigned_agent_id: 'master_yi',
        type: 'cron',
        cron_expr: '0 2 * * *',
        payload: {
          instruction: 'Scan trajectories from the last 7 days, cluster them, and extract reusable skill patterns',
          lookback_days: 7,
        },
        status: 'pending',
        scheduled_at: Date.now(),
      })
    } catch (err) {
      console.error('[cron-registry] Failed to create daily review event:', err)
    }
  }, 2, 0)
  registerCronTask('merge-debug-turns', () => {
    console.log('[cron-registry] Merging old debug turns')
    mergeOldDebugTurns()
  }, 2, 30)
  cronTimer = setInterval(tick, 60000)
}

export function stopCronRegistry() {
  if (cronTimer) {
    clearInterval(cronTimer)
    cronTimer = null
  }
}

function tick() {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  for (const task of tasks) {
    if (task.hour !== h || task.minute !== m) continue
    const dedup = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${h}:${m}`
    if (lastRunByTask.get(task.name) === dedup) continue
    lastRunByTask.set(task.name, dedup)
    task.handler()
  }
}
```

### Task 2: Create merge-turns.ts

**Files:**
- Create: `apps/server/src/debug/merge-turns.ts`

- [ ] Implement `mergeOldDebugTurns()`

```typescript
import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { resolve } from 'path'

const DEBUG_DIR = resolve(import.meta.dirname, '../../data/debug')

export function mergeOldDebugTurns() {
  let entries: string[]
  try {
    entries = readdirSync(DEBUG_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  } catch {
    return
  }

  const cutoff = Date.now() - 86400000

  for (const sessionId of entries) {
    const dir = resolve(DEBUG_DIR, sessionId)
    const files = readdirSync(dir).filter(f => f.includes('_turn'))

    // already merged
    if (files.some(f => f.startsWith('merged_'))) continue

    // parse timestamps from filenames like "1782989186573_turn1.json"
    const timestamps = files.map(f => {
      const m = f.match(/^(\d+)_turn\d+\.json$/)
      return m ? Number(m[1]) : 0
    }).filter(t => t > 0)

    if (timestamps.length === 0) continue
    if (Math.max(...timestamps) > cutoff) continue // not old enough

    // sort by filename (timestamp prefix)
    files.sort()
    const groups: string[][] = []
    let current: string[] = []
    let prevTurn = 0

    for (const f of files) {
      const m = f.match(/_turn(\d+)\.json$/)
      const turnNum = m ? Number(m[1]) : 0
      if (turnNum <= prevTurn && current.length > 0) {
        groups.push(current)
        current = []
      }
      current.push(f)
      prevTurn = turnNum
    }
    if (current.length > 0) groups.push(current)

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      const turns = group.map(f => {
        const raw = readFileSync(resolve(dir, f), 'utf-8')
        return JSON.parse(raw)
      })
      const mergedFile = resolve(dir, `merged_${i + 1}.json`)
      writeFileSync(mergedFile, JSON.stringify({ turns }, null, 2), 'utf-8')
      for (const f of group) {
        unlinkSync(resolve(dir, f))
      }
    }

    console.log(`[merge-turns] Merged ${sessionId}: ${groups.length} groups from ${files.length} turns`)
  }
}
```
