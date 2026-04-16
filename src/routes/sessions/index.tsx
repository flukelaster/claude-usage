import { createFileRoute, Link } from '@tanstack/react-router'
import { Terminal, Code, MessageSquare } from 'lucide-react'

import { useSessions } from '~/hooks/useSessions'
import { formatTokens, formatCost, formatRelativeTime } from '~/lib/format'
import { Card } from '~/components/ui/card'
import { EmptyState } from '~/components/ui/empty-state'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { DataTable } from '~/components/tables/data-table'

export const Route = createFileRoute('/sessions/')({
  component: SessionsPage,
})

function SessionsPage() {
  const { data, isLoading } = useSessions()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl">Sessions</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          All Claude Code sessions
        </p>
      </div>

      {isLoading && <LoadingSkeleton cols={1} height={280} />}

      {!isLoading && (!data || data.length === 0) && (
        <EmptyState
          title="No sessions yet"
          description="Click Sync Now on the overview page to import your Claude Code logs."
          icon={<MessageSquare size={28} />}
        />
      )}

      {data && data.length > 0 && (
        <Card>
          <DataTable
            rowKey={(s) => s.id}
            rows={data}
            columns={[
              {
                key: 'title',
                header: 'Session',
                cell: (s) => (
                  <Link
                    to="/sessions/$sessionId"
                    params={{ sessionId: s.id }}
                    className="flex items-center gap-2"
                  >
                    {s.entrypoint === 'cli' ? (
                      <Terminal size={14} style={{ color: 'var(--color-muted-foreground)' }} />
                    ) : (
                      <Code size={14} style={{ color: 'var(--color-muted-foreground)' }} />
                    )}
                    <span className="truncate max-w-[220px]" style={{ color: 'var(--color-foreground)' }}>
                      {s.title || s.slug || s.id.slice(0, 8)}
                    </span>
                  </Link>
                ),
              },
              {
                key: 'project',
                header: 'Project',
                cell: (s) => (
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: s.projectId }}
                    className="truncate max-w-[180px] block hover:underline"
                    style={{ color: 'var(--color-muted-foreground)' }}
                  >
                    {s.projectName}
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
      )}
    </div>
  )
}
