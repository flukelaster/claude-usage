import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Zap, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'

import { useCacheStats } from '~/hooks/useCacheStats'
import { formatTokens, formatCost, formatPercent } from '~/lib/format'
import { getModelDisplayName } from '~/lib/pricing'
import { PeriodFilter, getPeriodLabel, type Period } from '~/components/period-filter'
import { Card } from '~/components/ui/card'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { KpiGrid } from '~/components/cards/kpi-grid'
import { DataTable } from '~/components/tables/data-table'

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

export const Route = createFileRoute('/cache-analysis')({
  component: CacheAnalysisPage,
})

function CacheAnalysisPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const { data, isLoading } = useCacheStats(period)

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl">Cache Analysis</h2>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
        <LoadingSkeleton cols={4} height={100} />
      </div>
    )
  }

  const { overall, modelCacheStats, dailyCacheTrend, projectCache } = data

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Cache Analysis</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            Prompt caching efficiency and savings ({getPeriodLabel(data.days)})
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <KpiGrid
        columns={4}
        items={[
          {
            label: 'Cache Hit Rate',
            value: formatPercent(overall.hitRate),
            icon: <Zap size={18} style={{ color: 'var(--color-primary)' }} />,
          },
          {
            label: 'Estimated Savings',
            value: formatCost(overall.savings),
            icon: <TrendingUp size={18} style={{ color: 'var(--color-muted-foreground)' }} />,
          },
          {
            label: 'Cache Overhead',
            value: formatCost(overall.overhead),
            icon: <TrendingDown size={18} style={{ color: 'var(--color-muted-foreground)' }} />,
          },
          {
            label: 'Net Savings',
            value: formatCost(overall.netSavings),
            icon: (
              <DollarSign
                size={18}
                style={{
                  color: overall.netSavings >= 0 ? 'var(--color-primary)' : '#b53333',
                }}
              />
            ),
          },
        ]}
      />

      {overall.roi > 0 && (
        <div
          className="rounded-lg px-6 py-4 text-sm"
          style={{
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span style={{ color: 'var(--color-muted-foreground)' }}>Cache ROI: </span>
          <span
            className="font-medium"
            style={{ fontFamily: 'Georgia, serif', color: 'var(--color-foreground)' }}
          >
            {formatPercent(overall.roi)}
          </span>
          <span style={{ color: 'var(--color-muted-foreground)' }}>
            {' '}— caching saved {formatPercent(overall.roi)} of your total estimated cost
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <Card title="Daily Cache Token Volume">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dailyCacheTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0eee6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#87867f' }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#87867f' }}
                tickFormatter={(v: number) => formatTokens(v)}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatTokens(value)} />
              <Area
                type="monotone"
                dataKey="cacheReadTokens"
                stackId="a"
                stroke="#c96442"
                fill="#c96442"
                fillOpacity={0.2}
                name="Cache Reads"
              />
              <Area
                type="monotone"
                dataKey="cacheCreationTokens"
                stackId="a"
                stroke="#87867f"
                fill="#87867f"
                fillOpacity={0.15}
                name="Cache Writes"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Cache Efficiency by Model">
          <div className="space-y-4">
            {modelCacheStats.map((m) => (
              <div key={m.model} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--color-foreground)' }}>
                    {getModelDisplayName(m.model)}
                  </span>
                  <span style={{ color: 'var(--color-muted-foreground)' }}>
                    {formatPercent(m.hitRate)} hit rate
                  </span>
                </div>
                <div
                  className="h-2 w-full rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--color-secondary)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(m.hitRate * 100, 100)}%`,
                      backgroundColor: m.hitRate > 0.3 ? 'var(--color-primary)' : '#b53333',
                    }}
                  />
                </div>
                <div
                  className="flex justify-between text-xs"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  <span>Savings: {formatCost(m.netSavings)}</span>
                  <span>Cache reads: {formatTokens(m.cacheReadTokens)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Per-Project Cache Efficiency">
        <DataTable
          rowKey={(p) => p.projectId}
          rows={projectCache}
          columns={[
            {
              key: 'name',
              header: 'Project',
              cell: (p) => <span>{p.projectName}</span>,
            },
            {
              key: 'hit',
              header: 'Hit Rate',
              align: 'right',
              cell: (p) => (
                <span
                  style={{
                    color: p.hitRate > 0.3 ? 'var(--color-muted-foreground)' : '#b53333',
                  }}
                >
                  {formatPercent(p.hitRate)}
                </span>
              ),
            },
            {
              key: 'reads',
              header: 'Cache Reads',
              align: 'right',
              cell: (p) => (
                <span style={{ color: 'var(--color-muted-foreground)' }}>
                  {formatTokens(p.cacheReadTokens)}
                </span>
              ),
            },
            {
              key: 'writes',
              header: 'Cache Writes',
              align: 'right',
              cell: (p) => (
                <span style={{ color: 'var(--color-muted-foreground)' }}>
                  {formatTokens(p.cacheCreationTokens)}
                </span>
              ),
            },
            {
              key: 'cost',
              header: 'Total Cost',
              align: 'right',
              cell: (p) => <span className="font-medium tabular-nums">{formatCost(p.totalCost)}</span>,
            },
          ]}
        />
      </Card>
    </div>
  )
}
