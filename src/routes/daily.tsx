import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CalendarDays } from 'lucide-react'

import { useDailyUsage } from '~/hooks/useDailyUsage'
import { formatCost } from '~/lib/format'
import { PeriodFilter, getPeriodLabel, type Period } from '~/components/period-filter'
import { Card } from '~/components/ui/card'
import { EmptyState } from '~/components/ui/empty-state'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'

export const Route = createFileRoute('/daily')({
  component: DailyPage,
})

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function DailyPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const { data, isLoading } = useDailyUsage(period)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Daily Usage</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            {data ? getPeriodLabel(data.days) : 'Loading…'} — like{' '}
            <code
              className="rounded px-1.5 py-0.5 text-xs"
              style={{
                backgroundColor: 'var(--color-secondary)',
                color: 'var(--color-secondary-foreground)',
              }}
            >
              ccusage daily
            </code>
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {isLoading && <LoadingSkeleton cols={1} height={320} />}

      {data && data.daily.length === 0 && (
        <EmptyState
          title="No usage yet"
          description="Sync your Claude Code logs to populate the daily breakdown."
          icon={<CalendarDays size={28} />}
        />
      )}

      {data && data.daily.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  <th className="py-2 font-normal">Date</th>
                  <th className="py-2 font-normal">Models</th>
                  <th className="py-2 font-normal text-right">Input</th>
                  <th className="py-2 font-normal text-right">Output</th>
                  <th className="py-2 font-normal text-right">Cache Create</th>
                  <th className="py-2 font-normal text-right">Cache Read</th>
                  <th className="py-2 font-normal text-right">Total Tokens</th>
                  <th className="py-2 font-normal text-right">Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr
                    key={d.date}
                    className="border-t"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="py-2 font-medium whitespace-nowrap">{d.date}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {d.models.map((m) => (
                          <span
                            key={m}
                            className="inline-block rounded px-1.5 py-0.5 text-xs"
                            style={{
                              backgroundColor: 'var(--color-secondary)',
                              color: 'var(--color-secondary-foreground)',
                            }}
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td
                      className="py-2 text-right tabular-nums"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      {formatNumber(d.inputTokens)}
                    </td>
                    <td
                      className="py-2 text-right tabular-nums"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      {formatNumber(d.outputTokens)}
                    </td>
                    <td
                      className="py-2 text-right tabular-nums"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      {formatNumber(d.cacheCreationTokens)}
                    </td>
                    <td
                      className="py-2 text-right tabular-nums"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      {formatNumber(d.cacheReadTokens)}
                    </td>
                    <td
                      className="py-2 text-right tabular-nums"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      {formatNumber(d.totalTokens)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatCost(d.totalCost)}
                    </td>
                  </tr>
                ))}
                <tr
                  className="border-t"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-secondary)',
                  }}
                >
                  <td
                    className="py-2 font-medium"
                    style={{ fontFamily: 'Georgia, serif' }}
                  >
                    Total
                  </td>
                  <td className="py-2" />
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatNumber(data.totals.inputTokens)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatNumber(data.totals.outputTokens)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatNumber(data.totals.cacheCreationTokens)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatNumber(data.totals.cacheReadTokens)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatNumber(data.totals.totalTokens)}
                  </td>
                  <td
                    className="py-2 text-right tabular-nums font-medium"
                    style={{
                      color: 'var(--color-primary)',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    {formatCost(data.totals.totalCost)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
