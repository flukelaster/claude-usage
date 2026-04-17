import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Clock, Calendar, Timer } from 'lucide-react'

import { useActivity } from '~/hooks/useActivity'
import { formatCost, formatDuration } from '~/lib/format'
import { PeriodFilter, getPeriodLabel, type Period } from '~/components/period-filter'
import { Card } from '~/components/ui/card'
import { KpiGrid } from '~/components/cards/kpi-grid'

export const Route = createFileRoute('/activity')({
  component: ActivityPage,
})

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Reorder: Mon first
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function formatHour(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function ActivityPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const [metric, setMetric] = useState<'messages' | 'cost'>('messages')
  const { data, isLoading } = useActivity(period)

  const heatmap = new Map<string, { messageCount: number; cost: number }>()
  let maxVal = 1
  if (data) {
    for (const d of data.heatmapData) {
      const key = `${d.dayOfWeek}-${d.hour}`
      heatmap.set(key, { messageCount: d.messageCount, cost: d.cost })
      const val = metric === 'messages' ? d.messageCount : d.cost
      if (val > maxVal) maxVal = val
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Peak Hours</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            {data ? getPeriodLabel(data.days) : 'Loading…'}
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <KpiGrid
        columns={3}
        items={[
          {
            label: 'Busiest Hour',
            value: data ? formatHour(data.busiestHour) : '—',
            icon: <Clock size={18} style={{ color: 'var(--color-primary)' }} />,
          },
          {
            label: 'Busiest Day',
            value: data ? DAY_LABELS[data.busiestDay] : '—',
            icon: <Calendar size={18} style={{ color: 'var(--color-muted-foreground)' }} />,
          },
          {
            label: 'Avg Session Length',
            value: data ? formatDuration(data.avgSessionDurationMs) : '—',
            icon: <Timer size={18} style={{ color: 'var(--color-muted-foreground)' }} />,
          },
        ]}
      />

      <Card
        title="Activity Heatmap"
        action={
          <div
            className="flex rounded-lg p-1"
            style={{ backgroundColor: 'var(--color-secondary)' }}
          >
            {(['messages', 'cost'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors capitalize"
                style={{
                  backgroundColor: metric === m ? 'var(--color-card)' : 'transparent',
                  color: metric === m ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
                  boxShadow: metric === m ? '0px 0px 0px 1px var(--color-border)' : 'none',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        }
      >
        {isLoading ? (
          <div
            className="h-[220px] animate-pulse rounded"
            style={{ backgroundColor: 'var(--color-secondary)' }}
          />
        ) : (
          <div className="overflow-x-auto">
            <div className="flex" style={{ marginLeft: 44 }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="text-center text-[10px]"
                  style={{ width: 28, color: 'var(--color-muted-foreground)' }}
                >
                  {h % 3 === 0 ? formatHour(h) : ''}
                </div>
              ))}
            </div>

            {DAY_ORDER.map((dow) => (
              <div key={dow} className="flex items-center gap-1 mt-1">
                <span
                  className="text-xs w-10 text-right"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  {DAY_LABELS[dow]}
                </span>
                {Array.from({ length: 24 }, (_, h) => {
                  const cell = heatmap.get(`${dow}-${h}`)
                  const val = cell ? (metric === 'messages' ? cell.messageCount : cell.cost) : 0
                  const intensity = val / maxVal
                  return (
                    <div
                      key={h}
                      className="rounded"
                      style={{
                        width: 24,
                        height: 24,
                        backgroundColor: val > 0 ? '#c96442' : 'var(--color-secondary)',
                        opacity: val > 0 ? Math.max(0.15, intensity) : 1,
                      }}
                      title={`${DAY_LABELS[dow]} ${formatHour(h)}: ${
                        cell
                          ? `${cell.messageCount} msgs, ${formatCost(cell.cost)}`
                          : 'No activity'
                      }`}
                    />
                  )
                })}
              </div>
            ))}

            <div
              className="mt-4 flex items-center gap-2 text-xs"
              style={{ color: 'var(--color-muted-foreground)', marginLeft: 44 }}
            >
              <span>Less</span>
              {[0.15, 0.35, 0.55, 0.75, 1].map((opacity) => (
                <div
                  key={opacity}
                  className="rounded"
                  style={{ width: 16, height: 16, backgroundColor: '#c96442', opacity }}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
