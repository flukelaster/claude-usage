import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { syncLogs, getLastSyncTime } from '~/server/functions/sync-logs'
import { queryKeys, dataQueryKeys } from './queryKeys'
import type { SyncResult } from '~/types'

export function useLastSync() {
  return useQuery<string | null>({
    queryKey: queryKeys.lastSync(),
    queryFn: () => getLastSyncTime(),
  })
}

/**
 * Sync logs and invalidate every data query. Use this for user-triggered
 * "Sync Now" buttons; passive file-watch updates go through `useAutoSync`.
 */
export function useSyncLogs() {
  const queryClient = useQueryClient()
  return useMutation<SyncResult>({
    mutationFn: () => syncLogs(),
    onSuccess: () => {
      for (const key of dataQueryKeys) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}
