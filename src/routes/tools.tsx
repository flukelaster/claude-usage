import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Hammer } from 'lucide-react'
import { useTools } from '~/hooks/useTools'
import { PeriodFilter, getPeriodLabel, type Period } from '~/components/period-filter'
import { Card } from '~/components/ui/card'
import { EmptyState } from '~/components/ui/empty-state'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { formatCost, rechartsFmt} from '~/lib/format'

export const Route = createFileRoute('/tools')({
  component: ToolsPage,
})

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

const chartColors = ['#c96442', '#d97757', '#87867f', '#5e5d59', '#b0aea5']

function ToolsPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const { data, isLoading } = useTools(period)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Tool Use</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            {getPeriodLabel(data?.days ?? (period === 'all' ? null : period === '30d' ? 30 : 90))}
            {data ? ` · ${data.totalCalls.toLocaleString()} total calls` : ''}
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {isLoading && <LoadingSkeleton cols={3} height={140} />}

      {data && data.totalCalls === 0 && (
        <EmptyState
          title="No tool calls yet"
          description="Sync your logs or wait for the next assistant turn that invokes a tool."
          icon={<Hammer size={28} />}
        />
      )}

      {data && data.totalCalls > 0 && (
        <>
          <Card title="Top Tools by Call Count">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.perTool.slice(0, 12)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }} />
                <YAxis
                  dataKey="toolName"
                  type="category"
                  width={120}
                  tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={rechartsFmt((v) => [v.toLocaleString(), 'Calls'])}
                />
                <Bar dataKey="callCount" radius={[0, 4, 4, 0]}>
                  {data.perTool.slice(0, 12).map((_, i) => (
                    <Cell key={i} fill={chartColors[i % chartColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-2 gap-6">
            <Card title="Attributed Cost by Tool">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.perTool.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
                  <XAxis dataKey="toolName" tick={{ fontSize: 10, fill: 'var(--color-chart-tick)' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
                    tickFormatter={(v) => formatCost(v)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={rechartsFmt((v) => [formatCost(v), 'Attributed cost'])}
                  />
                  <Bar dataKey="attributedCost" fill="#c96442" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p
                className="mt-2 text-xs"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                Parent-message cost split evenly across its tool calls.
              </p>
            </Card>

            <Card title="Daily Calls">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={rechartsFmt((v) => [v.toLocaleString(), 'Calls'])}
                  />
                  <Bar dataKey="callCount" fill="#87867f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title="Full Tool Breakdown">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left text-xs"
                    style={{ color: 'var(--color-muted-foreground)' }}
                  >
                    <th className="py-2 font-normal">Tool</th>
                    <th className="py-2 font-normal text-right">Calls</th>
                    <th className="py-2 font-normal text-right">Share</th>
                    <th className="py-2 font-normal text-right">Avg Input Size</th>
                    <th className="py-2 font-normal text-right">Attributed Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perTool.map((t) => (
                    <tr
                      key={t.toolName}
                      className="border-t"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <td className="py-2 font-medium">{t.toolName}</td>
                      <td className="py-2 text-right tabular-nums">
                        {t.callCount.toLocaleString()}
                      </td>
                      <td
                        className="py-2 text-right tabular-nums"
                        style={{ color: 'var(--color-muted-foreground)' }}
                      >
                        {(t.share * 100).toFixed(1)}%
                      </td>
                      <td
                        className="py-2 text-right tabular-nums"
                        style={{ color: 'var(--color-muted-foreground)' }}
                      >
                        {Math.round(t.avgInputSize).toLocaleString()} B
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatCost(t.attributedCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

