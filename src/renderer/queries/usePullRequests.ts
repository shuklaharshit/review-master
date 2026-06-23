import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from './keys'
import type { PaginatedResult, PullRequest, PullRequestFilter, Repository } from '@shared/types'

const PER_PAGE = 25

export function usePullRequests(
  accountId: string | null,
  repo: Repository | null,
  filter: PullRequestFilter,
  query: string
) {
  const trimmed = query.trim()
  return useInfiniteQuery<PaginatedResult<PullRequest>>({
    queryKey:
      accountId && repo
        ? queryKeys.pullRequests({ accountId, repoId: repo.id, filter, query: trimmed })
        : ['pullRequests', 'none'],
    enabled: !!accountId && !!repo,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.prs.list({
        accountId: accountId as string,
        repoId: (repo as Repository).id,
        owner: (repo as Repository).owner,
        repo: (repo as Repository).name,
        filter,
        query: trimmed || undefined,
        page: pageParam as number,
        perPage: PER_PAGE
      }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 30_000
  })
}
