import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/server/db/client'
import { messages, sessions } from '~/server/db/schema'
import { sql, eq, and, gte } from 'drizzle-orm'

export const getActivityAll = createServerFn({ method: 'GET' })
  .handler(async () => queryActivity(null))

export const getActivity30d = createServerFn({ method: 'GET' })
  .handler(async () => queryActivity(30))

export const getActivity90d = createServerFn({ method: 'GET' })
  .handler(async () => queryActivity(90))

function queryActivity(days: number | null) {
  const db = getDb()
  const cutoff = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : null
  const timeFilter = cutoff ? gte(messages.timestamp, cutoff) : sql`1=1`
  const sessionTimeFilter = cutoff ? gte(sessions.startedAt, cutoff) : sql`1=1`
  const sidechainFilter = eq(messages.isSidechain, false)

  // Heatmap: day of week × hour
  const heatmapData = db.select({
    dayOfWeek: sql<number>`cast(strftime('%w', ${messages.timestamp}, 'localtime') as integer)`,
    hour: sql<number>`cast(strftime('%H', ${messages.timestamp}, 'localtime') as integer)`,
    messageCount: sql<number>`count(*)`,
    cost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .groupBy(sql`strftime('%w', ${messages.timestamp}, 'localtime')`, sql`strftime('%H', ${messages.timestamp}, 'localtime')`)
    .all()

  // Busiest hour
  const busiestHourRow = db.select({
    hour: sql<number>`cast(strftime('%H', ${messages.timestamp}, 'localtime') as integer)`,
    count: sql<number>`count(*)`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .groupBy(sql`strftime('%H', ${messages.timestamp}, 'localtime')`)
    .orderBy(sql`count(*) desc`)
    .limit(1)
    .get()

  // Busiest day of week
  const busiestDayRow = db.select({
    dayOfWeek: sql<number>`cast(strftime('%w', ${messages.timestamp}, 'localtime') as integer)`,
    count: sql<number>`count(*)`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .groupBy(sql`strftime('%w', ${messages.timestamp}, 'localtime')`)
    .orderBy(sql`count(*) desc`)
    .limit(1)
    .get()

  // Average session duration
  const avgDuration = db.select({
    avgMs: sql<number>`avg((julianday(${sessions.endedAt}) - julianday(${sessions.startedAt})) * 86400000)`,
  })
    .from(sessions)
    .where(and(sessionTimeFilter, sql`${sessions.endedAt} is not null`))
    .get()

  const totalMessages = heatmapData.reduce((s, d) => s + d.messageCount, 0)

  return {
    heatmapData,
    busiestHour: busiestHourRow?.hour ?? 0,
    busiestDay: busiestDayRow?.dayOfWeek ?? 0,
    avgSessionDurationMs: avgDuration?.avgMs ?? 0,
    totalMessages,
    days,
  }
}
