import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: string
  icon?: ReactNode
  className?: string
}

const cardStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  boxShadow: '0px 0px 0px 1px var(--color-border)',
}

export function KpiCard({ label, value, icon, className = '' }: KpiCardProps) {
  return (
    <div className={`rounded-lg p-6 ${className}`} style={cardStyle}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{label}</span>
      </div>
      <p
        className="mt-2 text-2xl"
        style={{ fontFamily: 'Georgia, serif', fontWeight: 500, color: 'var(--color-foreground)' }}
      >
        {value}
      </p>
    </div>
  )
}
