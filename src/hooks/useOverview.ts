import { getOverviewAll, getOverview30d, getOverview90d } from '~/server/functions/get-overview'
import { usePeriodQuery } from './usePeriodQuery'
import type { Period, OverviewData } from '~/types'

const fns: Record<Period, () => Promise<OverviewData>> = {
  '30d': getOverview30d,
  '90d': getOverview90d,
  all: getOverviewAll,
}

export function useOverview(period: Period) {
  return usePeriodQuery<OverviewData>('overview', period, fns, {
    refetchInterval: 60_000,
  })
}
