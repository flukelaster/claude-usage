import { createServerFn } from '@tanstack/react-start'
import { and, gte, sql } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import { messages } from '~/server/db/schema'
import { buildSidechainFilter } from '~/server/db/query-filters'
import {
  getPlan,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from '~/lib/subscription'
import {
  readSettingRaw,
  readNumberSetting,
} from '~/server/db/app-settings'

export interface WindowUsage {
  label: string
  windowHours: number
  inputTokens: number
  outputTokens: number
  inputLimit: number | null
  outputLimit: number | null
  inputPercent: number | null
  outputPercent: number | null
  // Worst-of: input% vs output% (whichever is closer to quota).
  utilizationPercent: number | null
  resetsAt: string | null
  messageCount: number
  // Linear forecast based on the last 60 minutes of activity.
  burnInPerMinute: number
  burnOutPerMinute: number
  // Estimated wall-clock time when input or output cap is reached at
  // the current burn rate. null = unlimited or zero burn rate.
  inputCapReachedAt: string | null
  outputCapReachedAt: string | null
  // Most-imminent of the two; the gauge headlines this.
  capReachedAt: string | null
}

export interface SubscriptionStatus {
  plan: SubscriptionPlan
  fiveHour: WindowUsage
  weekly: WindowUsage | null
  // Useful context for the UI even on "none" plans.
  totalInLast24h: { input: number; output: number; cost: number }
}

export const getSubscriptionStatus = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SubscriptionStatus> => {
    const planId = readSettingRaw('subscriptionPlan') ?? 'none'
    let plan = getPlan(planId)

    // Custom plan reads its own values from settings, falling back to the
    // defaults in SUBSCRIPTION_PLANS.custom if nothing's been set.
    if (plan.id === 'custom') {
      const base = SUBSCRIPTION_PLANS.custom
      plan = {
        ...base,
        fiveHourInputTokens: readNumberSetting(
          'customFiveHourInput',
          base.fiveHourInputTokens ?? 5_000_000,
        ),
        fiveHourOutputTokens: readNumberSetting(
          'customFiveHourOutput',
          base.fiveHourOutputTokens ?? 1_250_000,
        ),
        weeklyInputTokens:
          readSettingRaw('customWeeklyInput') !== null
            ? readNumberSetting('customWeeklyInput', 0)
            : null,
        weeklyOutputTokens:
          readSettingRaw('customWeeklyOutput') !== null
            ? readNumberSetting('customWeeklyOutput', 0)
            : null,
      }
    }

    const fiveHour = measureWindow(
      'Last 5 hours',
      5,
      plan.fiveHourInputTokens,
      plan.fiveHourOutputTokens,
    )

    const weekly =
      plan.weeklyInputTokens !== null || plan.weeklyOutputTokens !== null
        ? measureWindow(
            'Last 7 days',
            24 * 7,
            plan.weeklyInputTokens,
            plan.weeklyOutputTokens,
          )
        : null

    const totalInLast24h = measureRaw(24)

    return {
      plan,
      fiveHour,
      weekly,
      totalInLast24h: {
        input: totalInLast24h.inputTokens,
        output: totalInLast24h.outputTokens,
        cost: totalInLast24h.cost,
      },
    }
  },
)

