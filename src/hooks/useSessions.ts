import { useQuery } from '@tanstack/react-query'
import { getSessions, getSessionDetail } from '~/server/functions/get-sessions'
import { queryKeys } from './queryKeys'
import type { SessionsData, SessionDetail } from '~/types'

export function useSessions() {
  return useQuery<SessionsData>({
    queryKey: queryKeys.sessions(),
    queryFn: () => getSessions(),
  })
}

export function useSessionDetail(sessionId: string) {
  return useQuery<SessionDetail>({
    queryKey: queryKeys.sessionDetail(sessionId),
    queryFn: () => getSessionDetail({ data: { sessionId } }),
    enabled: !!sessionId,
  })
}
