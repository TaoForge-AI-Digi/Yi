import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { connectSocket, getSocket, type RunEvent } from '@/api/socket'
import * as sessionsApi from '@/api/sessions'

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export interface Message {
  id: string; role: 'user' | 'assistant' | 'tool'; content: string
  tool_name?: string; tool_input?: string; tool_output?: string
  tool_status?: 'running' | 'done' | 'error'
  is_streaming?: boolean
  reasoning?: string
  reasoning_duration?: number
  timestamp: number
}

export interface Session {
  id: string; character_id: string; title: string; messages: Message[]
  model?: string; provider_id?: string; workspace?: string; pinned?: boolean
  thinking?: boolean
  reasoning_effort?: string
  created_at: number; updated_at: number
}

export interface WorkspaceGroup {
  name: string
  sessions: Session[]
  collapsed: boolean
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<Session[]>([])
  const activeSessionId = ref<string | null>(null)
  const activeSession = computed(() => sessions.value.find(s => s.id === activeSessionId.value) || null)
  const isStreaming = ref(false)
  const pendingApproval = ref<{ tool_call_id: string; tool_name: string; description: string } | null>(null)
  const collapsedWorkspaces = ref<Set<string>>(new Set())
  const isBatchMode = ref(false)
  const selectedSessionIds = ref<Set<string>>(new Set())

  const workspaceGroups = computed<WorkspaceGroup[]>(() => {
    const groups = new Map<string, Session[]>()
    sessions.value.forEach(session => {
      const workspace = session.workspace || 'default'
      if (!groups.has(workspace)) {
        groups.set(workspace, [])
      }
      groups.get(workspace)!.push(session)
    })
    return Array.from(groups.entries()).map(([name, sessions]) => ({
      name,
      sessions,
      collapsed: collapsedWorkspaces.value.has(name),
    }))
  })

  async function renameSession(id: string, title: string) {
    const session = sessions.value.find(s => s.id === id)
    if (session) session.title = title
    await sessionsApi.renameSession(id, title)
  }

  async function deleteSingleSession(id: string) {
    sessions.value = sessions.value.filter(s => s.id !== id)
    if (activeSessionId.value === id) activeSessionId.value = null
    sessionsApi.deleteSession(id).catch(() => {})
  }

  function toggleSessionStar(id: string) {
    const session = sessions.value.find(s => s.id === id)
    if (session) {
      session.pinned = !session.pinned
    }
  }

  function toggleWorkspaceCollapse(workspace: string) {
    if (collapsedWorkspaces.value.has(workspace)) {
      collapsedWorkspaces.value.delete(workspace)
    } else {
      collapsedWorkspaces.value.add(workspace)
    }
  }

  async function loadSessions() {
    const list = await sessionsApi.fetchSessions()
    sessions.value = list.map(s => ({ ...s, model: s.model ?? undefined, provider_id: s.provider_id ?? undefined, workspace: s.workspace ?? undefined, messages: [] }))
  }

  async function createSession(opts: { character_id?: string; model?: string; provider_id?: string; workspace?: string } = {}): Promise<Session> {
    const session: Session = {
      id: uid(), character_id: opts.character_id || 'general', title: '',
      model: opts.model, provider_id: opts.provider_id, workspace: opts.workspace,
      messages: [], created_at: Date.now(), updated_at: Date.now(),
    }
    sessions.value.unshift(session)
    try { await sessionsApi.createSession({ id: session.id, character_id: session.character_id, model: session.model, provider_id: session.provider_id, workspace: session.workspace }) } catch { /* will be created on first message if needed */ }
    return session
  }

  async function switchSession(id: string) {
    activeSessionId.value = id
    const s = sessions.value.find(s => s.id === id)
    if (!s || s.messages.length > 0) return
    try {
      const data = await sessionsApi.fetchSessionMessages(id)
      s.messages = data.messages.map(m => ({
        id: String(m.id), role: m.role as any, content: m.content,
        reasoning: m.reasoning_content || undefined,
        tool_name: m.tool_name || undefined, tool_input: m.tool_input || undefined,
        tool_output: m.tool_output || undefined, tool_status: m.tool_status as any || undefined,
        timestamp: m.created_at,
      }))
    } catch { /* new session */ }
  }

