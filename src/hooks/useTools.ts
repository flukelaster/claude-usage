import { getToolsAll, getTools30d, getTools90d } from '~/server/functions/get-tools'
import { usePeriodQuery } from './usePeriodQuery'
import type { Period } from '~/types'

type ToolsData = Awaited<ReturnType<typeof getToolsAll>>

const fns: Record<Period, () => Promise<ToolsData>> = {
  '30d': getTools30d,
  '90d': getTools90d,
  all: getToolsAll,
}

export function useTools(period: Period) {
  return usePeriodQuery<ToolsData>('tools', period, fns)
}
