# Events Engine Refactor

## Motivation

Events engine 目前设计跑偏：session 是 readonly 的"执行外壳"，模型配置塞在 `payload.context`，状态机含无用状态（paused, expired），前端与后端职责混在一起。本次重构让 event 成为"指令包"，拉起正常 session 执行任务。

## Design

### 1. Data Model

**`EventRow` / `CreateEventInput`** 新增顶层字段：

```typescript
export interface CreateEventInput {
  assigned_agent_id: string
  assigned_group_id?: string
  type: 'once' | 'cron'
  cron_expr?: string
  payload: { instruction: string }

  // 原来塞在 payload.context 里的配置，提升为顶层字段
  model?: string
  provider_id?: string
  workspace?: string

  // 调度
  scheduled_at?: number  // 预约时间戳
  priority?: number
}
```

**状态机简化：**

```
pending → running → completed → archived
                  ↘ failed → archived
```

- `pending` — 待执行（包含原来的 pending + paused）
- `running` — 执行中
- `completed` — 成功
- `failed` — 失败
- `archived` — 归档

去掉 `paused`、`expired`。

### 2. EventService

- `create()` — model/provider_id/workspace 直接写字段，不绕 payload.context。**不创建 session**
- `updateStatus()` — 处理 completed/archived
- `archive(id)` — 单条归档
- `archiveOldEvents(autoArchiveHours)` — 查询 completed/failed 超过 TTL 的批量归档
- `completeAndRequeue(id)` — 事件执行完后调用：
  - 如果 `type === 'once'` → status = completed
  - 如果 `type === 'cron'` → 计算下一次 scheduled_at，放回 pending（除非已超过 max_retries）
- `delete(id)` — 只删 event，不碰 session

### 3. EventScheduler

重构为配置驱动单例：

```
class EventScheduler:
  - interval: number (秒，默认 10，从设置读取)
  - timer: IntervalHandle
  
  start(io)
  stop()
  scheduleImmediate(eventId) // 立即触发，不等下一 tick
  setInterval(seconds)       // 运行时修改轮询间隔
  
  tick():
    1. 查 pending 且 scheduled_at <= now 的事件（MAX_CONCURRENT 条）
    2. 每一条：updateStatus → running → executeEvent()
```

`scheduleImmediate()` 由前端"立即触发"按钮调用，绕过轮询延迟。

### 4. EventExecutor

触发 event 时新建 session（不是 event 创建时）：

- session ID: `evts_{event.id}_{timestamp}`（每次执行唯一，支持重试）
- `session_type: 'event'`，不加 `is_readonly`
- session 创建时直接用 event 上的 `model`、`provider_id`、`workspace`（若 event 上没有则 fallback 到角色默认）
- event 的 instruction 作为 session 的 user 消息
- sessionLoop 完成后调用 `completeAndRequeue()`

### 5. Session 与前端 readonly 逻辑

后端：

- 创建 session 时：`session_type: 'event'`, `is_readonly: 0`
- 不再写死 readonly

前端：

- ChatInput 检测 `session_type === 'event'`
- 如果 setting "event readonly" 开启 → 锁输入框 + 弹窗提示"点击允许打断"
- 如果 setting 关闭 → 不做 event 判断

### 6. Frontend EventsView

**列调整：**
- 去掉 `paused`、`expired` 列
- 新增 `completed`、`archived` 列
- 排序：pending → running → completed / failed → archived

**卡片操作：**
- pending: "立即触发"、"放弃（删除）"
- running: 只读展示
- completed/failed: "查看"（跳转 session）、"归档"、"删除"
- archived: "删除"

**创建表单：**
- model/provider_id/workspace 作为独立下拉选择框（不再塞 context）
- "立即" / "预约" / "定时(Cron)" 三种模式

**viewSession(id):** `router.push('/c/' + sessionId)`

### 7. Settings

Event 设置面板：

| 配置项 | key | 类型 | 默认 |
|--------|-----|------|------|
| Scheduler 轮询间隔 | eventPollInterval | number (秒) | 10 |
| 自动归档时间 | eventAutoArchiveHours | number (小时) | 24 |
| 默认不允许打断 | blockEventInterrupt | boolean | true |

### 8. Files Changed

| File | Change |
|------|--------|
| `apps/server/src/event/types.ts` | 重构类型：状态、CreateEventInput、EventRow |
| `apps/server/src/event/eventService.ts` | 新增 archive/archiveOld/completeAndRequeue，改 create |
| `apps/server/src/event/eventScheduler.ts` | 重写为配置驱动单例 |
| `apps/server/src/event/eventExecutor.ts` | 取消 is_readonly，用 event 字段建 session |
| `apps/server/src/event/index.ts` | 更新导出 |
| `apps/server/src/routes/events.ts` | 新增 archive/archiveOld/immediate 路由 |
| `apps/server/src/scheduler/cronRegistry.ts` | 对齐新状态 |
| `apps/client/src/api/events.ts` | 新增 API 方法 |
| `apps/client/src/views/EventsView.vue` | 重写看板、表单、操作 |
| `apps/client/src/api/events.ts` | CreateEventInput 类型更新 |
| `apps/client/src/stores/chat.ts` | session:new 不再硬编码 is_event |
| `apps/client/src/components/ChatInput.vue` | event readonly 前端逻辑 |
| `apps/client/src/components/settings/SessionSettings.vue` | 新增 event 配置项 |
| `apps/server/src/db/schema.ts` | 如有必要调整表结构 |

## Out of Scope

- 事件执行进度的实时推送（完成后已有 event:status_changed）
- 事件重试策略（保留现有 max_retries / incrementRetry）
- 事件编排 / DAG（parent_event_id 保留，但不新增编排能力）
