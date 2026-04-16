import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/server/db/client'
import { messages } from '~/server/db/schema'
import { sql, eq, and, gte } from 'drizzle-orm'

export const getModelStatsAll = createServerFn({ method: 'GET' })
  .handler(async () => queryModelStats(null))

export const getModelStats30d = createServerFn({ method: 'GET' })
  .handler(async () => queryModelStats(30))

export const getModelStats90d = createServerFn({ method: 'GET' })
  .handler(async () => queryModelStats(90))

function queryModelStats(days: number | null) {
  const db = getDb()
  const cutoff = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : null
  const timeFilter = cutoff ? gte(messages.timestamp, cutoff) : sql`1=1`
  const sidechainFilter = eq(messages.isSidechain, false)

  const modelStats = db.select({
    model: messages.model,
    totalInputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
    totalCacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    totalCacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
    totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
    messageCount: sql<number>`count(*)`,
    sessionCount: sql<number>`count(distinct ${messages.sessionId})`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .groupBy(messages.model)
    .all()

  const dailyByModel = db.select({
    date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
    model: messages.model,
    cost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
    tokens: sql<number>`coalesce(sum(${messages.inputTokens} + ${messages.outputTokens} + ${messages.cacheCreationTokens} + ${messages.cacheReadTokens}), 0)`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .groupBy(sql`date(${messages.timestamp}, 'localtime')`, messages.model)
    .orderBy(sql`date(${messages.timestamp}, 'localtime')`)
    .all()

  return { modelStats, dailyByModel, days }
}
