import type { LocalPrReviewState, PullRequestState } from '@shared/types'
import { Badge, type BadgeTone } from './misc'

// ---------------------------------------------------------------------------
// PR state badge (Open / Merged / Closed / Draft)
// ---------------------------------------------------------------------------
export function PrStateBadge({ state, draft }: { state: PullRequestState; draft?: boolean }) {
  if (draft && state === 'open') return <Badge tone="neutral">Draft</Badge>
  switch (state) {
    case 'open':
      return <Badge tone="success">Open</Badge>
    case 'merged':
      return <Badge tone="accent">Merged</Badge>
    case 'closed':
      return <Badge tone="danger">Closed</Badge>
    default:
      return <Badge tone="neutral">{state}</Badge>
  }
}

// ---------------------------------------------------------------------------
// Local review state badge (per spec PR list "Status:")
// ---------------------------------------------------------------------------
const reviewStateConfig: Record<LocalPrReviewState, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'neutral' },
  preflight_running: { label: 'Analysing…', tone: 'info' },
  preflight_ready: { label: 'Preflight ready', tone: 'accent' },
  preflight_failed: { label: 'Preflight failed', tone: 'danger' },
  preflight_stale: { label: 'Preflight stale', tone: 'warning' },
  review_generating: { label: 'Generating…', tone: 'info' },
  draft_available: { label: 'Draft available', tone: 'accent' },
  review_submitted: { label: 'Reviewed', tone: 'success' },
  needs_rereview: { label: 'Needs re-review', tone: 'warning' }
}

export function ReviewStateBadge({ state }: { state?: LocalPrReviewState }) {
  const cfg = state ? reviewStateConfig[state] : reviewStateConfig.new
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>
}
