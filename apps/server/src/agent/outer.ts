import { sessionStore } from '../db/sessionStore.js'
import { messageStore } from '../db/messageStore.js'
import { characterMetaStore } from '../db/characterStore.js'
import { providerStore } from '../db/providerStore.js'
import { characterContentStore } from '../character/store.js'
import { innerLoop, detectDoomLoop, type ToolCallRecord } from './inner.js'
import { spawnAndRunSubAgent, summarizeAndMerge } from './sub-agent.js'
import { getToolDefinitions } from '../tools/definitions.js'
import type { LLMMessage } from '../llm/client.js'
import type { Server, Socket } from 'socket.io'
import type { MessageRow } from '../db/messageStore.js'

const MAX_TURNS = 20
const DEFAULT_CONTEXT_WINDOW = 128000
const COMPACT_THRESHOLD = 0.75
const KEEP_TURNS = 3

function estimateTokens(messages: LLMMessage[]): number {
  let total = 0
  for (const m of messages) {
    if (m.content) total += m.content.length / 4
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        total += tc.function.name.length / 4 + tc.function.arguments.length / 4
      }
    }
    if (m.reasoning_content) total += m.reasoning_content.length / 4
    total += 4
  }
  return Math.ceil(total)
}

function shouldCompact(messages: LLMMessage[], contextWindow = DEFAULT_CONTEXT_WINDOW): boolean {
  return estimateTokens(messages) > contextWindow * COMPACT_THRESHOLD
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '...'
}

function buildCompactionSummary(msgs: LLMMessage[]): string {
  const parts: string[] = []
  for (const m of msgs) {
    if (m.role === 'user' && m.content) {
      parts.push(`User: ${truncate(m.content, 200)}`)
    } else if (m.role === 'assistant') {
      if (m.content) parts.push(`Assistant: ${truncate(m.content, 200)}`)
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          parts.push(`Tool Call: ${tc.function.name}`)
        }
      }
    } else if (m.role === 'tool') {
      const c = m.content || ''
      parts.push(`Tool Result: ${c.includes('error') ? truncate(c, 100) : 'success'}`)
    }
  }
  return parts.join('\n')
}

function compactHistory(messages: LLMMessage[]): { messages: LLMMessage[]; compacted: boolean } {
  if (messages.length <= 2) return { messages, compacted: false }

  const systemMsg = messages[0]
  let keepEnd = messages.length
  let turnsFound = 0
  for (let i = messages.length - 1; i >= 1 && turnsFound < KEEP_TURNS; i--) {
    if (messages[i].role === 'user') turnsFound++
    keepEnd = i
  }

  if (keepEnd <= 1) return { messages, compacted: false }

  const toCompact = messages.slice(1, keepEnd)
  const summary = buildCompactionSummary(toCompact)

  const compacted: LLMMessage[] = [systemMsg]
  compacted.push({ role: 'system', content: `[Compacted History]\n${summary}` })
  compacted.push(...messages.slice(keepEnd))

  return { messages: compacted, compacted: true }
}

function rowToLLMMessage(row: MessageRow): LLMMessage | null {
  if (row.role === 'tool') {
    let callId = ''
    try { const p = JSON.parse(row.tool_input || '{}'); if (p.call_id) callId = p.call_id } catch {}
    if (!callId) return null
    return { role: 'tool', content: row.content || '', tool_call_id: callId }
  }
  if (row.role === 'assistant' && row.tool_input) {
    try {
      const msg: LLMMessage = { role: 'assistant', content: row.content || null, tool_calls: JSON.parse(row.tool_input) }
      if (row.reasoning_content) msg.reasoning_content = row.reasoning_content
      return msg
    } catch {}
  }
  if (row.role === 'assistant' && !row.content && !row.tool_input) return null
  const msg: LLMMessage = { role: row.role as LLMMessage['role'], content: row.content || '' }
  if (row.reasoning_content) msg.reasoning_content = row.reasoning_content
  return msg
}

export interface RunResult {
  status: 'stop' | 'max_turns' | 'cancelled'
  sessionId: string
  totalInputTokens: number
  totalOutputTokens: number
}

