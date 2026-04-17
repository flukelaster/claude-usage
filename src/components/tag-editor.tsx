import { useState } from 'react'
import { Plus, Tag as TagIcon } from 'lucide-react'
import {
  useAssignTag,
  useCreateTag,
  useEntityTags,
  useTagList,
  useUnassignTag,
} from '~/hooks/useTags'
import type { EntityType } from '~/server/functions/tags'
import { TagPill } from './tag-pill'

interface TagEditorProps {
  entityType: EntityType
  entityId: string
}

/**
 * Renders the set of tags currently applied to an entity with a small
 * popover for adding new tags (either selecting an existing one or
 * creating one on the fly).
 */
export function TagEditor({ entityType, entityId }: TagEditorProps) {
  const { data: assignedRaw } = useEntityTags(entityType, entityId)
  const { data: allTagsRaw } = useTagList()
  const assignTag = useAssignTag()
  const unassignTag = useUnassignTag()
  const createTag = useCreateTag()

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const assigned = assignedRaw ?? []
  const assignedIds = new Set(assigned.map((t) => t.id))
  const available = (allTagsRaw ?? []).filter((t) => !assignedIds.has(t.id))

  async function addDraft() {
    const name = draft.trim()
    if (!name) return
    const existing = (allTagsRaw ?? []).find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    )
    const tagId = existing
      ? existing.id
      : (await createTag.mutateAsync({ name })).id
    await assignTag.mutateAsync({ tagId, entityType, entityId })
    setDraft('')
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {assigned.map((t) => (
        <TagPill
          key={t.id}
          name={t.name}
          color={t.color}
          onRemove={() =>
            unassignTag.mutate({ tagId: t.id, entityType, entityId })
          }
        />
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
          style={{
            backgroundColor: 'transparent',
            border: '1px dashed var(--color-border)',
            color: 'var(--color-muted-foreground)',
          }}
        >
          <Plus size={12} />
          Tag
        </button>
        {open && (
          <div
            className="absolute left-0 top-full mt-2 w-60 rounded-lg p-3 z-20"
            style={{
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.05), 0 0 0 1px var(--color-border)',
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                addDraft()
              }}
              className="flex items-center gap-2"
            >
              <TagIcon size={14} style={{ color: 'var(--color-muted-foreground)' }} />
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="New or existing tag"
                className="flex-1 rounded px-2 py-1 text-xs outline-none"
                style={{
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                }}
                autoFocus
              />
              <button
                type="submit"
                className="text-xs rounded px-2 py-1"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-primary-foreground)',
                }}
              >
                Add
              </button>
            </form>
            {available.length > 0 && (
              <>
                <p
                  className="mt-3 text-[10px] uppercase tracking-wide"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  Suggestions
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {available.slice(0, 12).map((t) => (
                    <TagPill
                      key={t.id}
                      name={t.name}
                      color={t.color}
                      onClick={() => {
                        assignTag.mutate({ tagId: t.id, entityType, entityId })
                        setOpen(false)
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
