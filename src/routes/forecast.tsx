import { createFileRoute } from '@tanstack/react-router'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Target } from 'lucide-react'

import { useForecast } from '~/hooks/useForecast'
import { formatCost, rechartsFmt} from '~/lib/format'
import { Card } from '~/components/ui/card'
import { KpiCard } from '~/components/ui/kpi-card'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { BudgetProgress } from '~/components/budget-progress'
import { TrendIndicator } from '~/components/cards/trend-indicator'

export const Route = createFileRoute('/forecast')({
  component: ForecastPage,
})

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

function ForecastPage() {
  const { data, isLoading } = useForecast()

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl">Cost Forecast</h2>
        <LoadingSkeleton cols={4} height={110} />
      </div>
    )
  }

  const vsLastMonth = data.previousMonthTotal > 0
    ? ((data.projectedTotal - data.previousMonthTotal) / data.previousMonthTotal) * 100
    : 0

  const vsLastColor = vsLastMonth > 0 ? 'var(--color-primary)' : '#5e5d59'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl">Cost Forecast</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          {data.monthLabel} — {data.daysElapsed} days elapsed, {data.daysRemaining} remaining
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Spent So Far"
          value={formatCost(data.monthSpendSoFar)}
          icon={<DollarSign size={18} style={{ color: 'var(--color-primary)' }} />}
        />
        <KpiCard
          label="Projected Total"
          value={formatCost(data.projectedTotal)}
          icon={
            <TrendIndicator
              direction={data.burnRateTrend}
              label={data.burnRateTrend}
            />
          }
        />
        <KpiCard
          label="Daily Average"
          value={formatCost(data.dailyAverage)}
          icon={<Target size={18} style={{ color: 'var(--color-muted-foreground)' }} />}
        />
        <div
          className="rounded-lg p-6"
          style={{
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            boxShadow: '0px 0px 0px 1px var(--color-border)',
          }}
        >
          <div className="flex items-center gap-2">
            {vsLastMonth > 0
              ? <TrendingUp size={18} style={{ color: vsLastColor }} />
              : <TrendingDown size={18} style={{ color: vsLastColor }} />}
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>vs Last Month</span>
          </div>
          <p
            className="mt-2 text-2xl"
            style={{
              fontFamily: 'Georgia, serif',
              fontWeight: 500,
              color: vsLastColor,
            }}
          >
            {vsLastMonth > 0 ? '+' : ''}{vsLastMonth.toFixed(1)}%
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            Last month: {formatCost(data.previousMonthTotal)}
          </p>
        </div>
      </div>

      <BudgetProgress />

      <Card title="Daily Spending">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={rechartsFmt((value) => [formatCost(value), 'Cost'])} />
            <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
              {data.chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill="#c96442"
                  fillOpacity={entry.isProjected ? 0.3 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex items-center gap-6 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#c96442' }} />
            Actual
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: '#c96442', opacity: 0.3 }} />
            Projected
          </div>
        </div>
      </Card>
    </div>
  )
}
