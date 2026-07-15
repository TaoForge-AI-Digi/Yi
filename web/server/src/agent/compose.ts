import type { LLMMessage } from '../llm/client.js'

export interface ComposeContext {
  systemAlerts?: string[]
}

function lastUserIdx(messages: LLMMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i
  }
  return -1
}

export function composeMessages(
  messages: LLMMessage[],
  ctx: ComposeContext,
): LLMMessage[] {
  if (!ctx.systemAlerts?.length) return messages.map(stripReasoning)

  const prefix = ctx.systemAlerts.join('\n')
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
