import type { ReactNode } from 'react'
import { Card } from '~/components/ui/card'

interface TopListItem {
  id: string
  primary: ReactNode
  secondary?: ReactNode
  trailing?: ReactNode
  href?: string
  icon?: ReactNode
}

interface TopListCardProps {
  title: string
  items: TopListItem[]
  emptyText?: string
}

/**
 * Sidebar-style list card used for "Recent Sessions", "Top Tools",
 * "Outlier sessions", etc. Renders hover-highlighted rows with an
 * optional leading icon, main text, secondary text, and trailing value.
 */
export function TopListCard({
  title,
  items,
  emptyText = 'No data yet',
}: TopListCardProps) {
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <Row item={item} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Row({ item }: { item: TopListItem }) {
  const content = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        {item.icon && (
          <span
            style={{
              color: 'var(--color-muted-foreground)',
              flexShrink: 0,
            }}
          >
            {item.icon}
          </span>
        )}
        <span className="truncate" style={{ color: 'var(--color-foreground)' }}>
          {item.primary}
        </span>
        {item.secondary && (
          <span
            className="truncate text-xs"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            {item.secondary}
          </span>
        )}
      </div>
      {item.trailing && (
        <span
          className="ml-2 whitespace-nowrap text-xs"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          {item.trailing}
        </span>
      )}
    </>
  )

  const className =
    'flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors'

  if (item.href) {
    return (
      <a
        href={item.href}
        className={className}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = 'var(--color-secondary)')
        }
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        {content}
      </a>
    )
  }
  return <div className={className}>{content}</div>
}
