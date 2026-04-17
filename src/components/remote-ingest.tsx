import { useState } from 'react'
import { Copy, Eye, EyeOff, RefreshCw, Server, Check } from 'lucide-react'
import { formatRelativeTime } from '~/lib/format'
import {
  useIngestApiKey,
  useRegenerateIngestApiKey,
  useConnectedMachines,
} from '~/hooks/useAppSettings'

/**
 * UI for the remote-ingest feature: shows the bearer token remote
 * agents must present, lists machines that have uploaded data, and
 * offers a regenerate button (which invalidates every running agent).
 */
export function RemoteIngest() {
  const { data: key } = useIngestApiKey()
  const regen = useRegenerateIngestApiKey()
  const { data: machines } = useConnectedMachines()

  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyKey() {
    if (!key?.apiKey) return
    try {
      await navigator.clipboard.writeText(key.apiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (insecure context / Firefox without
      // permission). Fall back to showing the key so the user can
      // select-and-copy manually.
      setShown(true)
    }
  }

  async function onRegenerate() {
    if (!confirm('Regenerate the API key? All running agents will stop ingesting until their .env files are updated.')) return
    regen.mutate()
  }

  return (
    <div
      className="rounded-lg p-6"
      style={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h3 className="text-lg flex items-center gap-2">
            <Server size={16} />
            Remote Ingest
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
            Run <code className="font-mono">pnpm agent</code> on your other machines to stream their
            Claude Code logs here. They authenticate with the key below.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)' }}>
            API key
          </label>
          <div className="mt-1 flex items-center gap-2">
            <code
              className="flex-1 rounded-md px-3 py-2 text-sm font-mono truncate"
              style={{
                backgroundColor: 'var(--color-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {key?.apiKey
                ? shown
                  ? key.apiKey
                  : '•'.repeat(Math.min(44, key.apiKey.length))
                : 'loading…'}
            </code>
            <button
              type="button"
              onClick={() => setShown((s) => !s)}
              className="rounded-md p-2 text-sm"
              style={{ backgroundColor: 'var(--color-secondary)', border: '1px solid var(--color-border)' }}
              title={shown ? 'Hide' : 'Reveal'}
            >
              {shown ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              onClick={copyKey}
              disabled={!key?.apiKey}
              className="rounded-md p-2 text-sm"
              style={{ backgroundColor: 'var(--color-secondary)', border: '1px solid var(--color-border)' }}
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regen.isPending}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--color-secondary)', border: '1px solid var(--color-border)' }}
            >
              <RefreshCw size={14} className={regen.isPending ? 'animate-spin' : ''} />
              Regenerate
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--color-muted-foreground)' }}>
            Connected machines
          </p>
          {machines && machines.length > 0 ? (
            <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {machines.map((m) => (
                <li key={m.machineId} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono">{m.machineId}</span>
                  <span style={{ color: 'var(--color-muted-foreground)' }}>
                    {m.sessionCount} session{m.sessionCount === 1 ? '' : 's'}
                    {m.lastSeenAt ? ` · ${formatRelativeTime(new Date(m.lastSeenAt))}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              No remote data yet. Set <code className="font-mono">SERVER_URL</code> and{' '}
              <code className="font-mono">API_KEY</code> on another machine, then run{' '}
              <code className="font-mono">pnpm agent</code>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
