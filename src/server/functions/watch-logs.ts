import { createServerFn } from '@tanstack/react-start'

/**
 * Exposes the module-level chokidar watcher state to the client. The
 * watcher itself lives in `~/server/claude-logs/watcher.ts`; importing it
 * dynamically here keeps chokidar out of the browser bundle even though
 * this file is shipped to the client as a server-function stub.
 */
export const getWatcherState = createServerFn({ method: 'GET' }).handler(async () => {
  const { getWatcherSnapshot } = await import('~/server/claude-logs/watcher')
  return getWatcherSnapshot()
})

/**
 * Long-poll variant: blocks up to ~25 seconds waiting for the watcher
 * tick count to advance past `sinceCount`. Used by the client to get
 * near-real-time sync triggers without a dedicated SSE endpoint — when
 * a file changes, the server resolves this call immediately; otherwise
 * it times out and the client re-subscribes.
 */
export const waitForWatcherChange = createServerFn({ method: 'POST' })
  .inputValidator((data: { sinceCount: number }) => data)
  .handler(async ({ data }) => {
    const { waitForChange, getWatcherSnapshot } = await import(
      '~/server/claude-logs/watcher'
    )
    const count = await waitForChange(data.sinceCount)
    const snapshot = getWatcherSnapshot()
    return {
      changeCount: count,
      lastChangeAt: snapshot.lastChangeAt,
      initialized: snapshot.initialized,
      error: snapshot.error,
    }
  })
