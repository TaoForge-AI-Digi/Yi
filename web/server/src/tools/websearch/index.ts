import type { ToolModule } from '../types.js'

export const tool: ToolModule = {
  name: 'websearch',
  description: 'Search the web for recent information. Returns a list of search results with titles, snippets, and URLs.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'The search query' } },
    required: ['query'],
  },
  execute: async (args) => {
    const query = args.query || ''
    if (!query) return { output: '', error: 'Query is required' }

    const searchApiUrl = process.env.SEARCH_API_URL
    if (searchApiUrl) {
      try {
        const res = await fetch(`${searchApiUrl}?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(15000),
        })
        if (res.ok) {
          const json = await res.json()
          const items = json.results || json.items || []
          if (items.length > 0) {
            return { output: items.slice(0, 8).map((r: any) => `- ${r.title}\n  ${r.snippet || ''}\n  ${r.url || r.link || ''}`).join('\n\n') }
          }
        }
      } catch (e: any) {
        console.warn(`[websearch] Custom API failed: ${e.message}`)
      }
    }

    try {
      const ddgRes = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      })
      if (!ddgRes.ok) return { output: '', error: `Search failed: HTTP ${ddgRes.status}` }
      const html = await ddgRes.text()
      const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []
      const results: string[] = []
      for (let i = 0; i < rows.length && results.length < 8; i++) {
        const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi)
        if (!cells || cells.length < 2) continue
        const linkA = cells[0].match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
        const snippet = cells[1]?.replace(/<[^>]+>/g, '').trim()
        if (linkA) {
          const title = linkA[2].replace(/<[^>]+>/g, '').trim()
          const url = linkA[1]
          if (title) results.push(`- ${title}\n  ${snippet || ''}\n  ${url}`)
        }
      }
      if (results.length > 0) return { output: `Web search results for "${query}":\n\n${results.join('\n\n')}` }
      return { output: '', error: 'No results found' }
    } catch (e: any) {
      return { output: '', error: `Search failed for "${query}": ${e.message || e}` }
    }
  },
}
