import type { ListPullRequestsParams, PullRequestRef } from '@shared/types'

/** Centralised TanStack Query keys. */
export const queryKeys = {
  bootstrap: ['bootstrap'] as const,
  accounts: ['accounts'] as const,
  installations: (accountId: string) => ['accounts', 'installations', accountId] as const,
  settings: ['settings'] as const,
  models: ['codex', 'models'] as const,
  repos: (accountId: string, sort?: string) => ['repos', accountId, sort ?? 'updated'] as const,
  repoSearch: (accountId: string, query: string) => ['repos', 'search', accountId, query] as const,
  pullRequests: (params: Pick<ListPullRequestsParams, 'accountId' | 'repoId' | 'filter' | 'query'>) =>
    ['pullRequests', params.accountId, params.repoId, params.filter ?? 'open', params.query ?? ''] as const,
  workspace: (ref: PullRequestRef) =>
    ['workspace', ref.accountId, ref.repoId, ref.number] as const,
  draft: (ref: PullRequestRef) => ['draft', ref.accountId, ref.repoId, ref.number] as const,
  conversation: (ref: PullRequestRef) =>
    ['conversation', ref.accountId, ref.repoId, ref.number] as const,
  mergeRequirements: (ref: PullRequestRef) =>
    ['mergeRequirements', ref.accountId, ref.repoId, ref.number] as const,
  fileContent: (ref: PullRequestRef, path: string, sha: string) =>
    ['fileContent', ref.accountId, ref.repoId, ref.number, sha, path] as const
}
