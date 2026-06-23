import type {
  PullRequestRef,
  SubmitDraftParams,
  SubmittedReview
} from '../../shared/types'
import type { Database } from '../db/types'
import type { GitProvider } from '../providers/GitProvider'
import { appError } from '../../shared/result'
import { nowIso } from '../../shared/dates'
import { logger } from '../app/Logger'
import type { ReviewSubmissionDeps } from './prTypes'

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
    if (!draft.markdown || draft.markdown.trim().length === 0) {
      throw appError('empty_draft', 'Cannot submit an empty review.', true)
    }

    // Best-effort PR state check. Closed/merged still attempts the submit;
    // GitHub will reject if it disallows it (spec §22.14).
    try {
      const pr = await this.provider.getPullRequest(params.ref)
      if (pr.state === 'closed' || pr.state === 'merged') {
        this.log.warn('submitting review to a non-open PR', {
          number: params.ref.number,
          state: pr.state
        })
      }
    } catch (error) {
      this.log.debug('PR state precheck failed; proceeding with submit', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    let submitted: SubmittedReview
    try {
      submitted = await this.provider.submitPullRequestReview({
        ref: params.ref,
        body: draft.markdown,
        event: params.event ?? 'COMMENT'
      })
    } catch (error) {
      // Keep the draft as-is; rethrow as an AppError for the caller.
      const message = error instanceof Error ? error.message : String(error)
      this.log.error('review submission failed', { draftId: params.draftId, error: message })
      throw appError('review_submit_failed', message, true, error)
    }

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

  /** Marks the latest snapshot of a PR as reviewed without submitting. */
  markReviewed(ref: PullRequestRef): void {
    const pr = this.db.pullRequests.getByNumber(ref.repoId, ref.number)
    if (!pr) return
    const snapshot = this.db.snapshots.latestForPr(pr.id)
    if (!snapshot) return
    this.db.reviewStatuses.setStatus(pr.id, snapshot.id, 'reviewed', snapshot.headSha)
  }
}
