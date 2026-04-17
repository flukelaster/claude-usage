import { useQuery } from '@tanstack/react-query'
import { getCalendarYear, type CalendarYear } from '~/server/functions/get-calendar'

export function useCalendarYear(year: number) {
  return useQuery<CalendarYear>({
    queryKey: ['calendar', year],
    queryFn: () => getCalendarYear({ data: { year } }),
  })
}
