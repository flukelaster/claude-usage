import { createServerFn } from '@tanstack/react-start'
import { desc, eq, sql } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import { sessions, projects } from '~/server/db/schema'

export interface AnomalySession {
  id: string
  title: string | null
  slug: string | null
  projectId: string
  projectName: string
  startedAt: string | null
  messageCount: number
  totalCost: number
  zScore: number
  costVsMean: number
}

export interface AnomalyResult {
  sessions: AnomalySession[]
  mean: number
  stdev: number
  thresholdCost: number
  totalConsidered: number
}

const Z_THRESHOLD = 2

/**
 * Return sessions whose total cost is at least `Z_THRESHOLD` standard
 * deviations above the mean. SQLite has no native stddev, so we compute
 * it in JS. Sessions with zero cost are excluded so one big outlier
 * doesn't drown out the stats.
 */
export const getAnomalies = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AnomalyResult> => {
    const db = getDb()

    const rows = db
      .select({
        id: sessions.id,
        title: sessions.title,
        slug: sessions.slug,
        projectId: sessions.projectId,
        projectName: projects.displayName,
        startedAt: sessions.startedAt,
        messageCount: sessions.messageCount,
        totalCost: sessions.totalCost,
      })
      .from(sessions)
      .innerJoin(projects, eq(sessions.projectId, projects.id))
      .where(sql`coalesce(${sessions.totalCost}, 0) > 0`)
      .all()

    if (rows.length === 0) {
      return { sessions: [], mean: 0, stdev: 0, thresholdCost: 0, totalConsidered: 0 }
    }

    const costs = rows.map((r) => r.totalCost ?? 0)
    const mean = costs.reduce((s, c) => s + c, 0) / costs.length
    const variance =
      costs.reduce((s, c) => s + (c - mean) ** 2, 0) / costs.length
    const stdev = Math.sqrt(variance)
    const threshold = mean + stdev * Z_THRESHOLD

    const flagged = rows
      .filter((r) => (r.totalCost ?? 0) > threshold && stdev > 0)
      .map((r) => {
        const cost = r.totalCost ?? 0
        return {
          id: r.id,
          title: r.title,
          slug: r.slug,
          projectId: r.projectId,
          projectName: r.projectName,
          startedAt: r.startedAt,
          messageCount: r.messageCount ?? 0,
          totalCost: cost,
          zScore: stdev > 0 ? (cost - mean) / stdev : 0,
          costVsMean: mean > 0 ? cost / mean : 0,
        }
      })
      .sort((a, b) => b.totalCost - a.totalCost)

    return {
      sessions: flagged,
      mean,
      stdev,
      thresholdCost: threshold,
      totalConsidered: rows.length,
    }
  },
)
