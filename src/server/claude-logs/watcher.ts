import type { FSWatcher } from 'chokidar'
import { getClaudeProjectsDir } from './paths'

/**
 * Module-level singleton chokidar watcher. The dashboard doesn't need
 * per-connection watchers — one process-wide watcher updates an in-memory
 * counter, and the client polls that counter to decide when to re-sync.
 *
 * Lazy-initialized on the first call to `ensureWatcher()` so importing
 * this file for its types (or in non-Node contexts) stays cheap.
 */

interface WatcherState {
  initialized: boolean
  lastChangeAt: string | null
  changeCount: number
  startedAt: string | null
  error: string | null
}

const state: WatcherState = {
  initialized: false,
  lastChangeAt: null,
  changeCount: 0,
  startedAt: null,
  error: null,
}

// Pending long-poll subscribers — each wants to be told the moment the
// changeCount advances past their `sinceCount`. Resolving fires the
// current count and drops the subscriber; the server function layer
// re-subscribes for the next update.
type Subscriber = { sinceCount: number; resolve: (count: number) => void }
const subscribers = new Set<Subscriber>()

let watcher: FSWatcher | null = null
let startPromise: Promise<void> | null = null

function fanOut() {
  for (const sub of subscribers) {
    if (state.changeCount > sub.sinceCount) {
      sub.resolve(state.changeCount)
      subscribers.delete(sub)
    }
  }
}

async function startWatcher(): Promise<void> {
  if (watcher) return
  try {
    const { watch } = await import('chokidar')
    const dir = getClaudeProjectsDir()
    watcher = watch(`${dir}/**/*.jsonl`, {
      ignoreInitial: true,
      persistent: true,
      // Limit scope to keep the watcher cheap on large home directories.
      depth: 4,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    })

    const bump = () => {
      state.lastChangeAt = new Date().toISOString()
      state.changeCount += 1
      fanOut()
    }

    watcher.on('add', bump)
    watcher.on('change', bump)
    watcher.on('unlink', bump)
    watcher.on('error', (err) => {
      state.error = err instanceof Error ? err.message : String(err)
    })

    state.initialized = true
    state.startedAt = new Date().toISOString()
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
    throw err
  }
}

export function ensureWatcher(): void {
  if (state.initialized || startPromise) return
  startPromise = startWatcher().catch(() => {
    // Error already stored in state.error; swallow so the caller can read
    // state without a rejection slipping through.
  })
}

export function getWatcherSnapshot() {
  ensureWatcher()
  return {
    initialized: state.initialized,
    lastChangeAt: state.lastChangeAt,
    changeCount: state.changeCount,
    startedAt: state.startedAt,
    error: state.error,
  }
}

/**
 * Long-poll for a watcher change. Resolves as soon as the watcher tick
 * count exceeds `sinceCount`, or after `timeoutMs` with the current
 * count — whichever comes first. The caller re-subscribes after each
 * resolution, giving near-real-time sync triggers without SSE.
 */
export function waitForChange(sinceCount: number, timeoutMs = 25_000): Promise<number> {
  ensureWatcher()

  if (state.changeCount > sinceCount) {
    return Promise.resolve(state.changeCount)
  }

  return new Promise<number>((resolve) => {
    const sub: Subscriber = { sinceCount, resolve }
    subscribers.add(sub)

    const timer = setTimeout(() => {
      subscribers.delete(sub)
      resolve(state.changeCount)
    }, timeoutMs)

    // Wrap resolve to clear the timeout when delivered via fanOut.
    sub.resolve = (count: number) => {
      clearTimeout(timer)
      resolve(count)
    }
  })
}