function measureWindow(
  label: string,
  windowHours: number,
  inputLimit: number | null,
  outputLimit: number | null,
): WindowUsage {
  const raw = measureRaw(windowHours)
  // Burn rate sampled from a shorter recent window so the prediction
  // reacts to "I just kicked off a long session" rather than averaging
  // over hours of idle time.
  const burnSampleHours = Math.min(1, windowHours)
  const burn = measureRaw(burnSampleHours)
  const burnMinutes = burnSampleHours * 60
  const burnIn = burnMinutes > 0 ? burn.inputTokens / burnMinutes : 0
  const burnOut = burnMinutes > 0 ? burn.outputTokens / burnMinutes : 0

  const finiteIn = inputLimit !== null && Number.isFinite(inputLimit) ? inputLimit : null
  const finiteOut =
    outputLimit !== null && Number.isFinite(outputLimit) ? outputLimit : null

  const inputPercent = finiteIn && finiteIn > 0 ? raw.inputTokens / finiteIn : null
  const outputPercent =
    finiteOut && finiteOut > 0 ? raw.outputTokens / finiteOut : null

  // "How close to my limit am I?" — take the worse of the two.
  let utilizationPercent: number | null = null
  if (inputPercent !== null && outputPercent !== null) {
    utilizationPercent = Math.max(inputPercent, outputPercent)
  } else if (inputPercent !== null) utilizationPercent = inputPercent
  else if (outputPercent !== null) utilizationPercent = outputPercent

  // Reset prediction: when the oldest message in the window scrolls off.
  // For a rolling window this is an approximation — truly the limit never
  // "resets" in one shot, it decays. We report the boundary of the window
  // as if the oldest block of activity drops off then.
  const resetsAt = raw.earliestIso
    ? new Date(
        new Date(raw.earliestIso).getTime() + windowHours * 3_600_000,
      ).toISOString()
    : null

  // Linear forecast: minutes until the remaining headroom is consumed.
  const inputCapReachedAt = predictReach(raw.inputTokens, finiteIn, burnIn)
  const outputCapReachedAt = predictReach(raw.outputTokens, finiteOut, burnOut)
  const capReachedAt = earliestIso(inputCapReachedAt, outputCapReachedAt)

  return {
    label,
    windowHours,
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    inputLimit: finiteIn,
    outputLimit: finiteOut,
    inputPercent,
    outputPercent,
    utilizationPercent,
    resetsAt,
    messageCount: raw.messageCount,
    burnInPerMinute: burnIn,
    burnOutPerMinute: burnOut,
    inputCapReachedAt,
    outputCapReachedAt,
    capReachedAt,
  }
}

function predictReach(
  used: number,
  limit: number | null,
  burnPerMinute: number,
): string | null {
  if (limit === null || limit <= 0) return null
  if (used >= limit) return new Date().toISOString() // already over
  if (burnPerMinute <= 0) return null
  const remaining = limit - used
  const minutes = remaining / burnPerMinute
  // Cap predictions to a reasonable horizon so the UI doesn't show
  // "reached in 47 days" when burn rate is negligible.
  if (minutes > 60 * 24 * 7) return null
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

function earliestIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a).getTime() < new Date(b).getTime() ? a : b
}

function measureRaw(windowHours: number) {
  const db = getDb()
  const cutoff = new Date(Date.now() - windowHours * 3_600_000).toISOString()
  const sidechainFilter = buildSidechainFilter()

  const agg = db
    .select({
      inputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
      cost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
      messageCount: sql<number>`count(*)`,
      earliest: sql<string | null>`min(${messages.timestamp})`,
    })
    .from(messages)
    .where(and(gte(messages.timestamp, cutoff), sidechainFilter))
    .get()

  return {
    inputTokens: agg?.inputTokens ?? 0,
    outputTokens: agg?.outputTokens ?? 0,
    cost: agg?.cost ?? 0,
    messageCount: agg?.messageCount ?? 0,
    earliestIso: agg?.earliest ?? null,
  }
}

/**
 * Persist the user's active plan + any custom overrides.
 */
export const setSubscriptionPlan = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      planId: string
      customFiveHourInput?: number
      customFiveHourOutput?: number
      customWeeklyInput?: number | null
      customWeeklyOutput?: number | null
    }) => data,
  )
  .handler(async ({ data }) => {
    const { writeSettingRaw, writeNumberSetting } = await import(
      '~/server/db/app-settings'
    )
    const valid = Object.prototype.hasOwnProperty.call(SUBSCRIPTION_PLANS, data.planId)
    if (!valid) throw new Error(`Unknown plan id: ${data.planId}`)
    writeSettingRaw('subscriptionPlan', data.planId)

    if (data.planId === 'custom') {
      if (data.customFiveHourInput !== undefined) {
        writeNumberSetting('customFiveHourInput', data.customFiveHourInput)
      }
      if (data.customFiveHourOutput !== undefined) {
        writeNumberSetting('customFiveHourOutput', data.customFiveHourOutput)
      }
      if (data.customWeeklyInput === null) {
        writeSettingRaw('customWeeklyInput', null)
      } else if (data.customWeeklyInput !== undefined) {
        writeNumberSetting('customWeeklyInput', data.customWeeklyInput)
      }
      if (data.customWeeklyOutput === null) {
        writeSettingRaw('customWeeklyOutput', null)
      } else if (data.customWeeklyOutput !== undefined) {
        writeNumberSetting('customWeeklyOutput', data.customWeeklyOutput)
      }
    }

    return { ok: true as const }
  })
