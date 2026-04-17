import { getActivityAll, getActivity30d, getActivity90d } from '~/server/functions/get-activity'
import { usePeriodQuery } from './usePeriodQuery'
import type { Period, ActivityData } from '~/types'

const fns: Record<Period, () => Promise<ActivityData>> = {
  '30d': getActivity30d,
  '90d': getActivity90d,
  all: getActivityAll,
}

export function useActivity(period: Period) {
  return usePeriodQuery<ActivityData>('activity', period, fns)
}
