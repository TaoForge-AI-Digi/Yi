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
  timestamp: number
}

export interface Session {
  id: string; character_id: string; title: string; messages: Message[]
  model?: string; provider_id?: string; workspace?: string; pinned?: boolean
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

  function toggleWorkspaceCollapse(workspace: string) {
    if (collapsedWorkspaces.value.has(workspace)) {
      collapsedWorkspaces.value.delete(workspace)
    } else {
      collapsedWorkspaces.value.add(workspace)
    }
  }

  async function loadSessions() {
    const list = await sessionsApi.fetchSessions()
    sessions.value = list.map(s => ({ ...s, messages: [] }))
  }

  function createSession(opts: { character_id?: string; model?: string; provider_id?: string; workspace?: string } = {}): Session {
    const session: Session = {
      id: uid(), character_id: opts.character_id || 'general', title: '',
      model: opts.model, provider_id: opts.provider_id, workspace: opts.workspace,
      messages: [], created_at: Date.now(), updated_at: Date.now(),
    }
    sessions.value.unshift(session)
    return session
  }

  async function switchSession(id: string) {
    activeSessionId.value = id
    const s = sessions.value.find(s => s.id === id)
    if (!s || s.messages.length > 0 || s.title) return
    try {
      const data = await sessionsApi.fetchSessionMessages(id)
      s.messages = data.messages.map(m => ({
        id: String(m.id), role: m.role as any, content: m.content,
        tool_name: m.tool_name || undefined, tool_input: m.tool_input || undefined,
        tool_output: m.tool_output || undefined, tool_status: m.tool_status as any || undefined,
        timestamp: m.created_at,
      }))
    } catch { /* new session */ }
  }

  function sendMessage(input: string) {
    let session = activeSession.value
    if (!session) {
      session = createSession()
      activeSessionId.value = session.id
    }

    const userMsg: Message = { id: uid(), role: 'user', content: input, timestamp: Date.now() }
    session.messages.push(userMsg)
    isStreaming.value = true

    const socket = connectSocket()
    socket.emit('chat-run', {
      session_id: session.id,
      character_id: session.character_id,
      input,
      model: session.model || undefined,
      provider_id: session.provider_id || undefined,
      workspace: session.workspace || undefined,
    })

    const onDelta = (data: RunEvent) => {
      if (data.session_id !== session!.id) return
      const last = session!.messages[session!.messages.length - 1]
      if (last?.role === 'assistant' && last.is_streaming) {
        last.content += data.delta || ''
      } else {
        session!.messages.push({
          id: uid(), role: 'assistant', content: data.delta || '',
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
    await Promise.all(ids.map(id => sessionsApi.deleteSession(id)))
    sessions.value = sessions.value.filter(s => !selectedSessionIds.value.has(s.id))
    if (activeSessionId.value && selectedSessionIds.value.has(activeSessionId.value)) {
      activeSessionId.value = null
    }
    selectedSessionIds.value.clear()
    isBatchMode.value = false
  }

  return {
    sessions, activeSessionId, activeSession, isStreaming, pendingApproval,
    collapsedWorkspaces, workspaceGroups, isBatchMode, selectedSessionIds,
    loadSessions, createSession, switchSession, sendMessage, respondApproval, abortRun,
    toggleWorkspaceCollapse, toggleBatchMode, toggleSessionSelection, selectAllSessions, batchDeleteSessions,
  }
})
