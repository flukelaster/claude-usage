import { useQuery } from '@tanstack/react-query'
import {
  getUnknownModels,
  type UnknownModelRow,
} from '~/server/functions/get-unknown-models'
import { queryKeys } from './queryKeys'

export function useUnknownModels() {
  return useQuery<UnknownModelRow[]>({
    queryKey: queryKeys.unknownModels(),
    queryFn: () => getUnknownModels(),
  })
}
