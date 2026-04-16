import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/server/db/client'
import { messages } from '~/server/db/schema'
import { sql, eq, and, gte } from 'drizzle-orm'

export const getDailyUsageAll = createServerFn({ method: 'GET' })
  .handler(async () => queryDailyUsage(null))

export const getDailyUsage30d = createServerFn({ method: 'GET' })
  .handler(async () => queryDailyUsage(30))

export const getDailyUsage90d = createServerFn({ method: 'GET' })
  .handler(async () => queryDailyUsage(90))

function queryDailyUsage(days: number | null) {
  const db = getDb()
  const cutoff = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : null
  const timeFilter = cutoff ? gte(messages.timestamp, cutoff) : sql`1=1`
  const sidechainFilter = eq(messages.isSidechain, false)

  const daily = db.select({
    date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
    inputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
    outputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
    cacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    cacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
    totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
    messageCount: sql<number>`count(*)`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .groupBy(sql`date(${messages.timestamp}, 'localtime')`)
    .orderBy(sql`date(${messages.timestamp}, 'localtime') desc`)
    .all()

  // Models used per day
  const dailyModels = db.select({
    date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
    model: messages.model,
    cost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .groupBy(sql`date(${messages.timestamp}, 'localtime')`, messages.model)
    .orderBy(sql`date(${messages.timestamp}, 'localtime') desc`, sql`sum(${messages.estimatedCostUsd}) desc`)
    .all()

  // Group models by date
  const modelsByDate = new Map<string, string[]>()
  for (const row of dailyModels) {
    const existing = modelsByDate.get(row.date) ?? []
    existing.push(row.model)
    modelsByDate.set(row.date, existing)
  }

  const result = daily.map((d) => ({
    ...d,
    totalTokens: d.inputTokens + d.outputTokens + d.cacheCreationTokens + d.cacheReadTokens,
    models: modelsByDate.get(d.date) ?? [],
  }))

  // Totals
  const totals = result.reduce(
    (acc, d) => ({
      inputTokens: acc.inputTokens + d.inputTokens,
      outputTokens: acc.outputTokens + d.outputTokens,
      cacheCreationTokens: acc.cacheCreationTokens + d.cacheCreationTokens,
      cacheReadTokens: acc.cacheReadTokens + d.cacheReadTokens,
      totalTokens: acc.totalTokens + d.totalTokens,
      totalCost: acc.totalCost + d.totalCost,
    }),
    { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, totalCost: 0 },
  )

  return { daily: result, totals, days }
}
