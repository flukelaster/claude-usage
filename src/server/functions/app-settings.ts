import { createServerFn } from '@tanstack/react-start'

export interface AppSettingsPayload {
  includeSidechain: boolean
  monthlyBudgetUsd: number | null
  billingCycleStartDay: number
}

export const getAppSettings = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AppSettingsPayload> => {
    const {
      readBooleanSetting,
      readNumberSetting,
      readSettingRaw,
    } = await import('~/server/db/app-settings')

    const includeSidechain = readBooleanSetting('includeSidechain', false)
    const billingCycleStartDay = Math.min(
      Math.max(1, readNumberSetting('billingCycleStartDay', 1)),
      28,
    )
    const budgetRaw = readSettingRaw('monthlyBudgetUsd')
    const monthlyBudgetUsd = budgetRaw === null ? null : Number(budgetRaw)

    return {
      includeSidechain,
      billingCycleStartDay,
      monthlyBudgetUsd:
        monthlyBudgetUsd !== null && Number.isFinite(monthlyBudgetUsd)
          ? monthlyBudgetUsd
          : null,
    }
  },
)

export const setIncludeSidechain = createServerFn({ method: 'POST' })
  .inputValidator((data: { enabled: boolean }) => data)
  .handler(async ({ data }) => {
    const { writeBooleanSetting } = await import('~/server/db/app-settings')
    writeBooleanSetting('includeSidechain', data.enabled)
    return { ok: true as const }
  })

export const setMonthlyBudget = createServerFn({ method: 'POST' })
  .inputValidator((data: { amount: number | null }) => data)
  .handler(async ({ data }) => {
    const { writeSettingRaw, writeNumberSetting } = await import('~/server/db/app-settings')
    if (data.amount === null || !Number.isFinite(data.amount) || data.amount <= 0) {
      writeSettingRaw('monthlyBudgetUsd', null)
    } else {
      writeNumberSetting('monthlyBudgetUsd', data.amount)
    }
    return { ok: true as const }
  })

export const setBillingCycleStartDay = createServerFn({ method: 'POST' })
  .inputValidator((data: { day: number }) => data)
  .handler(async ({ data }) => {
    const { writeNumberSetting } = await import('~/server/db/app-settings')
    const clamped = Math.min(Math.max(1, Math.round(data.day)), 28)
    writeNumberSetting('billingCycleStartDay', clamped)
    return { ok: true as const }
  })

export const getIngestApiKey = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ apiKey: string }> => {
    const { getOrCreateIngestApiKey } = await import('~/server/db/app-settings')
    return { apiKey: getOrCreateIngestApiKey() }
  },
)

export const regenerateIngestApiKey = createServerFn({ method: 'POST' }).handler(
  async (): Promise<{ apiKey: string }> => {
    const { setIngestApiKey, getOrCreateIngestApiKey } = await import('~/server/db/app-settings')
    // Clear by writing empty, then re-fetch which regenerates.
    setIngestApiKey('')
    return { apiKey: getOrCreateIngestApiKey() }
  },
)

export const getConnectedMachines = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<{ machineId: string; sessionCount: number; lastSeenAt: string | null }>> => {
    const { getDb } = await import('~/server/db/client')
    const { sessions } = await import('~/server/db/schema')
    const { sql } = await import('drizzle-orm')
    const db = getDb()
    const rows = db
      .select({
        machineId: sessions.machineId,
        sessionCount: sql<number>`count(*)`,
        lastSeenAt: sql<string | null>`max(${sessions.endedAt})`,
      })
      .from(sessions)
      .groupBy(sessions.machineId)
      .all()
    return rows
      .filter((r): r is { machineId: string; sessionCount: number; lastSeenAt: string | null } => !!r.machineId)
      .sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))
  },
)
