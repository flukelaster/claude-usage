import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Flame } from 'lucide-react'

import { useCalendarYear } from '~/hooks/useCalendar'
import { formatCost } from '~/lib/format'
import { Card } from '~/components/ui/card'
import { KpiGrid } from '~/components/cards/kpi-grid'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { EmptyState } from '~/components/ui/empty-state'
import { CalendarHeatmap } from '~/components/calendar-heatmap'

export const Route = createFileRoute('/calendar')({
  component: CalendarPage,
})

function CalendarPage() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const { data, isLoading } = useCalendarYear(year)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Activity Calendar</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            Every day of {year} colored by daily cost
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-md p-1.5"
            style={{
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
            }}
            aria-label="Previous year"
          >
            <ChevronLeft size={14} />
          </button>
          <span
            className="px-3 text-sm font-medium tabular-nums"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {year}
          </span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= new Date().getFullYear()}
            className="rounded-md p-1.5 disabled:opacity-30"
            style={{
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
            }}
            aria-label="Next year"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {isLoading && <LoadingSkeleton cols={4} height={110} />}

      {data && data.totalMessages === 0 && (
        <EmptyState
          title={`No activity in ${year}`}
          description="Try a different year, or sync logs if this should have data."
          icon={<CalendarIcon size={28} />}
        />
      )}

      {data && data.totalMessages > 0 && (
        <>
          <KpiGrid
            columns={4}
            items={[
              {
                label: 'Total cost',
                value: formatCost(data.totalCost),
              },
              {
                label: 'Active days',
                value: `${data.activeDays}/${data.days.length}`,
              },
              {
                label: 'Current streak',
                value: `${data.currentStreak} day${data.currentStreak === 1 ? '' : 's'}`,
                icon: data.currentStreak > 0 ? (
                  <Flame size={16} style={{ color: 'var(--color-primary)' }} />
                ) : undefined,
              },
              {
                label: 'Longest streak',
                value: `${data.longestStreak} day${data.longestStreak === 1 ? '' : 's'}`,
              },
            ]}
          />

          <Card>
            <CalendarHeatmap days={data.days} maxDailyCost={data.maxDailyCost} />
          </Card>

          <Card title="Highest-cost days">
            <ol className="space-y-1 text-sm">
              {[...data.days]
                .filter((d) => d.totalCost > 0)
                .sort((a, b) => b.totalCost - a.totalCost)
                .slice(0, 10)
                .map((d, i) => (
                  <li
                    key={d.date}
                    className="flex items-center justify-between rounded-md px-3 py-2"
                    style={{
                      backgroundColor:
                        i % 2 === 0 ? 'transparent' : 'var(--color-background)',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="text-xs tabular-nums w-6"
                        style={{ color: 'var(--color-muted-foreground)' }}
                      >
                        {i + 1}
                      </span>
                      <span>{new Date(d.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}</span>
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      {d.messageCount.toLocaleString()} msgs ·{' '}
                      <span
                        className="font-medium tabular-nums"
                        style={{ color: 'var(--color-foreground)' }}
                      >
                        {formatCost(d.totalCost)}
                      </span>
                    </span>
                  </li>
                ))}
            </ol>
          </Card>
        </>
      )}
    </div>
  )
}
