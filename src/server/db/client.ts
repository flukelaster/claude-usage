import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

const DB_PATH = join(process.cwd(), 'data', 'cache.db')

let _db: ReturnType<typeof createDb> | null = null

function createDb() {
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      cwd TEXT,
      display_name TEXT NOT NULL,
      first_seen_at TEXT,
      last_active_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      file_path TEXT NOT NULL,
      title TEXT,
      slug TEXT,
      entrypoint TEXT,
      started_at TEXT,
      ended_at TEXT,
      message_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cache_creation_tokens INTEGER DEFAULT 0,
      total_cache_read_tokens INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0,
      last_parsed_offset INTEGER DEFAULT 0,
      file_size INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      uuid TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      timestamp TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_ephemeral_5m_tokens INTEGER DEFAULT 0,
      cache_ephemeral_1h_tokens INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      stop_reason TEXT,
      duration_ms INTEGER,
      is_sidechain INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_uses (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(uuid),
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      input_size INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);
    CREATE INDEX IF NOT EXISTS idx_tool_uses_message ON tool_uses(message_id);
    CREATE INDEX IF NOT EXISTS idx_tool_uses_session ON tool_uses(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_uses_name ON tool_uses(tool_name);
    CREATE INDEX IF NOT EXISTS idx_tool_uses_timestamp ON tool_uses(timestamp);
  `)

  return db
}

export function getDb() {
  if (!_db) {
    mkdirSync(dirname(DB_PATH), { recursive: true })
    _db = createDb()
  }
  return _db
}

export type DbClient = ReturnType<typeof getDb>
