import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const DATA_DIR = resolve(import.meta.dirname, '../../data')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  mkdirSync(DATA_DIR, { recursive: true })
  db = new Database(resolve(DATA_DIR, 'sessions.db'))
  db.pragma('journal_mode = WAL')
  try { db.exec('ALTER TABLE messages ADD COLUMN reasoning_content TEXT') } catch { /* column may already exist */ }
  try { db.exec('ALTER TABLE sessions ADD COLUMN parent_id TEXT') } catch { }
  try { db.exec('ALTER TABLE sessions ADD COLUMN active_group TEXT') } catch { }
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL DEFAULT 'general',
      title TEXT NOT NULL DEFAULT '',
      model TEXT,
      provider_id TEXT,
      workspace TEXT,
      parent_id TEXT,
      active_group TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      reasoning_content TEXT,
      tool_name TEXT,
      tool_input TEXT,
      tool_output TEXT,
      tool_status TEXT,
      created_at INTEGER NOT NULL
    );
  `)
  return db
}
