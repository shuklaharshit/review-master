import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PullRequestContextService, computeFilesHash } from '../PullRequestContextService'
import type { Database } from '../../db/types'
import type { GitProvider } from '../../providers/GitProvider'
import type { RepoCacheService } from '../RepoCacheService'
import type {
  NormalizedDiff,
  PrCommitSnapshot,
  PreflightRecord,
  PullRequestDetail,
  PullRequestFile,
  PullRequestRef,
  ReviewContext,
  ReviewDraft,
  ReviewStatus
} from '../../../shared/types'

// ---------------------------------------------------------------------------
// PullRequestContextService.openWorkspace orchestration tests.
//
// openWorkspace's public outputs (reviewState, preflightStale, draftStale,
// diff.source) are driven by a private state machine fed entirely from the
// db repos and the provider/repoCache fakes. Following the mocked-deps pattern
// from pr/__tests__/ReviewSubmissionService.test.ts, we control exactly what
// those fakes return and assert on the derived public outputs.
// ---------------------------------------------------------------------------

const ref: PullRequestRef = {
  accountId: 'acct1',
  repoId: 'repo1',
  owner: 'acme',
  repo: 'review-master',
  number: 42
}

const FILES: PullRequestFile[] = [
  {
    path: 'src/a.ts',
    status: 'modified',
    additions: 3,
    deletions: 1,
    changes: 4,
    patch: '@@ -1,2 +1,4 @@\n line\n+added\n+added2\n-removed'
  }
]

function detail(overrides: Partial<PullRequestDetail> = {}): PullRequestDetail {
  return {
    id: 'pr1',
    providerId: 'github',
    accountId: ref.accountId,
    repoId: ref.repoId,
    providerPrId: '1000',
    number: 42,
    title: 'Add feature',
    state: 'open',
    baseBranch: 'main',
    headBranch: 'feature',
    baseSha: 'base-sha',
    headSha: 'head-sha',
    htmlUrl: 'https://github.com/acme/review-master/pull/42',
    ...overrides
  }
}

function context(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    pr: detail(),
    commits: [{ sha: 'c1', message: 'first' }],
    files: FILES,
    checks: [],
    reviews: [],
    labels: [],
    assignees: [],
    requestedReviewers: [],
    ...overrides
  }
}

const SNAPSHOT_ID = 'snap-current'

