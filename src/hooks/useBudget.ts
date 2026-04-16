import { useQuery } from '@tanstack/react-query'
import { getBudgetStatus, type BudgetStatus } from '~/server/functions/get-budget-status'
import { queryKeys } from './queryKeys'

export function useBudget() {
  return useQuery<BudgetStatus>({
    queryKey: queryKeys.budget(),
    queryFn: () => getBudgetStatus(),
  })
}
