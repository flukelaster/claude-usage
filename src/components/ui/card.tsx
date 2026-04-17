import type { ReactNode } from 'react'

const cardStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  boxShadow: '0px 0px 0px 1px var(--color-border)',
}

interface CardProps {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function Card({ title, action, children, className = '' }: CardProps) {
  return (
    <div className={`rounded-lg p-6 ${className}`} style={cardStyle}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-lg">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
