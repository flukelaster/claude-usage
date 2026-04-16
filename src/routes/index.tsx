import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { RefreshCw, Coins, FolderOpen, Zap, Terminal, Code } from 'lucide-react'

import { useOverview } from '~/hooks/useOverview'
import { useLastSync, useSyncLogs } from '~/hooks/useSync'
import { formatTokens, formatCost, formatPercent, formatRelativeTime, rechartsFmt } from '~/lib/format'
import { PeriodFilter, getPeriodLabel, type Period } from '~/components/period-filter'
import { ExportButton } from '~/components/export-button'
import { DataExportButton } from '~/components/data-export-button'
import { UnknownModelBanner } from '~/components/unknown-model-banner'
import { BudgetProgress } from '~/components/budget-progress'
import { KpiGrid } from '~/components/cards/kpi-grid'
import { TopListCard } from '~/components/cards/top-list-card'
import { Card } from '~/components/ui/card'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { ErrorState } from '~/components/ui/error-state'

export const Route = createFileRoute('/')({
  component: OverviewPage,
})

const cardStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  boxShadow: '0px 0px 0px 1px var(--color-border)',
}

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

const chartColors = ['#c96442', '#d97757', '#87867f', '#5e5d59', '#b0aea5']

function OverviewPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const { data, isLoading, error } = useOverview(period)
  const { data: lastSync } = useLastSync()
  const sync = useSyncLogs()

  if (error) {
    return (
      <ErrorState
        message="Failed to load dashboard data"
        action={
          <button
            type="button"
            onClick={() => sync.mutate()}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)',
            }}
          >
            <RefreshCw size={16} />
            Sync Logs
          </button>
        }
      />
    )
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl">Overview</h2>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
        <LoadingSkeleton cols={3} height={120} />
      </div>
    )
  }

  const { kpi, dailyCost, topProjects, recentSessions } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Overview</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            {getPeriodLabel(data.days)}
            {lastSync && <span> &middot; Synced {formatRelativeTime(new Date(lastSync))}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodFilter value={period} onChange={setPeriod} />
          <DataExportButton period={period} />
          <ExportButton period={period} />
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
            style={{
              backgroundColor: sync.isPending ? 'var(--color-secondary)' : 'var(--color-primary)',
              color: sync.isPending ? 'var(--color-secondary-foreground)' : 'var(--color-primary-foreground)',
            }}
          >
            <RefreshCw size={16} className={sync.isPending ? 'animate-spin' : ''} />
            {sync.isPending ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <UnknownModelBanner />

      {sync.data && (
        <div className="rounded-lg p-3 text-sm" style={cardStyle}>
          <span style={{ color: 'var(--color-muted-foreground)' }}>
            Synced {sync.data.filesProcessed} files, added {sync.data.messagesAdded} messages
            in {(sync.data.durationMs / 1000).toFixed(1)}s
            {sync.data.errors > 0 && ` (${sync.data.errors} errors)`}
          </span>
        </div>
      )}

      <BudgetProgress />

      <KpiGrid
        columns={3}
        items={[
          {
            label: 'Estimated Cost',
            value: formatCost(kpi.totalCost),
            icon: <Coins size={18} style={{ color: 'var(--color-primary)' }} />,
          },
          {
            label: 'Active Projects',
            value: String(kpi.activeProjects),
            icon: <FolderOpen size={18} style={{ color: 'var(--color-muted-foreground)' }} />,
          },
          {
            label: 'Cache Hit Rate',
            value: formatPercent(kpi.cacheHitRate),
            icon: <Zap size={18} style={{ color: 'var(--color-muted-foreground)' }} />,
          },
        ]}
      />

      <TokenBreakdownCard
        total={kpi.totalTokens}
        input={kpi.totalInputTokens}
        output={kpi.totalOutputTokens}
        cacheCreation={kpi.totalCacheCreationTokens}
        cacheRead={kpi.totalCacheReadTokens}
      />

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-6">
        <Card title="Daily Cost Trend">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dailyCost}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0eee6" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#87867f' }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#87867f' }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={rechartsFmt((value) => [formatCost(value), 'Cost'])} />
              <Area type="monotone" dataKey="cost" stroke="#c96442" fill="#c96442" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Daily Token Mix">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailyCost}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0eee6" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#87867f' }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#87867f' }} tickFormatter={(v: number) => formatTokens(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={rechartsFmt((value) => formatTokens(value))} />
              <Bar dataKey="inputTokens" stackId="a" fill="#c96442" name="Input" />
              <Bar dataKey="outputTokens" stackId="a" fill="#d97757" name="Output" />
              <Bar dataKey="cacheCreationTokens" stackId="a" fill="#87867f" name="Cache Write" />
              <Bar dataKey="cacheReadTokens" stackId="a" fill="#b0aea5" name="Cache Read" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-6">
        <Card title="Top Projects">
          {topProjects.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProjects} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} tickFormatter={(v: number) => formatCost(v)} />
                <YAxis type="category" dataKey="displayName" width={140} tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} />
                <Tooltip contentStyle={tooltipStyle} formatter={rechartsFmt((value) => [formatCost(value), 'Cost'])} />
                <Bar dataKey="totalCost" radius={[0, 4, 4, 0]}>
                  {topProjects.map((_, i) => (
                    <Cell key={i} fill={chartColors[i % chartColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <TopListCard
          title="Recent Sessions"
          emptyText="No sessions yet"
          items={recentSessions.map((s) => ({
            id: s.id,
            href: `/sessions/${s.id}`,
            icon: s.entrypoint === 'cli'
              ? <Terminal size={14} />
              : <Code size={14} />,
            primary: s.title || s.slug || s.id.slice(0, 8),
            secondary: s.projectName,
            trailing: formatCost(s.totalCost ?? 0),
          }))}
        />
      </div>
    </div>
  )
}

const tokenTypes = [
  { key: 'input' as const, label: 'Input', color: '#c96442' },
  { key: 'output' as const, label: 'Output', color: '#d97757' },
  { key: 'cacheCreation' as const, label: 'Cache Write', color: '#87867f' },
  { key: 'cacheRead' as const, label: 'Cache Read', color: '#b0aea5' },
]

function TokenBreakdownCard({ total, input, output, cacheCreation, cacheRead }: {
  total: number; input: number; output: number; cacheCreation: number; cacheRead: number
}) {
  const values = { input, output, cacheCreation, cacheRead }

  return (
    <div className="rounded-lg p-6" style={cardStyle}>
      <div className="flex items-end gap-8">
        <div className="shrink-0">
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Total Tokens</p>
          <p className="mt-1 text-3xl" style={{ fontFamily: 'Georgia, serif', fontWeight: 500, color: 'var(--color-foreground)' }}>
            {formatTokens(total)}
          </p>
        </div>
        <div className="flex flex-1 items-end gap-6">
          {tokenTypes.map((t) => {
            const val = values[t.key]
            const pct = total > 0 ? (val / total) * 100 : 0
            return (
              <div key={t.key} className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{t.label}</span>
                  </div>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)' }}>
                    {pct < 0.1 ? '<0.1' : pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-secondary)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: t.color }}
                  />
                </div>
                <p className="mt-1.5 text-sm font-medium tabular-nums" style={{ color: 'var(--color-foreground)' }}>
                  {formatTokens(val)}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
