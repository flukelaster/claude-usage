import { createServerFn } from '@tanstack/react-start'
import { and, gte, sql } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import { messages } from '~/server/db/schema'
import { buildSidechainFilter } from '~/server/db/query-filters'

export interface CalendarDay {
  date: string          // YYYY-MM-DD, local time
  messageCount: number
  totalCost: number
  totalTokens: number
}

export interface CalendarYear {
  year: number
  days: CalendarDay[]
  totalCost: number
  totalMessages: number
  activeDays: number
  maxDailyCost: number
  longestStreak: number
  currentStreak: number
}

/**
 * Returns per-day activity for a whole calendar year, ready to render
 * as a GitHub-style heatmap. `days` is length 365/366 with zero-filled
 * dates, so the UI can assume a dense series.
 */
export const getCalendarYear = createServerFn({ method: 'POST' })
  .inputValidator((data: { year?: number }) => data)
  .handler(async ({ data }): Promise<CalendarYear> => {
    const db = getDb()
    const year = data.year ?? new Date().getFullYear()
    const from = new Date(year, 0, 1)
    const to = new Date(year + 1, 0, 1)
    const sidechainFilter = buildSidechainFilter()

    const rows = db
      .select({
        date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
        messageCount: sql<number>`count(*)`,
        totalCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
        totalTokens: sql<number>`coalesce(sum(
          ${messages.inputTokens} + ${messages.outputTokens} +
          ${messages.cacheCreationTokens} + ${messages.cacheReadTokens}
        ), 0)`,
      })
      .from(messages)
      .where(
        and(
          gte(messages.timestamp, from.toISOString()),
          sql`${messages.timestamp} < ${to.toISOString()}`,
          sidechainFilter,
        ),
      )
      .groupBy(sql`date(${messages.timestamp}, 'localtime')`)
      .all()

    const byDate = new Map(rows.map((r) => [r.date, r]))

    // Build a dense day-by-day series.
    const days: CalendarDay[] = []
    const totalDays = isLeapYear(year) ? 366 : 365
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(year, 0, i + 1)
      const key = formatLocalDate(d)
      const found = byDate.get(key)
      days.push({
        date: key,
        messageCount: found?.messageCount ?? 0,
        totalCost: found?.totalCost ?? 0,
        totalTokens: found?.totalTokens ?? 0,
      })
    }

    const totalCost = days.reduce((s, d) => s + d.totalCost, 0)
    const totalMessages = days.reduce((s, d) => s + d.messageCount, 0)
    const activeDays = days.filter((d) => d.messageCount > 0).length
    const maxDailyCost = days.reduce((m, d) => Math.max(m, d.totalCost), 0)

    // Streaks: count runs of active days. `currentStreak` ends at today
    // if that day is active, else at the most recent active day before
    // today if the user hasn't logged anything yet today.
    let longestStreak = 0
    let running = 0
    const todayKey = formatLocalDate(new Date())
    let currentStreak = 0
    for (const d of days) {
      if (d.messageCount > 0) {
        running += 1
        if (running > longestStreak) longestStreak = running
      } else {
        running = 0
      }
    }
    // Compute currentStreak walking backward from today through the year.
    const todayIdx = days.findIndex((d) => d.date === todayKey)
    const startBackIdx = todayIdx === -1 ? days.length - 1 : todayIdx
    for (let i = startBackIdx; i >= 0; i--) {
      if (days[i].messageCount > 0) currentStreak += 1
      else break
    }

    return {
      year,
      days,
      totalCost,
      totalMessages,
      activeDays,
      maxDailyCost,
      longestStreak,
      currentStreak,
    }
  })

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
