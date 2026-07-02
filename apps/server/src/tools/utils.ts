import { resolve, relative } from 'path'
import { realpathSync } from 'fs'

export class PathEscapeError extends Error {
  constructor(msg: string) { super(msg); this.name = 'PathEscapeError' }
}

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

export function assertPathSafe(p: string, workspace: string): void {
  if (!resolvedSafe(p, workspace)) {
    throw new PathEscapeError(`Path escapes workspace: ${p}`)
  }
}

export function findFirstOccurrence(content: string, oldString: string): number {
  return content.indexOf(oldString)
}

export function replaceAllOccurrences(content: string, oldString: string, newString: string): string {
  return content.split(oldString).join(newString)
}
