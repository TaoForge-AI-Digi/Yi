import { messageStore } from '../db/messageStore.js'
import { characterMetaStore, type ToolBinding } from '../db/characterStore.js'
import { streamChatCompletion, type LLMMessage, type ToolCall } from '../llm/client.js'
import { DANGEROUS_TOOLS, validateConstraints } from '../tools/definitions.js'
import { executeTool } from '../tools/executor.js'
import { getSessionState, isToolApprovedForSession, approveToolForSession } from './session.js'
import type { Strategy } from './session.js'
import type { Server, Socket } from 'socket.io'

export interface ToolCallRecord {
  toolName: string
  hasError: boolean
  error?: string
  args?: string
}

export function detectDoomLoop(toolCallHistory: ToolCallRecord[]): boolean {
  if (toolCallHistory.length < 6) return false
  const recent = toolCallHistory.slice(-6)
  return recent.every(r => r.hasError) || hasRepeatingPattern(recent)
}

function hasRepeatingPattern(recent: ToolCallRecord[]): boolean {
  if (recent.length < 2) return false
  const names = recent.map(r => r.toolName)
  const first = names[0]
  return names.every(n => n === first)
}

function matchToolCall(acc: ToolCall[], tc: ToolCall): ToolCall | undefined {
  if (tc.id) return acc.find(t => t.id === tc.id)
  if (tc.index !== undefined) return acc.find(t => t.index === tc.index)
  return undefined
}

function deepCloneToolCall(tc: ToolCall): ToolCall {
  return { id: tc.id, index: tc.index, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } }
}

function checkToolBinding(characterId: string, toolName: string, args: Record<string, string>): string | null {
  const character = characterMetaStore.getById(characterId)
  if (!character) return null
  const bindings = character.tools
  if (!bindings || bindings.length === 0) return `No tools are enabled for this character`
  const binding = bindings.find((t: ToolBinding) => t.name === toolName)
  if (!binding) return `Tool "${toolName}" is not enabled for this character`
  if (binding.constraints) {
    const constraintError = validateConstraints(toolName, args, binding)
    if (constraintError) return constraintError
  }
  return null
}

function checkStrategy(toolName: string, strategy: Strategy): 'allow' | 'ask' | 'deny' {
  const dangerous = DANGEROUS_TOOLS.includes(toolName)
  if (strategy === 'Plan' && dangerous) return 'deny'
  if (strategy === 'Ask' && dangerous) return 'ask'
  return 'allow'
}

export interface SubAgentRequestData {
  task: string
  target_character_id: string
  sub_strategy?: 'Plan' | 'Ask' | 'Bypass'
  instances: number
}

export interface InnerResult {
  type: 'final_answer' | 'tool_calls_executed' | 'error' | 'aborted' | 'sub_agent_request'
  messages: LLMMessage[]
  fullText: string
  reasoningText: string
  toolCalls: ToolCall[]
  totalInputTokens: number
  totalOutputTokens: number
  error?: string
  toolCallRecords?: ToolCallRecord[]
  subAgentRequest?: SubAgentRequestData
}

