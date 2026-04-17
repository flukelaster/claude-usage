import { createServerFn } from '@tanstack/react-start'

/**
 * Full-database backup as a JSON document. Messages and sessions can be
 * large, so this should be thought of as a migration/backup tool rather
 * than something to run inside the dashboard every few seconds.
 *
 * Format version is bumped whenever the dump shape changes so importers
 * can reject unknown versions instead of silently merging mismatches.
 */

const DUMP_VERSION = 1

// Row shape is "anything JSON-serializable"; TanStack Start's serialization
// validator rejects `unknown`, so we narrow to a plain JSON value type.
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }
type DumpRow = Record<string, JsonValue>

export interface DatabaseDump {
  version: number
  exportedAt: string
  counts: Record<string, number>
  projects: DumpRow[]
  sessions: DumpRow[]
  messages: DumpRow[]
  toolUses: DumpRow[]
  tags: DumpRow[]
  entityTags: DumpRow[]
}

export interface ImportResult {
  version: number
  inserted: Record<string, number>
  skipped: Record<string, number>
  errors: string[]
}

export const exportDatabase = createServerFn({ method: 'POST' }).handler(
  async (): Promise<DatabaseDump> => {
    const { getDb } = await import('~/server/db/client')
    const { projects, sessions, messages, toolUses, tags, entityTags } =
      await import('~/server/db/schema')
    const db = getDb()

    const projectRows = db.select().from(projects).all()
    const sessionRows = db.select().from(sessions).all()
    const messageRows = db.select().from(messages).all()
    const toolUseRows = db.select().from(toolUses).all()
    const tagRows = db.select().from(tags).all()
    const entityTagRows = db.select().from(entityTags).all()

    return {
      version: DUMP_VERSION,
      exportedAt: new Date().toISOString(),
      counts: {
        projects: projectRows.length,
        sessions: sessionRows.length,
        messages: messageRows.length,
        toolUses: toolUseRows.length,
        tags: tagRows.length,
        entityTags: entityTagRows.length,
      },
      projects: projectRows,
      sessions: sessionRows,
      messages: messageRows,
      toolUses: toolUseRows,
      tags: tagRows,
      entityTags: entityTagRows,
    }
  },
)

export const importDatabase = createServerFn({ method: 'POST' })
  .inputValidator((data: { dump: DatabaseDump; mode: 'merge' | 'replace' }) => data)
  .handler(async ({ data }): Promise<ImportResult> => {
    const { getDb } = await import('~/server/db/client')
    const { projects, sessions, messages, toolUses, tags, entityTags } =
      await import('~/server/db/schema')
    const db = getDb()

    if (data.dump.version !== DUMP_VERSION) {
      throw new Error(
        `Unsupported dump version ${data.dump.version}; this build accepts ${DUMP_VERSION}.`,
      )
    }

    const inserted: Record<string, number> = {}
    const skipped: Record<string, number> = {}
    const errors: string[] = []

    function bulkInsert<T extends Record<string, unknown>>(
      label: string,
      table: Parameters<typeof db.insert>[0],
      rows: T[],
    ) {
      inserted[label] = 0
      skipped[label] = 0
      if (rows.length === 0) return
      db.transaction((tx) => {
        for (const row of rows) {
          try {
            const res = tx.insert(table).values(row as never).onConflictDoNothing().run()
            if ((res as { changes?: number }).changes) inserted[label] += 1
            else skipped[label] += 1
          } catch (err) {
            errors.push(
              `${label}: ${err instanceof Error ? err.message : String(err)}`,
            )
            skipped[label] += 1
          }
        }
      })
    }

    if (data.mode === 'replace') {
      // Wipe in reverse dependency order so FK constraints stay happy.
      db.transaction((tx) => {
        tx.delete(entityTags).run()
        tx.delete(tags).run()
        tx.delete(toolUses).run()
        tx.delete(messages).run()
        tx.delete(sessions).run()
        tx.delete(projects).run()
      })
    }

    // Insert order mirrors dependency graph: projects → sessions → messages
    // → tool_uses; tags are independent of those three.
    bulkInsert('projects', projects, data.dump.projects as Record<string, unknown>[])
    bulkInsert('sessions', sessions, data.dump.sessions as Record<string, unknown>[])
    bulkInsert('messages', messages, data.dump.messages as Record<string, unknown>[])
    bulkInsert('toolUses', toolUses, data.dump.toolUses as Record<string, unknown>[])
    bulkInsert('tags', tags, data.dump.tags as Record<string, unknown>[])
    bulkInsert('entityTags', entityTags, data.dump.entityTags as Record<string, unknown>[])

    return { version: DUMP_VERSION, inserted, skipped, errors }
  })
