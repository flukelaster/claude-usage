import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { Maximize2 } from 'lucide-react'

import { useContextUtilization } from '~/hooks/useContextUtilization'
import { formatTokens, rechartsFmt} from '~/lib/format'
import { getModelDisplayName } from '~/lib/pricing'
import { PeriodFilter, getPeriodLabel, type Period } from '~/components/period-filter'
import { Card } from '~/components/ui/card'
import { KpiGrid } from '~/components/cards/kpi-grid'
import { EmptyState } from '~/components/ui/empty-state'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { DataTable } from '~/components/tables/data-table'

export const Route = createFileRoute('/context')({
  component: ContextUtilizationPage,
})

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

const bucketColor = (pct: number) =>
  pct >= 0.9 ? '#b53333' : pct >= 0.75 ? '#c96442' : pct >= 0.5 ? '#d97757' : '#87867f'

function ContextUtilizationPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const { data, isLoading } = useContextUtilization(period)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Context Window</h2>
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            {data ? getPeriodLabel(data.days) : 'Loading…'} — estimated turn
            fill against each model&apos;s max context
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {isLoading && <LoadingSkeleton cols={3} height={120} />}

      {data && data.totalMessages === 0 && (
        <EmptyState
          title="No data to analyze"
          description="Context utilization is computed per assistant turn. Sync some sessions first."
          icon={<Maximize2 size={28} />}
        />
      )}

      {data && data.totalMessages > 0 && (
        <>
          <KpiGrid
            columns={3}
            items={[
              {
                label: 'Mean utilization',
                value: `${(data.meanUtilization * 100).toFixed(1)}%`,
              },
              {
                label: '95th percentile',
                value: `${(data.p95Utilization * 100).toFixed(1)}%`,
              },
              {
                label: 'Scored messages',
                value: data.totalMessages.toLocaleString(),
              },
            ]}
          />

          <Card title="Utilization Distribution">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
                />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={rechartsFmt((value) => [value.toLocaleString(), 'Messages'])}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.buckets.map((b, i) => (
                    <Cell key={i} fill={bucketColor(b.min)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p
              className="mt-2 text-xs"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              Turns in the rightmost bucket exceeded the published window, which
              usually means the model ran with a larger context extension or the
              max-window table needs updating.
            </p>
          </Card>

          <Card title="Daily Utilization Trend">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.dailyAverage}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={rechartsFmt((value, name) => [
                    `${(value * 100).toFixed(1)}%`,
                    name === 'avgUtilization' ? 'Avg' : 'Peak',
                  ])}
                />
                <ReferenceLine y={0.75} stroke="#c96442" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="avgUtilization"
                  stroke="#87867f"
                  strokeWidth={2}
                  dot={false}
                  name="avgUtilization"
                />
                <Line
                  type="monotone"
                  dataKey="maxUtilization"
                  stroke="#c96442"
                  strokeWidth={2}
                  dot={false}
                  name="maxUtilization"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title={`Sessions Near the Window (${data.nearLimit.length})`}>
            {data.nearLimit.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                No session exceeded 75% of its model&apos;s window in this period.
              </p>
            ) : (
              <DataTable
                rowKey={(r) => r.id}
                rows={data.nearLimit}
                columns={[
                  {
                    key: 'title',
                    header: 'Session',
                    cell: (s) => (
                      <Link
                        to="/sessions/$sessionId"
                        params={{ sessionId: s.id }}
                        className="hover:underline"
                        style={{ color: 'var(--color-foreground)' }}
                      >
                        {s.title || s.slug || s.id.slice(0, 10)}
                      </Link>
                    ),
                  },
                  {
                    key: 'project',
                    header: 'Project',
                    cell: (s) => (
                      <span style={{ color: 'var(--color-muted-foreground)' }}>
                        {s.projectName}
                      </span>
                    ),
                  },
                  {
                    key: 'model',
                    header: 'Model',
                    cell: (s) => (
                      <span style={{ color: 'var(--color-muted-foreground)' }}>
                        {getModelDisplayName(s.model)}
                      </span>
                    ),
                  },
                  {
                    key: 'peak',
                    header: 'Peak tokens',
                    align: 'right',
                    cell: (s) => (
                      <span className="tabular-nums">
                        {formatTokens(s.peakTokens)}
                      </span>
                    ),
                  },
                  {
                    key: 'util',
                    header: 'Max util',
                    align: 'right',
                    cell: (s) => (
                      <span
                        className="font-medium tabular-nums"
                        style={{ color: bucketColor(s.maxUtilization) }}
                      >
                        {(s.maxUtilization * 100).toFixed(0)}%
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}
    </div>
  )
}
