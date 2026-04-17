import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

import { useModelStats } from '~/hooks/useModelStats'
import { formatTokens, formatCost, rechartsFmt} from '~/lib/format'
import { getModelDisplayName } from '~/lib/pricing'
import { PeriodFilter, getPeriodLabel, type Period } from '~/components/period-filter'
import { Card } from '~/components/ui/card'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'

const chartColors: Record<string, string> = {
  'claude-opus-4-6': '#c96442',
  'claude-sonnet-4-6': '#d97757',
  'claude-sonnet-4-20250514': '#87867f',
  'claude-haiku-4-5-20251001': '#5e5d59',
}
const defaultColor = '#b0aea5'

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

export const Route = createFileRoute('/models')({
  component: ModelsPage,
})

function ModelsPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const { data, isLoading } = useModelStats(period)

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl">Models</h2>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
        <LoadingSkeleton cols={3} height={180} />
      </div>
    )
  }

  const { modelStats, dailyByModel } = data

  const dates = [...new Set(dailyByModel.map((d) => d.date))].sort()
  const models = [...new Set(dailyByModel.map((d) => d.model))]
  const pivotedDaily = dates.map((date) => {
    const row: Record<string, unknown> = { date }
    for (const model of models) {
      const entry = dailyByModel.find((d) => d.date === date && d.model === model)
      row[model] = entry?.cost ?? 0
    }
    return row
  })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Models</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            Usage comparison across Claude models ({getPeriodLabel(data.days)})
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {modelStats.map((m) => (
          <Card key={m.model}>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: chartColors[m.model] ?? defaultColor }} />
              <h3 className="text-xl">{getModelDisplayName(m.model)}</h3>
            </div>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Total Cost</p>
                <p className="font-medium" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-foreground)' }}>
                  {formatCost(m.totalCost)}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Sessions</p>
                <p className="font-medium" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-foreground)' }}>
                  {m.sessionCount}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Input Tokens</p>
                <p style={{ color: 'var(--color-muted-foreground)' }}>{formatTokens(m.totalInputTokens)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Output Tokens</p>
                <p style={{ color: 'var(--color-muted-foreground)' }}>{formatTokens(m.totalOutputTokens)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Avg Cost/Session</p>
                <p style={{ color: 'var(--color-muted-foreground)' }}>
                  {m.sessionCount > 0 ? formatCost(m.totalCost / m.sessionCount) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Messages</p>
                <p style={{ color: 'var(--color-muted-foreground)' }}>{m.messageCount}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Daily Cost by Model">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={pivotedDaily}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={rechartsFmt((value, name) => [formatCost(value), getModelDisplayName(name ?? '')])}
            />
            <Legend formatter={(value: string) => getModelDisplayName(value)} />
            {models.map((model) => (
              <Line
                key={model}
                type="monotone"
                dataKey={model}
                stroke={chartColors[model] ?? defaultColor}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