function snapshot(overrides: Partial<PrCommitSnapshot> = {}): PrCommitSnapshot {
  return {
    id: SNAPSHOT_ID,
    pullRequestId: 'pr1',
    baseSha: 'base-sha',
    headSha: 'head-sha',
    commitIds: ['c1'],
    filesHash: 'fh',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function preflight(overrides: Partial<PreflightRecord> = {}): PreflightRecord {
  return {
    id: 'pf1',
    pullRequestId: 'pr1',
    snapshotId: SNAPSHOT_ID,
    model: 'gpt-5.4',
    reasoningEffort: 'medium',
    status: 'completed',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function draft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    id: 'draft1',
    pullRequestId: 'pr1',
    snapshotId: SNAPSHOT_ID,
    model: 'gpt-5.4',
    reasoningEffort: 'medium',
    markdown: 'LGTM',
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function reviewStatus(overrides: Partial<ReviewStatus> = {}): ReviewStatus {
  return {
    id: 'rs1',
    pullRequestId: 'pr1',
    snapshotId: SNAPSHOT_ID,
    status: 'reviewed',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

interface DbReturns {
  findCompletedForSnapshot?: PreflightRecord | null
  latestForPrPreflight?: PreflightRecord | null
  findForSnapshotDraft?: ReviewDraft | null
  latestForPrDraft?: ReviewDraft | null
  getForSnapshotStatus?: ReviewStatus | null
}

interface Fakes {
  db: Database
  provider: GitProvider
  repoCache: RepoCacheService
  fetchReviewContext: ReturnType<typeof vi.fn>
  buildDiff: ReturnType<typeof vi.fn>
  isGitAvailable: ReturnType<typeof vi.fn>
  findOrCreate: ReturnType<typeof vi.fn>
  reposGetById: ReturnType<typeof vi.fn>
}

function buildFakes(opts: {
  dbReturns?: DbReturns
  gitDiff?: NormalizedDiff | null
  ctx?: ReviewContext
} = {}): Fakes {
  const r = opts.dbReturns ?? {}

  const findOrCreate = vi.fn().mockReturnValue(snapshot())
  const reposGetById = vi.fn().mockReturnValue({ id: ref.repoId, cloneUrl: 'https://github.com/acme/review-master.git' })

  const db = {
    repos: { getById: reposGetById },
    pullRequests: {
      getByNumber: vi.fn().mockReturnValue({ id: 'pr1' }),
      upsert: vi.fn((pr) => pr)
    },
    snapshots: { findOrCreate },
    preflight: {
      findCompletedForSnapshot: vi.fn().mockReturnValue(r.findCompletedForSnapshot ?? null),
      latestForPr: vi.fn().mockReturnValue(r.latestForPrPreflight ?? null)
    },
    drafts: {
      findForSnapshot: vi.fn().mockReturnValue(r.findForSnapshotDraft ?? null),
      latestForPr: vi.fn().mockReturnValue(r.latestForPrDraft ?? null)
    },
    reviewStatuses: {
      getForSnapshot: vi.fn().mockReturnValue(r.getForSnapshotStatus ?? null)
    }
  } as unknown as Database

  const fetchReviewContext = vi.fn().mockResolvedValue(opts.ctx ?? context())
  const provider = {
    id: 'github',
    fetchReviewContext
  } as unknown as GitProvider

  const buildDiff = vi.fn().mockResolvedValue(opts.gitDiff === undefined ? null : opts.gitDiff)
  const isGitAvailable = vi.fn().mockResolvedValue(true)
  const repoCache = { buildDiff, isGitAvailable } as unknown as RepoCacheService

  return { db, provider, repoCache, fetchReviewContext, buildDiff, isGitAvailable, findOrCreate, reposGetById }
}

function makeService(f: Fakes): PullRequestContextService {
  return new PullRequestContextService({ db: f.db, provider: f.provider, repoCache: f.repoCache })
}

const gitDiff: NormalizedDiff = {
  files: [],
  source: 'git',
  totalAdditions: 5,
  totalDeletions: 2
}

describe('PullRequestContextService.openWorkspace — reviewState derivation', () => {
  it("'new' when there is no preflight, draft, or review status", async () => {
    const f = buildFakes()
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.reviewState).toBe('new')
  })

  it("'preflight_ready' when a completed preflight exists for the current snapshot", async () => {
    const f = buildFakes({
      dbReturns: { findCompletedForSnapshot: preflight({ status: 'completed' }) }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.reviewState).toBe('preflight_ready')
    expect(ws.preflightStale).toBe(false)
  })

  it("'preflight_stale' when only an OLDER snapshot has a completed preflight", async () => {
    const f = buildFakes({
      dbReturns: {
        findCompletedForSnapshot: null,
        latestForPrPreflight: preflight({ status: 'completed', snapshotId: 'snap-old' })
      }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.preflightStale).toBe(true)
    expect(ws.reviewState).toBe('preflight_stale')
  })

  it("'preflight_running' from the current snapshot preflight", async () => {
    const f = buildFakes({
      dbReturns: { findCompletedForSnapshot: preflight({ status: 'running' }) }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.reviewState).toBe('preflight_running')
  })

  it("'preflight_failed' from the current snapshot preflight", async () => {
    const f = buildFakes({
      dbReturns: { findCompletedForSnapshot: preflight({ status: 'failed' }) }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.reviewState).toBe('preflight_failed')
  })

  it("'draft_available' when a draft is present with status 'draft'", async () => {
    const f = buildFakes({
      dbReturns: { findForSnapshotDraft: draft({ status: 'draft' }) }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.reviewState).toBe('draft_available')
  })

  it("'review_generating' when the draft is running", async () => {
    const f = buildFakes({
      dbReturns: { findForSnapshotDraft: draft({ status: 'running' }) }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.reviewState).toBe('review_generating')
  })

  it("'review_submitted' when reviewStatus is 'reviewed' and the draft is submitted", async () => {
    const f = buildFakes({
      dbReturns: {
        findForSnapshotDraft: draft({ status: 'submitted' }),
        getForSnapshotStatus: reviewStatus({ status: 'reviewed' })
      }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.reviewState).toBe('review_submitted')
  })

  it("'needs_rereview' when reviewStatus is 'needs_rereview'", async () => {
    const f = buildFakes({
      dbReturns: { getForSnapshotStatus: reviewStatus({ status: 'needs_rereview' }) }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.reviewState).toBe('needs_rereview')
  })

  it('draft state takes precedence over a completed preflight', async () => {
    const f = buildFakes({
      dbReturns: {
        findCompletedForSnapshot: preflight({ status: 'completed' }),
        findForSnapshotDraft: draft({ status: 'draft' })
      }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.reviewState).toBe('draft_available')
  })
})

describe('PullRequestContextService.openWorkspace — staleness flags', () => {
  it('preflightStale=false when a current-snapshot completed preflight exists', async () => {
    const f = buildFakes({
      dbReturns: {
        findCompletedForSnapshot: preflight({ status: 'completed' }),
        latestForPrPreflight: preflight({ status: 'completed', snapshotId: 'snap-old' })
      }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.preflightStale).toBe(false)
  })

  it('preflightStale=false when the latest preflight is not completed', async () => {
    const f = buildFakes({
      dbReturns: {
        findCompletedForSnapshot: null,
        latestForPrPreflight: preflight({ status: 'running', snapshotId: 'snap-old' })
      }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.preflightStale).toBe(false)
    // Falls back to preflight_running via latestPreflight.status.
    expect(ws.reviewState).toBe('preflight_running')
  })

  it('draftStale=true when the latest (non-submitted) draft is for an older snapshot', async () => {
    const f = buildFakes({
      dbReturns: {
        findForSnapshotDraft: null,
        latestForPrDraft: draft({ status: 'draft', snapshotId: 'snap-old' })
      }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.draftStale).toBe(true)
  })

  it('draftStale=false when there is a draft for the current snapshot', async () => {
    const f = buildFakes({
      dbReturns: {
        findForSnapshotDraft: draft({ status: 'draft' }),
        latestForPrDraft: draft({ status: 'draft' })
      }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.draftStale).toBe(false)
  })

  it('draftStale=false when the latest older draft is submitted', async () => {
    const f = buildFakes({
      dbReturns: {
        findForSnapshotDraft: null,
        latestForPrDraft: draft({ status: 'submitted', snapshotId: 'snap-old' })
      }
    })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.draftStale).toBe(false)
  })
})

describe('PullRequestContextService.openWorkspace — diff source', () => {
  it("uses repoCache.buildDiff result (source 'git') when available", async () => {
    const f = buildFakes({ gitDiff })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.diff.source).toBe('git')
    expect(ws.diff).toBe(gitDiff)
    expect(f.buildDiff).toHaveBeenCalledTimes(1)
  })

  it("falls back to building from context.files (source 'github_api') when buildDiff returns null", async () => {
    const f = buildFakes({ gitDiff: null })
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.diff.source).toBe('github_api')
    // Built from the single context file.
    expect(ws.diff.files).toHaveLength(1)
    expect(ws.diff.files[0].path).toBe('src/a.ts')
    expect(ws.diff.totalAdditions).toBe(3)
    expect(ws.diff.totalDeletions).toBe(1)
  })

  it('falls back to github_api when there is no resolvable repo identity', async () => {
    const f = buildFakes({ gitDiff })
    // No repo row and detail.htmlUrl absent -> resolveRepoIdentity returns null,
    // so buildDiff (git) is never attempted.
    f.reposGetById.mockReturnValue(null)
    f.fetchReviewContext.mockResolvedValue(context({ pr: detail({ htmlUrl: undefined }) }))
    const ws = await makeService(f).openWorkspace(ref)
    expect(ws.diff.source).toBe('github_api')
    expect(f.buildDiff).not.toHaveBeenCalled()
  })
})

describe('PullRequestContextService.openWorkspace — snapshot find-or-create', () => {
  it('invokes snapshots.findOrCreate with the computed filesHash and shas', async () => {
    const f = buildFakes({ gitDiff: null })
    await makeService(f).openWorkspace(ref)

    const expectedHash = computeFilesHash(
      // github_api fallback builds NormalizedDiffFiles from FILES.
      [{ path: 'src/a.ts', status: 'modified', additions: 3, deletions: 1, patch: FILES[0].patch }],
      'base-sha',
      'head-sha'
    )

    expect(f.findOrCreate).toHaveBeenCalledTimes(1)
    expect(f.findOrCreate).toHaveBeenCalledWith({
      pullRequestId: 'pr1',
      baseSha: 'base-sha',
      headSha: 'head-sha',
      commitIds: ['c1'],
      filesHash: expectedHash
    })
  })

  it('passes the git diff files to the filesHash when a git diff is built', async () => {
    const gitWithFiles: NormalizedDiff = {
      files: [
        {
          path: 'src/b.ts',
          status: 'added',
          additions: 10,
          deletions: 0,
          hunks: [],
          patch: 'PATCH'
        }
      ],
      source: 'git',
      totalAdditions: 10,
      totalDeletions: 0
    }
    const f = buildFakes({ gitDiff: gitWithFiles })
    await makeService(f).openWorkspace(ref)

    const expectedHash = computeFilesHash(gitWithFiles.files, 'base-sha', 'head-sha')
    expect(f.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ filesHash: expectedHash })
    )
  })
})
