/**
 * CLI script to sync Claude Code logs into SQLite cache.
 * Run: pnpm sync
 */
import { scanProjectFolders, getSessionFiles, extractSessionId } from '../src/server/claude-logs/paths'
import { readSessionFile } from '../src/server/claude-logs/reader'
import { parseEntry, type ParsedMessage, type ParsedTurnDuration } from '../src/server/claude-logs/parser'
import { getDb } from '../src/server/db/client'
import { projects, sessions, messages, toolUses, syncState } from '../src/server/db/schema'
import { eq, sql } from 'drizzle-orm'
import { statSync } from 'node:fs'

async function main() {
  const startTime = Date.now()
  const db = getDb()
  let filesProcessed = 0
  let totalMessagesAdded = 0
  let errors = 0

  const projectFolders = scanProjectFolders()
  console.log(`Found ${projectFolders.length} projects`)

  for (const project of projectFolders) {
    db.insert(projects).values({
      id: project.id,
      cwd: project.cwd,
      displayName: project.displayName,
    }).onConflictDoUpdate({
      target: projects.id,
      set: { cwd: project.cwd, displayName: project.displayName },
    }).run()

    const sessionFiles = getSessionFiles(project.path)

    for (const filePath of sessionFiles) {
      try {
        const sessionId = extractSessionId(filePath)
        let fileStat: ReturnType<typeof statSync>
        try { fileStat = statSync(filePath) } catch { continue }

        const existing = db.select({
          lastParsedOffset: sessions.lastParsedOffset,
          fileSize: sessions.fileSize,
        }).from(sessions).where(eq(sessions.filePath, filePath)).get()

        const currentSize = fileStat.size
        const fromOffset = existing?.lastParsedOffset ?? 0
        if (existing && fromOffset >= currentSize) continue
        const effectiveOffset = fromOffset > currentSize ? 0 : fromOffset

        db.insert(sessions).values({
          id: sessionId,
          projectId: project.id,
          filePath,
          lastParsedOffset: 0,
          fileSize: 0,
        }).onConflictDoNothing().run()

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
            case 'message': newMessages.push(result.data); break
            case 'turn_duration': turnDurations.push(result.data); break
            case 'title':
              if (result.data.isCustom || !sessionTitle) sessionTitle = result.data.title
              break
            case 'meta':
              if (!sessionEntrypoint && result.data.entrypoint) sessionEntrypoint = result.data.entrypoint
              if (!sessionSlug && result.data.slug) sessionSlug = result.data.slug
              if (!firstTimestamp && result.data.startedAt) firstTimestamp = result.data.startedAt
              if (result.data.endedAt) lastTimestamp = result.data.endedAt
              break
          }
          lastOffset = offset
        }

        const durationMap = new Map<string, number>()
        for (const td of turnDurations) durationMap.set(td.parentUuid, td.durationMs)

        // Subagent messages may carry a sessionId other than the file's own
        // UUID (the Agent tool inlines child-session log entries). Pre-insert
        // placeholder session rows for every id we've seen so the FK holds.
        const distinctIds = new Set(newMessages.map((m) => m.sessionId))
        distinctIds.add(sessionId)
        if (distinctIds.size > 1) {
          db.transaction((tx) => {
            for (const sid of distinctIds) {
              tx.insert(sessions).values({
                id: sid, projectId: project.id, filePath,
                lastParsedOffset: 0, fileSize: 0,
              }).onConflictDoNothing().run()
            }
          })
        }

        if (newMessages.length > 0) {
          const BATCH = 500
          for (let i = 0; i < newMessages.length; i += BATCH) {
            const batch = newMessages.slice(i, i + BATCH)
            db.transaction((tx) => {
              for (const msg of batch) {
                tx.insert(messages).values({
                  uuid: msg.uuid, sessionId: msg.sessionId, timestamp: msg.timestamp,
                  model: msg.model, inputTokens: msg.inputTokens, outputTokens: msg.outputTokens,
                  cacheCreationTokens: msg.cacheCreationTokens, cacheReadTokens: msg.cacheReadTokens,
                  cacheEphemeral5mTokens: msg.cacheEphemeral5mTokens, cacheEphemeral1hTokens: msg.cacheEphemeral1hTokens,
                  estimatedCostUsd: msg.estimatedCostUsd, stopReason: msg.stopReason,
                  durationMs: durationMap.get(msg.uuid) ?? null, isSidechain: msg.isSidechain,
                }).onConflictDoNothing().run()
                for (const tu of msg.toolUses) {
                  tx.insert(toolUses).values({
                    id: tu.id, messageId: tu.messageId, sessionId: tu.sessionId,
                    timestamp: tu.timestamp, toolName: tu.toolName, inputSize: tu.inputSize,
                  }).onConflictDoNothing().run()
                }
              }
            })
          }
          totalMessagesAdded += newMessages.length
        }

        for (const sid of distinctIds) {
          const totals = db.select({
            messageCount: sql<number>`count(*)`,
            totalInput: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
            totalOutput: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
            totalCacheCreation: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
            totalCacheRead: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
            totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
            minTs: sql<string>`min(${messages.timestamp})`,
            maxTs: sql<string>`max(${messages.timestamp})`,
          }).from(messages).where(eq(messages.sessionId, sid)).get()

          const isParent = sid === sessionId
          db.update(sessions).set({
            title: isParent ? (sessionTitle ?? undefined) : undefined,
            slug: isParent ? (sessionSlug ?? undefined) : undefined,
            entrypoint: isParent ? (sessionEntrypoint ?? undefined) : undefined,
            startedAt: totals?.minTs ?? (isParent ? firstTimestamp ?? undefined : undefined),
            endedAt: totals?.maxTs ?? (isParent ? lastTimestamp ?? undefined : undefined),
            messageCount: totals?.messageCount ?? 0,
            totalInputTokens: totals?.totalInput ?? 0,
            totalOutputTokens: totals?.totalOutput ?? 0,
            totalCacheCreationTokens: totals?.totalCacheCreation ?? 0,
            totalCacheReadTokens: totals?.totalCacheRead ?? 0,
            totalCost: totals?.totalCost ?? 0,
            lastParsedOffset: isParent ? lastOffset : undefined,
            fileSize: isParent ? currentSize : undefined,
          }).where(eq(sessions.id, sid)).run()
        }

        if (firstTimestamp || lastTimestamp) {
          const proj = db.select().from(projects).where(eq(projects.id, project.id)).get()
          const updates: Record<string, string> = {}
          if (firstTimestamp && (!proj?.firstSeenAt || firstTimestamp < proj.firstSeenAt)) updates.firstSeenAt = firstTimestamp
          if (lastTimestamp && (!proj?.lastActiveAt || lastTimestamp > proj.lastActiveAt)) updates.lastActiveAt = lastTimestamp
          if (Object.keys(updates).length > 0) db.update(projects).set(updates).where(eq(projects.id, project.id)).run()
        }

        filesProcessed++
      } catch (e) {
        errors++
        console.error(`Error: ${filePath}:`, (e as Error).message)
      }
    }
  }

  const now = new Date().toISOString()
  db.insert(syncState).values({ key: 'lastSyncAt', value: now, updatedAt: now })
    .onConflictDoUpdate({ target: syncState.key, set: { value: now, updatedAt: now } }).run()

  const dbCount = db.select({ count: sql<number>`count(*)` }).from(messages).get()
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log(`Synced ${filesProcessed} files, ${totalMessagesAdded} new messages (${dbCount?.count} total) in ${elapsed}s`)
  if (errors > 0) console.log(`${errors} errors`)
}

main().catch(console.error)
