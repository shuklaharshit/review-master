import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from './keys'
import type { PaginatedResult, Repository } from '@shared/types'

const PER_PAGE = 30

/** Paginated repository list for an account. */
export function useRepos(accountId: string | null) {
  return useInfiniteQuery<PaginatedResult<Repository>>({
    queryKey: accountId ? queryKeys.repos(accountId) : ['repos', 'none'],
    enabled: !!accountId,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.repos.list({ accountId: accountId as string, page: pageParam as number, perPage: PER_PAGE, sort: 'updated' }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 60_000
  })
}

/** Debounced repository search (caller debounces the query string). */
export function useRepoSearch(accountId: string | null, query: string) {
  const trimmed = query.trim()
  return useInfiniteQuery<PaginatedResult<Repository>>({
    queryKey: accountId ? queryKeys.repoSearch(accountId, trimmed) : ['repos', 'search', 'none'],
    enabled: !!accountId && trimmed.length > 0,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.repos.search({ accountId: accountId as string, query: trimmed, page: pageParam as number, perPage: PER_PAGE }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 30_000
  })
}
