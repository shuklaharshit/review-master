import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubProvider } from '../GitHubProvider'
import type { GitHubProviderDeps } from '../GitHubProvider'
import type { Database } from '../../../db/types'
import type { AccountService } from '../../../auth/AccountService'
import type { SecureTokenStore } from '../../../contracts'
import type { GitHubAuthService } from '../GitHubAuthService'
import type { GitHubApiClient } from '../GitHubApiClient'
import type { SubmitReviewParams } from '../../GitProvider'
import type {
  GhCheckRun,
  GhCommit,
  GhCommitStatus,
  GhCreatedReview,
  GhFile,
  GhLabel,
  GhPullRequest,
  GhReview,
  GhUser
} from '../GitHubTypes'
import { appError } from '../../../../shared/result'
import type { AppError } from '../../../../shared/result'
import type { ListPullRequestsParams, PullRequestRef } from '../../../../shared/types'

// ---------------------------------------------------------------------------
// GitHubProvider orchestration tests. Following the mocked-deps pattern from
// pr/__tests__/ReviewSubmissionService.test.ts: build minimal vi.fn()-backed
// fakes for the deps the provider actually touches, cast to the real
// interfaces, and assert on the calls + assembled shapes.
// ---------------------------------------------------------------------------

const ACCOUNT = 'acct1'
const REPO_ID = 'repo1'
const OWNER = 'acme'
const REPO = 'review-master'

function listParams(overrides: Partial<ListPullRequestsParams> = {}): ListPullRequestsParams {
  return { accountId: ACCOUNT, repoId: REPO_ID, owner: OWNER, repo: REPO, ...overrides }
}

function ref(number = 42): PullRequestRef {
  return { accountId: ACCOUNT, repoId: REPO_ID, owner: OWNER, repo: REPO, number }
}

// Raw GitHub PR shape (only the fields the mapper reads).
function ghPr(overrides: Partial<GhPullRequest> = {}): GhPullRequest {
  return {
    id: 1000,
    number: 42,
    title: 'Add feature',
    body: 'body',
    state: 'open',
    draft: false,
    user: { login: 'octocat' },
    base: { ref: 'main', sha: 'base-sha' },
    head: { ref: 'feature', sha: 'head-sha' },
    html_url: 'https://github.com/acme/review-master/pull/42',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    assignees: [{ login: 'alice' }],
    requested_reviewers: [{ login: 'bob' }],
    labels: [{ name: 'bug', color: 'red' }],
    ...overrides
  }
}

interface Fakes {
  deps: GitHubProviderDeps
  // db fakes
  prUpsert: ReturnType<typeof vi.fn>
  prGetByNumber: ReturnType<typeof vi.fn>
  reviewStatusesLatestForPr: ReturnType<typeof vi.fn>
  // api fakes
  listPulls: ReturnType<typeof vi.fn>
  getPull: ReturnType<typeof vi.fn>
  listPullCommits: ReturnType<typeof vi.fn>
  listPullFiles: ReturnType<typeof vi.fn>
  listCheckRuns: ReturnType<typeof vi.fn>
  listCommitStatuses: ReturnType<typeof vi.fn>
  listReviews: ReturnType<typeof vi.fn>
  getIssueLabels: ReturnType<typeof vi.fn>
  createReview: ReturnType<typeof vi.fn>
  hasInstallations: ReturnType<typeof vi.fn>
  mergePull: ReturnType<typeof vi.fn>
}

