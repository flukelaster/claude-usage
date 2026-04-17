import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSubscriptionStatus,
  setSubscriptionPlan,
  type SubscriptionStatus,
} from '~/server/functions/get-subscription'

const SUBSCRIPTION_KEY = ['subscription'] as const

export function useSubscription() {
  return useQuery<SubscriptionStatus>({
    queryKey: SUBSCRIPTION_KEY,
    queryFn: () => getSubscriptionStatus(),
    // The 5-hour window is rolling — refresh frequently so the gauge
    // reacts to fresh sync data.
    refetchInterval: 60_000,
  })
}

export function useSetSubscriptionPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      planId: string
      customFiveHourInput?: number
      customFiveHourOutput?: number
      customWeeklyInput?: number | null
      customWeeklyOutput?: number | null
    }) => setSubscriptionPlan({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBSCRIPTION_KEY })
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}
