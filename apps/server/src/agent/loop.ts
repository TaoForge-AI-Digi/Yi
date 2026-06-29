import { sessionStore } from '../db/sessionStore.js'
import { messageStore } from '../db/messageStore.js'
import { characterMetaStore } from '../db/characterStore.js'
import { providerStore } from '../db/providerStore.js'
import { characterContentStore } from '../character/store.js'
import { streamChatCompletion, type LLMMessage, type ToolCall } from '../llm/client.js'
import { getToolDefinitions } from '../tools/definitions.js'
import { executeTool } from '../tools/executor.js'
import type { Server, Socket } from 'socket.io'
import type { MessageRow } from '../db/messageStore.js'

const MAX_TURNS = 20

function rowToLLMMessage(row: MessageRow): LLMMessage {
  if (row.role === 'tool') {
    return { role: 'tool', content: row.content || null, tool_call_id: row.tool_name || 'call_unknown' }
  }
  if (row.role === 'assistant' && row.tool_input) {
    try { return { role: 'assistant', content: row.content || null, tool_calls: JSON.parse(row.tool_input) } } catch {}
  }
  return { role: row.role as LLMMessage['role'], content: row.content || null }
}

function deepCloneToolCall(tc: ToolCall): ToolCall {
  return { id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } }
}

function checkPermission(characterId: string, toolName: string): 'allow' | 'ask' | 'deny' {
  const character = characterMetaStore.getById(characterId)
  if (!character) return 'allow'
  const category = toolName === 'bash' ? 'bash' : 'files'
  return character.permissions[category]
}

