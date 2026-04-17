import { getEfficiencyAll, getEfficiency30d, getEfficiency90d } from '~/server/functions/get-efficiency'
import { usePeriodQuery } from './usePeriodQuery'
import type { Period, EfficiencyData } from '~/types'

const fns: Record<Period, () => Promise<EfficiencyData>> = {
  '30d': getEfficiency30d,
  '90d': getEfficiency90d,
  all: getEfficiencyAll,
}

export function useEfficiency(period: Period) {
  return usePeriodQuery<EfficiencyData>('efficiency', period, fns)
}
