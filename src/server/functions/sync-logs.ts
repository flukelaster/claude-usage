import { createServerFn } from '@tanstack/react-start'
import { statSync } from 'node:fs'
import { getDb } from '~/server/db/client'
import { projects, sessions, messages, syncState } from '~/server/db/schema'
import { eq, sql } from 'drizzle-orm'
import { scanProjectFolders, getSessionFiles, extractSessionId } from '~/server/claude-logs/paths'
import { readSessionFile } from '~/server/claude-logs/reader'
import { parseEntry, type ParsedMessage, type ParsedTurnDuration } from '~/server/claude-logs/parser'

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

        // Check if we need to parse
        const existing = db.select({
          lastParsedOffset: sessions.lastParsedOffset,
          fileSize: sessions.fileSize,
        })
          .from(sessions)
          .where(eq(sessions.filePath, filePath))
          .get()

        const currentSize = fileStat.size
        const fromOffset = existing?.lastParsedOffset ?? 0

        // Skip if file hasn't changed
        if (existing && fromOffset >= currentSize) continue

        // If file shrank (truncation), reset offset
        const effectiveOffset = fromOffset > currentSize ? 0 : fromOffset

        // Ensure session record exists
        db.insert(sessions)
          .values({
            id: sessionId,
            projectId: project.id,
            filePath,
            lastParsedOffset: 0,
            fileSize: 0,
          })
          .onConflictDoNothing()
          .run()

        // Parse new data
        const newMessages: ParsedMessage[] = []
        const turnDurations: ParsedTurnDuration[] = []
        let sessionTitle: string | null = null
        let sessionSlug: string | null = null
        let sessionEntrypoint: string | null = null
        let firstTimestamp: string | null = null
        let lastTimestamp: string | null = null
        let lastOffset = effectiveOffset

        for await (const { data, offset } of readSessionFile(filePath, effectiveOffset)) {
          const result = parseEntry(data)

          switch (result.type) {
            case 'message':
              newMessages.push(result.data)
              break
            case 'turn_duration':
              turnDurations.push(result.data)
              break
            case 'title':
              // Custom title overrides AI title
              if (result.data.isCustom || !sessionTitle) {
                sessionTitle = result.data.title
              }
              break
            case 'meta':
              if (!sessionEntrypoint && result.data.entrypoint) {
                sessionEntrypoint = result.data.entrypoint
              }
              if (!sessionSlug && result.data.slug) {
                sessionSlug = result.data.slug
              }
              if (!firstTimestamp && result.data.startedAt) {
                firstTimestamp = result.data.startedAt
              }
              if (result.data.endedAt) {
                lastTimestamp = result.data.endedAt
              }
              break
          }
          lastOffset = offset
        }

        // Build turn duration lookup
        const durationMap = new Map<string, number>()
        for (const td of turnDurations) {
          durationMap.set(td.parentUuid, td.durationMs)
        }

        // Batch insert messages in transaction. Count only rows that actually
        // land in the DB — `onConflictDoNothing` may skip existing uuids, and
        // if a transaction throws we must not double-count on retry.
        if (newMessages.length > 0) {
          const BATCH_SIZE = 500
          for (let i = 0; i < newMessages.length; i += BATCH_SIZE) {
            const batch = newMessages.slice(i, i + BATCH_SIZE)
            let batchInserted = 0
            db.transaction((tx) => {
              for (const msg of batch) {
                const result = tx.insert(messages)
                  .values({
                    uuid: msg.uuid,
                    sessionId: msg.sessionId,
                    timestamp: msg.timestamp,
                    model: msg.model,
                    inputTokens: msg.inputTokens,
                    outputTokens: msg.outputTokens,
                    cacheCreationTokens: msg.cacheCreationTokens,
                    cacheReadTokens: msg.cacheReadTokens,
                    cacheEphemeral5mTokens: msg.cacheEphemeral5mTokens,
                    cacheEphemeral1hTokens: msg.cacheEphemeral1hTokens,
                    estimatedCostUsd: msg.estimatedCostUsd,
                    stopReason: msg.stopReason,
                    durationMs: durationMap.get(msg.uuid) ?? null,
                    isSidechain: msg.isSidechain,
                  })
                  .onConflictDoNothing()
                  .run()
                if ((result as { changes?: number }).changes) batchInserted += 1
              }
            })
            messagesAdded += batchInserted
          }
        }

        // Update session metadata
        const totals = db.select({
          messageCount: sql<number>`count(*)`,
          totalInput: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
          totalOutput: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
          totalCacheCreation: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
          totalCacheRead: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
          totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
          minTimestamp: sql<string>`min(${messages.timestamp})`,
          maxTimestamp: sql<string>`max(${messages.timestamp})`,
        })
          .from(messages)
          .where(eq(messages.sessionId, sessionId))
          .get()

        db.update(sessions)
          .set({
            title: sessionTitle ?? undefined,
            slug: sessionSlug ?? undefined,
            entrypoint: sessionEntrypoint ?? undefined,
            startedAt: totals?.minTimestamp ?? firstTimestamp ?? undefined,
            endedAt: totals?.maxTimestamp ?? lastTimestamp ?? undefined,
            messageCount: totals?.messageCount ?? 0,
            totalInputTokens: totals?.totalInput ?? 0,
            totalOutputTokens: totals?.totalOutput ?? 0,
            totalCacheCreationTokens: totals?.totalCacheCreation ?? 0,
            totalCacheReadTokens: totals?.totalCacheRead ?? 0,
            totalCost: totals?.totalCost ?? 0,
            lastParsedOffset: lastOffset,
            fileSize: currentSize,
          })
          .where(eq(sessions.id, sessionId))
          .run()

        // Update project timestamps
        if (firstTimestamp || lastTimestamp) {
          const proj = db.select().from(projects).where(eq(projects.id, project.id)).get()
          const updates: Record<string, string> = {}
          if (firstTimestamp && (!proj?.firstSeenAt || firstTimestamp < proj.firstSeenAt)) {
            updates.firstSeenAt = firstTimestamp
          }
          if (lastTimestamp && (!proj?.lastActiveAt || lastTimestamp > proj.lastActiveAt)) {
            updates.lastActiveAt = lastTimestamp
          }
          if (Object.keys(updates).length > 0) {
            db.update(projects)
              .set(updates)
              .where(eq(projects.id, project.id))
              .run()
          }
        }

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

  return {
    projectsFound: projectFolders.length,
    filesProcessed,
    messagesAdded,
    errors,
    durationMs: Date.now() - startTime,
  }
})

export const getLastSyncTime = createServerFn({ method: 'GET' }).handler(async (): Promise<string | null> => {
  const db = getDb()
  const row = db.select().from(syncState).where(eq(syncState.key, 'lastSyncAt')).get()
  return row?.value ?? null
})
