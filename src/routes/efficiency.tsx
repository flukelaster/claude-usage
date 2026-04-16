import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, ZAxis,
} from 'recharts'
import { Terminal, Code } from 'lucide-react'

import { useEfficiency } from '~/hooks/useEfficiency'
import { formatCost, formatTokens } from '~/lib/format'
import { PeriodFilter, getPeriodLabel, type Period } from '~/components/period-filter'
import { Card } from '~/components/ui/card'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { EmptyState } from '~/components/ui/empty-state'
import { DataTable } from '~/components/tables/data-table'

export const Route = createFileRoute('/efficiency')({
  component: EfficiencyPage,
})

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

function EfficiencyPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const { data, isLoading } = useEfficiency(period)

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl">Efficiency</h2>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
        <LoadingSkeleton cols={2} height={200} />
      </div>
    )
  }

  const cliData = data.entrypointComparison.find((e) => e.entrypoint === 'cli')
  const vscodeData = data.entrypointComparison.find((e) => e.entrypoint === 'claude-vscode')
  const cliScatter = data.scatterData.filter((s) => s.entrypoint === 'cli')
  const vscodeScatter = data.scatterData.filter((s) => s.entrypoint === 'claude-vscode')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Efficiency</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            {getPeriodLabel(data.days)} — session cost analysis
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className={`grid gap-4 ${cliData && vscodeData ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {cliData && (
          <EntrypointCard label="CLI" icon={<Terminal size={20} />} data={cliData} />
        )}
        {vscodeData && (
          <EntrypointCard
            label="VS Code Extension"
            icon={<Code size={20} />}
            data={vscodeData}
          />
        )}
        {!cliData && !vscodeData && (
          <EmptyState title="No session data available" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Cost vs Messages per Session">
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="messageCount"
                type="number"
                name="Messages"
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              />
              <YAxis
                dataKey="totalCost"
                type="number"
                name="Cost"
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              />
              <ZAxis range={[30, 30]} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name: string) => [
                  name === 'Cost' ? formatCost(value) : value,
                  name,
                ]}
              />
              {cliScatter.length > 0 && <Scatter name="CLI" data={cliScatter} fill="#c96442" />}
              {vscodeScatter.length > 0 && (
                <Scatter name="VS Code" data={vscodeScatter} fill="#d97757" />
              )}
              {cliScatter.length === 0 && vscodeScatter.length === 0 && (
                <Scatter name="Sessions" data={data.scatterData} fill="#c96442" />
              )}
              <Legend />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Avg Cost per Session (Weekly)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.weeklyAvgCost}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                tickFormatter={(w: string) => w.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [formatCost(value), 'Avg Cost']}
              />
              <Line
                type="monotone"
                dataKey="avgCost"
                stroke="#c96442"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Most Expensive Sessions (per message)">
        <DataTable
          rowKey={(s) => s.id}
          rows={data.rankedSessions.map((s, i) => ({ ...s, rank: i + 1 }))}
          columns={[
            {
              key: 'rank',
              header: '#',
              cell: (s) => (
                <span className="tabular-nums" style={{ color: 'var(--color-muted-foreground)' }}>
                  {s.rank}
                </span>
              ),
            },
            {
              key: 'title',
              header: 'Session',
              cell: (s) => (
                <a
                  href={`/sessions/${s.id}`}
                  className="font-medium truncate block max-w-[240px] hover:underline"
                  style={{ color: 'var(--color-foreground)' }}
                >
                  {s.title || s.slug || s.id.slice(0, 8)}
                </a>
              ),
            },
            {
              key: 'project',
              header: 'Project',
              cell: (s) => (
                <span
                  className="truncate max-w-[160px] block"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  {s.projectName}
                </span>
              ),
            },
            {
              key: 'entry',
              header: '',
              align: 'center',
              cell: (s) =>
                s.entrypoint === 'cli' ? (
                  <Terminal size={14} style={{ color: 'var(--color-muted-foreground)' }} />
                ) : (
                  <Code size={14} style={{ color: 'var(--color-muted-foreground)' }} />
                ),
            },
            {
              key: 'messages',
              header: 'Messages',
              align: 'right',
              cell: (s) => (
                <span style={{ color: 'var(--color-muted-foreground)' }}>{s.messageCount}</span>
              ),
            },
            {
              key: 'cost',
              header: 'Cost',
              align: 'right',
              cell: (s) => (
                <span className="font-medium tabular-nums">{formatCost(s.totalCost ?? 0)}</span>
              ),
            },
            {
              key: 'per',
              header: '$/msg',
              align: 'right',
              cell: (s) => (
                <span
                  className="font-medium tabular-nums"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {formatCost(s.costPerMessage)}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}

function EntrypointCard({ label, icon, data }: {
  label: string
  icon: React.ReactNode
  data: {
    sessionCount: number
    totalCost: number
    avgCost: number
    totalTokens: number
    avgMessages: number
  }
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: 'var(--color-primary)' }}>{icon}</span>
        <h3 className="text-lg">{label}</h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Sessions" value={String(data.sessionCount)} />
        <Stat label="Total Cost" value={formatCost(data.totalCost)} />
        <Stat label="Avg Cost/Session" value={formatCost(data.avgCost)} />
        <Stat
          label="Avg Messages/Session"
          value={Math.round(data.avgMessages).toLocaleString()}
        />
        <Stat label="Total Tokens" value={formatTokens(data.totalTokens)} />
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{label}</p>
      <p
        className="mt-0.5 text-lg font-medium tabular-nums"
        style={{ color: 'var(--color-foreground)' }}
      >
        {value}
      </p>
    </div>
  )
}
