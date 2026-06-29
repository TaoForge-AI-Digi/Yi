import { readdirSync, readFileSync, statSync } from 'fs'
import { resolve } from 'path'

export function grepSync(pattern: string, dir: string): string {
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
