import { useQuery } from '@tanstack/react-query'
import { getComparison, type ComparisonResult } from '~/server/functions/get-comparison'
import { queryKeys } from './queryKeys'

export function useComparison(windowDays: number) {
  return useQuery<ComparisonResult>({
    queryKey: queryKeys.comparison(windowDays),
    queryFn: () => getComparison({ data: { windowDays } }),
  })
}
