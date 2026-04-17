import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/server/db/client'
import { messages } from '~/server/db/schema'
import { sql, eq, and, gte, lt } from 'drizzle-orm'
import { buildSidechainFilter } from '~/server/db/query-filters'
import { readNumberSetting } from '~/server/db/app-settings'
import { resolveBillingPeriod } from './get-budget-status'

export const getForecast = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const now = new Date()
  const cycleStartDay = Math.min(
    Math.max(1, readNumberSetting('billingCycleStartDay', 1)),
    28,
  )
  const period = resolveBillingPeriod(now, cycleStartDay)
  const periodStart = new Date(period.startIso)
  const periodEnd = new Date(period.endIso)

  const firstOfMonth = period.startIso
  const firstOfNextMonth = period.endIso
  const prevPeriod = resolveBillingPeriod(
    new Date(periodStart.getTime() - 24 * 60 * 60 * 1000),
    cycleStartDay,
  )
  const firstOfPrevMonth = prevPeriod.startIso

  const totalDaysInMonth = Math.max(1, period.totalDays)
  const todayDate = Math.min(totalDaysInMonth, period.daysElapsed)

  const sidechainFilter = buildSidechainFilter()

  // Current month daily costs — group by local calendar date so it aligns
  // with the user's notion of "today" and the month boundary computed above.
  const dailyCosts = db.select({
    date: sql<string>`date(${messages.timestamp}, 'localtime')`.as('date'),
    cost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
  })
    .from(messages)
    .where(and(gte(messages.timestamp, firstOfMonth), lt(messages.timestamp, firstOfNextMonth), sidechainFilter))
    .groupBy(sql`date(${messages.timestamp}, 'localtime')`)
    .orderBy(sql`date(${messages.timestamp}, 'localtime')`)
    .all()

  // Previous month total
  const prevMonth = db.select({
    total: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
  })
    .from(messages)
    .where(and(gte(messages.timestamp, firstOfPrevMonth), lt(messages.timestamp, firstOfMonth), sidechainFilter))
    .get()

  const previousMonthTotal = prevMonth?.total ?? 0
  const monthSpendSoFar = dailyCosts.reduce((sum, d) => sum + d.cost, 0)
  // daysElapsed reflects the calendar position, not the number of days with
  // activity — a user who used Claude 3 days out of 10 still has 10 days elapsed.
  const daysElapsed = Math.max(1, todayDate)
  const daysRemaining = Math.max(0, totalDaysInMonth - todayDate)
  const dailyAverage = monthSpendSoFar / daysElapsed
  const projectedTotal = monthSpendSoFar + dailyAverage * daysRemaining

  // Burn rate trend: compare last 7 days avg vs first 7 days avg
  let burnRateTrend: 'increasing' | 'decreasing' | 'stable' = 'stable'
  if (dailyCosts.length >= 7) {
    const first7 = dailyCosts.slice(0, 7)
    const last7 = dailyCosts.slice(-7)
    const first7Avg = first7.reduce((s, d) => s + d.cost, 0) / first7.length
    const last7Avg = last7.reduce((s, d) => s + d.cost, 0) / last7.length
    const diff = (last7Avg - first7Avg) / (first7Avg || 1)
    if (diff > 0.1) burnRateTrend = 'increasing'
    else if (diff < -0.1) burnRateTrend = 'decreasing'
  }

  // Build chart data with projections
  const chartData: Array<{ date: string; cost: number; isProjected: boolean }> = []

  for (const d of dailyCosts) {
    chartData.push({ date: d.date, cost: d.cost, isProjected: false })
  }

  // Fill remaining days with projections. Format in local timezone to match
  // the localtime-grouped SQL dates above.
  for (let i = 1; i <= daysRemaining; i++) {
    const futureDate = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + todayDate + i - 1)
    const dateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`
    chartData.push({ date: dateStr, cost: dailyAverage, isProjected: true })
  }

  const monthLabel =
    cycleStartDay === 1
      ? periodStart.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      : `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(periodEnd.getTime() - 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  return {
    monthLabel,
    cycleStartDay,
    monthSpendSoFar,
    projectedTotal,
    dailyAverage,
    daysElapsed,
    daysRemaining,
    previousMonthTotal,
    burnRateTrend,
    chartData,
  }
})
