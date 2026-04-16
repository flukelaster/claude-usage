import { TrendingUp, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { useBudget } from '~/hooks/useBudget'
import { formatCost } from '~/lib/format'

/**
 * Inline banner that shows monthly budget usage. Renders nothing when no
 * budget is configured, so it's safe to drop in on any dashboard page.
 */
export function BudgetProgress() {
  const { data } = useBudget()
  if (!data) return null
  if (data.status === 'untracked') return null

  const pct = Math.max(0, Math.min(1, data.percentUsed ?? 0))
  const barColor =
    data.status === 'exceeded'
      ? '#b53333'
      : data.status === 'warning'
      ? 'var(--color-primary)'
      : '#5e5d59'

  const icon =
    data.status === 'exceeded' ? (
      <XCircle size={18} style={{ color: '#b53333' }} />
    ) : data.status === 'warning' ? (
      <AlertTriangle size={18} style={{ color: 'var(--color-primary)' }} />
    ) : (
      <CheckCircle2 size={18} style={{ color: 'var(--color-muted-foreground)' }} />
    )

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        boxShadow: '0px 0px 0px 1px var(--color-border)',
      }}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">
          Monthly budget &middot; {formatCost(data.spentUsd)} of{' '}
          {formatCost(data.budgetUsd ?? 0)}
        </span>
        <span
          className="ml-auto flex items-center gap-1 text-xs"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          <TrendingUp size={12} />
          Projected {formatCost(data.projectedUsd)}
        </span>
      </div>
      <div
        className="mt-3 h-2 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-secondary)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.round(pct * 100)}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
      <div
        className="mt-2 flex items-center justify-between text-xs"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        <span>
          {data.daysElapsed} of {data.daysElapsed + data.daysRemaining} days elapsed
        </span>
        <span>
          {data.remainingUsd !== null && data.remainingUsd >= 0
            ? `${formatCost(data.remainingUsd)} remaining`
            : `${formatCost(Math.abs(data.remainingUsd ?? 0))} over budget`}
        </span>
      </div>
    </div>
  )
}
