import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWatcherState, waitForWatcherChange } from '~/server/functions/watch-logs'
import { useSyncLogs } from './useSync'

/**
 * Near-real-time auto-sync. We prime the state with a single
 * `getWatcherState()` call to get the current tick count, then fire a
 * chain of long-poll `waitForWatcherChange()` requests — each resolves
 * the moment chokidar sees a file change, or after ~25s timeout.
 *
 * Long poll > polling: median latency drops from half the poll interval
 * to effectively zero, and network chatter goes to zero while the
 * filesystem is idle.
 *
 * Falls back to cheap polling if the watcher errors out or long poll
 * keeps throwing (e.g. in dev when the server restarts).
 */
export function useAutoSync(enabled = true) {
  const sync = useSyncLogs()
  const lastSeenCount = useRef<number | null>(null)
  const errorCountRef = useRef(0)
  const [pollFallback, setPollFallback] = useState(false)

  // Prime — also updates when the tab returns to focus.
  const primeQuery = useQuery({
    queryKey: ['watcherState', 'prime'],
    queryFn: () => getWatcherState(),
    refetchOnWindowFocus: enabled,
    enabled,
    refetchInterval: pollFallback && enabled ? 5_000 : false,
  })

  // Drive a chain of long-poll subscriptions. The effect kicks off one
  // request; when it resolves, state change triggers the next.
  const [tickGeneration, bumpTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    if (pollFallback) return

    const initial = primeQuery.data
    if (!initial) return

    if (lastSeenCount.current === null) {
      lastSeenCount.current = initial.changeCount
    }

    let cancelled = false
    ;(async () => {
      try {
        const result = await waitForWatcherChange({
          data: { sinceCount: lastSeenCount.current ?? 0 },
        })
        if (cancelled) return
        errorCountRef.current = 0
        if (result.changeCount > (lastSeenCount.current ?? 0)) {
          lastSeenCount.current = result.changeCount
          if (!sync.isPending) sync.mutate()
        }
        // Schedule the next wait regardless — each call returns either
        // a real change or a timeout, both are cues to re-subscribe.
        bumpTick((n) => n + 1)
      } catch {
        if (cancelled) return
        errorCountRef.current += 1
        if (errorCountRef.current >= 3) {
          // Too many failed long polls; drop back to plain polling so
          // users still get eventual updates.
          setPollFallback(true)
        } else {
          // Gentle backoff before retrying.
          setTimeout(() => bumpTick((n) => n + 1), 2_000)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, pollFallback, tickGeneration, primeQuery.data, sync])

  // Fallback polling: compare snapshot to last seen.
  useEffect(() => {
    if (!pollFallback || !enabled) return
    const snapshot = primeQuery.data
    if (!snapshot) return
    if (lastSeenCount.current === null) {
      lastSeenCount.current = snapshot.changeCount
      return
    }
    if (snapshot.changeCount > lastSeenCount.current && !sync.isPending) {
      lastSeenCount.current = snapshot.changeCount
      sync.mutate()
    }
  }, [pollFallback, enabled, primeQuery.data, sync])

  return {
    watcherReady: primeQuery.data?.initialized ?? false,
    watcherError: primeQuery.data?.error ?? null,
    isSyncing: sync.isPending,
    lastSyncResult: sync.data,
    mode: pollFallback ? ('poll' as const) : ('long-poll' as const),
  }
}
