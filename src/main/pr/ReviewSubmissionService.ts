import type {
  DraftInlineComment,
  FinishReviewParams,
  PullRequestRef,
  SubmitDraftParams,
  SubmittedReview
} from '../../shared/types'
import type { Database } from '../db/types'
import type { GitProvider, SubmitReviewInlineComment } from '../providers/GitProvider'
import { appError } from '../../shared/result'
import { nowIso } from '../../shared/dates'
import { logger } from '../app/Logger'
import { withReviewBranding } from './reviewBranding'
import type { ReviewSubmissionDeps } from './prTypes'

type ReviewEvent = 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'

export class ReviewSubmissionService {
  private readonly log = logger.scope('review-submit')
  private readonly db: Database
  private readonly provider: GitProvider

  constructor(deps: ReviewSubmissionDeps) {
    this.db = deps.db
    this.provider = deps.provider
  }

  /**
   * Submits the draft as a single GitHub PR review body (event defaults to
   * COMMENT). On success marks the draft submitted and the snapshot reviewed.
   * On failure the draft is left untouched and an AppError is rethrown so the
   * caller can surface Copy Markdown / Retry (spec §16).
   */
  async submit(params: SubmitDraftParams): Promise<SubmittedReview> {
    const draft = this.db.drafts.getById(params.draftId)
    if (!draft) {
      throw appError('draft_not_found', 'Review draft no longer exists.', false)
    }
    const inlineComments = params.comments ?? []
    const event = params.event ?? 'COMMENT'
    const hasBody = !!draft.markdown && draft.markdown.trim().length > 0
    // An Approve needs no content; Comment/Request-changes must carry a body or
    // at least one inline comment (GitHub rejects an empty one of those).
    if (event !== 'APPROVE' && !hasBody && inlineComments.length === 0) {
      throw appError('empty_draft', 'Add a summary or inline comments, or choose Approve.', true)
    }

    const submitted = await this.performSubmit(params.ref, draft.markdown, event, inlineComments)

    // On success: update draft + review status.
    const submittedAt = submitted.submittedAt || nowIso()
    this.db.drafts.update(draft.id, {
      status: 'submitted',
      githubReviewId: submitted.githubReviewId,
      submittedAt,
      updatedAt: nowIso()
    })

    const headSha = this.db.snapshots.getById(draft.snapshotId)?.headSha
    this.db.reviewStatuses.setStatus(draft.pullRequestId, draft.snapshotId, 'reviewed', headSha)

    this.log.info('review submitted', {
      draftId: draft.id,
      githubReviewId: submitted.githubReviewId
    })
    return submitted
  }

  /**
   * Submits a hand-authored review (no AI draft) — a free-form summary and/or
   * pending inline comments. On success marks the latest snapshot reviewed.
   */
  async finishReview(params: FinishReviewParams): Promise<SubmittedReview> {
    const inlineComments = params.comments ?? []
    const event = params.event ?? 'COMMENT'
    const hasBody = !!params.body && params.body.trim().length > 0
    // Approve may be empty; Comment/Request-changes need a body or inline notes.
    if (event !== 'APPROVE' && !hasBody && inlineComments.length === 0) {
      throw appError('empty_draft', 'Add a summary or inline comments, or choose Approve.', true)
    }

    const submitted = await this.performSubmit(params.ref, params.body ?? '', event, inlineComments)

    this.markReviewed(params.ref)
    this.log.info('hand-authored review submitted', {
      number: params.ref.number,
      githubReviewId: submitted.githubReviewId
    })
    return submitted
  }

  /**
   * Shared submit path: best-effort PR-state precheck, then post the (branded)
   * review with its inline comments. Rethrows provider failures as a recoverable
   * AppError so the caller can offer Copy Markdown / Retry (spec §16).
   */
  private async performSubmit(
    ref: PullRequestRef,
    body: string,
    event: ReviewEvent,
    comments: DraftInlineComment[]
  ): Promise<SubmittedReview> {
    // Best-effort PR state check. Closed/merged still attempts the submit;
    // GitHub will reject if it disallows it (spec §22.14).
    try {
      const pr = await this.provider.getPullRequest(ref)
      if (pr.state === 'closed' || pr.state === 'merged') {
        this.log.warn('submitting review to a non-open PR', { number: ref.number, state: pr.state })
      }
    } catch (error) {
      this.log.debug('PR state precheck failed; proceeding with submit', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    const inline: SubmitReviewInlineComment[] = comments.map((c) => ({
      path: c.path,
      body: c.body,
      line: c.line,
      side: c.side,
      startLine: c.startLine,
      startSide: c.startSide
    }))

    try {
      return await this.provider.submitPullRequestReview({
        ref,
        // Attribution footer is injected here only — the stored draft and the
        // live preview keep the unbranded markdown. A content-free review (e.g.
        // a bare Approve) stays empty so we don't turn "no comment" into a
        // footer-only comment.
        body: body.trim().length > 0 ? withReviewBranding(body) : '',
        event,
        comments: inline
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log.error('review submission failed', { number: ref.number, error: message })
      throw appError('review_submit_failed', message, true, error)
    }
  }

  /** Marks the latest snapshot of a PR as reviewed without submitting. */
  markReviewed(ref: PullRequestRef): void {
    const pr = this.db.pullRequests.getByNumber(ref.repoId, ref.number)
    if (!pr) return
    const snapshot = this.db.snapshots.latestForPr(pr.id)
    if (!snapshot) return
    this.db.reviewStatuses.setStatus(pr.id, snapshot.id, 'reviewed', snapshot.headSha)
  }
}
