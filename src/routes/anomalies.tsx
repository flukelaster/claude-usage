import { createFileRoute } from '@tanstack/react-router'
import { AlertOctagon } from 'lucide-react'
import { useAnomalies } from '~/hooks/useAnomalies'
import { Card } from '~/components/ui/card'
import { EmptyState } from '~/components/ui/empty-state'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { formatCost } from '~/lib/format'

export const Route = createFileRoute('/anomalies')({
  component: AnomaliesPage,
})

function AnomaliesPage() {
  const { data, isLoading } = useAnomalies()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl">Cost Anomalies</h2>
        <LoadingSkeleton cols={1} height={280} />
      </div>
    )
  }

  if (!data || data.totalConsidered === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl">Cost Anomalies</h2>
        <EmptyState
          title="Nothing to compare yet"
          description="Anomaly detection needs sessions with non-zero cost. Run a sync once you have some activity."
          icon={<AlertOctagon size={28} />}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl">Cost Anomalies</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          Sessions with cost more than 2 standard deviations above the mean across{' '}
          {data.totalConsidered.toLocaleString()} scored sessions.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Mean cost" value={formatCost(data.mean)} />
        <Stat label="Std deviation" value={formatCost(data.stdev)} />
        <Stat label="Outlier threshold" value={formatCost(data.thresholdCost)} />
      </div>

      <Card title={`${data.sessions.length} Outlier Session${data.sessions.length === 1 ? '' : 's'}`}>
        {data.sessions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            No sessions exceed the threshold right now. Enjoy the calm.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  <th className="py-2 font-normal">Session</th>
                  <th className="py-2 font-normal">Project</th>
                  <th className="py-2 font-normal">Started</th>
                  <th className="py-2 font-normal text-right">Messages</th>
                  <th className="py-2 font-normal text-right">Cost</th>
                  <th className="py-2 font-normal text-right">z-score</th>
                  <th className="py-2 font-normal text-right">× avg</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="py-2">
                      <a
                        href={`/sessions/${s.id}`}
                        className="hover:underline"
                        style={{ color: 'var(--color-foreground)' }}
                      >
                        {s.title || s.slug || s.id.slice(0, 10)}
                      </a>
                    </td>
                    <td
                      className="py-2"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      {s.projectName}
                    </td>
                    <td
                      className="py-2 text-xs"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      {s.startedAt
                        ? new Date(s.startedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {s.messageCount.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatCost(s.totalCost)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {s.zScore.toFixed(1)}σ
                    </td>
                    <td
                      className="py-2 text-right tabular-nums"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      {s.costVsMean.toFixed(1)}×
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        boxShadow: '0px 0px 0px 1px var(--color-border)',
      }}
    >
      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{label}</p>
      <p
        className="mt-1 text-xl"
        style={{ fontFamily: 'Georgia, serif', fontWeight: 500 }}
      >
        {value}
      </p>
    </div>
  )
}
