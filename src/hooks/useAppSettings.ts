import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAppSettings,
  setIncludeSidechain,
  setMonthlyBudget,
  setBillingCycleStartDay,
  getIngestApiKey,
  regenerateIngestApiKey,
  getConnectedMachines,
  type AppSettingsPayload,
} from '~/server/functions/app-settings'
import { queryKeys, dataQueryKeys } from './queryKeys'

export function useAppSettings() {
  return useQuery<AppSettingsPayload>({
    queryKey: queryKeys.settings(),
    queryFn: () => getAppSettings(),
  })
}

/**
 * Invalidate all derived data queries after a setting that affects
 * analytics output (like `includeSidechain` or `billingCycleStartDay`)
 * changes. Budget alone doesn't need this but keeping one helper is
 * simpler than threading invalidation lists through each mutation.
 */
function useInvalidateAfterSetting() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.settings() })
    for (const key of dataQueryKeys) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }
}

export function useSetIncludeSidechain() {
  const invalidate = useInvalidateAfterSetting()
  return useMutation({
    mutationFn: (enabled: boolean) => setIncludeSidechain({ data: { enabled } }),
    onSuccess: invalidate,
  })
}

export function useSetMonthlyBudget() {
  const invalidate = useInvalidateAfterSetting()
  return useMutation({
    mutationFn: (amount: number | null) => setMonthlyBudget({ data: { amount } }),
    onSuccess: invalidate,
  })
}

export function useSetBillingCycleStartDay() {
  const invalidate = useInvalidateAfterSetting()
  return useMutation({
    mutationFn: (day: number) => setBillingCycleStartDay({ data: { day } }),
    onSuccess: invalidate,
  })
}

export function useIngestApiKey() {
  return useQuery({
    queryKey: queryKeys.ingestApiKey(),
    queryFn: () => getIngestApiKey(),
  })
}

export function useRegenerateIngestApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => regenerateIngestApiKey(),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.ingestApiKey(), data)
    },
  })
}

export function useConnectedMachines() {
  return useQuery({
    queryKey: queryKeys.connectedMachines(),
    queryFn: () => getConnectedMachines(),
    refetchInterval: 30_000,
  })
}
