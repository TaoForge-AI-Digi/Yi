import { Hono } from 'hono'
import * as fs from 'fs'
import * as path from 'path'
import os from 'os'

const workspaceRouter = new Hono()

const HOME = os.homedir()

const DEFAULT_ROOTS: string[] = process.platform === 'win32'
  ? ['C:\\', 'D:\\', HOME]
  : ['/', HOME]

interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

function listDir(dirPath: string): DirEntry[] {
  const entries: DirEntry[] = []
  let names: string[]
  try {
    names = fs.readdirSync(dirPath)
  } catch {
    return entries
  }
  for (const name of names) {
    if (name.startsWith('.')) continue
    const fullPath = path.join(dirPath, name)
    let stat: fs.Stats
    try {
      stat = fs.statSync(fullPath)
    } catch {
      continue
    }
    entries.push({ name, path: fullPath, isDir: stat.isDirectory() })
  }
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

workspaceRouter.get('/list', (c) => {
  const rawPath = c.req.query('path') || ''
  const targetPath = rawPath ? path.resolve(rawPath) : ''

  if (!targetPath) {
    const roots = DEFAULT_ROOTS.map(p => ({ name: p, path: p, isDir: true }))
    return c.json({ entries: roots, currentPath: '', parentPath: null })
  }

  if (!fs.existsSync(targetPath)) {
    return c.json({ error: 'Path not found' }, 404)
  }

  const entries = listDir(targetPath)
  const parentPath = path.dirname(targetPath)

  const isRoot = process.platform === 'win32'
    ? /^[A-Za-z]:\\$/.test(targetPath)
    : targetPath === '/'

  return c.json({
    entries,
    currentPath: targetPath,
    parentPath: isRoot ? null : parentPath,
  })
})

export default workspaceRouter
