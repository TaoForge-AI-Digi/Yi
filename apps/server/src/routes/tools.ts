import { Hono } from 'hono'
import { readdirSync, existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { mcpServerStore } from '../db/toolStore.js'

const TOOLS_DIR = resolve(import.meta.dirname, '../tools')

function readToolMetas(): Array<{ name: string; description: string; source: string; constraintFields: any[] }> {
  const results: Array<{ name: string; description: string; source: string; constraintFields: any[] }> = []
  const entries = readdirSync(TOOLS_DIR, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isDirectory() || e.name === '_template') continue
    const jsonPath = resolve(TOOLS_DIR, e.name, 'tool.json')
    if (!existsSync(jsonPath)) continue
    try {
      let text = readFileSync(jsonPath, 'utf-8')
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
      const meta = JSON.parse(text)
      results.push({
        name: meta.name || e.name,
        description: meta.description || '',
        source: meta.source || 'builtin',
        constraintFields: meta.constraintFields || [],
      })
    } catch { /* skip invalid tool.json */ }
  }
  return results
}

const router = new Hono()

router.get('/', (c) => {
  const mcpServers = mcpServerStore.getAll()
  const tools = [
    ...readToolMetas(),
    ...mcpServers.map(s => ({
      name: s.name,
      description: `MCP server: ${s.name}`,
      source: 'mcp' as const,
    })),
  ]
  return c.json({ tools, mcpServers })
})

router.post('/mcp', async (c) => {
  const body = await c.req.json()
  const record = mcpServerStore.create(body)
  return c.json(record, 201)
})

router.put('/mcp/:id', async (c) => {
  const body = await c.req.json()
  const updated = mcpServerStore.update(c.req.param('id'), body)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})

router.delete('/mcp/:id', (c) => {
  if (!mcpServerStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

export default router
