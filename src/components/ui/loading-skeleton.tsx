interface LoadingSkeletonProps {
  rows?: number
  cols?: number
  height?: number
}

const cardStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
}

export function LoadingSkeleton({ rows = 1, cols = 3, height = 120 }: LoadingSkeletonProps) {
  const cells = rows * cols
  return (
    <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: cells }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg p-6 animate-pulse"
          style={{ ...cardStyle, height }}
        >
          <div
            className="h-4 w-20 rounded"
            style={{ backgroundColor: 'var(--color-secondary)' }}
          />
          <div
            className="mt-3 h-8 w-32 rounded"
            style={{ backgroundColor: 'var(--color-secondary)' }}
          />
        </div>
      ))}
    </div>
  )
}

export function InlineSkeleton({ width = 120, height = 16 }: { width?: number; height?: number }) {
  return (
    <span
      className="inline-block rounded animate-pulse"
      style={{ width, height, backgroundColor: 'var(--color-secondary)' }}
    />
  )
}
