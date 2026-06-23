import { useMemo, useState } from 'react'
import type { Repository } from '@shared/types'
import { relativeTime } from '@shared/dates'
import { useRepos, useRepoSearch } from '../queries/useRepos'
import { useAppStore } from '../stores/appStore'
import { useDebounced } from '../lib/useDebounced'
import { Button } from '../components/ui/Button'
import { SearchInput } from '../components/ui/Input'
import { Badge, Card, EmptyState, Skeleton } from '../components/ui/misc'
import { AlertTriangleIcon, ChevronRightIcon, FolderIcon } from '../components/ui/icons'

function RepoCard({ repo, onOpen }: { repo: Repository; onOpen: (repo: Repository) => void }) {
  return (
    <button type="button" onClick={() => onOpen(repo)} className="block w-full text-left">
      <Card className="flex items-center gap-3 px-4 py-3 transition-colors hover:border-border-strong hover:bg-background-panel-hover">
        <FolderIcon className="h-4 w-4 shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-text-primary">{repo.fullName}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
            <span>{repo.private ? 'Private' : 'Public'}</span>
            {repo.language && (
              <>
                <span>·</span>
                <span>{repo.language}</span>
              </>
            )}
            {repo.updatedAt && (
              <>
                <span>·</span>
                <span>Updated {relativeTime(repo.updatedAt)}</span>
              </>
            )}
          </div>
        </div>
        {repo.private && <Badge tone="neutral">Private</Badge>}
        <ChevronRightIcon className="h-4 w-4 text-text-muted" />
      </Card>
    </button>
  )
}

export function Repositories() {
  const accountId = useAppStore((s) => s.activeAccountId)
  const selectRepo = useAppStore((s) => s.selectRepo)
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search, 350)
  const searching = debounced.trim().length > 0

  const reposQuery = useRepos(searching ? null : accountId)
  const searchQuery = useRepoSearch(searching ? accountId : null, debounced)
  const active = searching ? searchQuery : reposQuery

  const items = useMemo<Repository[]>(
    () => active.data?.pages.flatMap((p) => p.items) ?? [],
    [active.data]
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border-subtle px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <h1 className="text-base font-semibold text-text-primary">Repositories</h1>
          <SearchInput
            placeholder="Search repositories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-2">
          {active.isLoading && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[58px] w-full" />)}

          {active.isError && (
            <EmptyState
              icon={<AlertTriangleIcon className="h-6 w-6 text-danger" />}
              title="Failed to load repositories"
              description={active.error instanceof Error ? active.error.message : 'An unexpected error occurred.'}
              action={
                <Button variant="secondary" size="sm" onClick={() => active.refetch()}>
                  Retry
                </Button>
              }
            />
          )}

          {!active.isLoading && !active.isError && items.length === 0 && (
            <EmptyState
              icon={<FolderIcon className="h-6 w-6" />}
              title={searching ? 'No repositories match your search' : 'No repositories found'}
              description={searching ? 'Try a different search term.' : 'This account has no accessible repositories.'}
            />
          )}

          {items.map((repo) => (
            <RepoCard key={repo.id} repo={repo} onOpen={selectRepo} />
          ))}

          {active.hasNextPage && (
            <div className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                loading={active.isFetchingNextPage}
                onClick={() => active.fetchNextPage()}
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
