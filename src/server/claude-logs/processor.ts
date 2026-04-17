import { eq, sql } from 'drizzle-orm'
import type { DbClient } from '~/server/db/client'
import { projects, sessions, messages, toolUses } from '~/server/db/schema'
import { parseEntry, type ParsedMessage, type ParsedTurnDuration } from './parser'

/**
 * Parse a buffer of .jsonl bytes starting at `fromOffset`, yielding each
 * JSON object with its *exact* byte offset (relative to the file, not the
 * buffer). Mirrors the semantics of `readSessionFile` but for in-memory
 * bytes — used by the /api/ingest route so remote agents can upload a
 * chunk starting at the offset they last synced.
 */
export function* parseBytes(
  buffer: Buffer,
  fromOffset = 0,
): Generator<{ data: unknown; offset: number }> {
  let cursor = 0
  let absolute = fromOffset

  while (cursor < buffer.length) {
    const newlineIdx = buffer.indexOf(0x0a, cursor)
    if (newlineIdx === -1) {
      const line = buffer.subarray(cursor).toString('utf8').replace(/\r$/, '')
      absolute += buffer.length - cursor
      cursor = buffer.length
      if (line.trim()) {
        try {
          yield { data: JSON.parse(line), offset: absolute }
        } catch {
          // ignore malformed tail
        }
      }
      return
    }

    let lineEnd = newlineIdx
    if (lineEnd > cursor && buffer[lineEnd - 1] === 0x0d) lineEnd -= 1

    const line = buffer.subarray(cursor, lineEnd).toString('utf8')
    const consumed = newlineIdx + 1 - cursor
    cursor = newlineIdx + 1
    absolute += consumed

    if (!line.trim()) continue
    try {
      yield { data: JSON.parse(line), offset: absolute }
    } catch {
      // skip malformed line
    }
  }
}

export interface ProcessChunkInput {
  db: DbClient
  projectId: string
  machineId: string
  filePath: string
  sessionId: string
  fromOffset: number
  currentSize: number
  entries: Iterable<{ data: unknown; offset: number }>
}

export interface ProcessChunkResult {
  messagesAdded: number
  lastOffset: number
  firstTimestamp: string | null
  lastTimestamp: string | null
}

/**
 * Apply a pre-parsed chunk of session entries to the database. Shared
 * between local sync (`sync-logs.ts`) and remote ingest (`/api/ingest`).
 * Callers are responsible for guarding against `fromOffset >= currentSize`
 * (no-op) and for resetting `fromOffset` on file truncation.
 */
export function processSessionChunk(input: ProcessChunkInput): ProcessChunkResult {
  const { db, projectId, machineId, filePath, sessionId, fromOffset, currentSize, entries } = input

  const newMessages: ParsedMessage[] = []
  const turnDurations: ParsedTurnDuration[] = []
  let sessionTitle: string | null = null
  let sessionSlug: string | null = null
  let sessionEntrypoint: string | null = null
  let firstTimestamp: string | null = null
  let lastTimestamp: string | null = null
  let lastOffset = fromOffset

  for (const { data, offset } of entries) {
    const result = parseEntry(data)
    switch (result.type) {
      case 'message':
        newMessages.push(result.data)
        break
      case 'turn_duration':
        turnDurations.push(result.data)
        break
      case 'title':
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

  // Ensure parent session row exists
  db.insert(sessions)
    .values({
      id: sessionId,
      projectId,
      machineId,
      filePath,
      lastParsedOffset: 0,
      fileSize: 0,
    })
    .onConflictDoNothing()
    .run()

  const durationMap = new Map<string, number>()
  for (const td of turnDurations) durationMap.set(td.parentUuid, td.durationMs)

  // Subagent placeholder rows — see sync-logs.ts for the rationale.
  const distinctSessionIds = new Set(newMessages.map((m) => m.sessionId))
  distinctSessionIds.add(sessionId)
  if (distinctSessionIds.size > 1) {
    db.transaction((tx) => {
      for (const sid of distinctSessionIds) {
        tx.insert(sessions)
          .values({
            id: sid,
            projectId,
            machineId,
            filePath,
            lastParsedOffset: 0,
            fileSize: 0,
          })
          .onConflictDoNothing()
          .run()
      }
    })
  }

  let messagesAdded = 0
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
        title: isParent ? (sessionTitle ?? undefined) : undefined,
        slug: isParent ? (sessionSlug ?? undefined) : undefined,
        entrypoint: isParent ? (sessionEntrypoint ?? undefined) : undefined,
        machineId,
        startedAt: totals?.minTimestamp ?? (isParent ? firstTimestamp ?? undefined : undefined),
        endedAt: totals?.maxTimestamp ?? (isParent ? lastTimestamp ?? undefined : undefined),
        messageCount: totals?.messageCount ?? 0,
        totalInputTokens: totals?.totalInput ?? 0,
        totalOutputTokens: totals?.totalOutput ?? 0,
        totalCacheCreationTokens: totals?.totalCacheCreation ?? 0,
        totalCacheReadTokens: totals?.totalCacheRead ?? 0,
        totalCost: totals?.totalCost ?? 0,
        lastParsedOffset: isParent ? lastOffset : undefined,
        fileSize: isParent ? currentSize : undefined,
      })
      .where(eq(sessions.id, sid))
      .run()
  }

  if (firstTimestamp || lastTimestamp) {
    const proj = db.select().from(projects).where(eq(projects.id, projectId)).get()
    const updates: Record<string, string> = {}
    if (firstTimestamp && (!proj?.firstSeenAt || firstTimestamp < proj.firstSeenAt)) {
      updates.firstSeenAt = firstTimestamp
    }
    if (lastTimestamp && (!proj?.lastActiveAt || lastTimestamp > proj.lastActiveAt)) {
      updates.lastActiveAt = lastTimestamp
    }
    if (Object.keys(updates).length > 0) {
      db.update(projects).set(updates).where(eq(projects.id, projectId)).run()
    }
  }

  return { messagesAdded, lastOffset, firstTimestamp, lastTimestamp }
}
