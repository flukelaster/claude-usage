import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWatcherState } from '~/server/functions/watch-logs'
import { useSyncLogs } from './useSync'

const WATCHER_POLL_MS = 5_000

/**
 * Polls the server-side chokidar watcher state and kicks off a sync
 * whenever the watcher reports that new JSONL data has landed. The hook
 * is safe to call once at the app root — the underlying mutation dedups
 * concurrent syncs via TanStack Query, and the watcher itself is a
 * module-level singleton.
 */
export function useAutoSync(enabled = true) {
  const sync = useSyncLogs()
  const lastSeenCount = useRef<number | null>(null)

  const watcher = useQuery({
    queryKey: ['watcherState'],
    queryFn: () => getWatcherState(),
    refetchInterval: enabled ? WATCHER_POLL_MS : false,
    refetchOnWindowFocus: enabled,
    enabled,
  })

  useEffect(() => {
    if (!enabled) return
    const snapshot = watcher.data
    if (!snapshot) return

    if (lastSeenCount.current === null) {
      lastSeenCount.current = snapshot.changeCount
      return
    }

    if (snapshot.changeCount > lastSeenCount.current && !sync.isPending) {
      lastSeenCount.current = snapshot.changeCount
      sync.mutate()
    }
  }, [watcher.data, enabled, sync])

  return {
    watcherReady: watcher.data?.initialized ?? false,
    watcherError: watcher.data?.error ?? null,
    isSyncing: sync.isPending,
    lastSyncResult: sync.data,
  }
}
