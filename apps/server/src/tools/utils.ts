import { resolve, relative } from 'path'
import { realpathSync } from 'fs'

export class PathEscapeError extends Error {
  constructor(msg: string) { super(msg); this.name = 'PathEscapeError' }
}

function realRoot(root: string): string {
  try { return realpathSync(root) } catch { return root }
}

function resolvedSafe(p: string, root: string): boolean {
  const full = resolve(root, p)
  const base = realRoot(root)
  let target = full
  try { target = realpathSync(full) } catch {
    const parent = resolve(full, '..')
    try { target = realpathSync(parent) } catch { return false }
    if (relative(base, target).startsWith('..')) return false
    return relative(base, full).startsWith('..') === false
  }
  return !relative(base, target).startsWith('..')
}

export function assertPathSafe(p: string, workspace: string, allowedRoots?: string[]): void {
  if (resolvedSafe(p, workspace)) return
  if (allowedRoots) {
    for (const root of allowedRoots) {
      if (resolvedSafe(p, root)) return
    }
  }
  throw new PathEscapeError(`Path escapes workspace: ${p}`)
}

export function findFirstOccurrence(content: string, oldString: string): number {
  return content.indexOf(oldString)
}

export function replaceAllOccurrences(content: string, oldString: string, newString: string): string {
  return content.split(oldString).join(newString)
}
