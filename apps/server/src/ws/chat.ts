import { Server, Socket } from 'socket.io'
import { sessionStore } from '../db/sessionStore.js'
import { messageStore } from '../db/messageStore.js'
import { sessionLoop } from '../agent/loop.js'
import { setSessionStrategy, removeSessionState, getSessionState } from '../agent/session.js'
import type { Strategy } from '../agent/session.js'

const activeRuns = new Map<string, { abort: () => void }>()

export function registerChatSocket(io: Server, socket: Socket) {
  socket.on('strategy.set', (data: { session_id: string; strategy: Strategy }, ack?: (resp: unknown) => void) => {
    const { session_id, strategy } = data
    if (!session_id) { ack?.({ error: 'No session_id' }); return }
    if (!['Plan', 'Ask', 'Bypass'].includes(strategy)) { ack?.({ error: 'Invalid strategy' }); return }
    setSessionStrategy(session_id, strategy, 'user')
    console.log(`[strategy.set] session=${session_id} strategy=${strategy}`)
    socket.emit('strategy.updated', { session_id, strategy })
    ack?.({ status: 'ok' })
  })
  socket.on('chat-run', async (data: Record<string, unknown>, ack?: (resp: unknown) => void) => {
    try {
      const sessionId = data.session_id as string
      if (!sessionId) { ack?.({ error: 'No session_id' }); return }

      let session = sessionStore.getById(sessionId)
      if (!session) {
        session = sessionStore.create({
          id: sessionId,
          character_id: (data.character_id as string) || 'general',
          title: (data.title as string) || '',
          model: (data.model as string) || undefined,
          provider_id: (data.provider_id as string) || undefined,
          workspace: (data.workspace as string) || undefined,
          active_group: (data.active_group as string) || undefined,
          session_type: (data.session_type as 'chat' | 'event') || undefined,
          event_id: (data.event_id as string) || undefined,
        })
      } else {
        const patch: Record<string, unknown> = {}
        if (data.provider_id) patch.provider_id = data.provider_id
        if (data.model) patch.model = data.model
        if (data.workspace) patch.workspace = data.workspace
        if (data.character_id) patch.character_id = data.character_id
        if (data.active_group) patch.active_group = data.active_group
        if (data.event_id) patch.event_id = data.event_id
        if (Object.keys(patch).length > 0) sessionStore.update(sessionId, patch)
      }

      const input = (data.input as string) || ''
      if (input.trim()) {
        messageStore.addMessage(sessionId, { role: 'user', content: input })
      }

      const abortController = new AbortController()
      activeRuns.set(sessionId, { abort: () => abortController.abort() })
      ack?.({ run_id: `run_${sessionId}_${Date.now()}`, status: 'started' })

      await sessionLoop(io, socket, sessionId, abortController.signal, {
        thinking: !!data.thinking,
        reasoning_effort: data.reasoning_effort as string | undefined,
      })
    } catch (err) {
      console.error('chat-run error:', err)
      socket.emit('run.failed', { session_id: data.session_id, error: String(err) })
    } finally {
      if (data.session_id) activeRuns.delete(data.session_id as string)
    }
  })

  socket.on('abort', (data: { session_id?: string }) => {
    const sid = data.session_id
    if (sid && activeRuns.has(sid)) {
      activeRuns.get(sid)!.abort()
      activeRuns.delete(sid)
    }
  })
}
