import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg p-12 text-center"
      style={{
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      {icon && (
        <div className="mb-3" style={{ color: 'var(--color-muted-foreground)' }}>
          {icon}
        </div>
      )}
      <h3 className="text-lg" style={{ fontFamily: 'Georgia, serif' }}>{title}</h3>
      {description && (
        <p
          className="mt-2 text-sm max-w-sm"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
