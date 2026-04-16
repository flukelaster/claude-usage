import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/server/db/client'
import { messages } from '~/server/db/schema'
import { sql, eq, and, gte } from 'drizzle-orm'
import { PRICING, calcCost, getModelFamily, getModelDisplayName, type TokenUsage } from '~/lib/pricing'
import { buildSidechainFilter } from '~/server/db/query-filters'

export const getWhatIfAll = createServerFn({ method: 'GET' })
  .handler(async () => queryWhatIf(null))

export const getWhatIf30d = createServerFn({ method: 'GET' })
  .handler(async () => queryWhatIf(30))

export const getWhatIf90d = createServerFn({ method: 'GET' })
  .handler(async () => queryWhatIf(90))

function queryWhatIf(days: number | null) {
  const db = getDb()
  const cutoff = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : null
  const timeFilter = cutoff ? gte(messages.timestamp, cutoff) : sql`1=1`
  const sidechainFilter = buildSidechainFilter()

  // Per-model token breakdown
  const modelData = db.select({
    model: messages.model,
    totalInputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)`,
    totalCacheCreationTokens: sql<number>`coalesce(sum(${messages.cacheCreationTokens}), 0)`,
    totalCacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)`,
    totalCacheEphemeral5m: sql<number>`coalesce(sum(${messages.cacheEphemeral5mTokens}), 0)`,
    totalCacheEphemeral1h: sql<number>`coalesce(sum(${messages.cacheEphemeral1hTokens}), 0)`,
    actualCost: sql<number>`coalesce(sum(${messages.estimatedCostUsd}), 0)`,
    messageCount: sql<number>`count(*)`,
  })
    .from(messages)
    .where(and(timeFilter, sidechainFilter))
    .groupBy(messages.model)
    .orderBy(sql`sum(${messages.estimatedCostUsd}) desc`)
    .all()

  const allModelFamilies = Object.keys(PRICING)

  // Precompute cross-model cost matrix
  const modelBreakdown = modelData.map((m) => {
    const usage: TokenUsage = {
      inputTokens: m.totalInputTokens,
      outputTokens: m.totalOutputTokens,
      cacheCreationTokens: m.totalCacheCreationTokens,
      cacheReadTokens: m.totalCacheReadTokens,
      cacheEphemeral5mTokens: m.totalCacheEphemeral5m,
      cacheEphemeral1hTokens: m.totalCacheEphemeral1h,
    }

    const simulatedCosts: Record<string, number> = {}
    for (const family of allModelFamilies) {
      // Use calcCost with a fake model name that maps to the target family
      // We need to construct a model string that getModelFamily will resolve to this family
      // Instead, directly calculate using the pricing
      const p = PRICING[family]
      const totalCacheWrite = usage.cacheCreationTokens
      let cacheWriteCost: number
      if (totalCacheWrite > 0 && (usage.cacheEphemeral5mTokens > 0 || usage.cacheEphemeral1hTokens > 0)) {
        cacheWriteCost = (usage.cacheEphemeral5mTokens * p.cacheWrite5m + usage.cacheEphemeral1hTokens * p.cacheWrite1h) / 1_000_000
      } else {
        cacheWriteCost = totalCacheWrite * p.cacheWrite1h / 1_000_000
      }
      simulatedCosts[family] = (
        usage.inputTokens * p.input / 1_000_000 +
        usage.outputTokens * p.output / 1_000_000 +
        cacheWriteCost +
        usage.cacheReadTokens * p.cacheRead / 1_000_000
      )
    }

    return {
      model: m.model,
      family: getModelFamily(m.model),
      displayName: getModelDisplayName(m.model),
      actualCost: m.actualCost,
      totalInputTokens: m.totalInputTokens,
      totalOutputTokens: m.totalOutputTokens,
      totalCacheCreationTokens: m.totalCacheCreationTokens,
      totalCacheReadTokens: m.totalCacheReadTokens,
      messageCount: m.messageCount,
      simulatedCosts,
    }
  })

  const totalActualCost = modelBreakdown.reduce((s, m) => s + m.actualCost, 0)

  return {
    modelBreakdown,
    totalActualCost,
    allModelFamilies,
    days,
  }
}