export async function innerLoop(
  messages: LLMMessage[],
  tools: any[] | undefined,
  provider: { base_url: string; api_key: string },
  model: string,
  characterId: string,
  workspace: string | undefined,
  io?: Server,
  socket?: Socket,
  sessionId?: string,
  signal?: AbortSignal,
  opts: { thinking?: boolean; reasoning_effort?: string } = {}
): Promise<InnerResult> {
  let fullText = ''
  let reasoningText = ''
  let toolCallsAcc: ToolCall[] = []
  let errorText = ''
  let totalInputTokens = 0
  let totalOutputTokens = 0

  const gen = streamChatCompletion({
    baseUrl: provider.base_url,
    apiKey: provider.api_key,
    model,
    messages,
    tools,
    signal,
    thinking: opts.thinking,
    reasoning_effort: opts.reasoning_effort,
  })

  for await (const chunk of gen) {
    if (signal?.aborted) break

    if (chunk.type === 'delta') {
      if (chunk.reasoning) {
        reasoningText += chunk.reasoning
        socket?.emit('message.delta', { session_id: sessionId, reasoning: chunk.reasoning })
      }
      if (chunk.text) {
        fullText += chunk.text
        socket?.emit('message.delta', { session_id: sessionId, delta: chunk.text })
      }
      if (chunk.tool_calls) {
        for (const tc of chunk.tool_calls) {
          const existing = matchToolCall(toolCallsAcc, tc)
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
      socket?.emit('run.failed', { session_id: sessionId, error: errorText })
      break
    }

    if (chunk.type === 'done' && chunk.usage) {
      totalInputTokens += chunk.usage.input_tokens
      totalOutputTokens += chunk.usage.output_tokens
    }
  }

  if (signal?.aborted) {
    return { type: 'aborted', messages: [], fullText, reasoningText, toolCalls: [], totalInputTokens, totalOutputTokens }
  }
  if (errorText) {
    return { type: 'error', messages: [], fullText, reasoningText, toolCalls: [], totalInputTokens, totalOutputTokens, error: errorText }
  }

  toolCallsAcc = toolCallsAcc.filter(tc => tc.function.name)

  const newMessages: LLMMessage[] = []
  if (fullText || toolCallsAcc.length > 0 || reasoningText) {
    if (sessionId) messageStore.addMessage(sessionId, {
      role: 'assistant', content: fullText,
      reasoning_content: reasoningText || null,
      tool_input: toolCallsAcc.length > 0 ? JSON.stringify(toolCallsAcc) : null,
    })
    const msg: LLMMessage = {
      role: 'assistant', content: fullText || null,
      tool_calls: toolCallsAcc.length > 0 ? toolCallsAcc : undefined,
    }
    if (reasoningText) msg.reasoning_content = reasoningText
    newMessages.push(msg)
  }

  if (toolCallsAcc.length === 0) {
    return { type: 'final_answer', messages: newMessages, fullText, reasoningText, toolCalls: [], totalInputTokens, totalOutputTokens }
  }

  const delegateCall = toolCallsAcc.find(tc => tc.function.name === 'delegate_task')
  if (delegateCall) {
    let args: Record<string, string> = {}
    try { args = JSON.parse(delegateCall.function.arguments) } catch { args = {} }
    const delegateArgs: SubAgentRequestData = {
      task: args.task || '',
      target_character_id: args.target_character_id || '',
      sub_strategy: args.sub_strategy as any,
      instances: parseInt(args.instances as string) || 1,
    }
    return {
      type: 'sub_agent_request',
      messages: newMessages,
      fullText, reasoningText,
      toolCalls: toolCallsAcc,
      totalInputTokens, totalOutputTokens,
      subAgentRequest: delegateArgs,
    }
  }

  const toolCallRecords: ToolCallRecord[] = []

  for (const tc of toolCallsAcc) {
    socket?.emit('tool.started', { session_id: sessionId, tool_call_id: tc.id, tool_name: tc.function.name, tool_input: tc.function.arguments })
    if (signal?.aborted) break
    const { name, arguments: argsStr } = tc.function
    let args: Record<string, string> = {}
    try { args = JSON.parse(argsStr) } catch { args = {} }

    const bindingError = checkToolBinding(characterId, name, args)
    if (bindingError) {
      toolCallRecords.push({ toolName: name, hasError: true, error: bindingError, args: argsStr })
      if (sessionId) messageStore.addMessage(sessionId, { role: 'tool', content: JSON.stringify({ error: bindingError }), tool_name: name, tool_input: JSON.stringify({ call_id: tc.id, args: argsStr }), tool_output: bindingError, tool_status: 'error' })
      newMessages.push({ role: 'tool', content: JSON.stringify({ error: bindingError }), tool_call_id: tc.id })
      socket?.emit('tool.completed', { session_id: sessionId, tool_call_id: tc.id, tool_name: name, tool_output: bindingError, tool_status: 'error', duration_ms: 0 })
      continue
    }

    const strategyState = sessionId ? getSessionState(sessionId) : { current_strategy: 'Bypass' as Strategy }
    const strategyResult = checkStrategy(name, strategyState.current_strategy)

    if (strategyResult === 'deny') {
      const msg = `[Plan] ${name} is not allowed in Plan mode`
      toolCallRecords.push({ toolName: name, hasError: true, error: msg, args: argsStr })
      if (sessionId) messageStore.addMessage(sessionId, { role: 'tool', content: JSON.stringify({ error: msg }), tool_name: name, tool_input: JSON.stringify({ call_id: tc.id, args: argsStr }), tool_output: msg, tool_status: 'error' })
      newMessages.push({ role: 'tool', content: JSON.stringify({ error: msg }), tool_call_id: tc.id })
      socket?.emit('tool.completed', { session_id: sessionId, tool_call_id: tc.id, tool_name: name, tool_output: msg, tool_status: 'error', duration_ms: 0 })
      continue
    }

    if (strategyResult === 'ask') {
      if (!sessionId || !isToolApprovedForSession(sessionId, name)) {
        const choice = await new Promise<'once' | 'always' | 'reject'>((resolve) => {
          if (!socket || !sessionId) { resolve('reject'); return }
          socket.emit('approval.requested', { session_id: sessionId, tool_call_id: tc.id, tool_name: `[Ask] ${name}`, tool_input: JSON.stringify(args) })
          const handler = (data: { tool_call_id: string; choice: 'once' | 'always' | 'reject' }) => {
            if (data.tool_call_id === tc.id) { socket.off('approval.respond', handler); resolve(data.choice) }
          }
          socket.on('approval.respond', handler)
          setTimeout(() => { socket.off('approval.respond', handler); resolve('reject') }, 60000)
        })
        if (choice === 'reject') {
          toolCallRecords.push({ toolName: name, hasError: true, error: `${name} denied`, args: argsStr })
          if (sessionId) messageStore.addMessage(sessionId, { role: 'tool', content: JSON.stringify({ error: `${name} denied` }), tool_name: name, tool_input: JSON.stringify({ call_id: tc.id, args: argsStr }), tool_output: 'Denied by user', tool_status: 'denied' })
          newMessages.push({ role: 'tool', content: JSON.stringify({ error: `${name} denied` }), tool_call_id: tc.id })
          socket?.emit('tool.completed', { session_id: sessionId, tool_call_id: tc.id, tool_name: name, tool_output: 'Denied by user', tool_status: 'denied', duration_ms: 0 })
          continue
        }
        if (choice === 'always' && sessionId) {
          approveToolForSession(sessionId, name)
        }
      }
    }

    const startTime = Date.now()
    const result = await executeTool(name, args, workspace || process.cwd(), signal)
    const duration = Date.now() - startTime

    toolCallRecords.push({ toolName: name, hasError: !!result.error, error: result.error, args: argsStr })

    const toolStatus = result.error ? 'error' : result.escaped ? 'denied' : 'success'
    if (sessionId) messageStore.addMessage(sessionId, {
      role: 'tool', content: JSON.stringify({ output: result.output, error: result.error }),
      tool_name: name, tool_input: JSON.stringify({ call_id: tc.id, args: argsStr }), tool_output: result.error || result.output,
      tool_status: toolStatus,
    })
    newMessages.push({
      role: 'tool', content: JSON.stringify({ output: result.output, error: result.error }),
      tool_call_id: tc.id,
    })
    socket?.emit('tool.completed', { session_id: sessionId, tool_call_id: tc.id, tool_name: name, tool_output: result.error || result.output, tool_status: toolStatus, duration_ms: duration })
  }

  if (signal?.aborted) {
    return { type: 'aborted', messages: newMessages, fullText, reasoningText, toolCalls: toolCallsAcc, totalInputTokens, totalOutputTokens }
  }

  return { type: 'tool_calls_executed', messages: newMessages, fullText, reasoningText, toolCalls: toolCallsAcc, totalInputTokens, totalOutputTokens, toolCallRecords }
}
