import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Webhook, CheckCircle2, XCircle, Trash2, Send } from 'lucide-react'

import {
  useWebhookList,
  useAvailableWebhookEvents,
  useCreateWebhook,
  useDeleteWebhook,
  useUpdateWebhook,
  useSendTestWebhook,
  useWebhookDeliveries,
} from '~/hooks/useWebhooks'
import { Card } from '~/components/ui/card'
import { EmptyState } from '~/components/ui/empty-state'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { DataTable } from '~/components/tables/data-table'

export const Route = createFileRoute('/webhooks')({
  component: WebhooksPage,
})

const EVENT_LABELS: Record<string, string> = {
  'budget.warning': 'Budget at 80%',
  'budget.exceeded': 'Budget exceeded',
  'subscription.warning': 'Subscription at 80%',
  'subscription.exceeded': 'Subscription exceeded',
  'anomaly.detected': 'Cost anomaly',
  'sync.failed': 'Sync failed',
  'sync.completed': 'Sync completed (verbose)',
}

function WebhooksPage() {
  const { data: hooks, isLoading } = useWebhookList()
  const { data: deliveries } = useWebhookDeliveries()
  const { data: availableEvents } = useAvailableWebhookEvents()
  const create = useCreateWebhook()
  const update = useUpdateWebhook()
  const del = useDeleteWebhook()
  const test = useSendTestWebhook()

  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [secret, setSecret] = useState('')
  const [events, setEvents] = useState<Set<string>>(
    () => new Set(['budget.exceeded', 'subscription.exceeded', 'anomaly.detected', 'sync.failed']),
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    create.mutate(
      {
        url: url.trim(),
        label: label.trim() || null,
        events: [...events],
        secret: secret.trim() || null,
        enabled: true,
      },
      {
        onSuccess: () => {
          setUrl('')
          setLabel('')
          setSecret('')
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl">Webhooks</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          POST notifications to an external URL when the dashboard crosses a
          threshold. Add a Slack/Discord incoming webhook, a custom receiver,
          or anything that speaks HTTP.
        </p>
      </div>

      <Card title="Add webhook">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="URL">
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://hooks.example.com/…"
                className="input"
                style={inputStyle}
              />
            </Field>
            <Field label="Label (optional)">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Team Slack"
                style={inputStyle}
              />
            </Field>
          </div>
          <Field label="Signing secret (optional — enables HMAC-SHA256 headers)">
            <input
              type="text"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="leave blank to skip signing"
              style={inputStyle}
            />
          </Field>
          <Field label="Events">
            <div className="flex flex-wrap gap-2">
              {(availableEvents ?? []).map((ev) => {
                const checked = events.has(ev)
                return (
                  <label
                    key={ev}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs cursor-pointer select-none"
                    style={{
                      backgroundColor: checked
                        ? 'var(--color-primary)'
                        : 'var(--color-secondary)',
                      color: checked
                        ? 'var(--color-primary-foreground)'
                        : 'var(--color-foreground)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        setEvents((prev) => {
                          const next = new Set(prev)
                          if (next.has(ev)) next.delete(ev)
                          else next.add(ev)
                          return next
                        })
                      }
                    />
                    {EVENT_LABELS[ev] ?? ev}
                  </label>
                )
              })}
            </div>
          </Field>
          <button
            type="submit"
            disabled={create.isPending || events.size === 0 || !url}
            className="rounded-md px-4 py-1.5 text-sm"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)',
            }}
          >
            {create.isPending ? 'Saving…' : 'Add webhook'}
          </button>
          {create.isError && (
            <p className="text-xs" style={{ color: '#b53333' }}>
              {create.error?.message}
            </p>
          )}
        </form>
      </Card>

      {isLoading && <LoadingSkeleton cols={1} height={180} />}

      {!isLoading && (!hooks || hooks.length === 0) && (
        <EmptyState
          title="No webhooks yet"
          description="Add one above. The next sync will fire configured events."
          icon={<Webhook size={28} />}
        />
      )}

      {hooks && hooks.length > 0 && (
        <Card title={`${hooks.length} Webhook${hooks.length === 1 ? '' : 's'}`}>
          <ul className="space-y-3">
            {hooks.map((h) => (
              <li
                key={h.id}
                className="rounded-md p-3"
                style={{
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {h.label || h.url}
                    </p>
                    {h.label && (
                      <p
                        className="text-xs truncate"
                        style={{ color: 'var(--color-muted-foreground)' }}
                      >
                        {h.url}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {h.events.map((ev) => (
                        <span
                          key={ev}
                          className="text-[10px] rounded-full px-2 py-0.5"
                          style={{
                            backgroundColor: 'var(--color-secondary)',
                          }}
                        >
                          {EVENT_LABELS[ev] ?? ev}
                        </span>
                      ))}
                    </div>
                    {h.lastError && (
                      <p
                        className="mt-2 text-xs flex items-center gap-1"
                        style={{ color: '#b53333' }}
                      >
                        <XCircle size={12} />
                        Last error: {h.lastError}
                      </p>
                    )}
                    {h.lastDeliveredAt && !h.lastError && (
                      <p
                        className="mt-2 text-xs flex items-center gap-1"
                        style={{ color: 'var(--color-muted-foreground)' }}
                      >
                        <CheckCircle2 size={12} />
                        Last delivered {new Date(h.lastDeliveredAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={h.enabled}
                        onChange={(e) =>
                          update.mutate({ id: h.id, enabled: e.target.checked })
                        }
                      />
                      Enabled
                    </label>
                    <button
                      type="button"
                      onClick={() => test.mutate(h.id)}
                      disabled={test.isPending}
                      className="text-xs inline-flex items-center gap-1 rounded-md px-2 py-1"
                      style={{
                        backgroundColor: 'var(--color-secondary)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <Send size={11} />
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete webhook ${h.label || h.url}?`)) del.mutate(h.id)
                      }}
                      className="text-xs inline-flex items-center gap-1 rounded-md px-2 py-1"
                      style={{
                        color: '#b53333',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <Trash2 size={11} />
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {deliveries && deliveries.length > 0 && (
        <Card title="Recent delivery log">
          <DataTable
            rowKey={(d) => d.id}
            rows={deliveries}
            columns={[
              {
                key: 'ok',
                header: '',
                cell: (d) =>
                  d.ok ? (
                    <CheckCircle2 size={14} style={{ color: '#5e5d59' }} />
                  ) : (
                    <XCircle size={14} style={{ color: '#b53333' }} />
                  ),
              },
              {
                key: 'event',
                header: 'Event',
                cell: (d) => EVENT_LABELS[d.event] ?? d.event,
              },
              {
                key: 'at',
                header: 'When',
                cell: (d) => (
                  <span style={{ color: 'var(--color-muted-foreground)' }}>
                    {new Date(d.attemptedAt).toLocaleString()}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                align: 'right',
                cell: (d) => (
                  <span
                    className="tabular-nums"
                    style={{ color: 'var(--color-muted-foreground)' }}
                  >
                    {d.status ?? '—'}
                  </span>
                ),
              },
              {
                key: 'dur',
                header: 'Duration',
                align: 'right',
                cell: (d) => (
                  <span
                    className="tabular-nums"
                    style={{ color: 'var(--color-muted-foreground)' }}
                  >
                    {d.durationMs !== null ? `${d.durationMs}ms` : '—'}
                  </span>
                ),
              },
              {
                key: 'err',
                header: 'Error',
                cell: (d) => (
                  <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                    {d.error ?? ''}
                  </span>
                ),
              },
            ]}
          />
        </Card>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
  width: '100%',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="block text-xs mb-1"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}
