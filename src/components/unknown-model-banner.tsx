import { AlertTriangle } from 'lucide-react'
import { useUnknownModels } from '~/hooks/useUnknownModels'

/**
 * Shown above settings / overview pages when the database contains model
 * identifiers that aren't in the hard-coded PRICING table. Those rows use
 * a fallback rate, so cost estimates for them are less accurate until
 * someone updates `src/lib/pricing.ts`.
 */
export function UnknownModelBanner() {
  const { data } = useUnknownModels()
  if (!data || data.length === 0) return null

  return (
    <div
      className="rounded-lg p-4 flex items-start gap-3"
      style={{
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        boxShadow: '0px 0px 0px 1px var(--color-border)',
      }}
    >
      <AlertTriangle
        size={20}
        style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 2 }}
      />
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
          {data.length} unknown model{data.length > 1 ? 's' : ''} detected
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          Cost estimates for these models fall back to the default rate. Update{' '}
          <code className="text-xs px-1 rounded" style={{ backgroundColor: 'var(--color-secondary)' }}>
            src/lib/pricing.ts
          </code>{' '}
          to get accurate pricing.
        </p>
        <ul className="mt-2 text-xs space-y-0.5">
          {data.slice(0, 5).map((m) => (
            <li key={m.model} style={{ color: 'var(--color-muted-foreground)' }}>
              <code>{m.model}</code> — {m.messageCount.toLocaleString()} messages
            </li>
          ))}
          {data.length > 5 && (
            <li style={{ color: 'var(--color-muted-foreground)' }}>
              …and {data.length - 5} more
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
