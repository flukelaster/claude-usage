import { createServerFn } from '@tanstack/react-start'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '~/server/db/client'
import { tags, entityTags } from '~/server/db/schema'

export type EntityType = 'project' | 'session'

export interface TagRow {
  id: string
  name: string
  color: string | null
  createdAt: string
  usageCount: number
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `tag-${Date.now()}`
}

/**
 * Return every tag alongside the number of entities currently tagged.
 * The count is useful for showing "(3)" next to a tag in the UI.
 */
export const getTags = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TagRow[]> => {
    const db = getDb()
    const rows = db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        createdAt: tags.createdAt,
        usageCount: sql<number>`coalesce(count(${entityTags.tagId}), 0)`,
      })
      .from(tags)
      .leftJoin(entityTags, eq(entityTags.tagId, tags.id))
      .groupBy(tags.id)
      .orderBy(tags.name)
      .all()
    return rows
  },
)

export const createTag = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; color?: string | null }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    const name = data.name.trim()
    if (!name) throw new Error('Tag name required')
    const id = slugify(name)
    const now = new Date().toISOString()
    db.insert(tags)
      .values({ id, name, color: data.color ?? null, createdAt: now })
      .onConflictDoUpdate({
        target: tags.id,
        set: { name, color: data.color ?? null },
      })
      .run()
    return { id }
  })

export const deleteTag = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    db.delete(tags).where(eq(tags.id, data.id)).run()
    // entity_tags has ON DELETE CASCADE so cleanup is automatic.
    return { ok: true as const }
  })

export const assignTag = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    tagId: string
    entityType: EntityType
    entityId: string
  }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    const now = new Date().toISOString()
    db.insert(entityTags)
      .values({
        tagId: data.tagId,
        entityType: data.entityType,
        entityId: data.entityId,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run()
    return { ok: true as const }
  })

export const unassignTag = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    tagId: string
    entityType: EntityType
    entityId: string
  }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    db.delete(entityTags)
      .where(
        and(
          eq(entityTags.tagId, data.tagId),
          eq(entityTags.entityType, data.entityType),
          eq(entityTags.entityId, data.entityId),
        ),
      )
      .run()
    return { ok: true as const }
  })

/**
 * Return the tags attached to a specific entity. Used to render the
 * tag pill row on project / session detail pages.
 */
export const getEntityTags = createServerFn({ method: 'GET' })
  .inputValidator((data: { entityType: EntityType; entityId: string }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    const rows = db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        createdAt: tags.createdAt,
      })
      .from(entityTags)
      .innerJoin(tags, eq(tags.id, entityTags.tagId))
      .where(
        and(
          eq(entityTags.entityType, data.entityType),
          eq(entityTags.entityId, data.entityId),
        ),
      )
      .all()
    return rows
  })

/**
 * Bulk lookup: given a list of entity ids, return a map of id → tags.
 * Lets list pages render tag pills without N+1 queries.
 */
export const getTagsForEntities = createServerFn({ method: 'POST' })
  .inputValidator((data: { entityType: EntityType; ids: string[] }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    if (data.ids.length === 0) return {} as Record<string, Array<{ id: string; name: string; color: string | null }>>
    const rows = db
      .select({
        entityId: entityTags.entityId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(entityTags)
      .innerJoin(tags, eq(tags.id, entityTags.tagId))
      .where(
        and(
          eq(entityTags.entityType, data.entityType),
          sql`${entityTags.entityId} in (${sql.join(data.ids.map((id) => sql`${id}`), sql`, `)})`,
        ),
      )
      .all()

    const map: Record<string, Array<{ id: string; name: string; color: string | null }>> = {}
    for (const r of rows) {
      if (!map[r.entityId]) map[r.entityId] = []
      map[r.entityId].push({ id: r.id, name: r.name, color: r.color })
    }
    return map
  })
