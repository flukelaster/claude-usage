import { useQuery } from '@tanstack/react-query'
import { getAnomalies, type AnomalyResult } from '~/server/functions/get-anomalies'
import { queryKeys } from './queryKeys'

export function useAnomalies() {
  return useQuery<AnomalyResult>({
    queryKey: queryKeys.anomalies(),
    queryFn: () => getAnomalies(),
  })
}
