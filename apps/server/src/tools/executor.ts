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

export async function executeTool(name: string, args: Record<string, string>, workspace: string): Promise<ToolResult> {
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
      case 'bash': {
        return { output: execSync(args.command || '', { cwd: workspace, encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 30000 }).toString().trim() }
      }
      case 'grep': {
        const dir = args.path ? (assertPathSafe(args.path, workspace), args.path) : '.'
        return { output: grepSync(args.pattern || '', resolve(workspace, dir)) }
      }
      case 'glob': {
        const matches = globSync(args.pattern || '', { cwd: workspace, dot: true })
        return { output: matches.length ? matches.join('\n') : 'No files matched' }
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
