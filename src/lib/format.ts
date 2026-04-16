/**
 * Formatting utilities for tokens, costs, and dates
 */

export function formatTokens(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return count.toLocaleString()
}

export function formatCost(usd: number): string {
  if (usd >= 1000) return `$${usd.toFixed(0)}`
  if (usd >= 100) return `$${usd.toFixed(1)}`
  if (usd >= 1) return `$${usd.toFixed(2)}`
  if (usd >= 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(4)}`
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

/**
 * Adapter for Recharts <Tooltip formatter>. Recharts' formatter signature
 * is `(value: ValueType | undefined, …) => ReactNode | [ReactNode, ReactNode]`
 * which forces an `undefined` check at every call site. Our formatters only
 * ever receive numbers, so this helper coerces undefined/strings to 0 and
 * returns a signature Recharts accepts without type gymnastics.
 */
export function rechartsFmt<T>(fn: (value: number, name?: string) => T) {
  return ((value: unknown, name?: unknown) =>
    fn(typeof value === 'number' ? value : Number(value ?? 0), typeof name === 'string' ? name : undefined)) as never
}

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
