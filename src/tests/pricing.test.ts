import { describe, expect, it } from 'vitest'
import {
  calcCost,
  getModelFamily,
  getModelPricing,
  isKnownModel,
  type TokenUsage,
} from '~/lib/pricing'

const emptyUsage: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  cacheEphemeral5mTokens: 0,
  cacheEphemeral1hTokens: 0,
}

describe('pricing.calcCost', () => {
  it('returns zero for empty usage', () => {
    expect(calcCost('claude-sonnet-4-6', emptyUsage)).toBe(0)
  })

  it('prices plain input/output at the family rate', () => {
    const usage: TokenUsage = {
      ...emptyUsage,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }
    const p = getModelPricing('claude-sonnet-4-6')
    expect(calcCost('claude-sonnet-4-6', usage)).toBeCloseTo(p.input + p.output, 6)
  })

  it('splits ephemeral cache writes using the 5m/1h breakdown', () => {
    const usage: TokenUsage = {
      ...emptyUsage,
      cacheCreationTokens: 1_000_000,
      cacheEphemeral5mTokens: 800_000,
      cacheEphemeral1hTokens: 200_000,
    }
    const p = getModelPricing('claude-sonnet-4-6')
    const expected = (800_000 * p.cacheWrite5m + 200_000 * p.cacheWrite1h) / 1_000_000
    expect(calcCost('claude-sonnet-4-6', usage)).toBeCloseTo(expected, 6)
  })

  it('distributes the remainder when breakdown is partial', () => {
    const usage: TokenUsage = {
      ...emptyUsage,
      cacheCreationTokens: 1_000_000,
      cacheEphemeral5mTokens: 200_000,
      cacheEphemeral1hTokens: 0,
    }
    // 200k attributed to 5m directly. Remainder (800k) should split 100%
    // to 5m since the observed ratio is 1.0 toward 5m.
    const p = getModelPricing('claude-sonnet-4-6')
    expect(calcCost('claude-sonnet-4-6', usage)).toBeCloseTo(
      (1_000_000 * p.cacheWrite5m) / 1_000_000,
      6,
    )
  })

  it('uses a 75/25 blend when no breakdown is present', () => {
    const usage: TokenUsage = {
      ...emptyUsage,
      cacheCreationTokens: 1_000_000,
    }
    const p = getModelPricing('claude-sonnet-4-6')
    const blend = p.cacheWrite5m * 0.75 + p.cacheWrite1h * 0.25
    expect(calcCost('claude-sonnet-4-6', usage)).toBeCloseTo(blend, 6)
  })

  it('prices cache reads at the cache-read rate', () => {
    const usage: TokenUsage = { ...emptyUsage, cacheReadTokens: 2_000_000 }
    const p = getModelPricing('claude-opus-4-6')
    expect(calcCost('claude-opus-4-6', usage)).toBeCloseTo(2 * p.cacheRead, 6)
  })
})

describe('pricing model detection', () => {
  it('maps known aliases to a pricing family', () => {
    expect(getModelFamily('claude-opus-4-6')).toBe('opus-4.6')
    expect(getModelFamily('claude-sonnet-4-5-20250929')).toBe('sonnet-4.5')
    expect(getModelFamily('claude-haiku-4-5')).toBe('haiku-4.5')
  })

  it('falls back to sonnet-4.6 for unknown ids', () => {
    expect(getModelFamily('claude-future-9')).toBe('sonnet-4.6')
    expect(isKnownModel('claude-future-9')).toBe(false)
    expect(isKnownModel('claude-opus-4-6')).toBe(true)
  })
})
