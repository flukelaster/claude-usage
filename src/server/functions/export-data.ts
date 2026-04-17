import { createServerFn } from '@tanstack/react-start'

type ExportFormat = 'csv' | 'json'
type ExportDataset = 'sessions' | 'messages' | 'daily'

interface ExportParams {
  format: ExportFormat
  dataset: ExportDataset
  days?: number | null
}

interface ExportPayload {
  filename: string
  mimeType: string
  body: string
}

/**
 * Streams tabular data out as CSV or JSON for spreadsheet / analysis
 * workflows. Kept in a separate server function from the PDF export so
 * its formatter stays lean and avoids dragging in PDFKit.
 */
export const exportData = createServerFn({ method: 'POST' })
  .inputValidator((data: ExportParams) => data)
  .handler(async ({ data }): Promise<ExportPayload> => {
    const { getDb } = await import('~/server/db/client')
    const { messages, sessions, projects } = await import('~/server/db/schema')
    const { sql, eq, and, gte, desc } = await import('drizzle-orm')
    const { buildSidechainFilter } = await import('~/server/db/query-filters')
    const { toCsv } = await import('~/server/export/csv')

    const db = getDb()
    const cutoff =
      data.days && data.days > 0
        ? new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString()
        : null
    const sidechainFilter = buildSidechainFilter()

    let rows: Array<Record<string, unknown>> = []
    let baseName = 'claude-usage'

    if (data.dataset === 'sessions') {
      baseName = 'sessions'
      const msgTimeFilter = cutoff ? gte(sessions.startedAt, cutoff) : sql`1=1`
      rows = db
        .select({
          id: sessions.id,
          projectName: projects.displayName,
          title: sessions.title,
          entrypoint: sessions.entrypoint,
          startedAt: sessions.startedAt,
          endedAt: sessions.endedAt,
          messageCount: sessions.messageCount,
          totalInputTokens: sessions.totalInputTokens,
          totalOutputTokens: sessions.totalOutputTokens,
          totalCacheCreationTokens: sessions.totalCacheCreationTokens,
          totalCacheReadTokens: sessions.totalCacheReadTokens,
          totalCost: sessions.totalCost,
        })
        .from(sessions)
        .innerJoin(projects, eq(sessions.projectId, projects.id))
        .where(msgTimeFilter)
        .orderBy(desc(sessions.startedAt))
        .all() as Array<Record<string, unknown>>
    } else if (data.dataset === 'messages') {
      baseName = 'messages'
      const timeFilter = cutoff ? gte(messages.timestamp, cutoff) : sql`1=1`
      rows = db
        .select({
          uuid: messages.uuid,
          sessionId: messages.sessionId,
          timestamp: messages.timestamp,
          model: messages.model,
          inputTokens: messages.inputTokens,
          outputTokens: messages.outputTokens,
          cacheCreationTokens: messages.cacheCreationTokens,
          cacheReadTokens: messages.cacheReadTokens,
          estimatedCostUsd: messages.estimatedCostUsd,
          stopReason: messages.stopReason,
          durationMs: messages.durationMs,
          isSidechain: messages.isSidechain,
        })
        .from(messages)
        .where(and(timeFilter, sidechainFilter))
        .orderBy(desc(messages.timestamp))
        .limit(50_000) // safety cap to avoid multi-GB exports
        .all() as Array<Record<string, unknown>>
    } else if (data.dataset === 'daily') {
      baseName = 'daily-usage'
      const timeFilter = cutoff ? gte(messages.timestamp, cutoff) : sql`1=1`
      rows = db
        .select({
          date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
          messageCount: sql<number>`count(*)`,
          inputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
          outputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
          cacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
          cacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
          totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
        })
        .from(messages)
        .where(and(timeFilter, sidechainFilter))
        .groupBy(sql`date(${messages.timestamp}, 'localtime')`)
        .orderBy(sql`date(${messages.timestamp}, 'localtime') desc`)
        .all() as Array<Record<string, unknown>>
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const periodTag = data.days ? `${data.days}d` : 'all'
    const filename = `${baseName}-${periodTag}-${stamp}.${data.format}`

    if (data.format === 'json') {
      return {
        filename,
        mimeType: 'application/json',
        body: JSON.stringify(rows, null, 2),
      }
    }

    return {
      filename,
      mimeType: 'text/csv',
      body: toCsv(rows),
    }
  })
