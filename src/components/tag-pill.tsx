import type { MouseEventHandler } from 'react'
import { X } from 'lucide-react'

interface TagPillProps {
  name: string
  color?: string | null
  onRemove?: MouseEventHandler<HTMLButtonElement>
  onClick?: MouseEventHandler<HTMLButtonElement>
  active?: boolean
  size?: 'sm' | 'md'
}

const DEFAULT_COLORS = [
  '#c96442', // terracotta
  '#d97757', // coral
  '#87867f', // stone
  '#5e5d59', // olive
  '#b0aea5', // warm silver
]

/**
 * Stable color choice for an untagged tag — pick a palette entry based on
 * the tag name's char codes so the same tag always renders the same color.
 */
function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return DEFAULT_COLORS[h % DEFAULT_COLORS.length]
}

export function TagPill({
  name,
  color,
  onRemove,
  onClick,
  active,
  size = 'sm',
}: TagPillProps) {
  const fill = color || hashColor(name)
  const sizeClasses =
    size === 'sm'
      ? 'text-[11px] px-2 py-0.5'
      : 'text-xs px-2.5 py-1'

  const content = (
    <>
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: fill }}
      />
      <span>{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(e)
          }}
          className="ml-0.5 flex items-center justify-center opacity-60 hover:opacity-100"
          style={{ color: 'currentColor' }}
        >
          <X size={10} />
        </button>
      )}
    </>
  )

  const commonStyle: React.CSSProperties = {
    backgroundColor: active ? fill : 'var(--color-secondary)',
    color: active ? '#faf9f5' : 'var(--color-foreground)',
    border: '1px solid var(--color-border)',
  }
  const className = `inline-flex items-center gap-1.5 rounded-full ${sizeClasses} whitespace-nowrap`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={commonStyle}>
        {content}
      </button>
    )
  }

  return (
    <span className={className} style={commonStyle}>
      {content}
    </span>
  )
}
