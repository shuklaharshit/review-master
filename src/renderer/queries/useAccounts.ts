import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from './keys'
import type { GitProviderId, RemoveAccountOptions } from '@shared/types'

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.accounts.list(),
    staleTime: 30_000
  })
}

export function useStartAddAccount() {
  return useMutation({
    mutationFn: (providerId: GitProviderId) => api.accounts.startAddAccount(providerId)
  })
}

/**
 * Whether the GitHub App can see any installation for this account. Drives the
 * "Choose repositories" onboarding step (ADR-0007). `enabled` lets callers defer
 * the check until an account id is available.
 */
export function useHasInstallations(accountId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.installations(accountId ?? ''),
    queryFn: () => api.accounts.hasInstallations(accountId as string),
    enabled: enabled && !!accountId,
    staleTime: 10_000
  })
}

export function useSetActiveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => api.accounts.setActive(accountId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts })
      qc.invalidateQueries({ queryKey: queryKeys.settings })
    }
  })
}

export function useRemoveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, options }: { accountId: string; options?: RemoveAccountOptions }) =>
      api.accounts.remove(accountId, options),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts })
      qc.invalidateQueries({ queryKey: queryKeys.bootstrap })
    }
  })
}
