import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, statSync, realpathSync } from 'fs'
import { resolve, relative } from 'path'
import { globSync } from 'glob'
import { grepSync } from './grep.js'
import { ToolResult, PathEscapeError } from './definitions.js'

function resolvedSafe(p: string, workspace: string): boolean {
  const full = resolve(workspace, p)
  let target = full
  try { target = realpathSync(full) } catch {
    const parent = resolve(full, '..')
    try { target = realpathSync(parent) } catch { return false }
    if (relative(workspace, target).startsWith('..')) return false
    return relative(workspace, full).startsWith('..') === false
  }
  return !relative(workspace, target).startsWith('..')
}

function assertPathSafe(p: string, workspace: string): void {
  if (!resolvedSafe(p, workspace)) {
    throw new PathEscapeError(`Path escapes workspace: ${p}`)
  }
}

function findFirstOccurrence(content: string, oldString: string): number {
  return content.indexOf(oldString)
}

function replaceAllOccurrences(content: string, oldString: string, newString: string): string {
  return content.split(oldString).join(newString)
}

export async function executeTool(name: string, args: Record<string, string>, workspace: string, signal?: AbortSignal): Promise<ToolResult> {
  try {
    switch (name) {
      case 'read': {
        const p = args.path || ''
        assertPathSafe(p, workspace)
        const fullPath = resolve(workspace, p)
        if (!existsSync(fullPath)) return { output: '', error: `File not found: ${p}` }
        if (statSync(fullPath).size > 1024 * 1024) return { output: '', error: 'File too large (>1MB)' }
        return { output: readFileSync(fullPath, 'utf-8') }
      }
      case 'write': {
        const p = args.path || ''
        assertPathSafe(p, workspace)
        writeFileSync(resolve(workspace, p), args.content || '', 'utf-8')
        return { output: `Written ${(args.content || '').length} bytes to ${p}` }
      }
      case 'edit': {
        const p = args.path || ''
        assertPathSafe(p, workspace)
        const fullPath = resolve(workspace, p)
        if (!existsSync(fullPath)) return { output: '', error: `File not found: ${p}` }
        const content = readFileSync(fullPath, 'utf-8')
        const oldString = args.oldString || ''
        const newString = args.newString || ''
        const replaceAll = args.replaceAll === 'true' || args.replaceAll === true
        if (!oldString) return { output: '', error: 'oldString is required' }
        if (replaceAll) {
          if (findFirstOccurrence(content, oldString) === -1) return { output: '', error: 'oldString not found in file' }
          const newContent = replaceAllOccurrences(content, oldString, newString)
          writeFileSync(fullPath, newContent, 'utf-8')
          return { output: `Replaced all occurrences of oldString in ${p}` }
        }
        const idx = findFirstOccurrence(content, oldString)
        if (idx === -1) return { output: '', error: 'oldString not found in file' }
        const newContent = content.slice(0, idx) + newString + content.slice(idx + oldString.length)
        writeFileSync(fullPath, newContent, 'utf-8')
        return { output: `Applied edit at position ${idx} in ${p} (${oldString.length} chars replaced with ${newString.length} chars)` }
      }
      case 'bash': {
        return { output: execSync(args.command || '', { cwd: workspace, encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 30000, signal } as any).toString().trim() }
      }
      case 'grep': {
        const dir = args.path ? (assertPathSafe(args.path, workspace), args.path) : '.'
        return { output: grepSync(args.pattern || '', resolve(workspace, dir)) }
      }
      case 'glob': {
        const matches = globSync(args.pattern || '', { cwd: workspace, dot: true })
        return { output: matches.length ? matches.join('\n') : 'No files matched' }
      }
      case 'webfetch': {
        const url = args.url || ''
        if (!url) return { output: '', error: 'URL is required' }
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!res.ok) return { output: '', error: `HTTP ${res.status}: ${res.statusText}` }
        const text = await res.text()
        const maxLen = 100000
        return { output: text.length > maxLen ? text.slice(0, maxLen) + `\n\n... (truncated ${text.length - maxLen} chars)` : text }
      }
      case 'websearch': {
        const query = args.query || ''
        if (!query) return { output: '', error: 'Query is required' }

        // Custom search API via env var — expects GET ?q= returning JSON { results: [{ title, snippet, url }] }
        const searchApiUrl = process.env.SEARCH_API_URL
        if (searchApiUrl) {
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
        }

        // Fallback: DuckDuckGo lite HTML search
        const ddgRes = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YiLinBot/1.0)' },
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
      }
      default:
        return { output: '', error: `Unknown tool: ${name}` }
    }
  } catch (err: any) {
    if (err instanceof PathEscapeError) {
      return { output: '', error: err.message, escaped: true }
    }
    return { output: '', error: err.message || String(err) }
  }
}
