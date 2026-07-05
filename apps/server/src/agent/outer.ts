import { sessionStore } from '../db/sessionStore.js'
import { messageStore } from '../db/messageStore.js'
import { characterMetaStore } from '../db/characterStore.js'
import { providerStore } from '../db/providerStore.js'
import { characterContentStore } from '../character/store.js'
import { innerLoop, detectDoomLoop, type ToolCallRecord } from './inner.js'
import { detectInsight } from '../evolution/index.js'
import { spawnAndRunSubAgent, summarizeAndMerge } from './sub-agent.js'
import { buildSkillIndex } from './skill-loader.js'
import { getCharacterToolDefinitions } from '../tools/definitions.js'
import { connectMCPServer, disconnectMCPServer } from '../tools/mcp-client.js'
import { mcpServerStore } from '../db/toolStore.js'
import { setMCPStatus } from '../tools/mcp-status.js'
import { preprocessContextReferences } from './context-references.js'
import { eventService } from '../event/eventService.js'
import { evolutionConfig } from '../evolution/evolutionConfig.js'
import * as fs from 'fs'
import * as path from 'path'
import type { LLMMessage } from '../llm/client.js'
import type { Server, Socket } from 'socket.io'
import type { MessageRow } from '../db/messageStore.js'
import type { MCPClient } from '../tools/mcp-client.js'

const MAX_TURNS = 20
const DEFAULT_CONTEXT_WINDOW = 128000

const DEFAULT_WORKSPACE = path.resolve(process.cwd(), '..', 'default-workspace')
if (!fs.existsSync(DEFAULT_WORKSPACE)) {
  try { fs.mkdirSync(DEFAULT_WORKSPACE, { recursive: true }) } catch {}
}
function resolveWorkspace(ws: string | null | undefined): string {
  return ws || DEFAULT_WORKSPACE
}
const COMPACT_THRESHOLD = 0.75
const KEEP_TURNS = 3

// ── Guidance blocks (ported from opencode) ──

const TOOL_USE_ENFORCEMENT_GUIDANCE =
  "# Tool-use enforcement\n" +
  "You MUST use your tools to take action \u2014 do not describe what you would do " +
  "or plan to do without actually doing it. When you say you will perform an " +
  "action, you MUST immediately make the corresponding tool call in the same " +
  "response. Never end your turn with a promise of future action \u2014 execute it now.\n" +
  "Keep working until the task is actually complete. If you have tools available " +
  "that can accomplish the task, use them instead of telling the user what you would do.\n" +
  "Every response should either (a) contain tool calls that make progress, or " +
  "(b) deliver a final result to the user. Responses that only describe intentions " +
  "without acting are not acceptable."

const TASK_COMPLETION_GUIDANCE =
  "# Finishing the job\n" +
  "When the user asks you to build, run, or verify something, the deliverable is " +
  "a working artifact backed by real tool output \u2014 not a description of one. " +
  "Do not stop after writing a stub, a plan, or a single command. Keep working " +
  "until you have actually exercised the code or produced the requested result.\n" +
  "If a tool fails and blocks the real path, say so directly and try an alternative. " +
  "NEVER substitute fabricated output for results you couldn\u2019t actually produce."

const PARALLEL_TOOL_CALL_GUIDANCE =
  "# Parallel tool calls\n" +
  "When you need several pieces of information that don\u2019t depend on each " +
  "other, request them together in a single response instead of one tool " +
  "call per turn. Independent reads, searches, and read-only commands should " +
  "be batched into the same assistant turn.\n" +
  "Only serialize calls when a later call genuinely depends on an earlier " +
  "call\u2019s result (e.g. you must read a file before you can patch it)."

const ACT_DONT_ASK_GUIDANCE =
  "# Act, don\u2019t ask\n" +
  "When a question has an obvious default interpretation, act on it immediately " +
  "instead of asking for clarification. Examples:\n" +
  "- \u2018What time is it?\u2019 \u2192 run `date` (don\u2019t guess)\n" +
  "- \u2018Is this port open?\u2019 \u2192 check the machine directly\n" +
  "Only ask for clarification when the ambiguity genuinely changes what tool " +
  "you would call."

