import { useMemo, useState } from 'react'
import type { PullRequest, PullRequestFilter, PullRequestRef } from '@shared/types'
import { relativeTime } from '@shared/dates'
import { usePullRequests } from '../queries/usePullRequests'
import { useAppStore } from '../stores/appStore'
import { useDebounced } from '../lib/useDebounced'
import { Button } from '../components/ui/Button'
import { SearchInput } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Avatar, Card, EmptyState, Skeleton } from '../components/ui/misc'
import { PrStateBadge, ReviewStateBadge } from '../components/ui/StatusBadge'
import { AlertTriangleIcon, GitBranchIcon, MessageIcon } from '../components/ui/icons'

const FILTER_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'merged', label: 'Merged' },
  { value: 'all', label: 'All' }
]

function PullRequestRow({ pr, onOpen }: { pr: PullRequest; onOpen: (pr: PullRequest) => void }) {
  return (
    <button type="button" onClick={() => onOpen(pr)} className="block w-full text-left">
      <Card className="px-4 py-3 transition-colors hover:border-border-strong hover:bg-background-panel-hover">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="mono text-[12px] text-text-muted">#{pr.number}</span>
              <span className="truncate text-[13px] font-medium text-text-primary">{pr.title}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Avatar src={pr.author?.avatarUrl} alt={pr.author?.login} size={14} />
                {pr.author?.login ?? 'unknown'}
              </span>
              <span>·</span>
              <PrStateBadge state={pr.state} draft={pr.draft} />
              <span className="inline-flex items-center gap-1">
                <GitBranchIcon className="h-3 w-3" />
                <span className="mono">{pr.headBranch}</span>
              </span>
              {pr.updatedAt && <span>· {relativeTime(pr.updatedAt)}</span>}
            </div>
          </div>
          <ReviewStateBadge state={pr.localReviewState} />
        </div>
      </Card>
    </button>
  )
}

export function PullRequests() {
  const accountId = useAppStore((s) => s.activeAccountId)
  const repo = useAppStore((s) => s.selectedRepo)
  const openWorkspaceFor = useAppStore((s) => s.openWorkspaceFor)
  const [filter, setFilter] = useState<PullRequestFilter>('open')
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search, 350)

  const query = usePullRequests(accountId, repo, filter, debounced)
  const items = useMemo<PullRequest[]>(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data])

  function open(pr: PullRequest) {
    if (!accountId || !repo) return
    const ref: PullRequestRef = {
      accountId,
      repoId: repo.id,
      owner: repo.owner,
      repo: repo.name,
      number: pr.number
    }
    openWorkspaceFor(ref)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border-subtle px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-text-primary">{repo?.fullName ?? 'Pull Requests'}</h1>
            <div className="text-[11px] text-text-muted">Pull requests</div>
          </div>
          <div className="flex items-center gap-2">
            <SearchInput
              placeholder="Search PRs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-52"
            />
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as PullRequestFilter)}
              options={FILTER_OPTIONS}
              ariaLabel="Filter pull requests"
              className="w-28"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-2">
          {query.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[64px] w-full" />)}

          {query.isError && (
            <EmptyState
              icon={<AlertTriangleIcon className="h-6 w-6 text-danger" />}
              title="Failed to load pull requests"
              description={query.error instanceof Error ? query.error.message : 'An unexpected error occurred.'}
              action={
                <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
                  Retry
                </Button>
              }
            />
          )}

          {!query.isLoading && !query.isError && items.length === 0 && (
            <EmptyState
              icon={<MessageIcon className="h-6 w-6" />}
              title="No pull requests"
              description={`No ${filter === 'all' ? '' : filter + ' '}pull requests found for this repository.`}
            />
          )}

          {items.map((pr) => (
            <PullRequestRow key={pr.id} pr={pr} onOpen={open} />
          ))}

          {query.hasNextPage && (
            <div className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
