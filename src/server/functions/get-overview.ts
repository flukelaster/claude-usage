import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/server/db/client'
import { messages, sessions, projects } from '~/server/db/schema'
import { sql, eq, and, gte, desc } from 'drizzle-orm'

export const getOverviewAll = createServerFn({ method: 'GET' })
  .handler(async () => queryOverview(null))

export const getOverview30d = createServerFn({ method: 'GET' })
  .handler(async () => queryOverview(30))

export const getOverview90d = createServerFn({ method: 'GET' })
  .handler(async () => queryOverview(90))

function queryOverview(days: number | null) {
  const db = getDb()
  const sidechainFilter = eq(messages.isSidechain, false)

  // null = all time, otherwise last N days
  const cutoff = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : null

  const timeFilter = cutoff ? gte(messages.timestamp, cutoff) : sql`1=1`
  const sessionTimeFilter = cutoff ? gte(sessions.startedAt, cutoff) : sql`1=1`

  const kpi = db.select({
    totalInputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
    totalCacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    totalCacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
    totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
    messageCount: sql<number>`count(*)`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .get()

  const activeProjects = db.select({
    count: sql<number>`count(distinct ${sessions.projectId})`,
  })
    .from(sessions)
    .innerJoin(messages, eq(messages.sessionId, sessions.id))
    .where(and(timeFilter, sidechainFilter))
    .get()

  const activeSessions = db.select({
    count: sql<number>`count(distinct ${messages.sessionId})`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .get()

  const totalInput = (kpi?.totalInputTokens ?? 0) + (kpi?.totalCacheReadTokens ?? 0) + (kpi?.totalCacheCreationTokens ?? 0)
  const cacheHitRate = totalInput > 0 ? (kpi?.totalCacheReadTokens ?? 0) / totalInput : 0

  const dailyCost = db.select({
    date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
    cost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
    inputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
    outputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
    cacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    cacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .groupBy(sql`date(${messages.timestamp}, 'localtime')`)
    .orderBy(sql`date(${messages.timestamp}, 'localtime')`)
    .all()

  const topProjects = db.select({
    projectId: sessions.projectId,
    displayName: projects.displayName,
    totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
    totalTokens: sql<number>`coalesce(sum(${messages.inputTokens} + ${messages.outputTokens} + ${messages.cacheCreationTokens} + ${messages.cacheReadTokens}), 0)`,
  })
    .from(messages)
    .innerJoin(sessions, eq(messages.sessionId, sessions.id))
    .innerJoin(projects, eq(sessions.projectId, projects.id))
    .where(and(timeFilter, sidechainFilter))
    .groupBy(sessions.projectId)
    .orderBy(desc(sql`sum(${messages.estimatedCostUsd})`))
    .limit(5)
    .all()

  const recentSessions = db.select({
    id: sessions.id,
    title: sessions.title,
    slug: sessions.slug,
    projectName: projects.displayName,
    projectId: sessions.projectId,
    startedAt: sessions.startedAt,
    totalCost: sessions.totalCost,
    messageCount: sessions.messageCount,
    entrypoint: sessions.entrypoint,
  })
    .from(sessions)
    .innerJoin(projects, eq(sessions.projectId, projects.id))
    .where(sessionTimeFilter)
    .orderBy(desc(sessions.startedAt))
    .limit(10)
    .all()

  return {
    kpi: {
      totalTokens: (kpi?.totalInputTokens ?? 0) + (kpi?.totalOutputTokens ?? 0) + (kpi?.totalCacheCreationTokens ?? 0) + (kpi?.totalCacheReadTokens ?? 0),
      totalInputTokens: kpi?.totalInputTokens ?? 0,
      totalOutputTokens: kpi?.totalOutputTokens ?? 0,
      totalCacheCreationTokens: kpi?.totalCacheCreationTokens ?? 0,
      totalCacheReadTokens: kpi?.totalCacheReadTokens ?? 0,
      totalCost: kpi?.totalCost ?? 0,
      messageCount: kpi?.messageCount ?? 0,
      activeProjects: activeProjects?.count ?? 0,
      activeSessions: activeSessions?.count ?? 0,
      cacheHitRate,
    },
    dailyCost,
    topProjects,
    recentSessions,
    days,
  }
}
