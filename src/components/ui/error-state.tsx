import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

interface ErrorStateProps {
  message?: string
  action?: ReactNode
}

export function ErrorState({
  message = 'Failed to load data.',
  action,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <AlertCircle size={32} style={{ color: 'var(--color-muted-foreground)' }} />
      <p className="mt-3 text-lg" style={{ color: 'var(--color-muted-foreground)' }}>
        {message}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
