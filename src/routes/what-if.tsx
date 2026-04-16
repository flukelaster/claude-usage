import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { FlaskConical } from 'lucide-react'

import { useWhatIf } from '~/hooks/useWhatIf'
import { formatCost } from '~/lib/format'
import { PeriodFilter, getPeriodLabel, type Period } from '~/components/period-filter'
import { Card } from '~/components/ui/card'
import { KpiGrid } from '~/components/cards/kpi-grid'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'

export const Route = createFileRoute('/what-if')({
  component: WhatIfPage,
})

const FAMILY_DISPLAY: Record<string, string> = {
  'opus-4.6': 'Opus 4.6',
  'opus-4.5': 'Opus 4.5',
  'opus-4.1': 'Opus 4.1',
  'opus-4': 'Opus 4',
  'sonnet-4.6': 'Sonnet 4.6',
  'sonnet-4.5': 'Sonnet 4.5',
  'sonnet-4': 'Sonnet 4',
  'haiku-4.5': 'Haiku 4.5',
}

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

function WhatIfPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const [targetFamily, setTargetFamily] = useState<string>('')
  const { data, isLoading } = useWhatIf(period)

  const activeTarget = targetFamily || (data?.allModelFamilies[0] ?? '')

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl">What-If Analysis</h2>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
        <LoadingSkeleton cols={3} height={120} />
      </div>
    )
  }

  const simulatedTotal = data.modelBreakdown.reduce(
    (s, m) => s + (m.simulatedCosts[activeTarget] ?? 0), 0,
  )
  const delta = simulatedTotal - data.totalActualCost
  const deltaPercent = data.totalActualCost > 0 ? (delta / data.totalActualCost) * 100 : 0
  const isSaving = delta < 0

  const mostExpensive = data.modelBreakdown[0]

  const chartData = data.modelBreakdown.map((m) => ({
    name: m.displayName,
    actual: m.actualCost,
    simulated: m.simulatedCosts[activeTarget] ?? 0,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">What-If Analysis</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            {getPeriodLabel(data.days)} — model cost simulation
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <KpiGrid
        columns={3}
        items={[
          {
            label: 'Total Actual Cost',
            value: formatCost(data.totalActualCost),
          },
          {
            label: 'Models Used',
            value: String(data.modelBreakdown.length),
          },
          {
            label: 'Most Expensive Model',
            value: mostExpensive?.displayName ?? '—',
          },
        ]}
      />

      <Card>
        <div className="flex items-center gap-3 mb-6">
          <FlaskConical size={20} style={{ color: 'var(--color-primary)' }} />
          <h3 className="text-lg">What if everything was...</h3>
          <select
            value={activeTarget}
            onChange={(e) => setTargetFamily(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-background)',
              border: '1px solid var(--color-secondary)',
              color: 'var(--color-foreground)',
            }}
          >
            {data.allModelFamilies.map((f) => (
              <option key={f} value={f}>
                {FAMILY_DISPLAY[f] ?? f}
              </option>
            ))}
          </select>
          <span className="text-lg">?</span>
        </div>

        <div className="flex items-center gap-8 mb-6">
          <div>
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Actual Cost</p>
            <p
              className="text-2xl font-medium tabular-nums"
              style={{ fontFamily: 'Georgia, serif', color: 'var(--color-foreground)' }}
            >
              {formatCost(data.totalActualCost)}
            </p>
          </div>
          <span className="text-2xl" style={{ color: 'var(--color-muted-foreground)' }}>→</span>
          <div>
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Simulated Cost</p>
            <p
              className="text-2xl font-medium tabular-nums"
              style={{ fontFamily: 'Georgia, serif', color: 'var(--color-foreground)' }}
            >
              {formatCost(simulatedTotal)}
            </p>
          </div>
          <div
            className="rounded-lg px-4 py-2"
            style={{
              backgroundColor: isSaving ? 'rgba(94,93,89,0.1)' : 'rgba(201,100,66,0.1)',
            }}
          >
            <p
              className="text-lg font-medium tabular-nums"
              style={{
                color: isSaving ? '#5e5d59' : 'var(--color-primary)',
                fontFamily: 'Georgia, serif',
              }}
            >
              {isSaving ? '' : '+'}
              {formatCost(Math.abs(delta))} ({deltaPercent > 0 ? '+' : ''}
              {deltaPercent.toFixed(1)}%)
            </p>
            <p
              className="text-xs"
              style={{ color: isSaving ? '#5e5d59' : 'var(--color-primary)' }}
            >
              {isSaving ? 'You would save' : 'Would cost more'}
            </p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 50)}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 12, fill: 'var(--color-foreground)' }}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatCost(value)} />
            <Legend />
            <Bar dataKey="actual" name="Actual" fill="#c96442" radius={[0, 4, 4, 0]} barSize={16} />
            <Bar dataKey="simulated" name="Simulated" fill="#87867f" radius={[0, 4, 4, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Full Cost Matrix">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-xs"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                <th className="py-2 font-normal">Source Model</th>
                <th className="py-2 font-normal text-right">Actual</th>
                {data.allModelFamilies.map((f) => (
                  <th
                    key={f}
                    className="py-2 font-normal text-right"
                    style={{
                      color: f === activeTarget ? 'var(--color-primary)' : undefined,
                      backgroundColor:
                        f === activeTarget ? 'rgba(201,100,66,0.05)' : 'transparent',
                    }}
                  >
                    {FAMILY_DISPLAY[f] ?? f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.modelBreakdown.map((m) => (
                <tr
                  key={m.model}
                  className="border-t"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="py-2 font-medium">{m.displayName}</td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatCost(m.actualCost)}
                  </td>
                  {data.allModelFamilies.map((f) => {
                    const simCost = m.simulatedCosts[f] ?? 0
                    const isCurrentModel = f === m.family
                    return (
                      <td
                        key={f}
                        className="py-2 text-right tabular-nums"
                        style={{
                          color: isCurrentModel
                            ? 'var(--color-foreground)'
                            : 'var(--color-muted-foreground)',
                          fontWeight: isCurrentModel ? 500 : 400,
                          backgroundColor:
                            f === activeTarget ? 'rgba(201,100,66,0.05)' : 'transparent',
                        }}
                      >
                        {formatCost(simCost)}
                      </td>
                    )
                  })}
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
                <td className="py-2 text-right tabular-nums font-medium">
                  {formatCost(data.totalActualCost)}
                </td>
                {data.allModelFamilies.map((f) => {
                  const total = data.modelBreakdown.reduce(
                    (s, m) => s + (m.simulatedCosts[f] ?? 0),
                    0,
                  )
                  return (
                    <td
                      key={f}
                      className="py-2 text-right tabular-nums font-medium"
                      style={{
                        color: f === activeTarget ? 'var(--color-primary)' : undefined,
                        backgroundColor:
                          f === activeTarget ? 'rgba(201,100,66,0.05)' : 'transparent',
                        fontFamily: 'Georgia, serif',
                      }}
                    >
                      {formatCost(total)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