const VERIFICATION_GUIDANCE =
  "# Verification\n" +
  "Before finalizing your response:\n" +
  "- Correctness: does the output satisfy every stated requirement?\n" +
  "- Grounding: are factual claims backed by tool outputs or provided context?\n" +
  "- If required context is missing, use a tool to look it up rather than guessing.\n" +
  "- If you must proceed with incomplete information, label assumptions explicitly."

const NO_FABRICATION_GUIDANCE =
  "# No fabrication\n" +
  "Never invent file contents, command output, API responses, or search results. " +
  "If a tool returns an error or partial data, report it honestly \u2014 do NOT " +
  "make up plausible-looking output. A blocker reported honestly is always better " +
  "than a fabricated result."

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
  status: 'stop' | 'max_turns' | 'cancelled' | 'task_complete'
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

  const toolDefs = getCharacterToolDefinitions(charMeta.tools)

  const mcpClients = new Map<string, MCPClient>()
  const mcpFailedServers: string[] = []
  if (charMeta.tools) {
    const mcpEntries = charMeta.tools.filter((t: { name: string }) => t.name.startsWith('mcp:'))
    for (const entry of mcpEntries) {
      const serverName = entry.name.slice(4)
      const config = mcpServerStore.getAll().find((s: { name: string }) => s.name === serverName)
      if (!config) {
        console.warn(`[mcp] Server "${serverName}" referenced but not configured`)
        setMCPStatus(serverName, { status: 'disabled' })
        mcpFailedServers.push(serverName)
        continue
      }
      setMCPStatus(serverName, { status: 'connecting' })
      let lastError = ''
      const MAX_RETRIES = 3
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const client = await connectMCPServer(config, resolveWorkspace(session.workspace))
          mcpClients.set(serverName, client)
          for (const tool of client.tools) {
            const fullName = `mcp__${serverName}__${tool.name}`
            toolDefs.push({
              type: 'function' as const,
              function: {
                name: fullName,
                description: tool.description,
                parameters: tool.inputSchema as any,
              },
            })
          }
          setMCPStatus(serverName, { status: 'connected', toolsCount: client.tools.length })
          console.log(`[mcp] Connected "${serverName}" (${client.tools.length} tools)`)
          lastError = ''
          break
        } catch (err: any) {
          lastError = err.message
          if (attempt < MAX_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000)
            console.warn(`[mcp] Retry ${attempt}/${MAX_RETRIES} for "${serverName}" in ${delay}ms: ${err.message}`)
            await new Promise(r => setTimeout(r, delay))
          }
        }
      }
      if (lastError) {
        setMCPStatus(serverName, { status: 'failed', error: lastError })
        console.error(`[mcp] Server "${serverName}" failed after ${MAX_RETRIES} retries: ${lastError}`)
        mcpFailedServers.push(serverName)
      }
    }
  }

  const tools = toolDefs.length > 0 ? toolDefs : undefined

  const systemParts: string[] = []
  if (charContent.soul) systemParts.push(`## Character\n${charContent.soul}`)
  if (charContent.user) systemParts.push(`## User Info\n${charContent.user}`)
  if (charContent.memory) systemParts.push(`## Memory\n${charContent.memory}`)
  systemParts.push(`## Workspace\nYour working directory is: ${resolveWorkspace(session.workspace)}\nAll file operations (read/write/edit/glob/bash) use this directory as root. Use paths relative to this directory, or use absolute paths within it.`)

  // Guidance blocks — only when tools are available
  if (toolDefs.length > 0) {
    systemParts.push(TOOL_USE_ENFORCEMENT_GUIDANCE)
    systemParts.push(TASK_COMPLETION_GUIDANCE)
    systemParts.push(PARALLEL_TOOL_CALL_GUIDANCE)
    systemParts.push(ACT_DONT_ASK_GUIDANCE)
    systemParts.push(VERIFICATION_GUIDANCE)
    systemParts.push(NO_FABRICATION_GUIDANCE)
  }

  // List available tools — only whitelisted ones, same pattern as skills
  if (tools) {
    const allChars = characterMetaStore.getAll()
    const activeGroup = session.active_group
    const delegateTargets = allChars.filter(c => {
      if (c.role !== 'sub' && c.role !== 'both') return false
      if (c.id === session.character_id) return true
      if (!activeGroup) return false
      if (!c.groups || c.groups.length === 0) return false
      return c.groups.includes(activeGroup)
    })
    const toolListings = tools.map(t => {
      let desc = t.function.description
      if (t.function.name === 'delegate_task' && delegateTargets.length > 0) {
        desc += ` | targets: ${delegateTargets.map(c => `${c.id}(${c.name})`).join(', ')}`
      }
      return `- ${t.function.name}: ${desc}`
    })
    systemParts.push(`## Available Tools\n${toolListings.join('\n')}`)
  }

  // Unavailable MCP servers — configured but failed to connect
  if (mcpFailedServers.length > 0) {
    const notes = mcpFailedServers.map(name =>
      `- mcp:${name}: configured but could not connect. This MCP server is NOT available in this session.`
    )
    systemParts.push(`## Unavailable Tools\n${notes.join('\n')}`)
  }

  // Skills: index in system prompt only (no pre-injection of full content)
  const skillIndex = buildSkillIndex(charMeta)
  if (skillIndex.length > 0) {
    const skillList = skillIndex.map(s => s.listing).join('\n')
    systemParts.push(`## Available Skills\n${skillList}\nUse \`skill_manager\` with action="read" to view a skill's full SKILL.md content.`)    
    const hints = skillIndex.filter(s => s.attachments.length > 0)
      .map(s => `  ${s.name}: ${s.attachments.join(', ')}`)
    if (hints.length) {
      systemParts.push(`## Skill Attachments\n${hints.join('\n')}`)
    }
  }

  const systemPrompt = systemParts.join('\n\n')

  const rows = messageStore.getMessages(sessionId)
  const messages: LLMMessage[] = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  for (const row of rows) {
    let m = rowToLLMMessage(row)
    if (m && m.role === 'user' && m.content && /@(file|folder|url):/.test(m.content)) {
      const refResult = await preprocessContextReferences(m.content, resolveWorkspace(session.workspace))
      if (refResult.expanded) {
        m = { ...m, content: refResult.message }
        for (const w of refResult.warnings) console.warn(`[context-ref] ${w}`)
      }
    }
    if (m) messages.push(m)
  }

  let turn = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let consecutiveErrors = 0
  const toolCallHistory: ToolCallRecord[] = []
  let insightDispatched = false

  socket.emit('run.started', { session_id: sessionId })

  while (turn < MAX_TURNS && !signal?.aborted) {
    turn++

    const result = await innerLoop(
      messages, tools, provider, model, session.character_id,
      resolveWorkspace(session.workspace), io, socket, sessionId, signal, opts, turn,
      mcpClients,
    )

    totalInputTokens += result.totalInputTokens
    totalOutputTokens += result.totalOutputTokens

    if (result.type === 'error') {
      consecutiveErrors++
      if (consecutiveErrors >= 2) {
        // Two consecutive errors — give up
        socket.emit('run.failed', { session_id: sessionId, error: result.error })
        for (const [, client] of mcpClients) {
          await disconnectMCPServer(client).catch(() => {})
        }
        return { status: 'stop', sessionId, totalInputTokens, totalOutputTokens }
      }
      // First error — report and let the model try again
      const guidance = `[System: An API error occurred (${result.error}). This may be transient. Please retry your last action with a simpler approach or different strategy.]`
      messages.push({ role: 'system', content: guidance })
      continue
    }
    consecutiveErrors = 0

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

    if (result.type === 'task_complete') {
      const toolCallId = result.toolCalls?.[0]?.id || `complete_${Date.now()}`
      const summaryOutput = result.taskCompleteSummary || 'Task marked complete'
      messages.push({
        role: 'tool',
        content: JSON.stringify({ output: summaryOutput }),
        tool_call_id: toolCallId,
      })
      messageStore.addMessage(sessionId, {
        role: 'tool',
        content: JSON.stringify({ output: summaryOutput }),
        tool_name: 'task_complete',
        tool_input: JSON.stringify({ call_id: toolCallId }),
        tool_output: summaryOutput,
        tool_status: 'success',
      })
      socket.emit('tool.completed', {
        session_id: sessionId, tool_call_id: toolCallId,
        tool_name: 'task_complete', tool_output: summaryOutput,
        tool_status: 'success', duration_ms: 0,
      })
      socket.emit('run.completed', { session_id: sessionId, status: 'task_complete' })
      if (totalInputTokens > 0 || totalOutputTokens > 0) {
        sessionStore.update(sessionId, {
          input_tokens: (session.input_tokens || 0) + totalInputTokens,
          output_tokens: (session.output_tokens || 0) + totalOutputTokens,
        })
      }
      for (const [, client] of mcpClients) {
        await disconnectMCPServer(client).catch(() => {})
      }
      return { status: 'task_complete', sessionId, totalInputTokens, totalOutputTokens }
    }

    if (result.toolCallRecords?.length && detectDoomLoop(toolCallHistory)) {
      const recent = toolCallHistory.slice(-6)
      const lastTool = recent[recent.length - 1]?.toolName || 'unknown'
      messages.push({
        role: 'system',
        content: `[System Alert] You have encountered repeated failures (last: ${lastTool}). This is a Doom Loop. Stop your current approach and try a completely different strategy. Consider: (a) read the file structure first, (b) use a different tool, (c) break the task into smaller steps.`
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

  // Check evolution at session end, not during the loop
  if (!insightDispatched && toolCallHistory.length > 0 && charMeta.memory?.selfEvolution) {
    const cfg = evolutionConfig.get()
    if (cfg.character_id) {
      const insight = detectInsight(toolCallHistory, sessionId, session.character_id, {
        window: cfg.detect_window,
        errorRateThreshold: cfg.error_rate_threshold,
        repetitionCount: cfg.repetition_count,
        highFreqMinCalls: cfg.high_freq_min_calls,
        highFreqMaxUnique: cfg.high_freq_max_unique,
      })
      if (insight) {
        insightDispatched = true
        // Include user's original intent to guide skill creation toward domain tasks
        const firstUserMsg = messages.find(m => m.role === 'user')?.content || ''
        const userGoal = firstUserMsg.length > 200 ? firstUserMsg.slice(0, 200) + '…' : firstUserMsg
        const newEvent = eventService.create({
          source_type: 'agent',
          source_id: session.character_id,
          source_meta: { session_id: session.id, trigger: 'insight_detected', insight },
          assigned_agent_id: cfg.character_id,
          assigned_group_id: cfg.group_id || undefined,
          type: 'once',
          payload: { instruction: `Session: ${session.id}\nDetected: ${insight.description}\n\nUser's original request:\n${userGoal}\n\n${cfg.content || 'Analyze this session and create a skill for the task the user was trying to accomplish.'}` },
          status: 'pending',
          scheduled_at: Date.now(),
        })
        socket?.emit('evolution:insight_created', {
          session_id: session.id,
          insight_type: insight.type,
          description: insight.description,
          notify_enabled: cfg.notify_enabled,
          notify_timeout: cfg.notify_timeout,
        })
      }
    }
  }

  for (const [, client] of mcpClients) {
    await disconnectMCPServer(client).catch(() => {})
  }

  return { status: completedStatus, sessionId, totalInputTokens, totalOutputTokens }
}


