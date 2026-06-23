import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReviewSubmissionService } from '../ReviewSubmissionService'
import type { Database } from '../../db/types'
import type { GitProvider } from '../../providers/GitProvider'
import type {
  PrCommitSnapshot,
  PullRequestDetail,
  PullRequestRef,
  ReviewDraft,
  SubmitDraftParams,
  SubmittedReview
} from '../../../shared/types'
import type { AppError } from '../../../shared/result'

// ---------------------------------------------------------------------------
// Reference example: testing a service against lightweight, typed fakes.
//
// The service touches only a few DB repos and a couple of provider methods.
// We build minimal `vi.fn()`-backed fakes for exactly those, cast them to the
// real interfaces with `as unknown as <Type>`, and assert on the calls.
// ---------------------------------------------------------------------------

const ref: PullRequestRef = {
  accountId: 'acct1',
  repoId: 'repo1',
  owner: 'acme',
  repo: 'review-master',
  number: 42
}

function makeDraft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    id: 'draft1',
    pullRequestId: 'pr1',
    snapshotId: 'snap1',
    model: 'gpt-5.4',
    reasoningEffort: 'medium',
    markdown: 'LGTM with a few nits.',
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

const snapshot: PrCommitSnapshot = {
  id: 'snap1',
  pullRequestId: 'pr1',
  baseSha: 'base',
  headSha: 'head',
  commitIds: ['c1'],
  filesHash: 'fh',
  createdAt: '2026-01-01T00:00:00Z'
}

const openPr = { state: 'open' } as unknown as PullRequestDetail

interface Fakes {
  db: Database
  provider: GitProvider
  draftsGetById: ReturnType<typeof vi.fn>
  draftsUpdate: ReturnType<typeof vi.fn>
  setStatus: ReturnType<typeof vi.fn>
  snapshotsGetById: ReturnType<typeof vi.fn>
  submitReview: ReturnType<typeof vi.fn>
  getPullRequest: ReturnType<typeof vi.fn>
}

function buildFakes(draft: ReviewDraft | null): Fakes {
  const draftsGetById = vi.fn().mockReturnValue(draft)
  const draftsUpdate = vi.fn().mockImplementation((id: string, patch: Partial<ReviewDraft>) =>
    draft ? { ...draft, ...patch } : null
  )
  const setStatus = vi.fn()
  const snapshotsGetById = vi.fn().mockReturnValue(snapshot)
  const submitReview = vi.fn<() => Promise<SubmittedReview>>()
  const getPullRequest = vi.fn().mockResolvedValue(openPr)

  const db = {
    drafts: { getById: draftsGetById, update: draftsUpdate },
    snapshots: { getById: snapshotsGetById },
    reviewStatuses: { setStatus }
  } as unknown as Database

  const provider = {
    getPullRequest,
    submitPullRequestReview: submitReview
  } as unknown as GitProvider

  return {
    db,
    provider,
    draftsGetById,
    draftsUpdate,
    setStatus,
    snapshotsGetById,
    submitReview,
    getPullRequest
  }
}

function submitParams(overrides: Partial<SubmitDraftParams> = {}): SubmitDraftParams {
  return { draftId: 'draft1', ref, ...overrides }
}

