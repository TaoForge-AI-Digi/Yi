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

const MAX_TURNS = 10

function rowToLLMMessage(row: MessageRow): LLMMessage {
  if (row.role === 'tool') {
    return {
      role: 'tool',
      content: row.content || null,
      tool_call_id: row.tool_name || 'call_unknown',
    }
  }
  if (row.role === 'assistant' && row.tool_input) {
    try {
      const toolCalls = JSON.parse(row.tool_input)
      return {
        role: 'assistant',
        content: row.content || null,
        tool_calls: toolCalls,
      }
    } catch {
      // malformed tool_input, ignore
    }
  }
  return {
    role: row.role as LLMMessage['role'],
    content: row.content || null,
  }
}

function deepCloneToolCall(tc: ToolCall): ToolCall {
  return {
    id: tc.id,
    type: 'function',
    function: { name: tc.function.name, arguments: tc.function.arguments },
  }
}

export async function runAgent(io: Server, socket: Socket, sessionId: string, signal?: AbortSignal) {
  const session = sessionStore.getById(sessionId)
  if (!session) {
    socket.emit('agent:error', { message: `Session not found: ${sessionId}` })
    return
  }

  const charMeta = characterMetaStore.getById(session.character_id)
  if (!charMeta) {
    socket.emit('agent:error', { message: `Character not found: ${session.character_id}` })
    return
  }

  const charContent = characterContentStore.get(session.character_id)

  const providerId = session.provider_id
  if (!providerId) {
    socket.emit('agent:error', { message: 'No provider configured for session' })
    return
  }

  const provider = providerStore.getById(providerId)
  if (!provider) {
    socket.emit('agent:error', { message: `Provider not found: ${providerId}` })
    return
  }

  const model = session.model || provider.models[0]?.id
  if (!model) {
    socket.emit('agent:error', { message: 'No model configured' })
    return
  }

  const systemParts: string[] = []
  if (charContent.soul) systemParts.push(`## Character\n${charContent.soul}`)
  if (charContent.user) systemParts.push(`## User Info\n${charContent.user}`)
  if (charContent.memory) systemParts.push(`## Memory\n${charContent.memory}`)
  const systemPrompt = systemParts.join('\n\n')

  const rows = messageStore.getMessages(sessionId)

  const messages: LLMMessage[] = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  for (const row of rows) {
    messages.push(rowToLLMMessage(row))
  }

  const toolDefs = getToolDefinitions()
  const tools = toolDefs.length > 0 ? toolDefs : undefined

  let turn = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let done = false

  while (turn < MAX_TURNS && !done && !signal?.aborted) {
    turn++

    let fullText = ''
    let toolCallsAcc: ToolCall[] = []
    let errorText = ''

    const gen = streamChatCompletion({
      baseUrl: provider.base_url,
      apiKey: provider.api_key,
      model,
      messages,
      tools,
      signal,
    })

    for await (const chunk of gen) {
      if (signal?.aborted) break

      if (chunk.type === 'delta') {
        if (chunk.text) {
          fullText += chunk.text
          socket.emit('agent:message', { text: chunk.text })
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
        socket.emit('agent:error', { message: errorText })
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
      role: 'assistant',
      content: fullText,
      tool_input: toolCallsAcc.length > 0 ? JSON.stringify(toolCallsAcc) : null,
    })

    messages.push({
      role: 'assistant',
      content: fullText || null,
      tool_calls: toolCallsAcc.length > 0 ? toolCallsAcc : undefined,
    })

    if (toolCallsAcc.length === 0) {
      done = true
      break
    }

    socket.emit('agent:tool_start', { tool_calls: toolCallsAcc })

    for (const tc of toolCallsAcc) {
      if (signal?.aborted) break
      const { name, arguments: argsStr } = tc.function
      let args: Record<string, string> = {}
      try { args = JSON.parse(argsStr) } catch { args = {} }

      socket.emit('agent:tool_call', { id: tc.id, name, arguments: args })

      const result = await executeTool(name, args, session.workspace || process.cwd())

      messageStore.addMessage(sessionId, {
        role: 'tool',
        content: JSON.stringify({ output: result.output, error: result.error }),
        tool_name: name,
        tool_input: argsStr,
        tool_output: result.output,
        tool_status: result.error ? 'error' : 'success',
      })

      messages.push({
        role: 'tool',
        content: JSON.stringify({ output: result.output, error: result.error }),
        tool_call_id: tc.id,
      })

      socket.emit('agent:tool_result', { id: tc.id, name, result })
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
    const reason = turn >= MAX_TURNS ? 'max_turns' : done ? 'stop' : 'error'
    socket.emit('agent:done', { finish_reason: reason })
  }
}
