import type { ReactNode } from 'react'
import type { ReviewSummary, WorkspaceState } from '@shared/types'
import { Avatar } from '../ui/misc'
import { CheckIcon, XIcon, MessageIcon, CircleIcon } from '../ui/icons'
import { RiskFindingPanel } from './RiskFindingPanel'
import { ChecksPanel } from './ChecksPanel'

function Section({ title, count, children }: { title: string; count?: number | string; children: ReactNode }): JSX.Element {
  return (
    <section className="border-b border-border-subtle py-3">
      <div className="mb-2 flex items-center justify-between px-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
        {count !== undefined && <span className="text-[11px] text-text-muted">{count}</span>}
      </div>
      {children}
    </section>
  )
}

function ReviewerStateIcon({ state }: { state: ReviewSummary['state'] }): JSX.Element {
  switch (state) {
    case 'APPROVED':
      return <CheckIcon className="h-3.5 w-3.5 text-success" />
    case 'CHANGES_REQUESTED':
      return <XIcon className="h-3.5 w-3.5 text-danger" />
    case 'COMMENTED':
      return <MessageIcon className="h-3.5 w-3.5 text-info" />
    default:
      return <CircleIcon className="h-3.5 w-3.5 text-text-muted" />
  }
}

export function PrIntelligencePanel({ workspace }: { workspace: WorkspaceState }): JSX.Element {
  const { context, preflight } = workspace
  const findings = preflight?.analysis?.riskFindings ?? []

  // De-duplicate reviewers, keeping their latest state.
  const reviewerMap = new Map<string, ReviewSummary>()
  for (const r of context.reviews) reviewerMap.set(r.login, r)
  const reviewers = Array.from(reviewerMap.values())

  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-auto border-l border-border-subtle bg-background">
      <div className="border-b border-border-subtle px-3 py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-text-muted">PR Intelligence</span>
      </div>

      <Section title="AI Issues & Risks" count={findings.length}>
        <RiskFindingPanel findings={findings} />
      </Section>

      <Section title="Flags" count={0}>
        <p className="px-3 text-[12px] text-text-muted">No flags.</p>
      </Section>

      <Section title="Checks">
        <ChecksPanel checks={context.checks} />
      </Section>

      <Section title="Reviewers" count={reviewers.length + context.requestedReviewers.length}>
        <div className="space-y-1 px-3">
          {reviewers.map((r) => (
            <div key={r.login} className="flex items-center gap-2 text-[12px]">
              <Avatar src={r.avatarUrl} alt={r.login} size={18} />
              <span className="flex-1 truncate text-text-secondary">{r.login}</span>
              <ReviewerStateIcon state={r.state} />
            </div>
          ))}
          {context.requestedReviewers.map((r) => (
            <div key={`req-${r.login}`} className="flex items-center gap-2 text-[12px]">
              <Avatar src={r.avatarUrl} alt={r.login} size={18} />
              <span className="flex-1 truncate text-text-muted">{r.login}</span>
              <CircleIcon className="h-3.5 w-3.5 text-text-muted" />
            </div>
          ))}
          {reviewers.length === 0 && context.requestedReviewers.length === 0 && (
            <p className="text-[12px] text-text-muted">No reviewers yet.</p>
          )}
        </div>
      </Section>

      <Section title="Assignees" count={context.assignees.length}>
        <div className="space-y-1 px-3">
          {context.assignees.length === 0 ? (
            <p className="text-[12px] text-text-muted">No assignees</p>
          ) : (
            context.assignees.map((a) => (
              <div key={a.login} className="flex items-center gap-2 text-[12px]">
                <Avatar src={a.avatarUrl} alt={a.login} size={18} />
                <span className="truncate text-text-secondary">{a.login}</span>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Labels" count={context.labels.length}>
        <div className="flex flex-wrap gap-1.5 px-3">
          {context.labels.length === 0 ? (
            <p className="text-[12px] text-text-muted">No labels assigned</p>
          ) : (
            context.labels.map((l) => (
              <span
                key={l.name}
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]"
                style={{
                  borderColor: l.color ? `#${l.color}66` : 'var(--border-strong)',
                  color: l.color ? `#${l.color}` : 'var(--text-secondary)',
                  backgroundColor: l.color ? `#${l.color}1a` : 'transparent'
                }}
              >
                {l.name}
              </span>
            ))
          )}
        </div>
      </Section>
    </aside>
  )
}
