import { describe, expect, it } from 'vitest'
import { resolveBillingPeriod } from '~/server/functions/get-budget-status'

describe('resolveBillingPeriod', () => {
  it('anchors to the 1st of the current month for cycle day 1', () => {
    const now = new Date(2026, 3, 15, 10, 0, 0) // Apr 15 local
    const period = resolveBillingPeriod(now, 1)
    expect(new Date(period.startIso).getDate()).toBe(1)
    expect(new Date(period.startIso).getMonth()).toBe(3)
    expect(new Date(period.endIso).getMonth()).toBe(4)
    expect(period.totalDays).toBe(30)
    expect(period.daysElapsed).toBeGreaterThanOrEqual(15)
  })

  it('rolls back to the previous month when before the cycle start day', () => {
    const now = new Date(2026, 3, 10, 10, 0, 0) // Apr 10
    const period = resolveBillingPeriod(now, 15)
    expect(new Date(period.startIso).getMonth()).toBe(2) // March
    expect(new Date(period.startIso).getDate()).toBe(15)
    expect(new Date(period.endIso).getMonth()).toBe(3) // April
    expect(new Date(period.endIso).getDate()).toBe(15)
  })

  it('starts a new period on the cycle start day itself', () => {
    const now = new Date(2026, 3, 15, 0, 1, 0)
    const period = resolveBillingPeriod(now, 15)
    expect(new Date(period.startIso).getMonth()).toBe(3)
    expect(new Date(period.startIso).getDate()).toBe(15)
    expect(period.daysElapsed).toBe(1)
  })
})
