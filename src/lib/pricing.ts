/**
 * Claude model pricing — verified from platform.claude.com/docs 2026-04-14
 * All prices in USD per million tokens
 */

export interface ModelPricing {
  input: number
  output: number
  cacheWrite5m: number
  cacheWrite1h: number
  cacheRead: number
}

// Map raw model strings to pricing family
const MODEL_FAMILY: Record<string, string> = {
  'claude-opus-4-7': 'opus-4.7',
  'claude-opus-4-7-20260101': 'opus-4.7',
  'claude-opus-4-6': 'opus-4.6',
  'claude-opus-4-5': 'opus-4.5',
  'claude-opus-4-5-20251101': 'opus-4.5',
  'claude-opus-4-1': 'opus-4.1',
  'claude-opus-4-1-20250805': 'opus-4.1',
  'claude-opus-4-20250514': 'opus-4',
  'claude-sonnet-4-6': 'sonnet-4.6',
  'claude-sonnet-4-5': 'sonnet-4.5',
  'claude-sonnet-4-5-20250929': 'sonnet-4.5',
  'claude-sonnet-4-20250514': 'sonnet-4',
  'claude-haiku-4-5-20251001': 'haiku-4.5',
  'claude-haiku-4-5': 'haiku-4.5',
}

/**
 * Maximum context window per family, in tokens. Used by the context
 * utilization analytics to normalize input-token totals into a % fill.
 * Values reflect the current max window each model accepts on the
 * platform (verified alongside PRICING_LAST_VERIFIED).
 */
export const MODEL_CONTEXT_WINDOW: Record<string, number> = {
  'opus-4.7': 1_000_000,
  'opus-4.6': 200_000,
  'opus-4.5': 200_000,
  'opus-4.1': 200_000,
  'opus-4': 200_000,
  'sonnet-4.6': 1_000_000,
  'sonnet-4.5': 200_000,
  'sonnet-4': 200_000,
  'haiku-4.5': 200_000,
}

export function getModelContextWindow(model: string): number {
  const family = getModelFamily(model)
  return MODEL_CONTEXT_WINDOW[family] ?? 200_000
}

export const PRICING: Record<string, ModelPricing> = {
  // Opus 4.7 matches 4.6's rate card as of the "knowledge cutoff + first
  // platform release" window; update once the published rate card moves.
  'opus-4.7':   { input:  5.00, output: 25.00, cacheWrite5m:  6.25, cacheWrite1h: 10.00, cacheRead: 0.50 },
  'opus-4.6':   { input:  5.00, output: 25.00, cacheWrite5m:  6.25, cacheWrite1h: 10.00, cacheRead: 0.50 },
  'opus-4.5':   { input:  5.00, output: 25.00, cacheWrite5m:  6.25, cacheWrite1h: 10.00, cacheRead: 0.50 },
  'opus-4.1':   { input: 15.00, output: 75.00, cacheWrite5m: 18.75, cacheWrite1h: 30.00, cacheRead: 1.50 },
  'opus-4':     { input: 15.00, output: 75.00, cacheWrite5m: 18.75, cacheWrite1h: 30.00, cacheRead: 1.50 },
  'sonnet-4.6': { input:  3.00, output: 15.00, cacheWrite5m:  3.75, cacheWrite1h:  6.00, cacheRead: 0.30 },
  'sonnet-4.5': { input:  3.00, output: 15.00, cacheWrite5m:  3.75, cacheWrite1h:  6.00, cacheRead: 0.30 },
  'sonnet-4':   { input:  3.00, output: 15.00, cacheWrite5m:  3.75, cacheWrite1h:  6.00, cacheRead: 0.30 },
  'haiku-4.5':  { input:  1.00, output:  5.00, cacheWrite5m:  1.25, cacheWrite1h:  2.00, cacheRead: 0.10 },
}

export const PRICING_LAST_VERIFIED = '2026-04-14'

// Default fallback for unknown models
const FALLBACK_FAMILY = 'sonnet-4.6'

export function getModelFamily(model: string): string {
  return MODEL_FAMILY[model] ?? FALLBACK_FAMILY
}

/**
 * True if the model appears in the hard-coded pricing table. Callers can
 * surface a warning for unknown models so the operator knows to update
 * `PRICING` before trusting the cost estimate.
 */
export function isKnownModel(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODEL_FAMILY, model)
}

export function getModelPricing(model: string): ModelPricing {
  const family = getModelFamily(model)
  return PRICING[family] ?? PRICING[FALLBACK_FAMILY]
}

export function getModelDisplayName(model: string): string {
  const family = getModelFamily(model)
  const names: Record<string, string> = {
    'opus-4.7': 'Opus 4.7',
    'opus-4.6': 'Opus 4.6',
    'opus-4.5': 'Opus 4.5',
    'opus-4.1': 'Opus 4.1',
    'opus-4': 'Opus 4',
    'sonnet-4.6': 'Sonnet 4.6',
    'sonnet-4.5': 'Sonnet 4.5',
    'sonnet-4': 'Sonnet 4',
    'haiku-4.5': 'Haiku 4.5',
  }
  return names[family] ?? model
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  cacheEphemeral5mTokens: number
  cacheEphemeral1hTokens: number
}

/**
 * Calculate estimated cost in USD.
 * Cache write cost uses the weighted average of 5m and 1h rates
 * based on the ephemeral breakdown when available.
 */
export function calcCost(model: string, usage: TokenUsage): number {
  const p = getModelPricing(model)

  const totalCacheWrite = usage.cacheCreationTokens
  const ephemeralTotal = usage.cacheEphemeral5mTokens + usage.cacheEphemeral1hTokens
  let cacheWriteCost: number

  if (totalCacheWrite === 0) {
    cacheWriteCost = 0
  } else if (ephemeralTotal > 0) {
    // Use the explicit breakdown for accurate pricing. If the breakdown covers
    // only part of the total (e.g. one field missing), split the remainder
    // using the observed ratio.
    const remainder = Math.max(0, totalCacheWrite - ephemeralTotal)
    const p5mShare = usage.cacheEphemeral5mTokens / ephemeralTotal
    const attributed5m = usage.cacheEphemeral5mTokens + remainder * p5mShare
    const attributed1h = usage.cacheEphemeral1hTokens + remainder * (1 - p5mShare)
    cacheWriteCost = (attributed5m * p.cacheWrite5m + attributed1h * p.cacheWrite1h) / 1_000_000
  } else {
    // Breakdown missing entirely. 5-minute cache is the SDK default, so
    // weight toward it rather than assuming the pricier 1h tier.
    const blendRate = p.cacheWrite5m * 0.75 + p.cacheWrite1h * 0.25
    cacheWriteCost = totalCacheWrite * blendRate / 1_000_000
  }

  return (
    usage.inputTokens * p.input / 1_000_000 +
    usage.outputTokens * p.output / 1_000_000 +
    cacheWriteCost +
    usage.cacheReadTokens * p.cacheRead / 1_000_000
  )
}
