import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from './keys'

export function useBootstrap() {
  return useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: () => api.app.getBootstrapStatus(),
    staleTime: 5_000
  })
}
