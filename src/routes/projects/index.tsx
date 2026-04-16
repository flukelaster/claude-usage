import { createFileRoute, Link } from '@tanstack/react-router'
import { FolderOpen } from 'lucide-react'

import { useProjects } from '~/hooks/useProjects'
import { formatTokens, formatCost, formatRelativeTime } from '~/lib/format'
import { Card } from '~/components/ui/card'
import { EmptyState } from '~/components/ui/empty-state'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { DataTable } from '~/components/tables/data-table'
import type { ProjectSummary } from '~/types'

export const Route = createFileRoute('/projects/')({
  component: ProjectsPage,
})

function ProjectsPage() {
  const { data, isLoading } = useProjects()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl">Projects</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          All projects with Claude Code usage
        </p>
      </div>

      {isLoading && <LoadingSkeleton cols={1} height={280} />}

      {!isLoading && (!data || data.length === 0) && (
        <EmptyState
          title="No projects yet"
          description="Run `pnpm sync` or click Sync Now on the overview page to import Claude Code logs."
          icon={<FolderOpen size={28} />}
        />
      )}

      {data && data.length > 0 && (
        <Card>
          <DataTable<ProjectSummary>
            rowKey={(p) => p.id}
            rows={data}
            columns={[
              {
                key: 'name',
                header: 'Project',
                cell: (p) => (
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="font-medium hover:underline"
                    style={{ color: 'var(--color-foreground)' }}
                  >
                    {p.displayName}
                  </Link>
                ),
              },
              {
                key: 'sessions',
                header: 'Sessions',
                align: 'right',
                cell: (p) => (
                  <span style={{ color: 'var(--color-muted-foreground)' }}>
                    {p.sessionCount}
                  </span>
                ),
              },
              {
                key: 'messages',
                header: 'Messages',
                align: 'right',
                cell: (p) => (
                  <span style={{ color: 'var(--color-muted-foreground)' }}>
                    {p.messageCount}
                  </span>
                ),
              },
              {
                key: 'tokens',
                header: 'Tokens',
                align: 'right',
                cell: (p) => (
                  <span style={{ color: 'var(--color-muted-foreground)' }}>
                    {formatTokens(
                      (p.totalInputTokens ?? 0) +
                        (p.totalOutputTokens ?? 0) +
                        (p.totalCacheCreationTokens ?? 0) +
                        (p.totalCacheReadTokens ?? 0),
                    )}
                  </span>
                ),
              },
              {
                key: 'cost',
                header: 'Cost',
                align: 'right',
                cell: (p) => (
                  <span className="font-medium tabular-nums">
                    {formatCost(p.totalCost ?? 0)}
                  </span>
                ),
              },
              {
                key: 'last',
                header: 'Last Active',
                align: 'right',
                cell: (p) => (
                  <span style={{ color: 'var(--color-muted-foreground)' }}>
                    {p.lastActiveAt ? formatRelativeTime(new Date(p.lastActiveAt)) : '—'}
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
