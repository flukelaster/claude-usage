import { createFileRoute, Link } from '@tanstack/react-router'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ArrowLeft } from 'lucide-react'

import { useSessionDetail } from '~/hooks/useSessions'
import { formatTokens, formatCost, formatDuration, rechartsFmt} from '~/lib/format'
import { getModelDisplayName } from '~/lib/pricing'
import { Card } from '~/components/ui/card'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { EmptyState } from '~/components/ui/empty-state'
import { TagEditor } from '~/components/tag-editor'

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

export const Route = createFileRoute('/sessions/$sessionId')({
  component: SessionDetailPage,
})

function SessionDetailPage() {
  const { sessionId } = Route.useParams()
  const { data, isLoading } = useSessionDetail(sessionId)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded" style={{ backgroundColor: 'var(--color-secondary)' }} />
        <LoadingSkeleton cols={1} height={220} />
      </div>
    )
  }

  if (!data) {
    return (
      <EmptyState
        title="Session not found"
        action={
          <Link to="/sessions" className="text-sm" style={{ color: 'var(--color-primary)' }}>
            Back to sessions
          </Link>
        }
      />
    )
  }

  const { session, messages } = data

  let cumCost = 0
  const cumulativeData = messages.map((msg, i) => {
    cumCost += msg.estimatedCostUsd ?? 0
    return { index: i + 1, cost: cumCost, model: msg.model }
  })

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/sessions"
          className="mb-2 inline-flex items-center gap-1 text-sm"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          <ArrowLeft size={14} /> Sessions
        </Link>
        <h2 className="text-3xl">{session.title || session.slug || session.id.slice(0, 8)}</h2>
        <div
          className="mt-1 flex items-center gap-3 text-sm"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          <Link
            to="/projects/$projectId"
            params={{ projectId: session.projectId }}
            className="hover:underline"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            {session.projectName}
          </Link>
          <span>&middot;</span>
          <span>{session.entrypoint === 'cli' ? 'CLI' : 'VS Code'}</span>
          <span>&middot;</span>
          <span>{session.messageCount} messages</span>
          <span>&middot;</span>
          <span>{formatCost(session.totalCost ?? 0)}</span>
        </div>
        <div className="mt-3">
          <TagEditor entityType="session" entityId={session.id} />
        </div>
      </div>

      {cumulativeData.length > 1 && (
        <Card title="Cumulative Cost">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={cumulativeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
              <XAxis
                dataKey="index"
                tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
                label={{ value: 'Message #', position: 'insideBottom', offset: -5, fill: 'var(--color-chart-tick)', fontSize: 11 }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={rechartsFmt((value) => [formatCost(value), 'Cumulative Cost'])}
              />
              <Line type="monotone" dataKey="cost" stroke="#c96442" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card title="Message Timeline">
        <div className="space-y-2">
          {messages.map((msg, i) => (
            <div
              key={msg.uuid}
              className="flex items-center justify-between rounded-md px-4 py-3 text-sm"
              style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-background)' }}
            >
              <div className="flex items-center gap-4">
                <span className="w-8 text-right text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  #{i + 1}
                </span>
                <span
                  className="rounded px-2 py-0.5 text-xs"
                  style={{
                    backgroundColor: 'var(--color-secondary)',
                    color: 'var(--color-secondary-foreground)',
                  }}
                >
                  {getModelDisplayName(msg.model)}
                </span>
                {msg.durationMs && (
                  <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                    {formatDuration(msg.durationMs)}
                  </span>
                )}
                {msg.stopReason && (
                  <span className="text-xs" style={{ color: '#b0aea5' }}>
                    {msg.stopReason}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                <span>in: {formatTokens(msg.inputTokens ?? 0)}</span>
                <span>out: {formatTokens(msg.outputTokens ?? 0)}</span>
                {(msg.cacheReadTokens ?? 0) > 0 && (
                  <span>cache: {formatTokens(msg.cacheReadTokens ?? 0)}</span>
                )}
                <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>
                  {formatCost(msg.estimatedCostUsd ?? 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
