import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { formatCost, rechartsFmt } from '~/lib/format'

interface DailyCostPoint {
  date: string
  cost: number
  isProjected?: boolean
}

interface DailyCostChartProps {
  data: DailyCostPoint[]
  height?: number
  color?: string
}

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

export function DailyCostChart({
  data,
  height = 240,
  color = '#c96442',
}: DailyCostChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
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
          formatter={rechartsFmt((value) => [formatCost(value), 'Cost'])}
        />
        <Area
          type="monotone"
          dataKey="cost"
          stroke={color}
          fill={color}
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