describe('ReviewSubmissionService.submit', () => {
  let fakes: Fakes
  let service: ReviewSubmissionService

  beforeEach(() => {
    fakes = buildFakes(makeDraft())
    service = new ReviewSubmissionService({ db: fakes.db, provider: fakes.provider })
  })

  it('submits successfully: provider called, draft marked submitted, status set reviewed', async () => {
    const submitted: SubmittedReview = {
      githubReviewId: 'review-99',
      htmlUrl: 'https://github.com/acme/review-master/pull/42#review',
      submittedAt: '2026-06-23T10:00:00Z'
    }
    fakes.submitReview.mockResolvedValue(submitted)

    const result = await service.submit(submitParams())

    expect(result).toEqual(submitted)
    // Provider called with the draft body and default COMMENT event.
    expect(fakes.submitReview).toHaveBeenCalledTimes(1)
    expect(fakes.submitReview).toHaveBeenCalledWith({
      ref,
      body: 'LGTM with a few nits.',
      event: 'COMMENT'
    })
    // Draft updated to submitted with the returned review id + timestamp.
    expect(fakes.draftsUpdate).toHaveBeenCalledTimes(1)
    const [updatedId, patch] = fakes.draftsUpdate.mock.calls[0]
    expect(updatedId).toBe('draft1')
    expect(patch).toMatchObject({
      status: 'submitted',
      githubReviewId: 'review-99',
      submittedAt: '2026-06-23T10:00:00Z'
    })
    // Review status set to 'reviewed' for the draft's pr + snapshot, with head sha.
    expect(fakes.setStatus).toHaveBeenCalledWith('pr1', 'snap1', 'reviewed', 'head')
  })

  it('passes through a non-default event', async () => {
    fakes.submitReview.mockResolvedValue({
      githubReviewId: 'r1',
      submittedAt: '2026-06-23T10:00:00Z'
    })
    await service.submit(submitParams({ event: 'APPROVE' }))
    expect(fakes.submitReview).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'APPROVE' })
    )
  })

  it('throws empty_draft and does NOT call the provider for an empty draft', async () => {
    fakes = buildFakes(makeDraft({ markdown: '   ' }))
    service = new ReviewSubmissionService({ db: fakes.db, provider: fakes.provider })

    await expect(service.submit(submitParams())).rejects.toMatchObject({
      code: 'empty_draft'
    } satisfies Partial<AppError>)
    expect(fakes.submitReview).not.toHaveBeenCalled()
    expect(fakes.draftsUpdate).not.toHaveBeenCalled()
    expect(fakes.setStatus).not.toHaveBeenCalled()
  })

  it('throws draft_not_found when the draft is missing', async () => {
    fakes = buildFakes(null)
    service = new ReviewSubmissionService({ db: fakes.db, provider: fakes.provider })

    await expect(service.submit(submitParams())).rejects.toMatchObject({
      code: 'draft_not_found'
    } satisfies Partial<AppError>)
    expect(fakes.submitReview).not.toHaveBeenCalled()
  })

  it('propagates a provider failure and leaves the draft unmarked (kept for retry)', async () => {
    fakes.submitReview.mockRejectedValue(new Error('GitHub 422'))

    await expect(service.submit(submitParams())).rejects.toMatchObject({
      code: 'review_submit_failed',
      message: 'GitHub 422'
    } satisfies Partial<AppError>)
    // Draft NOT marked submitted; status NOT set.
    expect(fakes.draftsUpdate).not.toHaveBeenCalled()
    expect(fakes.setStatus).not.toHaveBeenCalled()
  })

  it('still submits even if the PR state precheck throws', async () => {
    fakes.getPullRequest.mockRejectedValue(new Error('network'))
    fakes.submitReview.mockResolvedValue({
      githubReviewId: 'r1',
      submittedAt: '2026-06-23T10:00:00Z'
    })
    await expect(service.submit(submitParams())).resolves.toBeDefined()
    expect(fakes.submitReview).toHaveBeenCalledTimes(1)
  })
})

describe('ReviewSubmissionService.markReviewed', () => {
  it('sets reviewed on the latest snapshot of the PR', () => {
    const getByNumber = vi.fn().mockReturnValue({ id: 'pr1' })
    const latestForPr = vi.fn().mockReturnValue(snapshot)
    const setStatus = vi.fn()
    const db = {
      pullRequests: { getByNumber },
      snapshots: { latestForPr },
      reviewStatuses: { setStatus }
    } as unknown as Database
    const service = new ReviewSubmissionService({
      db,
      provider: {} as unknown as GitProvider
    })

    service.markReviewed(ref)
    expect(getByNumber).toHaveBeenCalledWith('repo1', 42)
    expect(setStatus).toHaveBeenCalledWith('pr1', 'snap1', 'reviewed', 'head')
  })

  it('is a no-op when the PR is unknown', () => {
    const getByNumber = vi.fn().mockReturnValue(null)
    const setStatus = vi.fn()
    const db = {
      pullRequests: { getByNumber },
      snapshots: { latestForPr: vi.fn() },
      reviewStatuses: { setStatus }
    } as unknown as Database
    const service = new ReviewSubmissionService({
      db,
      provider: {} as unknown as GitProvider
    })

    service.markReviewed(ref)
    expect(setStatus).not.toHaveBeenCalled()
  })
})
