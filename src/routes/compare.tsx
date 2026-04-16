import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { GitCompare } from 'lucide-react'

import { useComparison } from '~/hooks/useComparison'
import { formatCost, formatTokens, rechartsFmt} from '~/lib/format'
import { Card } from '~/components/ui/card'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { EmptyState } from '~/components/ui/empty-state'

export const Route = createFileRoute('/compare')({
  component: ComparePage,
})

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

const WINDOW_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 60, label: '60 days' },
  { days: 90, label: '90 days' },
]

function ComparePage() {
  const [windowDays, setWindowDays] = useState(30)
  const { data, isLoading } = useComparison(windowDays)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Period Comparison</h2>
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Compare the current {windowDays}-day window to the prior
            {' '}{windowDays} days
          </p>
        </div>
        <div
          className="flex rounded-lg p-1"
          style={{ backgroundColor: 'var(--color-secondary)' }}
        >
          {WINDOW_OPTIONS.map((o) => (
            <button
              key={o.days}
              type="button"
              onClick={() => setWindowDays(o.days)}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor:
                  windowDays === o.days ? 'var(--color-card)' : 'transparent',
                color:
                  windowDays === o.days
                    ? 'var(--color-foreground)'
                    : 'var(--color-muted-foreground)',
                boxShadow:
                  windowDays === o.days
                    ? '0px 0px 0px 1px var(--color-border)'
                    : 'none',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingSkeleton cols={4} height={120} />}

      {data && data.current.messageCount === 0 && data.previous.messageCount === 0 && (
        <EmptyState
          title="Nothing to compare"
          description="Neither window has usage. Sync your logs and try again."
          icon={<GitCompare size={28} />}
        />
      )}

      {data && (data.current.messageCount > 0 || data.previous.messageCount > 0) && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <ComparisonCard
              label="Total Cost"
              current={formatCost(data.current.totalCost)}
              previous={formatCost(data.previous.totalCost)}
              percent={data.percentDeltas.totalCost}
            />
            <ComparisonCard
              label="Messages"
              current={data.current.messageCount.toLocaleString()}
              previous={data.previous.messageCount.toLocaleString()}
              percent={data.percentDeltas.messageCount}
            />
            <ComparisonCard
              label="Sessions"
              current={data.current.sessionCount.toLocaleString()}
              previous={data.previous.sessionCount.toLocaleString()}
              percent={data.percentDeltas.sessionCount}
            />
            <ComparisonCard
              label="Total Tokens"
              current={formatTokens(data.current.totalTokens)}
              previous={formatTokens(data.previous.totalTokens)}
              percent={data.percentDeltas.totalTokens}
            />
          </div>

          <Card title={`Daily Cost — overlayed ${windowDays}-day windows`}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.dailyPairs}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0eee6" />
                <XAxis
                  dataKey="offset"
                  tick={{ fontSize: 11, fill: '#87867f' }}
                  label={{
                    value: 'Day in window',
                    position: 'insideBottom',
                    offset: -4,
                    fill: '#87867f',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#87867f' }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={rechartsFmt((value) => formatCost(value))}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="previous"
                  name="Previous window"
                  stroke="#87867f"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="current"
                  name="Current window"
                  stroke="#c96442"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-2 gap-6">
            <Card title="Current window breakdown">
              <BreakdownList data={data.current} />
            </Card>
            <Card title="Previous window breakdown">
              <BreakdownList data={data.previous} />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function ComparisonCard({
  label,
  current,
  previous,
  percent,
}: {
  label: string
  current: string
  previous: string
  percent: number
}) {
  const arrow = percent > 0 ? '▲' : percent < 0 ? '▼' : '•'
  const color =
    percent > 0
      ? 'var(--color-primary)'
      : percent < 0
      ? '#5e5d59'
      : 'var(--color-muted-foreground)'

  return (
    <div
      className="rounded-lg p-6"
      style={{
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        boxShadow: '0px 0px 0px 1px var(--color-border)',
      }}
    >
      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
        {label}
      </p>
      <p
        className="mt-1 text-2xl"
        style={{ fontFamily: 'Georgia, serif', fontWeight: 500 }}
      >
        {current}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
        Previous: {previous}
      </p>
      <p className="mt-2 text-sm tabular-nums" style={{ color }}>
        {arrow} {percent > 0 ? '+' : ''}
        {percent.toFixed(1)}%
      </p>
    </div>
  )
}

function BreakdownList({
  data,
}: {
  data: {
    start: string
    end: string
    totalCost: number
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
  }
}) {
  const from = new Date(data.start).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const to = new Date(data.end).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <ul className="text-sm space-y-2">
      <li className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
        {from} → {to}
      </li>
      <Row label="Input" value={formatTokens(data.inputTokens)} />
      <Row label="Output" value={formatTokens(data.outputTokens)} />
      <Row label="Cache write" value={formatTokens(data.cacheCreationTokens)} />
      <Row label="Cache read" value={formatTokens(data.cacheReadTokens)} />
      <Row label="Cost" value={formatCost(data.totalCost)} bold />
    </ul>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span style={{ color: 'var(--color-muted-foreground)' }}>{label}</span>
      <span
        className={bold ? 'font-medium tabular-nums' : 'tabular-nums'}
        style={{ color: 'var(--color-foreground)' }}
      >
        {value}
      </span>
    </li>
  )
}