function buildFakes(): Fakes {
  const prUpsert = vi.fn((pr) => pr)
  const prGetByNumber = vi.fn().mockReturnValue(null)
  const reviewStatusesLatestForPr = vi.fn().mockReturnValue(null)

  const db = {
    pullRequests: { upsert: prUpsert, getByNumber: prGetByNumber },
    reviewStatuses: { latestForPr: reviewStatusesLatestForPr }
  } as unknown as Database

  const listPulls = vi.fn<() => Promise<GhPullRequest[]>>().mockResolvedValue([])
  const getPull = vi.fn<() => Promise<GhPullRequest>>().mockResolvedValue(ghPr())
  const listPullCommits = vi.fn<() => Promise<GhCommit[]>>().mockResolvedValue([])
  const listPullFiles = vi.fn<() => Promise<GhFile[]>>().mockResolvedValue([])
  const listCheckRuns = vi.fn<() => Promise<GhCheckRun[]>>().mockResolvedValue([])
  const listCommitStatuses = vi.fn<() => Promise<GhCommitStatus[]>>().mockResolvedValue([])
  const listReviews = vi.fn<() => Promise<GhReview[]>>().mockResolvedValue([])
  const getIssueLabels = vi.fn<() => Promise<GhLabel[]>>().mockResolvedValue([])
  const createReview = vi.fn<() => Promise<GhCreatedReview>>()
  const hasInstallations = vi.fn<() => Promise<boolean>>()
  const mergePull = vi.fn<() => Promise<{ merged: boolean; sha?: string; message?: string }>>()

  const api = {
    listPulls,
    getPull,
    listPullCommits,
    listPullFiles,
    listCheckRuns,
    listCommitStatuses,
    listReviews,
    getIssueLabels,
    createReview,
    hasInstallations,
    mergePull
  } as unknown as GitHubApiClient

  const deps: GitHubProviderDeps = {
    db,
    accounts: {} as unknown as AccountService,
    tokens: {} as unknown as SecureTokenStore,
    auth: {} as unknown as GitHubAuthService,
    api
  }

  return {
    deps,
    prUpsert,
    prGetByNumber,
    reviewStatusesLatestForPr,
    listPulls,
    getPull,
    listPullCommits,
    listPullFiles,
    listCheckRuns,
    listCommitStatuses,
    listReviews,
    getIssueLabels,
    createReview,
    hasInstallations,
    mergePull
  }
}

