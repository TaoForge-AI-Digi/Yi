import { Hono } from 'hono'
import { sessionStore } from '../db/sessionStore.js'
import { messageStore } from '../db/messageStore.js'

const router = new Hono()

router.get('/', (c) => c.json(sessionStore.list()))
router.post('/', async (c) => {
  const body = await c.req.json()
  const session = sessionStore.create({ id: body.id, ...body })
  return c.json(session, 201)
})
router.put('/:id', async (c) => {
  const body = await c.req.json()
  const updated = sessionStore.update(c.req.param('id'), body)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})
router.delete('/:id', (c) => {
  if (!sessionStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})
router.get('/:id/messages', (c) => {
  const id = c.req.param('id')
  const session = sessionStore.getById(id)
  if (!session) return c.json({ error: 'Not found' }, 404)
  const messages = messageStore.getMessages(id)
  return c.json({ session, messages, total: messages.length })
})

export default router
