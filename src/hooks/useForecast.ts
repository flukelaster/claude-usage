import { useQuery } from '@tanstack/react-query'
import { getForecast } from '~/server/functions/get-forecast'
import { queryKeys } from './queryKeys'
import type { ForecastData } from '~/types'

export function useForecast() {
  return useQuery<ForecastData>({
    queryKey: queryKeys.forecast(),
    queryFn: () => getForecast(),
  })
}
