import type { CalendarDay } from '~/server/functions/get-calendar'
import { formatCost } from '~/lib/format'

interface CalendarHeatmapProps {
  days: CalendarDay[]
  maxDailyCost: number
  cellSize?: number
  gap?: number
}

const DAY_LABELS = ['Mon', 'Wed', 'Fri']
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * GitHub-style contributions grid. Columns are weeks, rows are days
 * (Sun → Sat). Cell color intensity is the ratio of the day's cost to
 * the year's maxDailyCost, capped at 1.
 */
export function CalendarHeatmap({
  days,
  maxDailyCost,
  cellSize = 12,
  gap = 3,
}: CalendarHeatmapProps) {
  if (days.length === 0) return null

  // Find the Sunday that starts the week containing Jan 1.
  const firstDate = parseLocalDate(days[0].date)
  const leadOffset = firstDate.getDay() // 0 = Sun

  // Pad leading days so week columns are aligned.
  const cells: Array<CalendarDay | null> = [
    ...Array.from({ length: leadOffset }, () => null),
    ...days,
  ]

  const weekCount = Math.ceil(cells.length / 7)
  const width = weekCount * (cellSize + gap)
  const height = 7 * (cellSize + gap)

  // Month labels — position at the first column whose week contains
  // the 1st of that month.
  const monthPositions: Array<{ month: number; x: number }> = []
  let lastMonth = -1
  for (let i = leadOffset; i < cells.length; i++) {
    const cell = cells[i]
    if (!cell) continue
    const d = parseLocalDate(cell.date)
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth()
      const week = Math.floor(i / 7)
      monthPositions.push({ month: d.getMonth(), x: week * (cellSize + gap) })
    }
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width={width + 40}
        height={height + 20}
        role="img"
        aria-label="Yearly activity heatmap"
      >
        {/* Month labels */}
        {monthPositions.map(({ month, x }) => (
          <text
            key={month}
            x={x + 40}
            y={10}
            fontSize={10}
            fill="var(--color-muted-foreground)"
          >
            {MONTH_LABELS[month]}
          </text>
        ))}

        {/* Weekday labels */}
        {DAY_LABELS.map((label, i) => {
          const row = i * 2 + 1 // Mon=1, Wed=3, Fri=5
          return (
            <text
              key={label}
              x={0}
              y={20 + row * (cellSize + gap) + cellSize - 2}
              fontSize={10}
              fill="var(--color-muted-foreground)"
            >
              {label}
            </text>
          )
        })}

        {/* Cells */}
        <g transform="translate(40,20)">
          {cells.map((cell, i) => {
            if (!cell) return null
            const col = Math.floor(i / 7)
            const row = i % 7
            return (
              <rect
                key={cell.date}
                x={col * (cellSize + gap)}
                y={row * (cellSize + gap)}
                width={cellSize}
                height={cellSize}
                rx={2}
                fill={cellColor(cell.totalCost, maxDailyCost)}
                stroke={cell.totalCost > 0 ? 'rgba(0,0,0,0.05)' : 'none'}
              >
                <title>
                  {cell.date} — {cell.messageCount.toLocaleString()} msgs ·{' '}
                  {formatCost(cell.totalCost)}
                </title>
              </rect>
            )
          })}
        </g>
      </svg>

      <Legend />
    </div>
  )
}

function Legend() {
  const steps = [0, 0.15, 0.35, 0.6, 0.85, 1]
  return (
    <div
      className="mt-3 flex items-center gap-1 text-xs"
      style={{ color: 'var(--color-muted-foreground)' }}
    >
      <span>Less</span>
      {steps.map((s) => (
        <span
          key={s}
          className="rounded-sm"
          style={{
            width: 12,
            height: 12,
            backgroundColor: cellColor(s, 1),
            border: '1px solid rgba(0,0,0,0.04)',
          }}
        />
      ))}
      <span>More</span>
    </div>
  )
}

function cellColor(cost: number, max: number): string {
  if (cost <= 0 || max <= 0) return 'var(--color-secondary)'
  const ratio = Math.min(1, cost / max)
  // 6 bucket terracotta ramp; darker = more usage.
  const buckets = ['#f5d6c9', '#ecb39a', '#e09070', '#d1734d', '#c96442', '#a04d2f']
  const idx = Math.min(buckets.length - 1, Math.floor(ratio * buckets.length))
  return buckets[idx]
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
