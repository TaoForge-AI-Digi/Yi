import type { ToolModule } from '../types.js'

export const tool: ToolModule = {
  name: 'webfetch',
  description: 'Fetch and return the text content of a URL. Returns the page content as plain text or markdown.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'The fully-formed URL to fetch' } },
    required: ['url'],
  },
  execute: async (args) => {
    const url = args.url || ''
    if (!url) return { output: '', error: 'URL is required' }
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        redirect: 'follow',
      })
      if (!res.ok) return { output: '', error: `HTTP ${res.status}: ${res.statusText}` }
      const text = await res.text()
      const maxLen = 100000
      return { output: text.length > maxLen ? text.slice(0, maxLen) + `\n\n... (truncated ${text.length - maxLen} chars)` : text }
    } catch (e: any) {
      return { output: '', error: `Fetch failed for ${url}: ${e.message || e}` }
    }
  },
}
