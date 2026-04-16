import { getCacheStatsAll, getCacheStats30d, getCacheStats90d } from '~/server/functions/get-cache-stats'
import { usePeriodQuery } from './usePeriodQuery'
import type { Period, CacheData } from '~/types'

const fns: Record<Period, () => Promise<CacheData>> = {
  '30d': getCacheStats30d,
  '90d': getCacheStats90d,
  all: getCacheStatsAll,
}

export function useCacheStats(period: Period) {
  return usePeriodQuery<CacheData>('cacheStats', period, fns)
}
