import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { formatTokens, rechartsFmt } from '~/lib/format'

interface TokenMixPoint {
  date: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

export function TokenMixChart({
  data,
  height = 240,
}: {
  data: TokenMixPoint[]
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
          tickFormatter={(d: string) => d.slice(5)}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
          tickFormatter={(v: number) => formatTokens(v)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={rechartsFmt((value) => formatTokens(value))}
        />
        <Bar dataKey="inputTokens" stackId="a" fill="#c96442" name="Input" />
        <Bar dataKey="outputTokens" stackId="a" fill="#d97757" name="Output" />
        <Bar
          dataKey="cacheCreationTokens"
          stackId="a"
          fill="#87867f"
          name="Cache Write"
        />
        <Bar
          dataKey="cacheReadTokens"
          stackId="a"
          fill="#b0aea5"
          name="Cache Read"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
