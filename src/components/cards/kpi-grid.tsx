import type { ReactNode } from 'react'
import { KpiCard } from '~/components/ui/kpi-card'

export interface KpiItem {
  label: string
  value: string
  icon?: ReactNode
}

/**
 * Standard KPI grid used across dashboards. Pass an array of items; the
 * grid uses a sensible default column count that caller can override.
 */
export function KpiGrid({
  items,
  columns = 3,
}: {
  items: KpiItem[]
  columns?: 2 | 3 | 4 | 5
}) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <KpiCard key={item.label} {...item} />
      ))}
    </div>
  )
}
