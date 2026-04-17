import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import { messages, sessions, projects } from '~/server/db/schema'
import { buildSidechainFilter } from '~/server/db/query-filters'
import { getModelContextWindow } from '~/lib/pricing'

export interface UtilizationBucket {
  label: string
  min: number
  max: number
  count: number
}

export interface NearLimitSession {
  id: string
  title: string | null
  slug: string | null
  projectId: string
  projectName: string
  model: string
  maxUtilization: number
  peakTokens: number
  contextWindow: number
  startedAt: string | null
}

export interface ContextUtilizationResult {
  days: number | null
  totalMessages: number
  buckets: UtilizationBucket[]
  dailyAverage: Array<{ date: string; avgUtilization: number; maxUtilization: number }>
  nearLimit: NearLimitSession[]
  meanUtilization: number
  p95Utilization: number
}

export const getContextUtilizationAll = createServerFn({ method: 'GET' })
  .handler(async () => queryUtilization(null))

export const getContextUtilization30d = createServerFn({ method: 'GET' })
  .handler(async () => queryUtilization(30))

export const getContextUtilization90d = createServerFn({ method: 'GET' })
  .handler(async () => queryUtilization(90))

const BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: '0–10%', min: 0, max: 0.1 },
  { label: '10–25%', min: 0.1, max: 0.25 },
  { label: '25–50%', min: 0.25, max: 0.5 },
  { label: '50–75%', min: 0.5, max: 0.75 },
  { label: '75–90%', min: 0.75, max: 0.9 },
  { label: '90–100%', min: 0.9, max: 1.0 },
  { label: '>100%', min: 1.0, max: Infinity },
]

/**
 * Context utilization is approximated as the "input side" of each
 * assistant turn (input + cached tokens + cache creation) divided by
 * the model's known context window. It's an estimate — output tokens
 * count toward the window too but aren't known ahead of time, and
 * cache writes don't literally stay "in" the window — but it's a
 * reasonable proxy for "how full was the turn".
 */
function queryUtilization(days: number | null): ContextUtilizationResult {
  const db = getDb()
  const cutoff = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : null
  const timeFilter = cutoff ? gte(messages.timestamp, cutoff) : sql`1=1`
  const sidechainFilter = buildSidechainFilter()

  // Pull model + input-side tokens per message. We do the utilization math
  // in JS because the context-window values live in TypeScript, not the DB.
  const rows = db
    .select({
      model: messages.model,
      timestamp: messages.timestamp,
      sessionId: messages.sessionId,
      totalIn: sql<number>`${messages.inputTokens} + ${messages.cacheReadTokens} + ${messages.cacheCreationTokens}`,
    })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .all()

  const bucketCounts = BUCKETS.map((b) => ({ ...b, count: 0 }))
  const perSessionPeak = new Map<string, { model: string; peakTokens: number; util: number }>()
  const perDay = new Map<string, { sum: number; count: number; max: number }>()

  let totalUtil = 0
  const utils: number[] = []

  for (const r of rows) {
    const window = getModelContextWindow(r.model)
    const util = window > 0 ? r.totalIn / window : 0
    totalUtil += util
    utils.push(util)

    for (const b of bucketCounts) {
      if (util >= b.min && util < b.max) {
        b.count += 1
        break
      }
    }

    const peak = perSessionPeak.get(r.sessionId)
    if (!peak || util > peak.util) {
      perSessionPeak.set(r.sessionId, { model: r.model, peakTokens: r.totalIn, util })
    }

    const day = r.timestamp.slice(0, 10)
    const agg = perDay.get(day) ?? { sum: 0, count: 0, max: 0 }
    agg.sum += util
    agg.count += 1
    if (util > agg.max) agg.max = util
    perDay.set(day, agg)
  }

  const dailyAverage = Array.from(perDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, agg]) => ({
      date,
      avgUtilization: agg.count > 0 ? agg.sum / agg.count : 0,
      maxUtilization: agg.max,
    }))

  const nearLimitIds = [...perSessionPeak.entries()]
    .filter(([, v]) => v.util >= 0.75)
    .sort(([, a], [, b]) => b.util - a.util)
    .slice(0, 25)
    .map(([sid, v]) => ({ sid, ...v }))

  let nearLimit: NearLimitSession[] = []
  if (nearLimitIds.length > 0) {
    const sessionRows = db
      .select({
        id: sessions.id,
        title: sessions.title,
        slug: sessions.slug,
        projectId: sessions.projectId,
        projectName: projects.displayName,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .innerJoin(projects, eq(sessions.projectId, projects.id))
      .where(
        sql`${sessions.id} in (${sql.join(
          nearLimitIds.map((r) => sql`${r.sid}`),
          sql`, `,
        )})`,
      )
      .orderBy(desc(sessions.startedAt))
      .all()

    const byId = new Map(sessionRows.map((s) => [s.id, s]))
    nearLimit = nearLimitIds
      .map((v) => {
        const s = byId.get(v.sid)
        if (!s) return null
        return {
          id: s.id,
          title: s.title,
          slug: s.slug,
          projectId: s.projectId,
          projectName: s.projectName,
          model: v.model,
          maxUtilization: v.util,
          peakTokens: v.peakTokens,
          contextWindow: getModelContextWindow(v.model),
          startedAt: s.startedAt,
        }
      })
      .filter((r): r is NearLimitSession => r !== null)
  }

  const totalMessages = rows.length
  const meanUtilization = totalMessages > 0 ? totalUtil / totalMessages : 0
  utils.sort((a, b) => a - b)
  const p95Utilization =
    utils.length > 0 ? utils[Math.min(utils.length - 1, Math.floor(utils.length * 0.95))] : 0

  return {
    days,
    totalMessages,
    buckets: bucketCounts.map((b) => ({
      label: b.label,
      min: b.min,
      max: b.max === Infinity ? 10 : b.max,
      count: b.count,
    })),
    dailyAverage,
    nearLimit,
    meanUtilization,
    p95Utilization,
  }
}
