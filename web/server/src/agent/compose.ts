import type { LLMMessage } from '../llm/client.js'

export interface ComposeContext {
  timestamp?: string
  systemAlerts?: string[]
}

function formatTimestamp(now: Date): string {
  const offset = -now.getTimezoneOffset()
  const tz = `UTC${offset >= 0 ? '+' : ''}${Math.floor(offset / 60)}:${String(offset % 60).padStart(2, '0')}`
  return `[Current time: ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} (${tz})]`
}

function lastUserIdx(messages: LLMMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i
  }
  return -1
}

export function buildComposeContext(now: Date): ComposeContext {
  return { timestamp: formatTimestamp(now), systemAlerts: [] }
}

export function composeMessages(
  messages: LLMMessage[],
  ctx: ComposeContext,
): LLMMessage[] {
  const parts: string[] = []
  if (ctx.timestamp) parts.push(ctx.timestamp)
  if (ctx.systemAlerts?.length) parts.push(...ctx.systemAlerts)

  const prefix = parts.join('\n')
  if (!prefix) return messages.map(stripReasoning)

  const result = messages.map(stripReasoning)
  const idx = lastUserIdx(result)
  if (idx < 0) return result

  const userMsg = { ...result[idx] }
  const existing = userMsg.content || ''
  userMsg.content = prefix + (existing ? '\n\n' + existing : '')
  result[idx] = userMsg
  return result
}

function stripReasoning(m: LLMMessage): LLMMessage {
  if (!m.reasoning_content) return m
  const msg = { ...m }
  delete msg.reasoning_content
  return msg
}
