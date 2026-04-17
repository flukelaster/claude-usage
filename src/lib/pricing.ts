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

export const PRICING: Record<string, ModelPricing> = {
  // TODO: verify opus-4.7 pricing at platform.claude.com/docs
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
  let cacheWriteCost: number

  if (totalCacheWrite > 0 && (usage.cacheEphemeral5mTokens > 0 || usage.cacheEphemeral1hTokens > 0)) {
    // Use the breakdown for accurate pricing
    cacheWriteCost = (
      usage.cacheEphemeral5mTokens * p.cacheWrite5m +
      usage.cacheEphemeral1hTokens * p.cacheWrite1h
    ) / 1_000_000
  } else {
    // Fallback: assume 1h cache write (conservative estimate)
    cacheWriteCost = totalCacheWrite * p.cacheWrite1h / 1_000_000
  }

  return (
    usage.inputTokens * p.input / 1_000_000 +
    usage.outputTokens * p.output / 1_000_000 +
    cacheWriteCost +
    usage.cacheReadTokens * p.cacheRead / 1_000_000
  )
}
