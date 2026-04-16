import { createServerFn } from '@tanstack/react-start'

export const exportPdf30d = createServerFn({ method: 'POST' })
  .inputValidator((data: { accountName: string }) => data)
  .handler(async ({ data }) => generatePdf(data?.accountName ?? 'Claude User', 30))

export const exportPdf90d = createServerFn({ method: 'POST' })
  .inputValidator((data: { accountName: string }) => data)
  .handler(async ({ data }) => generatePdf(data?.accountName ?? 'Claude User', 90))

export const exportPdfAll = createServerFn({ method: 'POST' })
  .inputValidator((data: { accountName: string }) => data)
  .handler(async ({ data }) => generatePdf(data?.accountName ?? 'Claude User', null))

async function generatePdf(accountName: string, days: number | null) {
  // All imports are dynamic to prevent Node modules from leaking into browser bundle
  const { getDb } = await import('~/server/db/client')
  const { messages, sessions, projects } = await import('~/server/db/schema')
  const { sql, eq, and, gte, desc } = await import('drizzle-orm')
  const { buildReport } = await import('~/server/pdf/report-builder')
  const { getModelPricing, getModelFamily } = await import('~/lib/pricing')
  const { buildSidechainFilter } = await import('~/server/db/query-filters')

  const db = getDb()
  const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null
  const timeFilter = cutoff ? gte(messages.timestamp, cutoff) : sql`1=1`
  const sidechainFilter = buildSidechainFilter()
  const sessionTimeFilter = cutoff ? gte(sessions.startedAt, cutoff) : sql`1=1`

  // Overview KPIs
  const kpi = db.select({
    totalInputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
    totalCacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    totalCacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
    totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
    messageCount: sql<number>`count(*)`,
  }).from(messages).where(and(timeFilter, sidechainFilter)).get()!

  const activeProjects = db.select({ count: sql<number>`count(distinct ${sessions.projectId})` })
    .from(sessions).innerJoin(messages, eq(messages.sessionId, sessions.id))
    .where(and(timeFilter, sidechainFilter)).get()

  const activeSessions = db.select({ count: sql<number>`count(distinct ${messages.sessionId})` })
    .from(messages).where(and(timeFilter, sidechainFilter)).get()

  const totalTokens = kpi.totalInputTokens + kpi.totalOutputTokens + kpi.totalCacheCreationTokens + kpi.totalCacheReadTokens
  const totalWithCache = kpi.totalInputTokens + kpi.totalCacheReadTokens + kpi.totalCacheCreationTokens
  const cacheHitRate = totalWithCache > 0 ? kpi.totalCacheReadTokens / totalWithCache : 0

  // Model stats
  const modelStats = db.select({
    model: messages.model,
    totalInputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
    totalCacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    totalCacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
    totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
    messageCount: sql<number>`count(*)`,
    sessionCount: sql<number>`count(distinct ${messages.sessionId})`,
  }).from(messages).where(and(timeFilter, sidechainFilter)).groupBy(messages.model).all()

  // Cache stats per model
  const modelCacheStats = modelStats.map((s) => {
    const pricing = getModelPricing(s.model)
    const total = s.totalInputTokens + s.totalCacheReadTokens + s.totalCacheCreationTokens
    const hitRate = total > 0 ? s.totalCacheReadTokens / total : 0
    const savings = s.totalCacheReadTokens * (pricing.input - pricing.cacheRead) / 1_000_000
    const overhead = s.totalCacheCreationTokens * (pricing.cacheWrite1h - pricing.input) / 1_000_000
    return {
      model: s.model, modelFamily: getModelFamily(s.model), hitRate, savings, overhead,
      netSavings: savings - overhead, totalCost: s.totalCost,
      roi: s.totalCost > 0 ? (savings - overhead) / s.totalCost : 0,
      cacheReadTokens: s.totalCacheReadTokens, cacheCreationTokens: s.totalCacheCreationTokens,
      ephemeral5mTokens: 0, ephemeral1hTokens: 0,
    }
  })

  const overallSavings = modelCacheStats.reduce((a, s) => a + s.savings, 0)
  const overallOverhead = modelCacheStats.reduce((a, s) => a + s.overhead, 0)

  // Cache per project
  const projectCache = db.select({
    projectId: sessions.projectId, projectName: projects.displayName,
    cacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
    cacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    inputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
    totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
  }).from(messages)
    .innerJoin(sessions, eq(messages.sessionId, sessions.id))
    .innerJoin(projects, eq(sessions.projectId, projects.id))
    .where(and(timeFilter, sidechainFilter))
    .groupBy(sessions.projectId)
    .orderBy(desc(sql`sum(${messages.cacheReadTokens})`))
    .all()
    .map((p) => {
      const t = p.inputTokens + p.cacheReadTokens + p.cacheCreationTokens
      return { ...p, hitRate: t > 0 ? p.cacheReadTokens / t : 0 }
    })

  // Projects list
  const projectList = db.select({
    displayName: projects.displayName,
    sessionCount: sql<number>`count(distinct ${sessions.id})`,
    messageCount: sql<number>`coalesce(sum(${sessions.messageCount}), 0)`,
    totalInputTokens: sql<number>`coalesce(sum(${sessions.totalInputTokens}), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(${sessions.totalOutputTokens}), 0)`,
    totalCost: sql<number>`coalesce(sum(${sessions.totalCost}), 0)`,
    lastActiveAt: projects.lastActiveAt,
  }).from(projects)
    .leftJoin(sessions, sql`${sessions.projectId} = ${projects.id}`)
    .groupBy(projects.id)
    .orderBy(desc(sql`sum(${sessions.totalCost})`))
    .all()

  // Recent sessions
  const recentSessions = db.select({
    id: sessions.id, title: sessions.title, slug: sessions.slug,
    projectName: projects.displayName, projectId: sessions.projectId,
    startedAt: sessions.startedAt, totalCost: sessions.totalCost,
    messageCount: sessions.messageCount, entrypoint: sessions.entrypoint,
  }).from(sessions)
    .innerJoin(projects, eq(sessions.projectId, projects.id))
    .where(sessionTimeFilter)
    .orderBy(desc(sessions.startedAt))
    .limit(10).all()

  const period = days ? `Last ${days} days` : 'All time'

  const pdfBuffer = await buildReport({
    accountName,
    period,
    overview: {
      kpi: {
        totalTokens, totalInputTokens: kpi.totalInputTokens, totalOutputTokens: kpi.totalOutputTokens,
        totalCacheCreationTokens: kpi.totalCacheCreationTokens, totalCacheReadTokens: kpi.totalCacheReadTokens,
        totalCost: kpi.totalCost, messageCount: kpi.messageCount,
        activeProjects: activeProjects?.count ?? 0, activeSessions: activeSessions?.count ?? 0,
        cacheHitRate,
      },
      dailyCost: [], topProjects: [], recentSessions, days,
    },
    modelStats: { modelStats, dailyByModel: [], days },
    cacheStats: {
      overall: {
        hitRate: cacheHitRate, savings: overallSavings, overhead: overallOverhead,
        netSavings: overallSavings - overallOverhead, totalCost: kpi.totalCost,
        roi: kpi.totalCost > 0 ? (overallSavings - overallOverhead) / kpi.totalCost : 0,
      },
      modelCacheStats, dailyCacheTrend: [], projectCache, days,
    },
    projects: projectList,
  })

  return {
    base64: pdfBuffer.toString('base64'),
    filename: `claude-usage-report-${days ?? 'all'}-${new Date().toISOString().slice(0, 10)}.pdf`,
  }
}
