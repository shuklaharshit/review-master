import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from './keys'
import type { AppSettings, CodexModel } from '@shared/types'

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: queryKeys.settings,
    queryFn: () => api.settings.get(),
    staleTime: 30_000
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api.settings.update(patch),
    onSuccess: (next) => {
      qc.setQueryData(queryKeys.settings, next)
    }
  })
}

export function useModels() {
  return useQuery<CodexModel[]>({
    queryKey: queryKeys.models,
    queryFn: () => api.codex.listModels(),
    staleTime: 5 * 60_000
  })
}