describe('GitHubProvider.listPullRequests', () => {
  let f: Fakes
  let provider: GitHubProvider

  beforeEach(() => {
    f = buildFakes()
    provider = new GitHubProvider(f.deps)
  })

  it("maps filter 'open' to state 'open'", async () => {
    await provider.listPullRequests(listParams({ filter: 'open' }))
    expect(f.listPulls).toHaveBeenCalledWith(
      ACCOUNT,
      OWNER,
      REPO,
      expect.objectContaining({ state: 'open' })
    )
  })

  it("maps filter 'closed' to state 'closed'", async () => {
    await provider.listPullRequests(listParams({ filter: 'closed' }))
    expect(f.listPulls).toHaveBeenCalledWith(
      ACCOUNT,
      OWNER,
      REPO,
      expect.objectContaining({ state: 'closed' })
    )
  })

  it("maps filter 'all' to state 'all'", async () => {
    await provider.listPullRequests(listParams({ filter: 'all' }))
    expect(f.listPulls).toHaveBeenCalledWith(
      ACCOUNT,
      OWNER,
      REPO,
      expect.objectContaining({ state: 'all' })
    )
  })

  it("defaults to 'open' state when no filter given", async () => {
    await provider.listPullRequests(listParams())
    expect(f.listPulls).toHaveBeenCalledWith(
      ACCOUNT,
      OWNER,
      REPO,
      expect.objectContaining({ state: 'open' })
    )
  })

  it("maps filter 'merged' to state 'closed' and keeps only merged PRs", async () => {
    f.listPulls.mockResolvedValue([
      ghPr({ id: 1, number: 1, merged_at: '2026-01-03T00:00:00Z' }), // merged
      ghPr({ id: 2, number: 2, state: 'closed' }) // closed-not-merged
    ])

    const res = await provider.listPullRequests(listParams({ filter: 'merged' }))

    expect(f.listPulls).toHaveBeenCalledWith(
      ACCOUNT,
      OWNER,
      REPO,
      expect.objectContaining({ state: 'closed' })
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].number).toBe(1)
    expect(res.items[0].state).toBe('merged')
  })

  it('applies a client-side title/number query filter', async () => {
    f.listPulls.mockResolvedValue([
      ghPr({ id: 1, number: 100, title: 'Fix login bug' }),
      ghPr({ id: 2, number: 200, title: 'Improve performance' })
    ])

    const byTitle = await provider.listPullRequests(listParams({ query: 'login' }))
    expect(byTitle.items.map((p) => p.number)).toEqual([100])

    const byNumber = await provider.listPullRequests(listParams({ query: '200' }))
    expect(byNumber.items.map((p) => p.number)).toEqual([200])
  })

  it('persists each result via db.pullRequests.upsert', async () => {
    f.listPulls.mockResolvedValue([ghPr({ id: 1, number: 1 }), ghPr({ id: 2, number: 2 })])
    await provider.listPullRequests(listParams())
    expect(f.prUpsert).toHaveBeenCalledTimes(2)
  })

  it('attaches localReviewState from db.reviewStatuses when present', async () => {
    f.listPulls.mockResolvedValue([ghPr()])
    f.reviewStatusesLatestForPr.mockReturnValue({ status: 'reviewed' })

    const res = await provider.listPullRequests(listParams())

    expect(res.items[0].localReviewState).toBe('review_submitted')
    // The upserted PR carries the same derived state.
    expect(f.prUpsert.mock.calls[0][0].localReviewState).toBe('review_submitted')
  })

  it('maps review status values to local review states', async () => {
    const cases: Array<[string, string | undefined]> = [
      ['reviewed', 'review_submitted'],
      ['needs_rereview', 'needs_rereview'],
      ['draft_available', 'draft_available'],
      ['something_else', undefined]
    ]
    for (const [status, expected] of cases) {
      f = buildFakes()
      provider = new GitHubProvider(f.deps)
      f.listPulls.mockResolvedValue([ghPr()])
      f.reviewStatusesLatestForPr.mockReturnValue({ status })
      const res = await provider.listPullRequests(listParams())
      expect(res.items[0].localReviewState).toBe(expected)
    }
  })

  it('leaves localReviewState undefined when no status row exists', async () => {
    f.listPulls.mockResolvedValue([ghPr()])
    f.reviewStatusesLatestForPr.mockReturnValue(null)
    const res = await provider.listPullRequests(listParams())
    expect(res.items[0].localReviewState).toBeUndefined()
  })

  it('reports hasMore=true when a full page is returned', async () => {
    const full = Array.from({ length: 5 }, (_, i) => ghPr({ id: i + 1, number: i + 1 }))
    f.listPulls.mockResolvedValue(full)
    const res = await provider.listPullRequests(listParams({ perPage: 5 }))
    expect(res.hasMore).toBe(true)
    expect(res.perPage).toBe(5)
  })

  it('reports hasMore=false on a short page', async () => {
    f.listPulls.mockResolvedValue([ghPr()])
    const res = await provider.listPullRequests(listParams({ perPage: 5 }))
    expect(res.hasMore).toBe(false)
  })
})

