import { createServerFn } from '@tanstack/react-start'
import { statSync } from 'node:fs'
import { hostname } from 'node:os'
import { getDb } from '~/server/db/client'
import { projects, sessions, syncState } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { scanProjectFolders, getSessionFiles, extractSessionId } from '~/server/claude-logs/paths'
import { readSessionFile } from '~/server/claude-logs/reader'
import { processSessionChunk } from '~/server/claude-logs/processor'

interface SyncResult {
  projectsFound: number
  filesProcessed: number
  messagesAdded: number
  errors: number
  durationMs: number
}

export const syncLogs = createServerFn({ method: 'POST' }).handler(async (): Promise<SyncResult> => {
  const startTime = Date.now()
  const db = getDb()
  const localMachineId = hostname() || 'local'
  let filesProcessed = 0
  let messagesAdded = 0
  let errors = 0

  const projectFolders = scanProjectFolders()

  for (const project of projectFolders) {
    // Upsert project — always update cwd/displayName with real values
    db.insert(projects)
      .values({
        id: project.id,
        cwd: project.cwd,
        displayName: project.displayName,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          cwd: project.cwd,
          displayName: project.displayName,
        },
      })
      .run()

    const sessionFiles = getSessionFiles(project.path)

    for (const filePath of sessionFiles) {
      try {
        const sessionId = extractSessionId(filePath)
        let fileStat: ReturnType<typeof statSync>
        try {
          fileStat = statSync(filePath)
        } catch {
          continue
        }

        const existing = db.select({
          lastParsedOffset: sessions.lastParsedOffset,
          fileSize: sessions.fileSize,
        })
          .from(sessions)
          .where(eq(sessions.filePath, filePath))
          .get()

        const currentSize = fileStat.size
        const fromOffset = existing?.lastParsedOffset ?? 0

        if (existing && fromOffset >= currentSize) continue

        const effectiveOffset = fromOffset > currentSize ? 0 : fromOffset

        const entries: Array<{ data: unknown; offset: number }> = []
        for await (const item of readSessionFile(filePath, effectiveOffset)) {
          entries.push(item)
        }

        const result = processSessionChunk({
          db,
          projectId: project.id,
          machineId: localMachineId,
          filePath,
          sessionId,
          fromOffset: effectiveOffset,
          currentSize,
          entries,
        })

        messagesAdded += result.messagesAdded
        filesProcessed++
      } catch (e) {
        errors++
        console.error(`[sync] Error parsing ${filePath}:`, e)
      }
    }
  }

  // Update last sync time
  const now = new Date().toISOString()
  db.insert(syncState)
    .values({ key: 'lastSyncAt', value: now, updatedAt: now })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value: now, updatedAt: now },
    })
    .run()

  const result = {
    projectsFound: projectFolders.length,
    filesProcessed,
    messagesAdded,
    errors,
    durationMs: Date.now() - startTime,
  }

  // Fan out to webhook subscribers. Loaded dynamically so the trigger
  // module's transitive imports (e.g. node:crypto) stay out of the
  // browser bundle that ships this file's stub.
  try {
    const { runPostSyncTriggers } = await import('~/server/webhooks/triggers')
    await runPostSyncTriggers({ syncResult: result })
  } catch (err) {
    console.error('[sync] webhook dispatch failed:', err)
  }

  return result
})

export const getLastSyncTime = createServerFn({ method: 'GET' }).handler(async (): Promise<string | null> => {
  const db = getDb()
  const row = db.select().from(syncState).where(eq(syncState.key, 'lastSyncAt')).get()
  return row?.value ?? null
})