  async function sendMessage(input: string) {
    let session = activeSession.value
    if (!session) {
      session = await createSession()
      activeSessionId.value = session.id
    }

    const userMsg: Message = { id: uid(), role: 'user', content: input, timestamp: Date.now() }
    session.messages.push(userMsg)
    isStreaming.value = true

    if (!session.provider_id) {
      const { useProvidersStore } = await import('@/stores/providers')
      const providers = useProvidersStore().providers
      if (providers.length > 0) session.provider_id = providers[0].id
    }

    const socket = connectSocket()
    socket.emit('chat-run', {
      session_id: session.id,
      character_id: session.character_id,
      input,
      model: session.model || undefined,
      provider_id: session.provider_id || undefined,
      workspace: session.workspace || undefined,
      thinking: session.thinking || undefined,
      reasoning_effort: session.reasoning_effort || undefined,
    })

    const onDelta = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      const last = session!.messages[session!.messages.length - 1]
      if (last?.role === 'assistant' && last.is_streaming) {
        if (data.reasoning) last.reasoning = (last.reasoning || '') + data.reasoning
        if (data.delta) last.content += data.delta
      } else {
        session!.messages.push({
          id: uid(), role: 'assistant', content: data.delta || '',
          reasoning: data.reasoning || '',
          is_streaming: true, timestamp: Date.now(),
        })
      }
    }
    const onToolStarted = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      session!.messages.push({
        id: uid(), role: 'tool', content: '',
        tool_name: data.tool_name, tool_input: data.tool_input,
        tool_status: 'running', timestamp: Date.now(),
      })
    }
    const onToolCompleted = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      const tools = session!.messages.filter(m => m.role === 'tool' && m.tool_name === data.tool_name)
      const last = tools[tools.length - 1]
      if (last) { last.tool_status = 'done'; last.tool_output = data.tool_output }
    }
    const onApprovalRequested = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      pendingApproval.value = {
        tool_call_id: data.tool_call_id!, tool_name: data.tool_name!, description: data.tool_input || '',
      }
    }
    const onCompleted = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      const last = session!.messages[session!.messages.length - 1]
      if (last?.is_streaming) last.is_streaming = false
      isStreaming.value = false
      cleanup()
    }
    const onFailed = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      session!.messages.push({ id: uid(), role: 'assistant', content: `Error: ${data.error || 'Unknown'}`, timestamp: Date.now() })
      isStreaming.value = false
      cleanup()
    }

    function cleanup() {
      socket.off('message.delta', onDelta)
      socket.off('tool.started', onToolStarted)
      socket.off('tool.completed', onToolCompleted)
      socket.off('approval.requested', onApprovalRequested)
      socket.off('run.completed', onCompleted)
      socket.off('run.failed', onFailed)
    }

    socket.on('message.delta', onDelta)
    socket.on('tool.started', onToolStarted)
    socket.on('tool.completed', onToolCompleted)
    socket.on('approval.requested', onApprovalRequested)
    socket.on('run.completed', onCompleted)
    socket.on('run.failed', onFailed)
  }

  function respondApproval(choice: 'allow' | 'deny') {
    if (!pendingApproval.value) return
    const socket = getSocket()
    if (socket?.connected && activeSessionId.value) {
      socket.emit('approval.respond', {
        session_id: activeSessionId.value,
        tool_call_id: pendingApproval.value.tool_call_id,
        choice,
      })
    }
    pendingApproval.value = null
  }

  function abortRun() {
    const socket = getSocket()
    if (socket?.connected && activeSessionId.value) {
      socket.emit('abort', { session_id: activeSessionId.value })
    }
  }

  function updateMessage(sessionId: string, messageId: string, content: string) {
    const s = sessions.value.find(x => x.id === sessionId)
    if (!s) return
    const msg = s.messages.find(m => m.id === messageId)
    if (msg) msg.content = content
  }

  function deleteMessage(sessionId: string, messageId: string) {
    const s = sessions.value.find(x => x.id === sessionId)
    if (s) s.messages = s.messages.filter(m => m.id !== messageId)
  }

  function toggleBatchMode() {
    isBatchMode.value = !isBatchMode.value
    if (!isBatchMode.value) {
      selectedSessionIds.value.clear()
    }
  }

  function toggleSessionSelection(sessionId: string) {
    if (selectedSessionIds.value.has(sessionId)) {
      selectedSessionIds.value.delete(sessionId)
    } else {
      selectedSessionIds.value.add(sessionId)
    }
  }

  function selectAllSessions() {
    if (selectedSessionIds.value.size === sessions.value.length) {
      selectedSessionIds.value.clear()
    } else {
      sessions.value.forEach(session => {
        selectedSessionIds.value.add(session.id)
      })
    }
  }

  async function batchDeleteSessions() {
    const ids = Array.from(selectedSessionIds.value)
    const failedIds: string[] = []
    await Promise.all(ids.map(id =>
      sessionsApi.deleteSession(id).catch(() => { failedIds.push(id) })
    ))
    if (failedIds.length > 0) {
      console.warn(`Failed to delete ${failedIds.length} session(s):`, failedIds)
    }
    const deletedIds = ids.filter(id => !failedIds.includes(id))
    sessions.value = sessions.value.filter(s => !deletedIds.includes(s.id))
    if (activeSessionId.value && deletedIds.includes(activeSessionId.value)) {
      activeSessionId.value = null
    }
    deletedIds.forEach(id => selectedSessionIds.value.delete(id))
    if (selectedSessionIds.value.size === 0) {
      isBatchMode.value = false
    }
  }

  return {
    sessions, activeSessionId, activeSession, isStreaming, pendingApproval,
    collapsedWorkspaces, workspaceGroups, isBatchMode, selectedSessionIds,
    loadSessions, createSession, switchSession, sendMessage, respondApproval, abortRun,
    renameSession, deleteSingleSession, updateMessage, deleteMessage,
    toggleSessionStar,
    toggleWorkspaceCollapse, toggleBatchMode, toggleSessionSelection, selectAllSessions, batchDeleteSessions,
  }
})
