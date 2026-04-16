export type Period = '30d' | '90d' | 'all'

export const PERIOD_LABELS: Record<Period, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
}

export interface PeriodAware {
  days: number | null
}
