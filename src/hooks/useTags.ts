import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getTags,
  getEntityTags,
  getTagsForEntities,
  createTag,
  deleteTag,
  assignTag,
  unassignTag,
  type EntityType,
  type TagRow,
} from '~/server/functions/tags'

const TAGS_KEY = ['tags'] as const
const entityTagsKey = (entityType: EntityType, entityId: string) =>
  ['entity-tags', entityType, entityId] as const
const bulkTagsKey = (entityType: EntityType, ids: string[]) =>
  ['bulk-tags', entityType, [...ids].sort().join(',')] as const

export function useTagList() {
  return useQuery<TagRow[]>({
    queryKey: TAGS_KEY,
    queryFn: () => getTags(),
  })
}

export function useEntityTags(entityType: EntityType, entityId: string) {
  return useQuery({
    queryKey: entityTagsKey(entityType, entityId),
    queryFn: () => getEntityTags({ data: { entityType, entityId } }),
    enabled: !!entityId,
  })
}

export function useTagsForEntities(entityType: EntityType, ids: string[]) {
  return useQuery({
    queryKey: bulkTagsKey(entityType, ids),
    queryFn: () => getTagsForEntities({ data: { entityType, ids } }),
    enabled: ids.length > 0,
  })
}

function useInvalidateTagQueries() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['tags'] })
    qc.invalidateQueries({ queryKey: ['entity-tags'] })
    qc.invalidateQueries({ queryKey: ['bulk-tags'] })
  }
}

export function useCreateTag() {
  const invalidate = useInvalidateTagQueries()
  return useMutation({
    mutationFn: (data: { name: string; color?: string | null }) =>
      createTag({ data }),
    onSuccess: invalidate,
  })
}

export function useDeleteTag() {
  const invalidate = useInvalidateTagQueries()
  return useMutation({
    mutationFn: (id: string) => deleteTag({ data: { id } }),
    onSuccess: invalidate,
  })
}

export function useAssignTag() {
  const invalidate = useInvalidateTagQueries()
  return useMutation({
    mutationFn: (data: { tagId: string; entityType: EntityType; entityId: string }) =>
      assignTag({ data }),
    onSuccess: invalidate,
  })
}

export function useUnassignTag() {
  const invalidate = useInvalidateTagQueries()
  return useMutation({
    mutationFn: (data: { tagId: string; entityType: EntityType; entityId: string }) =>
      unassignTag({ data }),
    onSuccess: invalidate,
  })
}
