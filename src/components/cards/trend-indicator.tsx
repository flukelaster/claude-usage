import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface TrendIndicatorProps {
  direction: 'increasing' | 'decreasing' | 'stable'
  label?: string
  percent?: number
}

/**
 * Small inline badge showing up/down/stable with an optional percentage.
 * Colors are neutral by default — the direction conveys meaning, not
 * good-vs-bad (an "increasing cost" and "increasing savings" are
 * rendered the same).
 */
export function TrendIndicator({ direction, label, percent }: TrendIndicatorProps) {
  const Icon =
    direction === 'increasing' ? TrendingUp : direction === 'decreasing' ? TrendingDown : Minus
  const color =
    direction === 'increasing'
      ? 'var(--color-primary)'
      : direction === 'decreasing'
      ? '#5e5d59'
      : 'var(--color-muted-foreground)'

  return (
    <span
      className="inline-flex items-center gap-1 text-xs tabular-nums"
      style={{ color }}
    >
      <Icon size={12} />
      {label}
      {percent !== undefined && (
        <span>
          {percent >= 0 ? '+' : ''}
          {percent.toFixed(1)}%
        </span>
      )}
    </span>
  )
}
