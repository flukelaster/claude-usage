/**
 * Claude subscription plans and their rate-limit shapes.
 *
 * The numbers below are deliberately rough — Anthropic publishes limits
 * as "≈N messages per 5 hours" rather than token quotas, and those
 * guidelines shift periodically. They're good enough for a "how close am
 * I to my cap?" gauge; the user can switch to the `custom` plan and
 * enter their own values if they have better info.
 *
 * Pricing/quota sources used at draft time (2026-04-14):
 *  - claude.ai/pricing (Pro vs Max)
 *  - anthropic.com/claude-code (usage rules for subscriptions)
 */

export interface SubscriptionPlan {
  id: string
  name: string
  monthlyPriceUsd: number | null // null = pay-per-token (no subscription)
  // Rolling 5-hour window — every subscription tier has this. `null` means
  // "no cap", used by pay-per-token so the UI can hide the gauge.
  fiveHourInputTokens: number | null
  fiveHourOutputTokens: number | null
  // Rolling 7-day window — added on Max tiers.
  weeklyInputTokens: number | null
  weeklyOutputTokens: number | null
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  none: {
    id: 'none',
    name: 'Pay-per-token',
    monthlyPriceUsd: null,
    fiveHourInputTokens: null,
    fiveHourOutputTokens: null,
    weeklyInputTokens: null,
    weeklyOutputTokens: null,
  },
  pro: {
    id: 'pro',
    name: 'Claude Pro',
    monthlyPriceUsd: 20,
    // ~45 messages per 5h → assume an average 40k input + 10k output per msg.
    fiveHourInputTokens: 1_800_000,
    fiveHourOutputTokens: 450_000,
    weeklyInputTokens: null,
    weeklyOutputTokens: null,
  },
  max5: {
    id: 'max5',
    name: 'Claude Max (5×)',
    monthlyPriceUsd: 100,
    // Roughly 5× Pro in the 5h window.
    fiveHourInputTokens: 9_000_000,
    fiveHourOutputTokens: 2_250_000,
    // Max plans also have a weekly cap.
    weeklyInputTokens: 90_000_000,
    weeklyOutputTokens: 22_500_000,
  },
  max20: {
    id: 'max20',
    name: 'Claude Max (20×)',
    monthlyPriceUsd: 200,
    fiveHourInputTokens: 36_000_000,
    fiveHourOutputTokens: 9_000_000,
    weeklyInputTokens: 360_000_000,
    weeklyOutputTokens: 90_000_000,
  },
  custom: {
    id: 'custom',
    name: 'Custom plan',
    monthlyPriceUsd: 0,
    fiveHourInputTokens: 5_000_000,
    fiveHourOutputTokens: 1_250_000,
    weeklyInputTokens: null,
    weeklyOutputTokens: null,
  },
}

export const PLAN_IDS = Object.keys(SUBSCRIPTION_PLANS) as Array<keyof typeof SUBSCRIPTION_PLANS>

export function getPlan(id: string | null | undefined): SubscriptionPlan {
  if (!id) return SUBSCRIPTION_PLANS.none
  return SUBSCRIPTION_PLANS[id] ?? SUBSCRIPTION_PLANS.none
}
