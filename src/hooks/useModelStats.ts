import { getModelStatsAll, getModelStats30d, getModelStats90d } from '~/server/functions/get-model-stats'
import { usePeriodQuery } from './usePeriodQuery'
import type { Period, ModelStatsData } from '~/types'

const fns: Record<Period, () => Promise<ModelStatsData>> = {
  '30d': getModelStats30d,
  '90d': getModelStats90d,
  all: getModelStatsAll,
}

export function useModelStats(period: Period) {
  return usePeriodQuery<ModelStatsData>('modelStats', period, fns)
}
