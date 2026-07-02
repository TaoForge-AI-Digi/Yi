import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { resolve } from 'path'

const CHAR_DIR = resolve(import.meta.dirname, '../../data/characters')

mkdirSync(CHAR_DIR, { recursive: true })

export interface CharacterMemory {
  enabled: boolean
  selfEvolution?: boolean
  charLimit?: number
  maxEntries?: number
}

import type { ToolBinding, ToolConstraint } from '../tools/types.js'

export type { ToolBinding, ToolConstraint }

export interface CharacterRecord {
  id: string
  name: string
  description?: string
  avatar?: string
  color?: string
  memory?: CharacterMemory
  model?: string
  provider?: string
  tools?: ToolBinding[]
  maxSteps?: number
  role?: 'main' | 'sub' | 'both'
  groups?: string[]
  default_strategy?: 'Plan' | 'Ask' | 'Bypass'
  skills?: string[]
  enabled?: boolean
  createdAt?: number
  updatedAt?: number
}

function pathFor(id: string): string {
  return resolve(CHAR_DIR, id, 'character.json')
}

function readAll(): CharacterRecord[] {
  if (!existsSync(CHAR_DIR)) return []
  const items: CharacterRecord[] = []
  try {
    const entries = readdirSync(CHAR_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const f = pathFor(entry.name)
      if (!existsSync(f)) continue
      try { items.push(JSON.parse(readFileSync(f, 'utf-8'))) } catch { /* skip corrupt */ }
    }
  } catch { /* dir not found */ }
  return items
}

function writeSingle(record: CharacterRecord) {
  const dir = resolve(CHAR_DIR, record.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'character.json'), JSON.stringify(record, null, 2), 'utf-8')
}

function removeDir(id: string) {
  const dir = resolve(CHAR_DIR, id)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

function nextId(items: CharacterRecord[]): string {
  const max = items.reduce((m, c) => Math.max(m, parseInt(c.id) || 0), 0)
  return String(max + 1)
}

const NOW = Date.now()

const DEFAULT_CHARACTERS: CharacterRecord[] = [
  { id: 'general', name: 'General', description: '通用助手', color: '#6366f1', role: 'both', maxSteps: 10, enabled: true, createdAt: NOW, updatedAt: NOW, skills: ['echo-test'] },
  { id: 'coder', name: 'Coder', description: '编程专家', color: '#10b981', role: 'main', maxSteps: 20, enabled: true, createdAt: NOW, updatedAt: NOW, skills: ['echo-test', 'systematic-debugging', 'plan', 'test-driven-development'] },
  { id: 'reviewer', name: 'Reviewer', description: '代码审查', color: '#f59e0b', tools: [{ name: 'read' }, { name: 'grep' }, { name: 'glob' }], role: 'sub', maxSteps: 15, enabled: true, createdAt: NOW, updatedAt: NOW },
  { id: 'explorer', name: 'Explorer', description: '代码探索', color: '#8b5cf6', tools: [{ name: 'read' }, { name: 'grep' }, { name: 'glob' }, { name: 'webfetch' }, { name: 'websearch' }], role: 'both', maxSteps: 10, enabled: true, createdAt: NOW, updatedAt: NOW },
]

export function seedDefaultCharacters() {
  const all = readAll()
  if (all.length === 0) {
    for (const c of DEFAULT_CHARACTERS) writeSingle(c)
    console.log('[seed] Default characters created')
    return
  }
  let changed = false
  for (const c of DEFAULT_CHARACTERS) {
    const existing = all.find(a => a.id === c.id)
    if (!existing) continue

    if ((existing as any).builtIn) { delete (existing as any).builtIn; changed = true }
    if (existing.color !== c.color) { existing.color = c.color; changed = true }
    if (existing.description !== c.description) { existing.description = c.description; changed = true }
    if (existing.role !== c.role) { existing.role = c.role; changed = true }
    if (existing.maxSteps !== c.maxSteps) { existing.maxSteps = c.maxSteps; changed = true }

    if (c.tools === undefined && existing.tools !== undefined) {
      delete existing.tools
      changed = true
    }
    if (c.skills !== undefined && JSON.stringify(existing.skills) !== JSON.stringify(c.skills)) {
      existing.skills = c.skills; changed = true
    }

    if (changed) { writeSingle(existing); console.log(`[seed] Updated character: ${existing.id}`) }
  }
}

export const characterMetaStore = {
  getAll: () => readAll(),

  getById: (id: string) => {
    const f = pathFor(id)
    if (!existsSync(f)) return null
    try { return JSON.parse(readFileSync(f, 'utf-8')) } catch { return null }
  },

  create: (data: Omit<CharacterRecord, 'id' | 'createdAt' | 'updatedAt'>) => {
    const all = readAll()
    const now = Date.now()
    const record: CharacterRecord = { ...data, id: nextId(all), createdAt: now, updatedAt: now }
    writeSingle(record)
    return record
  },

  update: (id: string, data: Partial<CharacterRecord>) => {
    const record = characterMetaStore.getById(id)
    if (!record) return null
    const updated: CharacterRecord = { ...record, ...data, id, updatedAt: Date.now() }
    writeSingle(updated)
    return updated
  },

  delete: (id: string) => {
    if (!characterMetaStore.getById(id)) return false
    removeDir(id)
    return true
  },
}
