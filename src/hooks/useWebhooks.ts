import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  sendTestWebhook,
  recentDeliveries,
  listAvailableEvents,
  type WebhookRow,
  type DeliveryRow,
} from '~/server/functions/webhooks'
import { useToast } from '~/components/ui/toast'

const KEY = ['webhooks'] as const
const DELIVERIES_KEY = (id?: string) => ['webhook-deliveries', id ?? 'all'] as const

export function useWebhookList() {
  return useQuery<WebhookRow[]>({
    queryKey: KEY,
    queryFn: () => listWebhooks(),
  })
}

export function useAvailableWebhookEvents() {
  return useQuery({
    queryKey: ['webhook-events'],
    queryFn: () => listAvailableEvents(),
    staleTime: Infinity,
  })
}

export function useWebhookDeliveries(webhookId?: string, limit = 25) {
  return useQuery<DeliveryRow[]>({
    queryKey: DELIVERIES_KEY(webhookId),
    queryFn: () => recentDeliveries({ data: { webhookId, limit } }),
    refetchInterval: 30_000,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: KEY })
    qc.invalidateQueries({ queryKey: ['webhook-deliveries'] })
  }
}

export function useCreateWebhook() {
  const inv = useInvalidate()
  const toast = useToast()
  return useMutation({
    mutationFn: (data: {
      url: string
      label?: string | null
      events: string[]
      secret?: string | null
      enabled?: boolean
    }) => createWebhook({ data }),
    onSuccess: () => {
      inv()
      toast.push({ variant: 'success', title: 'Webhook created' })
    },
    onError: (err) => {
      toast.push({
        variant: 'error',
        title: 'Could not create webhook',
        description: err instanceof Error ? err.message : String(err),
      })
    },
  })
}

export function useUpdateWebhook() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (data: {
      id: string
      url?: string
      label?: string | null
      events?: string[]
      secret?: string | null
      enabled?: boolean
    }) => updateWebhook({ data }),
    onSuccess: inv,
  })
}

export function useDeleteWebhook() {
  const inv = useInvalidate()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => deleteWebhook({ data: { id } }),
    onSuccess: () => {
      inv()
      toast.push({ variant: 'info', title: 'Webhook deleted' })
    },
  })
}

export function useSendTestWebhook() {
  const inv = useInvalidate()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => sendTestWebhook({ data: { id } }),
    onSuccess: () => {
      inv()
      toast.push({
        variant: 'info',
        title: 'Test event fired',
        description: 'Check the delivery log for the response status.',
      })
    },
    onError: (err) => {
      toast.push({
        variant: 'error',
        title: 'Test delivery failed',
        description: err instanceof Error ? err.message : String(err),
      })
    },
  })
}
