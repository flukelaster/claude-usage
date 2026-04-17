import {
  getContextUtilizationAll,
  getContextUtilization30d,
  getContextUtilization90d,
  type ContextUtilizationResult,
} from '~/server/functions/get-context-utilization'
import { usePeriodQuery } from './usePeriodQuery'
import type { Period } from '~/types'

const fns: Record<Period, () => Promise<ContextUtilizationResult>> = {
  '30d': getContextUtilization30d,
  '90d': getContextUtilization90d,
  all: getContextUtilizationAll,
}

export function useContextUtilization(period: Period) {
  return usePeriodQuery<ContextUtilizationResult>('contextUtilization', period, fns)
}
