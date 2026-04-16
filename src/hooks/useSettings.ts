import { useQuery } from '@tanstack/react-query'
import { homedir } from '~/server/functions/get-settings'
import { queryKeys } from './queryKeys'

export function useHomedir() {
  return useQuery<string>({
    queryKey: queryKeys.homeDir(),
    queryFn: () => homedir(),
  })
}
