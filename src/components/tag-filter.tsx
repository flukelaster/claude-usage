import { useTagList } from '~/hooks/useTags'
import { TagPill } from './tag-pill'

interface TagFilterProps {
  selected: string[]
  onToggle: (tagId: string) => void
  onClear: () => void
  label?: string
}

/**
 * Horizontal list of tag pills used to filter project/session tables.
 * Selected tags render in their filled color; tapping a pill toggles it.
 */
export function TagFilter({ selected, onToggle, onClear, label = 'Filter by tag' }: TagFilterProps) {
  const { data } = useTagList()
  const tags = data ?? []
  if (tags.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
        {label}
      </span>
      {tags.map((t) => (
        <TagPill
          key={t.id}
          name={t.name}
          color={t.color}
          active={selected.includes(t.id)}
          onClick={() => onToggle(t.id)}
        />
      ))}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs underline"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          Clear
        </button>
      )}
    </div>
  )
}
