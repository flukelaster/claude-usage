import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { syncLogs, getLastSyncTime } from '~/server/functions/sync-logs'
import { useToast } from '~/components/ui/toast'
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
 * Emits a toast on completion so the user sees confirmation without the
 * old inline banner lingering on the page.
 */
export function useSyncLogs() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation<SyncResult>({
    mutationFn: () => syncLogs(),
    onSuccess: (result) => {
      for (const key of dataQueryKeys) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
      const hasErrors = result.errors > 0
      toast.push({
        variant: hasErrors ? 'warning' : 'success',
        title: `Synced ${result.filesProcessed} file${result.filesProcessed === 1 ? '' : 's'}`,
        description: hasErrors
          ? `${result.messagesAdded} messages added · ${result.errors} error${result.errors === 1 ? '' : 's'}`
          : `${result.messagesAdded} messages added in ${(result.durationMs / 1000).toFixed(1)}s`,
      })
    },
    onError: (err) => {
      toast.push({
        variant: 'error',
        title: 'Sync failed',
        description: err instanceof Error ? err.message : String(err),
      })
    },
  })
}
