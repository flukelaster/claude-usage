import { createServerFn } from '@tanstack/react-start'
import { statSync } from 'node:fs'
import { getDb } from '~/server/db/client'
import { projects, sessions, messages, syncState, toolUses } from '~/server/db/schema'
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

        // Subagent invocations (Agent tool) emit messages whose `sessionId`
        // refers to a child session that doesn't have its own .jsonl file at
        // this level — the messages are inlined into the parent log. Upsert a
        // placeholder sessions row for every distinct id we've seen so the
        // message FK succeeds; metadata backfills on future syncs that find
        // the real child file.
        const distinctSessionIds = new Set(newMessages.map((m) => m.sessionId))
        distinctSessionIds.add(sessionId) // always keep the parent row fresh
        if (distinctSessionIds.size > 1) {
          db.transaction((tx) => {
            for (const sid of distinctSessionIds) {
              tx.insert(sessions)
                .values({
                  id: sid,
                  projectId: project.id,
                  filePath,
                  lastParsedOffset: 0,
                  fileSize: 0,
                })
                .onConflictDoNothing()
                .run()
            }
          })
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

                // Tool uses live in a sibling table — always attempt the
                // insert so backfill on a previously-synced message still
                // captures its tool calls.
                for (const tu of msg.toolUses) {
                  tx.insert(toolUses)
                    .values({
                      id: tu.id,
                      messageId: tu.messageId,
                      sessionId: tu.sessionId,
                      timestamp: tu.timestamp,
                      toolName: tu.toolName,
                      inputSize: tu.inputSize,
                    })
                    .onConflictDoNothing()
                    .run()
                }
              }
            })
            messagesAdded += batchInserted
          }
        }

        // Recompute aggregates for every session id we touched (the parent
        // plus any subagent ids discovered inside the log). The parent row
        // also records the byte offset so the next sync can skip already-
        // parsed content.
        for (const sid of distinctSessionIds) {
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
            .where(eq(messages.sessionId, sid))
            .get()

          const isParent = sid === sessionId
          db.update(sessions)
            .set({
              // Only stamp the parent session with the file-derived metadata;
              // orphans (subagents) don't have their own top-level .jsonl so
              // leave their title/slug/entrypoint alone.
              title: isParent ? (sessionTitle ?? undefined) : undefined,
              slug: isParent ? (sessionSlug ?? undefined) : undefined,
              entrypoint: isParent ? (sessionEntrypoint ?? undefined) : undefined,
              startedAt: totals?.minTimestamp ?? (isParent ? firstTimestamp ?? undefined : undefined),
              endedAt: totals?.maxTimestamp ?? (isParent ? lastTimestamp ?? undefined : undefined),
              messageCount: totals?.messageCount ?? 0,
              totalInputTokens: totals?.totalInput ?? 0,
              totalOutputTokens: totals?.totalOutput ?? 0,
              totalCacheCreationTokens: totals?.totalCacheCreation ?? 0,
              totalCacheReadTokens: totals?.totalCacheRead ?? 0,
              totalCost: totals?.totalCost ?? 0,
              // Only the parent's byte offset matters — the orphan's own
              // file (if it ever gets its own .jsonl) will overwrite later.
              lastParsedOffset: isParent ? lastOffset : undefined,
              fileSize: isParent ? currentSize : undefined,
            })
            .where(eq(sessions.id, sid))
            .run()
        }

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
