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
