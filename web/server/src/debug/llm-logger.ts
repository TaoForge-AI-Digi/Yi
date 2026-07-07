import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

const DATA_DIR = process.env.DATA_DIR || resolve(import.meta.dirname, '../../../data')
const DEBUG_DIR = resolve(DATA_DIR, 'debug')

export function logLLMCall(
  sessionId: string | undefined,
  turn: number,
  request: { model: string; messages: unknown[]; tools?: unknown[] },
  response: { text: string; reasoning: string; toolCalls: unknown[]; usage: { input: number; output: number } | null },
  error?: string,
) {
  const id = sessionId || 'unknown'
  const ts = Date.now()
  const dir = resolve(DEBUG_DIR, id)
  mkdirSync(dir, { recursive: true })
  const f = resolve(dir, `${ts}_turn${turn}.json`)
  writeFileSync(f, JSON.stringify({ request, response, error, timestamp: ts }, null, 2), 'utf-8')
}
