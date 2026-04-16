import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { ArrowLeft } from 'lucide-react'

import { useProjectDetail } from '~/hooks/useProjects'
import { formatTokens, formatCost, formatRelativeTime, rechartsFmt} from '~/lib/format'
import { getModelDisplayName } from '~/lib/pricing'
import { Card } from '~/components/ui/card'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { EmptyState } from '~/components/ui/empty-state'
import { DataTable } from '~/components/tables/data-table'
import { TagEditor } from '~/components/tag-editor'

const chartColors = ['#c96442', '#d97757', '#87867f', '#5e5d59', '#b0aea5']

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-foreground)',
}

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const { data, isLoading } = useProjectDetail(projectId)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded" style={{ backgroundColor: 'var(--color-secondary)' }} />
        <LoadingSkeleton cols={2} height={240} />
      </div>
    )
  }

  if (!data) {
    return (
      <EmptyState
        title="Project not found"
        action={
          <Link to="/projects" className="text-sm" style={{ color: 'var(--color-primary)' }}>
            Back to projects
          </Link>
        }
      />
    )
  }

  const { project, sessions, modelBreakdown, dailyCost } = data
  const pieData = modelBreakdown.map((m) => ({
    name: getModelDisplayName(m.model),
    value: m.totalCost,
  }))

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projects" className="mb-2 inline-flex items-center gap-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          <ArrowLeft size={14} /> Projects
        </Link>
        <h2 className="text-3xl">{project.displayName}</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>{project.cwd}</p>
        <div className="mt-3">
          <TagEditor entityType="project" entityId={project.id} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Cost Trend">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyCost}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={rechartsFmt((value) => [formatCost(value), 'Cost'])} />
              <Area type="monotone" dataKey="cost" stroke="#c96442" fill="#c96442" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Model Usage">
          {pieData.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>No data</p>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={chartColors[i % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={rechartsFmt((value) => formatCost(value))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {modelBreakdown.map((m, i) => (
                  <div key={m.model} className="flex items-center gap-2 text-sm">
                    <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: chartColors[i % chartColors.length] }} />
                    <span style={{ color: 'var(--color-muted-foreground)' }}>{getModelDisplayName(m.model)}</span>
                    <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>{formatCost(m.totalCost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Sessions">
        <DataTable
          rowKey={(s) => s.id}
          rows={sessions}
          columns={[
            {
              key: 'title',
              header: 'Session',
              cell: (s) => (
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: s.id }}
                  className="hover:underline"
                  style={{ color: 'var(--color-foreground)' }}
                >
                  {s.title || s.slug || s.id.slice(0, 8)}
                </Link>
              ),
            },
            {
              key: 'started',
              header: 'Started',
              cell: (s) => (
                <span style={{ color: 'var(--color-muted-foreground)' }}>
                  {s.startedAt ? formatRelativeTime(new Date(s.startedAt)) : '—'}
                </span>
              ),
            },
            {
              key: 'messages',
              header: 'Messages',
              align: 'right',
              cell: (s) => (
                <span style={{ color: 'var(--color-muted-foreground)' }}>
                  {s.messageCount}
                </span>
              ),
            },
            {
              key: 'tokens',
              header: 'Tokens',
              align: 'right',
              cell: (s) => (
                <span style={{ color: 'var(--color-muted-foreground)' }}>
                  {formatTokens((s.totalInputTokens ?? 0) + (s.totalOutputTokens ?? 0))}
                </span>
              ),
            },
            {
              key: 'cost',
              header: 'Cost',
              align: 'right',
              cell: (s) => (
                <span className="font-medium tabular-nums">
                  {formatCost(s.totalCost ?? 0)}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
