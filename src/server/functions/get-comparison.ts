import { createServerFn } from '@tanstack/react-start'
import { and, gte, lt, sql } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import { messages } from '~/server/db/schema'
import { buildSidechainFilter } from '~/server/db/query-filters'

interface WindowTotals {
  start: string
  end: string
  totalCost: number
  messageCount: number
  sessionCount: number
  totalTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  inputTokens: number
  outputTokens: number
}

export interface ComparisonResult {
  windowDays: number
  current: WindowTotals
  previous: WindowTotals
  deltas: {
    totalCost: number
    messageCount: number
    sessionCount: number
    totalTokens: number
  }
  percentDeltas: {
    totalCost: number
    messageCount: number
    sessionCount: number
    totalTokens: number
  }
  dailyPairs: Array<{ offset: number; current: number; previous: number }>
}

export const getComparison = createServerFn({ method: 'POST' })
  .inputValidator((data: { windowDays: number }) => data)
  .handler(async ({ data }): Promise<ComparisonResult> => {
    const db = getDb()
    const windowDays = Math.max(1, Math.min(365, Math.round(data.windowDays || 30)))
    const sidechainFilter = buildSidechainFilter()

    const now = new Date()
    const currentEnd = now
    const currentStart = new Date(now.getTime() - windowDays * 86_400_000)
    const previousEnd = currentStart
    const previousStart = new Date(currentStart.getTime() - windowDays * 86_400_000)

    function aggregate(from: Date, to: Date): WindowTotals {
      const fromIso = from.toISOString()
      const toIso = to.toISOString()
      const range = and(
        gte(messages.timestamp, fromIso),
        lt(messages.timestamp, toIso),
        sidechainFilter,
      )

      const agg = db
        .select({
          totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
          messageCount: sql<number>`count(*)`,
          inputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
          outputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
          cacheCreation: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
          cacheRead: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
        })
        .from(messages)
        .where(range)
        .get()

      const sessionsCount = db
        .select({ c: sql<number>`count(distinct ${messages.sessionId})` })
        .from(messages)
        .where(range)
        .get()

      const input = agg?.inputTokens ?? 0
      const output = agg?.outputTokens ?? 0
      const cacheC = agg?.cacheCreation ?? 0
      const cacheR = agg?.cacheRead ?? 0

      return {
        start: fromIso,
        end: toIso,
        totalCost: agg?.totalCost ?? 0,
        messageCount: agg?.messageCount ?? 0,
        sessionCount: sessionsCount?.c ?? 0,
        totalTokens: input + output + cacheC + cacheR,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheR,
        cacheCreationTokens: cacheC,
      }
    }

    const current = aggregate(currentStart, currentEnd)
    const previous = aggregate(previousStart, previousEnd)

    // Daily pairs: align day N of previous window with day N of current.
    const currentDaily = db
      .select({
        date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
        cost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
      })
      .from(messages)
      .where(
        and(
          gte(messages.timestamp, currentStart.toISOString()),
          lt(messages.timestamp, currentEnd.toISOString()),
          sidechainFilter,
        ),
      )
      .groupBy(sql`date(${messages.timestamp}, 'localtime')`)
      .all()
    const previousDaily = db
      .select({
        date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
        cost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
      })
      .from(messages)
      .where(
        and(
          gte(messages.timestamp, previousStart.toISOString()),
          lt(messages.timestamp, previousEnd.toISOString()),
          sidechainFilter,
        ),
      )
      .groupBy(sql`date(${messages.timestamp}, 'localtime')`)
      .all()

    const curMap = new Map(currentDaily.map((d) => [d.date, d.cost]))
    const prevMap = new Map(previousDaily.map((d) => [d.date, d.cost]))

    const dailyPairs: ComparisonResult['dailyPairs'] = []
    for (let i = 0; i < windowDays; i++) {
      const curDate = new Date(currentStart.getTime() + i * 86_400_000)
      const prevDate = new Date(previousStart.getTime() + i * 86_400_000)
      const curKey = formatLocalDate(curDate)
      const prevKey = formatLocalDate(prevDate)
      dailyPairs.push({
        offset: i + 1,
        current: curMap.get(curKey) ?? 0,
        previous: prevMap.get(prevKey) ?? 0,
      })
    }

    const deltas = {
      totalCost: current.totalCost - previous.totalCost,
      messageCount: current.messageCount - previous.messageCount,
      sessionCount: current.sessionCount - previous.sessionCount,
      totalTokens: current.totalTokens - previous.totalTokens,
    }

    function pct(cur: number, prev: number): number {
      if (prev === 0) return cur === 0 ? 0 : 100
      return ((cur - prev) / prev) * 100
    }

    return {
      windowDays,
      current,
      previous,
      deltas,
      percentDeltas: {
        totalCost: pct(current.totalCost, previous.totalCost),
        messageCount: pct(current.messageCount, previous.messageCount),
        sessionCount: pct(current.sessionCount, previous.sessionCount),
        totalTokens: pct(current.totalTokens, previous.totalTokens),
      },
      dailyPairs,
    }
  })

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
