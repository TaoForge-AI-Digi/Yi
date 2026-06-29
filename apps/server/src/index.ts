import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()
app.get('/health', (c) => c.json({ ok: true }))

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('Yi-Lin server on :3001')
})
