import { getWhatIfAll, getWhatIf30d, getWhatIf90d } from '~/server/functions/get-what-if'
import { usePeriodQuery } from './usePeriodQuery'
import type { Period, WhatIfData } from '~/types'

const fns: Record<Period, () => Promise<WhatIfData>> = {
  '30d': getWhatIf30d,
  '90d': getWhatIf90d,
  all: getWhatIfAll,
}

export function useWhatIf(period: Period) {
  return usePeriodQuery<WhatIfData>('what-if', period, fns)
}