describe('GitHubProvider.fetchReviewContext', () => {
  let f: Fakes
  let provider: GitHubProvider

  beforeEach(() => {
    f = buildFakes()
    provider = new GitHubProvider(f.deps)
  })

  it('assembles a ReviewContext from the api fakes and persists the PR', async () => {
    const commits: GhCommit[] = [
      { sha: 'c1', commit: { message: 'first', author: { name: 'Al', date: '2026-01-01T00:00:00Z' } } }
    ]
    const files: GhFile[] = [
      { filename: 'a.ts', status: 'modified', additions: 3, deletions: 1, changes: 4, patch: '@@' }
    ]
    const runs: GhCheckRun[] = [{ name: 'ci', status: 'completed', conclusion: 'success' }]
    const statuses: GhCommitStatus[] = [{ context: 'legacy', state: 'success' }]
    const reviews: GhReview[] = [
      { id: 1, user: { login: 'rev' }, state: 'APPROVED', submitted_at: '2026-01-02T00:00:00Z' }
    ]
    const labels: GhLabel[] = [{ name: 'bug', color: 'red' }]
    const assignees: GhUser[] = [{ login: 'alice' }]
    const requestedReviewers: GhUser[] = [{ login: 'bob' }]

    f.getPull.mockResolvedValue(ghPr({ assignees, requested_reviewers: requestedReviewers, labels }))
    f.listPullCommits.mockResolvedValue(commits)
    f.listPullFiles.mockResolvedValue(files)
    f.listCheckRuns.mockResolvedValue(runs)
    f.listCommitStatuses.mockResolvedValue(statuses)
    f.listReviews.mockResolvedValue(reviews)
    f.getIssueLabels.mockResolvedValue(labels)

    const ctx = await provider.fetchReviewContext(ref(42))

    // The PR detail was fetched then persisted.
    expect(f.getPull).toHaveBeenCalledWith(ACCOUNT, OWNER, REPO, 42)
    expect(f.prUpsert).toHaveBeenCalledTimes(1)

    // The aggregated collection calls all happened.
    expect(f.listPullCommits).toHaveBeenCalledWith(ACCOUNT, OWNER, REPO, 42)
    expect(f.listPullFiles).toHaveBeenCalledWith(ACCOUNT, OWNER, REPO, 42)
    expect(f.listReviews).toHaveBeenCalledWith(ACCOUNT, OWNER, REPO, 42)
    expect(f.getIssueLabels).toHaveBeenCalledWith(ACCOUNT, OWNER, REPO, 42)
    // Checks resolve the head sha from the fetched PR (head-sha).
    expect(f.listCheckRuns).toHaveBeenCalledWith(ACCOUNT, OWNER, REPO, 'head-sha')
    expect(f.listCommitStatuses).toHaveBeenCalledWith(ACCOUNT, OWNER, REPO, 'head-sha')

    // Assembled shape.
    expect(ctx.commits).toHaveLength(1)
    expect(ctx.commits[0].sha).toBe('c1')
    expect(ctx.files).toHaveLength(1)
    expect(ctx.files[0].path).toBe('a.ts')
    // checks = check runs + commit statuses, concatenated.
    expect(ctx.checks.map((c) => c.name)).toEqual(['ci', 'legacy'])
    expect(ctx.reviews[0].state).toBe('APPROVED')
    expect(ctx.labels.map((l) => l.name)).toEqual(['bug'])
    expect(ctx.assignees.map((a) => a.login)).toEqual(['alice'])
    expect(ctx.requestedReviewers.map((r) => r.login)).toEqual(['bob'])

    // The detail is enriched with the aggregated collections.
    expect(ctx.pr.commits).toBe(ctx.commits)
    expect(ctx.pr.checks).toBe(ctx.checks)
    expect(ctx.pr.reviews).toBe(ctx.reviews)
    expect(ctx.pr.labels).toBe(ctx.labels)
    expect(ctx.pr.assignees).toBe(ctx.assignees)
    expect(ctx.pr.requestedReviewers).toBe(ctx.requestedReviewers)
  })

  it('issues the aggregated collection requests in parallel after the detail fetch', async () => {
    // Resolve order: getPull resolves before the parallel batch is issued.
    let collectionCalls = 0
    const bump = () => {
      collectionCalls++
      return Promise.resolve([])
    }
    f.listPullCommits.mockImplementation(bump)
    f.listPullFiles.mockImplementation(bump)
    f.listCheckRuns.mockImplementation(bump)
    f.listCommitStatuses.mockImplementation(bump)
    f.listReviews.mockImplementation(bump)
    f.getIssueLabels.mockImplementation(bump)

    // getPull only resolves after a microtask; the 6 collection calls must not
    // have started before getPull resolves (they depend on its head sha).
    f.getPull.mockImplementation(async () => {
      expect(collectionCalls).toBe(0)
      return ghPr()
    })

    await provider.fetchReviewContext(ref())
    expect(collectionCalls).toBe(6)
  })
})

