# Debug Turn Auto-Merger

## Problem

Debug turn files (`data/debug/{sessionId}/*_turn*.json`) accumulate daily. Individual turn files are verbose and hard to consume as coherent conversations. After one day they are no longer needed as separate files and should be consolidated.

## Design

### Merge trigger

The existing `cronRegistry` runs daily at 02:00. After dispatching the daily review event, it calls `mergeOldDebugTurns()`.

### Merge logic (`src/debug/merge-turns.ts`)

1. Scan `data/debug/` for child directories (session folders)
2. For each folder:
   - List files matching `*_turn*.json`, skip if folder already contains any `merged_*.json` (already processed)
   - Parse the timestamp prefix from filenames (e.g. `1782989186573_turn1.json` → `1782989186573`)
   - If the newest timestamp < 24h ago, skip the folder
   - List files matching `*_turn*.json`, sort by name (timestamp prefix)
   - Group into conversations:
     - Iterate sorted files; when `turnN` <= previous file's `turnN`, close the current group and start a new one
     - Each group = one conversation
   - For each group, write `merged_{n}.json`:
     - Format: `{ turns: [{ request, response, timestamp }, ...] }`
     - `n` = 1-based group index within the session
   - Delete the original turn files in the group

### Changes to existing files

- `src/scheduler/cronRegistry.ts`:
  - Generalize to task registry: support registering multiple `CronTask` with `{ name, handler, hour, minute }`
  - Each task tracks its own `lastRun` dedup key separately
  - Daily review event and merge both register as tasks
  - Merge task scheduled at `{ hour: 2, minute: 30 }` (every half-hour slot available for future tasks)

### Edge cases

- Single-turn group: merge into `merged_1.json` as well
- Folder with only merged files: skipped by the `merged_*.json` check
- Empty folder: skipped (no turn files found)
- All turn files less than 24h old: entire folder skipped
