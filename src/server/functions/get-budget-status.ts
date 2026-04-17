import { createServerFn } from '@tanstack/react-start'
import { and, gte, lt, sql } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import { messages } from '~/server/db/schema'
import { buildSidechainFilter } from '~/server/db/query-filters'
import {
  readNumberSetting,
  readSettingRaw,
} from '~/server/db/app-settings'

export interface BudgetStatus {
  budgetUsd: number | null
  cycleStartDay: number
  periodStart: string
  periodEnd: string
  spentUsd: number
  projectedUsd: number
  remainingUsd: number | null
  percentUsed: number | null
  daysElapsed: number
  daysRemaining: number
  status: 'ok' | 'warning' | 'exceeded' | 'untracked'
}

export const getBudgetStatus = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BudgetStatus> => {
    const db = getDb()

    const cycleStartDay = Math.min(
      Math.max(1, readNumberSetting('billingCycleStartDay', 1)),
      28,
    )
    const budgetRaw = readSettingRaw('monthlyBudgetUsd')
    const budgetUsd =
      budgetRaw !== null && Number.isFinite(Number(budgetRaw))
        ? Number(budgetRaw)
        : null

    const now = new Date()
    const period = resolveBillingPeriod(now, cycleStartDay)

    const sidechainFilter = buildSidechainFilter()
    const row = db
      .select({
        spent: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
      })
      .from(messages)
      .where(
        and(
          gte(messages.timestamp, period.startIso),
          lt(messages.timestamp, period.endIso),
          sidechainFilter,
        ),
      )
      .get()

    const spent = row?.spent ?? 0
    const totalDays = Math.max(1, period.totalDays)
    const daysElapsed = Math.min(totalDays, Math.max(1, period.daysElapsed))
    const daysRemaining = Math.max(0, totalDays - daysElapsed)
    const dailyAverage = spent / daysElapsed
    const projected = spent + dailyAverage * daysRemaining

    let status: BudgetStatus['status'] = 'untracked'
    let percentUsed: number | null = null
    let remaining: number | null = null
    if (budgetUsd !== null && budgetUsd > 0) {
      percentUsed = spent / budgetUsd
      remaining = budgetUsd - spent
      if (percentUsed >= 1) status = 'exceeded'
      else if (percentUsed >= 0.8 || projected > budgetUsd) status = 'warning'
      else status = 'ok'
    }

    return {
      budgetUsd,
      cycleStartDay,
      periodStart: period.startIso,
      periodEnd: period.endIso,
      spentUsd: spent,
      projectedUsd: projected,
      remainingUsd: remaining,
      percentUsed,
      daysElapsed,
      daysRemaining,
      status,
    }
  },
)

export function resolveBillingPeriod(now: Date, cycleStartDay: number) {
  const day = now.getDate()
  let startYear = now.getFullYear()
  let startMonth = now.getMonth()

  if (day < cycleStartDay) {
    startMonth -= 1
    if (startMonth < 0) {
      startMonth = 11
      startYear -= 1
    }
  }

  const start = new Date(startYear, startMonth, cycleStartDay)
  const end = new Date(startYear, startMonth + 1, cycleStartDay)
  const totalMs = end.getTime() - start.getTime()
  const totalDays = Math.round(totalMs / (24 * 60 * 60 * 1000))
  const elapsedMs = now.getTime() - start.getTime()
  const daysElapsed = Math.max(1, Math.ceil(elapsedMs / (24 * 60 * 60 * 1000)))

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    totalDays,
    daysElapsed,
  }
}
