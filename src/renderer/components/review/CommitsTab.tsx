import { useState } from 'react'
import type { CommitSummary } from '@shared/types'
import { CommitIcon, ChevronRightIcon, ChevronDownIcon } from '../ui/icons'
import { EmptyState } from '../ui/misc'
import { relativeTime } from '@shared/dates'
import { cn } from '../ui/cn'

function splitMessage(message: string): { title: string; body: string } {
  const nl = message.indexOf('\n')
  if (nl === -1) return { title: message, body: '' }
  return { title: message.slice(0, nl), body: message.slice(nl + 1).trim() }
}

export function CommitsTab({ commits }: { commits: CommitSummary[] }): JSX.Element {
  if (commits.length === 0) {
    return <EmptyState title="No commits" description="This pull request has no commits to show." />
  }
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 text-[12px] text-text-muted">
        {commits.length} commit{commits.length === 1 ? '' : 's'}
      </div>
      <ol className="overflow-hidden rounded-lg border border-border-subtle">
        {commits.map((commit, i) => (
          <CommitRow key={commit.sha} commit={commit} first={i === 0} />
        ))}
      </ol>
    </div>
  )
}

function CommitRow({ commit, first }: { commit: CommitSummary; first: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const { title, body } = splitMessage(commit.message)
  const hasBody = body.length > 0
  return (
    <li className={cn('bg-background-panel', !first && 'border-t border-border-subtle')}>
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <CommitIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            disabled={!hasBody}
            onClick={() => setOpen((v) => !v)}
            className={cn('flex w-full items-center gap-1.5 text-left', hasBody && 'hover:text-text-primary')}
          >
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{title}</span>
            {hasBody &&
              (open ? (
                <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              ))}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-text-muted">
            {commit.author && <span>{commit.author}</span>}
            {commit.authoredAt && <span>· {relativeTime(commit.authoredAt)}</span>}
          </div>
          {open && hasBody && (
            <pre className="mono mt-2 whitespace-pre-wrap rounded bg-background px-2.5 py-2 text-[11.5px] leading-relaxed text-text-secondary">
              {body}
            </pre>
          )}
        </div>
        <span className="mono shrink-0 rounded bg-background px-1.5 py-0.5 text-[11px] text-text-muted">
          {commit.sha.slice(0, 7)}
        </span>
      </div>
    </li>
  )
}
