import { readdirSync, readFileSync, statSync } from 'fs'
import { resolve } from 'path'
import type { ToolModule } from '../types.js'
import { assertPathSafe } from '../utils.js'

function grepSync(pattern: string, dir: string): string {
  const re = new RegExp(pattern)
  const results: string[] = []
  function walk(d: string) {
    let entries: string[]
    try { entries = readdirSync(d) } catch { return }
    for (const e of entries) {
      const full = resolve(d, e)
      let s: ReturnType<typeof statSync>
      try { s = statSync(full) } catch { continue }
      if (s.isDirectory()) { walk(full); continue }
      if (!s.isFile()) continue
      try {
        const lines = readFileSync(full, 'utf-8').split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) results.push(`${full}:${i + 1}:${lines[i]}`)
        }
      } catch { /* binary or unreadable */ }
    }
  }
  walk(dir)
  return results.length ? results.join('\n') : 'No matches found'
}

export const tool: ToolModule = {
  name: 'grep',
  description: 'Search file contents using a regex pattern',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern' },
      path: { type: 'string', description: 'Directory to search, relative to workspace (optional)' },
    },
    required: ['pattern'],
  },
  execute: async (args, { workspace, allowedRoots }) => {
    const dir = args.path ? (assertPathSafe(args.path, workspace, allowedRoots), args.path) : '.'
    return { output: grepSync(args.pattern || '', resolve(workspace, dir)) }
  },
}