describe('GitHubProvider.submitPullRequestReview', () => {
  let f: Fakes
  let provider: GitHubProvider

  function submitParams(overrides: Partial<SubmitReviewParams> = {}): SubmitReviewParams {
    return { ref: ref(42), body: 'looks good', event: 'COMMENT', ...overrides }
  }

  beforeEach(() => {
    f = buildFakes()
    provider = new GitHubProvider(f.deps)
  })

  it('returns a SubmittedReview on success', async () => {
    f.createReview.mockResolvedValue({
      id: 555,
      html_url: 'https://github.com/acme/review-master/pull/42#review',
      submitted_at: '2026-06-23T10:00:00Z'
    })

    const result = await provider.submitPullRequestReview(submitParams())

    expect(f.createReview).toHaveBeenCalledWith(ACCOUNT, OWNER, REPO, 42, {
      event: 'COMMENT',
      body: 'looks good',
      commitId: undefined
    })
    expect(result).toEqual({
      githubReviewId: '555',
      htmlUrl: 'https://github.com/acme/review-master/pull/42#review',
      submittedAt: '2026-06-23T10:00:00Z'
    })
  })

  it('falls back to nowIso when the API returns no submitted_at', async () => {
    f.createReview.mockResolvedValue({ id: 1, submitted_at: null })
    const result = await provider.submitPullRequestReview(submitParams())
    expect(result.githubReviewId).toBe('1')
    expect(typeof result.submittedAt).toBe('string')
    expect(result.submittedAt.length).toBeGreaterThan(0)
  })

  it("maps a 403-ish error (code 'no_permission') to 'no_permission'", async () => {
    f.createReview.mockRejectedValue(appError('no_permission', 'nope', false))
    await expect(provider.submitPullRequestReview(submitParams())).rejects.toMatchObject({
      code: 'no_permission'
    } satisfies Partial<AppError>)
  })

  it("maps a 422-ish error (code 'github_api_error') to 'pr_closed'", async () => {
    f.createReview.mockRejectedValue(
      appError('github_api_error', 'Unprocessable', true, { status: 422 })
    )
    await expect(provider.submitPullRequestReview(submitParams())).rejects.toMatchObject({
      code: 'pr_closed'
    } satisfies Partial<AppError>)
  })

  it("maps a not_found error to 'pr_closed'", async () => {
    f.createReview.mockRejectedValue(appError('not_found', 'gone', false))
    await expect(provider.submitPullRequestReview(submitParams())).rejects.toMatchObject({
      code: 'pr_closed'
    } satisfies Partial<AppError>)
  })

  it('re-throws an unrecognised error untouched', async () => {
    const raw = new Error('boom')
    f.createReview.mockRejectedValue(raw)
    await expect(provider.submitPullRequestReview(submitParams())).rejects.toBe(raw)
  })
})

describe('GitHubProvider.hasInstallations', () => {
  it('returns true/false based on the api installation fake', async () => {
    const f = buildFakes()
    const provider = new GitHubProvider(f.deps)

    f.hasInstallations.mockResolvedValue(true)
    expect(await provider.hasInstallations(ACCOUNT)).toBe(true)
    expect(f.hasInstallations).toHaveBeenCalledWith(ACCOUNT)

    f.hasInstallations.mockResolvedValue(false)
    expect(await provider.hasInstallations(ACCOUNT)).toBe(false)
  })
})

describe('GitHubProvider.mergePullRequest', () => {
  let f: Fakes
  let provider: GitHubProvider

  beforeEach(() => {
    f = buildFakes()
    provider = new GitHubProvider(f.deps)
  })

  it('forwards the chosen method + commit fields and returns the result', async () => {
    f.mergePull.mockResolvedValue({ merged: true, sha: 'merge-sha', message: 'Merged' })
    const res = await provider.mergePullRequest({
      ref: ref(42),
      method: 'squash',
      commitTitle: 'Title',
      commitMessage: 'Body'
    })
    expect(res).toEqual({ merged: true, sha: 'merge-sha', message: 'Merged' })
    expect(f.mergePull).toHaveBeenCalledWith(ACCOUNT, OWNER, REPO, 42, {
      merge_method: 'squash',
      commit_title: 'Title',
      commit_message: 'Body'
    })
  })

  it('maps a github_api_error (not mergeable / conflict) to a recoverable merge_failed', async () => {
    f.mergePull.mockRejectedValue(appError('github_api_error', 'Pull Request is not mergeable'))
    await expect(provider.mergePullRequest({ ref: ref(42), method: 'merge' })).rejects.toMatchObject({
      code: 'merge_failed',
      recoverable: true
    } satisfies Partial<AppError>)
  })
})
