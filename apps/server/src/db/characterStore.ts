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

export interface ToolConstraint {
  allowed_paths?: string[]
  denied_paths?: string[]
  max_file_size?: string
  allowed_commands?: string[]
  denied_patterns?: string[]
  readonly?: boolean
  max_rows?: number
  require_confirm_even_in_bypass?: boolean
}

export interface ToolBinding {
  name: string
  constraints?: ToolConstraint
}

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
  builtIn?: boolean
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

const DEFAULT_ALL_TOOLS: ToolBinding[] = [
  { name: 'read' }, { name: 'write' }, { name: 'edit' },
  { name: 'grep' }, { name: 'glob' }, { name: 'bash' },
  { name: 'webfetch' }, { name: 'websearch' },
]

const BUILTIN: CharacterRecord[] = [
  { id: 'general', name: 'General', description: '通用助手', color: '#6366f1', tools: [{ name: 'read' }, { name: 'write' }, { name: 'edit' }, { name: 'grep' }, { name: 'glob' }, { name: 'webfetch' }, { name: 'websearch' }], role: 'both', maxSteps: 10, enabled: true, builtIn: true, createdAt: NOW, updatedAt: NOW },
  { id: 'coder', name: 'Coder', description: '编程专家', color: '#10b981', tools: DEFAULT_ALL_TOOLS, role: 'main', maxSteps: 20, enabled: true, builtIn: true, createdAt: NOW, updatedAt: NOW },
  { id: 'reviewer', name: 'Reviewer', description: '代码审查', color: '#f59e0b', tools: [{ name: 'read' }, { name: 'grep' }, { name: 'glob' }], role: 'sub', maxSteps: 15, enabled: true, builtIn: true, createdAt: NOW, updatedAt: NOW },
  { id: 'explorer', name: 'Explorer', description: '代码探索', color: '#8b5cf6', tools: [{ name: 'read' }, { name: 'write' }, { name: 'edit' }, { name: 'grep' }, { name: 'glob' }, { name: 'webfetch' }, { name: 'websearch' }], role: 'both', maxSteps: 10, enabled: true, builtIn: true, createdAt: NOW, updatedAt: NOW },
]

export function seedBuiltinCharacters() {
  const all = readAll()
  const existing = new Set(all.map(a => a.id))
  let changed = false
  for (const c of BUILTIN) {
    if (!existing.has(c.id)) { writeSingle(c); changed = true }
  }
  for (const c of BUILTIN) {
    const existingRecord = all.find(a => a.id === c.id)
    if (existingRecord) {
      let dirty = false
      if (!existingRecord.tools) { existingRecord.tools = c.tools; dirty = true }
      if (!existingRecord.role) { existingRecord.role = c.role; dirty = true }
      if (!existingRecord.default_strategy && c.default_strategy) { existingRecord.default_strategy = c.default_strategy; dirty = true }
      if (!existingRecord.groups) { existingRecord.groups = c.groups; dirty = true }
      if (!existingRecord.skills) { existingRecord.skills = c.skills; dirty = true }
      if (dirty) { writeSingle(existingRecord); changed = true }
    }
  }
  if (changed) console.log('[seed] Builtin characters updated')
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
    const record = characterMetaStore.getById(id)
    if (!record) return false
    if (record.builtIn) return false
    removeDir(id)
    return true
  },
}
