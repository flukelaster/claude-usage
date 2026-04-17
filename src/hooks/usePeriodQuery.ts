import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import type { Period } from '~/types'

/**
 * Factory for queries that have three server-function variants (30d/90d/all).
 * Avoids repeating the `periodFns` lookup pattern across every route.
 */
export function usePeriodQuery<TData>(
  keyPrefix: string,
  period: Period,
  fns: Record<Period, () => Promise<TData>>,
  options?: Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<TData>({
    queryKey: [keyPrefix, period],
    queryFn: () => fns[period](),
    ...options,
  })
}
