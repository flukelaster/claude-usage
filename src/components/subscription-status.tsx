import { Link } from '@tanstack/react-router'
import { Zap, AlertTriangle } from 'lucide-react'
import { useSubscription } from '~/hooks/useSubscription'
import { formatTokens } from '~/lib/format'
import type { WindowUsage } from '~/server/functions/get-subscription'

/**
 * Banner that shows rolling-window subscription usage. Hides itself when
 * the user is on the pay-per-token plan so the existing dollar-cost
 * dashboard stays the default view.
 */
export function SubscriptionStatus({ compact = false }: { compact?: boolean }) {
  const { data } = useSubscription()
  if (!data) return null
  if (data.plan.id === 'none') return null

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        boxShadow: '0px 0px 0px 1px var(--color-border)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={16} style={{ color: 'var(--color-primary)' }} />
          <span className="text-sm font-medium">{data.plan.name}</span>
        </div>
        {!compact && (
          <Link
            to="/subscription"
            className="text-xs hover:underline"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Details →
          </Link>
        )}
      </div>
      <div className={`grid gap-3 ${data.weekly ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <WindowBar window={data.fiveHour} />
        {data.weekly && <WindowBar window={data.weekly} />}
      </div>
    </div>
  )
}

function WindowBar({ window: w }: { window: WindowUsage }) {
  const pct = w.utilizationPercent ?? 0
  const level = pct >= 1 ? 'exceeded' : pct >= 0.8 ? 'warning' : 'ok'
  const color =
    level === 'exceeded'
      ? '#b53333'
      : level === 'warning'
      ? 'var(--color-primary)'
      : '#5e5d59'

  const pctLabel = w.utilizationPercent !== null
    ? `${Math.round(pct * 100)}%`
    : '—'

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span style={{ color: 'var(--color-muted-foreground)' }}>
          {w.label}
        </span>
        <span className="flex items-center gap-1 tabular-nums" style={{ color }}>
          {level === 'exceeded' && <AlertTriangle size={11} />}
          {pctLabel}
        </span>
      </div>
      <div
        className="h-2 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-secondary)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, pct * 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <div
        className="mt-1 flex items-center justify-between text-[11px]"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        <span>
          {formatTokens(w.inputTokens)} in · {formatTokens(w.outputTokens)} out
        </span>
        {w.resetsAt && (
          <span>
            resets {new Date(w.resetsAt).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>
    </div>
  )
}
