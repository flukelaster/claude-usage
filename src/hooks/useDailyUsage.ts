import { getDailyUsageAll, getDailyUsage30d, getDailyUsage90d } from '~/server/functions/get-daily-usage'
import { usePeriodQuery } from './usePeriodQuery'
import type { Period, DailyUsageData } from '~/types'

const fns: Record<Period, () => Promise<DailyUsageData>> = {
  '30d': getDailyUsage30d,
  '90d': getDailyUsage90d,
  all: getDailyUsageAll,
}

export function useDailyUsage(period: Period) {
  return usePeriodQuery<DailyUsageData>('daily-usage', period, fns)
}
