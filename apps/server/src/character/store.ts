import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { characterMetaStore } from '../db/characterStore.js'

const CHAR_DIR = resolve(import.meta.dirname, '../../data/characters')

function readMdOrLegacy(characterId: string, section: string, legacyKey: string): string {
  const f = resolve(CHAR_DIR, characterId, `${section}.md`)
  if (existsSync(f)) return readFileSync(f, 'utf-8')
  const record = characterMetaStore.getById(characterId)
  if (record) return (record as any)[legacyKey] || ''
  return ''
}

export const characterContentStore = {
  get(characterId: string) {
    return {
      soul: readMdOrLegacy(characterId, 'soul', 'soul'),
      user: readMdOrLegacy(characterId, 'user', 'userProfile'),
      memory: readMdOrLegacy(characterId, 'memory', 'memoryContent'),
    }
  },
  save(characterId: string, data: { soul?: string; user?: string; memory?: string }) {
    const dir = resolve(CHAR_DIR, characterId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'soul.md'), data.soul ?? '', 'utf-8')
    writeFileSync(resolve(dir, 'user.md'), data.user ?? '', 'utf-8')
    writeFileSync(resolve(dir, 'memory.md'), data.memory ?? '', 'utf-8')
  },
}

const DEFAULT_CONTENT: Record<string, { soul: string; user: string; memory: string }> = {
  general: {
    soul: 'You are a helpful general-purpose assistant. Be concise, accurate, and friendly.',
    user: '',
    memory: '',
  },
  coder: {
    soul: 'You are an expert programmer. Write clean, efficient, and well-documented code. Analyze problems carefully before implementing solutions.',
    user: '',
    memory: '',
  },
  reviewer: {
    soul: 'You are a code reviewer. Focus on code quality, security, performance, and best practices. Provide constructive feedback.',
    user: '',
    memory: '',
  },
  explorer: {
    soul: 'You are a codebase explorer. Help users understand code structure, find relevant files, and navigate large codebases efficiently.',
    user: '',
    memory: '',
  },
}

export function seedDefaultCharacterContent() {
  for (const [id, content] of Object.entries(DEFAULT_CONTENT)) {
    const dir = resolve(CHAR_DIR, id)
    mkdirSync(dir, { recursive: true })
    for (const section of ['soul', 'user', 'memory'] as const) {
      const f = resolve(dir, `${section}.md`)
      if (!existsSync(f)) writeFileSync(f, (content as any)[section], 'utf-8')
    }
  }
}
