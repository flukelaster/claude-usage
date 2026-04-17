import { useQuery } from '@tanstack/react-query'
import { getProjects, getProjectDetail } from '~/server/functions/get-projects'
import { queryKeys } from './queryKeys'
import type { ProjectsData, ProjectDetail } from '~/types'

export function useProjects() {
  return useQuery<ProjectsData>({
    queryKey: queryKeys.projects(),
    queryFn: () => getProjects(),
  })
}

export function useProjectDetail(projectId: string) {
  return useQuery<ProjectDetail>({
    queryKey: queryKeys.projectDetail(projectId),
    queryFn: () => getProjectDetail({ data: { projectId } }),
    enabled: !!projectId,
  })
}
