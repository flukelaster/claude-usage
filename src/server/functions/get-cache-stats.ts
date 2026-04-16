import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/server/db/client'
import { messages, sessions, projects } from '~/server/db/schema'
import { sql, eq, and, gte, desc } from 'drizzle-orm'
import { getModelPricing, getModelFamily } from '~/lib/pricing'

export const getCacheStatsAll = createServerFn({ method: 'GET' })
  .handler(async () => queryCacheStats(null))

export const getCacheStats30d = createServerFn({ method: 'GET' })
  .handler(async () => queryCacheStats(30))

export const getCacheStats90d = createServerFn({ method: 'GET' })
  .handler(async () => queryCacheStats(90))

function queryCacheStats(days: number | null) {
  const db = getDb()
  const cutoff = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : null
  const timeFilter = cutoff ? gte(messages.timestamp, cutoff) : sql`1=1`

  const rawStats = db.select({
    model: messages.model,
    totalInputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
    totalCacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    totalCacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
    totalCacheEphemeral5m: sql<number>`coalesce(sum(${messages.cacheEphemeral5mTokens}), 0)`,
    totalCacheEphemeral1h: sql<number>`coalesce(sum(${messages.cacheEphemeral1hTokens}), 0)`,
    totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
  })
    .from(messages)
    .where(and(timeFilter, eq(messages.isSidechain, false)))
    .groupBy(messages.model)
    .all()

  const modelCacheStats = rawStats.map((stat) => {
    const pricing = getModelPricing(stat.model)
    const totalWithCache = stat.totalInputTokens + stat.totalCacheReadTokens + stat.totalCacheCreationTokens
    const hitRate = totalWithCache > 0 ? stat.totalCacheReadTokens / totalWithCache : 0
    const savings = stat.totalCacheReadTokens * (pricing.input - pricing.cacheRead) / 1_000_000
    const overhead = stat.totalCacheCreationTokens * (pricing.cacheWrite1h - pricing.input) / 1_000_000
    const netSavings = savings - overhead

    return {
      model: stat.model,
      modelFamily: getModelFamily(stat.model),
      hitRate,
      savings,
      overhead,
      netSavings,
      totalCost: stat.totalCost,
      roi: stat.totalCost > 0 ? netSavings / stat.totalCost : 0,
      cacheReadTokens: stat.totalCacheReadTokens,
      cacheCreationTokens: stat.totalCacheCreationTokens,
      ephemeral5mTokens: stat.totalCacheEphemeral5m,
      ephemeral1hTokens: stat.totalCacheEphemeral1h,
    }
  })

  const overallHitRate = rawStats.reduce((acc, s) => acc + s.totalCacheReadTokens, 0) /
    Math.max(1, rawStats.reduce((acc, s) => acc + s.totalInputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens, 0))
  const overallSavings = modelCacheStats.reduce((acc, s) => acc + s.savings, 0)
  const overallOverhead = modelCacheStats.reduce((acc, s) => acc + s.overhead, 0)
  const overallNetSavings = overallSavings - overallOverhead
  const overallCost = modelCacheStats.reduce((acc, s) => acc + s.totalCost, 0)

  const dailyCacheTrend = db.select({
    date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
    cacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
    cacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    inputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
  })
    .from(messages)
    .where(and(timeFilter, eq(messages.isSidechain, false)))
    .groupBy(sql`date(${messages.timestamp}, 'localtime')`)
    .orderBy(sql`date(${messages.timestamp}, 'localtime')`)
    .all()

  const projectCache = db.select({
    projectId: sessions.projectId,
    projectName: projects.displayName,
    cacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
    cacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    inputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
    totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
  })
    .from(messages)
    .innerJoin(sessions, eq(messages.sessionId, sessions.id))
    .innerJoin(projects, eq(sessions.projectId, projects.id))
    .where(and(timeFilter, eq(messages.isSidechain, false)))
    .groupBy(sessions.projectId)
    .orderBy(desc(sql`sum(${messages.cacheReadTokens})`))
    .all()
    .map((p) => {
      const total = p.inputTokens + p.cacheReadTokens + p.cacheCreationTokens
      return { ...p, hitRate: total > 0 ? p.cacheReadTokens / total : 0 }
    })

  return {
    overall: {
      hitRate: overallHitRate,
      savings: overallSavings,
      overhead: overallOverhead,
      netSavings: overallNetSavings,
      totalCost: overallCost,
      roi: overallCost > 0 ? overallNetSavings / overallCost : 0,
    },
    modelCacheStats,
    dailyCacheTrend,
    projectCache,
    days,
  }
}
