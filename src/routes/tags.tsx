import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Tag as TagIcon, Trash2 } from 'lucide-react'
import { useCreateTag, useDeleteTag, useTagList } from '~/hooks/useTags'
import { TagPill } from '~/components/tag-pill'
import { Card } from '~/components/ui/card'
import { EmptyState } from '~/components/ui/empty-state'

export const Route = createFileRoute('/tags')({
  component: TagsPage,
})

function TagsPage() {
  const { data } = useTagList()
  const createTag = useCreateTag()
  const deleteTag = useDeleteTag()
  const [name, setName] = useState('')
  const [color, setColor] = useState('')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl">Tags</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          Label projects and sessions for filtering and grouping.
        </p>
      </div>

      <Card title="Create Tag">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = name.trim()
            if (!trimmed) return
            createTag.mutate({ name: trimmed, color: color || null })
            setName('')
            setColor('')
          }}
          className="flex items-end gap-3 flex-wrap"
        >
          <div className="flex-1 min-w-[160px]">
            <label
              className="text-xs block mb-1"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. client-acme"
              className="w-full rounded-md px-2 py-1.5 text-sm"
              style={{
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>
          <div>
            <label
              className="text-xs block mb-1"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              Color
            </label>
            <input
              type="color"
              value={color || '#c96442'}
              onChange={(e) => setColor(e.target.value)}
              className="rounded-md h-8 w-12 cursor-pointer"
              style={{ border: '1px solid var(--color-border)' }}
            />
          </div>
          <button
            type="submit"
            disabled={createTag.isPending}
            className="rounded-md px-4 py-1.5 text-sm"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)',
            }}
          >
            Create
          </button>
        </form>
      </Card>

      {data && data.length === 0 && (
        <EmptyState
          title="No tags yet"
          description="Create a tag above, then attach it to a project or session from its detail page."
          icon={<TagIcon size={28} />}
        />
      )}

      {data && data.length > 0 && (
        <Card title={`${data.length} Tag${data.length === 1 ? '' : 's'}`}>
          <ul className="space-y-2">
            {data.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-md px-3 py-2"
                style={{ backgroundColor: 'var(--color-background)' }}
              >
                <TagPill name={t.name} color={t.color} size="md" />
                <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  <span>
                    {t.usageCount} use{t.usageCount === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete tag "${t.name}"? It will be removed from ${t.usageCount} entities.`)) {
                        deleteTag.mutate(t.id)
                      }
                    }}
                    className="flex items-center gap-1 hover:text-[var(--color-primary)]"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