export async function runAgent(io: Server, socket: Socket, sessionId: string, signal?: AbortSignal) {
  const session = sessionStore.getById(sessionId)
  if (!session) { socket.emit('run.failed', { session_id: sessionId, error: 'Session not found' }); return }

  const charMeta = characterMetaStore.getById(session.character_id)
  if (!charMeta) { socket.emit('run.failed', { session_id: sessionId, error: 'Character not found' }); return }

  const charContent = characterContentStore.get(session.character_id)

  const providerId = session.provider_id
  if (!providerId) { socket.emit('run.failed', { session_id: sessionId, error: 'No provider configured' }); return }

  const provider = providerStore.getById(providerId)
  if (!provider) { socket.emit('run.failed', { session_id: sessionId, error: 'Provider not found' }); return }

  const model = session.model || provider.models[0]?.id
  if (!model) { socket.emit('run.failed', { session_id: sessionId, error: 'No model configured' }); return }

  const systemParts: string[] = []
  if (charContent.soul) systemParts.push(`## Character\n${charContent.soul}`)
  if (charContent.user) systemParts.push(`## User Info\n${charContent.user}`)
  if (charContent.memory) systemParts.push(`## Memory\n${charContent.memory}`)
  const systemPrompt = systemParts.join('\n\n')

  const rows = messageStore.getMessages(sessionId)
  const messages: LLMMessage[] = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  for (const row of rows) messages.push(rowToLLMMessage(row))

  const toolDefs = getToolDefinitions()
  const tools = toolDefs.length > 0 ? toolDefs : undefined

  let turn = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let done = false

  socket.emit('run.started', { session_id: sessionId })

  while (turn < MAX_TURNS && !done && !signal?.aborted) {
    turn++

    let fullText = ''
    let toolCallsAcc: ToolCall[] = []
    let errorText = ''

    const gen = streamChatCompletion({
      baseUrl: provider.base_url, apiKey: provider.api_key, model, messages, tools, signal,
    })

    for await (const chunk of gen) {
      if (signal?.aborted) break

      if (chunk.type === 'delta') {
        if (chunk.text) {
          fullText += chunk.text
          socket.emit('message.delta', { session_id: sessionId, delta: chunk.text })
        }
        if (chunk.tool_calls) {
          for (const tc of chunk.tool_calls) {
            const existing = toolCallsAcc.find(t => t.id === tc.id)
            if (existing) {
              if (tc.function.name) existing.function.name += tc.function.name
              if (tc.function.arguments) existing.function.arguments += tc.function.arguments
            } else {
              toolCallsAcc.push(deepCloneToolCall(tc))
            }
          }
        }
      }

      if (chunk.type === 'error') {
        errorText = chunk.text || 'LLM error'
        socket.emit('run.failed', { session_id: sessionId, error: errorText })
        break
      }

      if (chunk.type === 'done' && chunk.usage) {
        totalInputTokens += chunk.usage.input_tokens
        totalOutputTokens += chunk.usage.output_tokens
      }
    }

    if (signal?.aborted) break
    if (errorText) break

    messageStore.addMessage(sessionId, {
      role: 'assistant', content: fullText,
      tool_input: toolCallsAcc.length > 0 ? JSON.stringify(toolCallsAcc) : null,
    })
    messages.push({
      role: 'assistant', content: fullText || null,
      tool_calls: toolCallsAcc.length > 0 ? toolCallsAcc : undefined,
    })

    if (toolCallsAcc.length === 0) { done = true; break }

    for (const tc of toolCallsAcc) {
      socket.emit('tool.started', { session_id: sessionId, tool_call_id: tc.id, tool_name: tc.function.name, tool_input: tc.function.arguments })
      if (signal?.aborted) break
      const { name, arguments: argsStr } = tc.function
      let args: Record<string, string> = {}
      try { args = JSON.parse(argsStr) } catch { args = {} }

      const permission = checkPermission(session.character_id, name)
      if (permission === 'deny') {
        messageStore.addMessage(sessionId, { role: 'tool', content: JSON.stringify({ error: `${name} not permitted` }), tool_name: name, tool_input: argsStr, tool_output: '', tool_status: 'error' })
        messages.push({ role: 'tool', content: JSON.stringify({ error: `${name} not permitted` }), tool_call_id: tc.id })
        socket.emit('tool.completed', { session_id: sessionId, tool_call_id: tc.id, tool_name: name, tool_output: 'Not permitted', duration_ms: 0 })
        continue
      }

      if (permission === 'ask') {
        const approved = await new Promise<boolean>((resolve) => {
          socket.emit('approval.requested', { session_id: sessionId, tool_call_id: tc.id, tool_name: name, tool_input: JSON.stringify(args) })
          const handler = (data: { tool_call_id: string; choice: 'allow' | 'deny' }) => {
            if (data.tool_call_id === tc.id) { socket.off('approval.respond', handler); resolve(data.choice === 'allow') }
          }
          socket.on('approval.respond', handler)
          setTimeout(() => { socket.off('approval.respond', handler); resolve(false) }, 60000)
        })
        if (!approved) {
          messageStore.addMessage(sessionId, { role: 'tool', content: JSON.stringify({ error: `${name} denied` }), tool_name: name, tool_input: argsStr, tool_output: '', tool_status: 'denied' })
          messages.push({ role: 'tool', content: JSON.stringify({ error: `${name} denied` }), tool_call_id: tc.id })
          socket.emit('tool.completed', { session_id: sessionId, tool_call_id: tc.id, tool_name: name, tool_output: 'Denied by user', duration_ms: 0 })
          continue
        }
      }

      const startTime = Date.now()
      const result = await executeTool(name, args, session.workspace || process.cwd())
      const duration = Date.now() - startTime

      messageStore.addMessage(sessionId, {
        role: 'tool', content: JSON.stringify({ output: result.output, error: result.error }),
        tool_name: name, tool_input: argsStr, tool_output: result.output,
        tool_status: result.error ? 'error' : result.escaped ? 'denied' : 'success',
      })
      messages.push({
        role: 'tool', content: JSON.stringify({ output: result.output, error: result.error }),
        tool_call_id: tc.id,
      })
      socket.emit('tool.completed', { session_id: sessionId, tool_call_id: tc.id, tool_name: name, tool_output: result.error || result.output, duration_ms: duration })
    }

    if (signal?.aborted) break
  }

  if (totalInputTokens > 0 || totalOutputTokens > 0) {
    sessionStore.update(sessionId, {
      input_tokens: (session.input_tokens || 0) + totalInputTokens,
      output_tokens: (session.output_tokens || 0) + totalOutputTokens,
    })
  }

  if (!signal?.aborted) {
    socket.emit('run.completed', { session_id: sessionId, status: turn >= MAX_TURNS ? 'max_turns' : 'stop' })
  }
}