export async function sessionLoop(io: Server, socket: Socket, sessionId: string, signal?: AbortSignal, opts: { thinking?: boolean; reasoning_effort?: string } = {}): Promise<RunResult> {
  const session = sessionStore.getById(sessionId)
  if (!session) { socket.emit('run.failed', { session_id: sessionId, error: 'Session not found' }); return { status: 'stop', sessionId, totalInputTokens: 0, totalOutputTokens: 0 } }

  const charMeta = characterMetaStore.getById(session.character_id)
  if (!charMeta) { socket.emit('run.failed', { session_id: sessionId, error: 'Character not found' }); return { status: 'stop', sessionId, totalInputTokens: 0, totalOutputTokens: 0 } }

  const charContent = characterContentStore.get(session.character_id)

  const providerId = session.provider_id
  if (!providerId) { socket.emit('run.failed', { session_id: sessionId, error: 'No provider configured' }); return { status: 'stop', sessionId, totalInputTokens: 0, totalOutputTokens: 0 } }

  const provider = providerStore.getById(providerId)
  if (!provider) { socket.emit('run.failed', { session_id: sessionId, error: 'Provider not found' }); return { status: 'stop', sessionId, totalInputTokens: 0, totalOutputTokens: 0 } }

  const model = session.model || provider.models[0]?.id
  if (!model) { socket.emit('run.failed', { session_id: sessionId, error: 'No model configured' }); return { status: 'stop', sessionId, totalInputTokens: 0, totalOutputTokens: 0 } }

  const systemParts: string[] = []
  if (charContent.soul) systemParts.push(`## Character\n${charContent.soul}`)
  if (charContent.user) systemParts.push(`## User Info\n${charContent.user}`)
  if (charContent.memory) systemParts.push(`## Memory\n${charContent.memory}`)
  if (session.workspace) systemParts.push(`## Workspace\nYour working directory is: ${session.workspace}\nAll file operations (read/write/edit/glob/bash) use this directory as root. Use paths relative to this directory, or use absolute paths within it.`)
  const activeGroup = session.active_group
  const allChars = characterMetaStore.getAll()
  const delegateTargets = allChars.filter(c => {
    if (c.role !== 'sub' && c.role !== 'both') return false
    if (c.id === session.character_id) return true
    if (!activeGroup) return false
    if (!c.groups || c.groups.length === 0) return false
    return c.groups.includes(activeGroup)
  })
  if (delegateTargets.length > 0) {
    const groupLabel = activeGroup ? `group "${activeGroup}"` : 'no group (self only)'
    systemParts.push(`## Available Delegates\nYou can delegate sub-tasks to other characters using the \`delegate_task\` tool. Available targets (${groupLabel}):\n${
      delegateTargets.map(c => `- id: "${c.id}" (${c.name})${c.id === session.character_id ? ' [self]' : ''} — ${c.description || ''}`).join('\n')
    }\nOnly use \`target_character_id\` from the list above.`)
  }
  const systemPrompt = systemParts.join('\n\n')

  const rows = messageStore.getMessages(sessionId)
  const messages: LLMMessage[] = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  for (const row of rows) { const m = rowToLLMMessage(row); if (m) messages.push(m) }

  const toolDefs = getToolDefinitions()
  const tools = toolDefs.length > 0 ? toolDefs : undefined

  let turn = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const toolCallHistory: ToolCallRecord[] = []

  socket.emit('run.started', { session_id: sessionId })

  while (turn < MAX_TURNS && !signal?.aborted) {
    turn++

    const result = await innerLoop(
      messages, tools, provider, model, session.character_id,
      session.workspace || undefined, io, socket, sessionId, signal, opts,
    )

    totalInputTokens += result.totalInputTokens
    totalOutputTokens += result.totalOutputTokens

    if (result.toolCallRecords) {
      toolCallHistory.push(...result.toolCallRecords)
    }

    messages.push(...result.messages)

    if (result.type === 'sub_agent_request' && result.subAgentRequest) {
      const req = result.subAgentRequest
      try {
        const subResult = await spawnAndRunSubAgent(
          req.task, req.target_character_id,
          session, provider, model,
          req.sub_strategy, signal, 0, io, socket,
        )
        const summary = summarizeAndMerge([subResult])
        const toolCallId = result.toolCalls?.[0]?.id || `delegate_${Date.now()}`
        const summaryContent = `[Sub-agent "${req.target_character_id}" completed]\n\nSummary: ${summary.summary}\n\nConclusions:\n${summary.conclusions.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
        messages.push({
          role: 'tool',
          content: JSON.stringify({ output: summaryContent }),
          tool_call_id: toolCallId,
        })
        messageStore.addMessage(sessionId, {
          role: 'tool',
          content: JSON.stringify({ output: summaryContent }),
          tool_name: 'delegate_task',
          tool_input: JSON.stringify({ call_id: toolCallId, args: req }),
          tool_output: summaryContent,
          tool_status: 'success',
        })
        socket.emit('tool.completed', {
          session_id: sessionId, tool_call_id: toolCallId,
          tool_name: 'delegate_task', tool_output: summaryContent,
          tool_status: 'success', duration_ms: 0,
        })
      } catch (err: any) {
        const errMsg = `Sub-agent delegation failed: ${err.message || err}`
        messages.push({ role: 'tool', content: JSON.stringify({ error: errMsg }), tool_call_id: result.toolCalls?.[0]?.id || '' })
        messageStore.addMessage(sessionId, {
          role: 'tool', content: JSON.stringify({ error: errMsg }),
          tool_name: 'delegate_task', tool_input: JSON.stringify({}),
          tool_output: errMsg, tool_status: 'error',
        })
        socket.emit('tool.completed', {
          session_id: sessionId, tool_call_id: result.toolCalls?.[0]?.id || '',
          tool_name: 'delegate_task', tool_output: errMsg,
          tool_status: 'error', duration_ms: 0,
        })
      }
      continue
    }

    if (result.toolCallRecords?.length && detectDoomLoop(toolCallHistory)) {
      messages.push({
        role: 'system',
        content: '[System Alert] You have been encountering repeated failures in your tool calls. This is a Doom Loop. Please stop your current approach immediately and try a completely different strategy.'
      })
    }

    if (shouldCompact(messages)) {
      const { messages: compacted, compacted: didCompact } = compactHistory(messages)
      if (didCompact) {
        messages.length = 0
        messages.push(...compacted)
        socket.emit('run.compacted', { session_id: sessionId, message: 'Context compacted to manage token usage' })
      }
    }

    if (result.type === 'aborted') break
    if (result.type === 'error') break
    if (result.type === 'final_answer') break
  }

  const completedStatus = signal?.aborted ? 'cancelled' : turn >= MAX_TURNS ? 'max_turns' : 'stop'
  socket.emit('run.completed', { session_id: sessionId, status: completedStatus })

  if (totalInputTokens > 0 || totalOutputTokens > 0) {
    sessionStore.update(sessionId, {
      input_tokens: (session.input_tokens || 0) + totalInputTokens,
      output_tokens: (session.output_tokens || 0) + totalOutputTokens,
    })
  }

  return { status: completedStatus, sessionId, totalInputTokens, totalOutputTokens }
}
