import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/server/db/client'
import { projects, sessions, messages } from '~/server/db/schema'
import { sql, eq, desc } from 'drizzle-orm'

export const getProjects = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()

  const result = db.select({
    id: projects.id,
    displayName: projects.displayName,
    cwd: projects.cwd,
    firstSeenAt: projects.firstSeenAt,
    lastActiveAt: projects.lastActiveAt,
    sessionCount: sql<number>`count(distinct ${sessions.id})`,
    messageCount: sql<number>`coalesce(sum(${sessions.messageCount}), 0)`,
    totalInputTokens: sql<number>`coalesce(sum(${sessions.totalInputTokens}), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(${sessions.totalOutputTokens}), 0)`,
    totalCacheCreationTokens: sql<number>`coalesce(sum(${sessions.totalCacheCreationTokens}), 0)`,
    totalCacheReadTokens: sql<number>`coalesce(sum(${sessions.totalCacheReadTokens}), 0)`,
    totalCost: sql<number>`coalesce(sum(${sessions.totalCost}), 0)`,
  })
    .from(projects)
    .leftJoin(sessions, eq(sessions.projectId, projects.id))
    .groupBy(projects.id)
    .orderBy(desc(sql`sum(${sessions.totalCost})`))
    .all()

  return result
})

export const getProjectDetail = createServerFn({ method: 'GET' })
  .inputValidator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const input = data ?? {} as any
    const db = getDb()

    const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get()
    if (!project) return null

    // Sessions for this project
    const projectSessions = db.select({
      id: sessions.id,
      title: sessions.title,
      slug: sessions.slug,
      entrypoint: sessions.entrypoint,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      messageCount: sessions.messageCount,
      totalInputTokens: sessions.totalInputTokens,
      totalOutputTokens: sessions.totalOutputTokens,
      totalCost: sessions.totalCost,
    })
      .from(sessions)
      .where(eq(sessions.projectId, input.projectId))
      .orderBy(desc(sessions.startedAt))
      .all()

    // Model breakdown
    const modelBreakdown = db.select({
      model: messages.model,
      totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${messages.inputTokens} + ${messages.outputTokens} + ${messages.cacheCreationTokens} + ${messages.cacheReadTokens}), 0)`,
      messageCount: sql<number>`count(*)`,
    })
      .from(messages)
      .innerJoin(sessions, eq(messages.sessionId, sessions.id))
      .where(eq(sessions.projectId, input.projectId))
      .groupBy(messages.model)
      .all()

    // Daily cost trend for this project
    const dailyCost = db.select({
      date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
      cost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
    })
      .from(messages)
      .innerJoin(sessions, eq(messages.sessionId, sessions.id))
      .where(eq(sessions.projectId, input.projectId))
      .groupBy(sql`date(${messages.timestamp}, 'localtime')`)
      .orderBy(sql`date(${messages.timestamp}, 'localtime')`)
      .all()

    return { project, sessions: projectSessions, modelBreakdown, dailyCost }
  })
