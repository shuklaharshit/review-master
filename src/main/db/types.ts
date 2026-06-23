// Internal DB contract. Repositories implement these; services consume them.
import type {
  ConnectedAccount,
  PreflightRecord,
  PreflightStatus,
  PrCommitSnapshot,
  PullRequest,
  ReasoningEffort,
  Repository,
  ReviewDraft,
  ReviewDraftStatus,
  ReviewStatus,
  ReviewStatusValue
} from '../../shared/types'

export interface AccountRepository {
  list(): ConnectedAccount[]
  getById(id: string): ConnectedAccount | null
  findByProviderAccount(providerId: string, providerAccountId: string): ConnectedAccount | null
  upsert(account: ConnectedAccount): ConnectedAccount
  touchLastUsed(id: string): void
  setNeedsReauth(id: string, needsReauth: boolean): void
  remove(id: string): void
}

export interface RepoRepository {
  upsertMany(repos: Repository[]): void
  getById(id: string): Repository | null
  listByAccount(accountId: string): Repository[]
}

export interface PullRequestRepository {
  upsert(pr: PullRequest): PullRequest
  getById(id: string): PullRequest | null
  getByNumber(repoId: string, number: number): PullRequest | null
  listByRepo(repoId: string): PullRequest[]
}

export interface SnapshotRepository {
  /** Returns existing snapshot with identical (baseSha, headSha, filesHash) or creates a new one. */
  findOrCreate(input: Omit<PrCommitSnapshot, 'id' | 'createdAt'>): PrCommitSnapshot
  getById(id: string): PrCommitSnapshot | null
  latestForPr(pullRequestId: string): PrCommitSnapshot | null
}

export interface PreflightRepository {
  create(record: PreflightRecord): PreflightRecord
  getById(id: string): PreflightRecord | null
  findCompletedForSnapshot(snapshotId: string): PreflightRecord | null
  latestForPr(pullRequestId: string): PreflightRecord | null
  update(id: string, patch: Partial<PreflightRecord>): PreflightRecord | null
  markStaleForPrExcept(pullRequestId: string, keepSnapshotId: string): void
  /** Mark `running` records older than `olderThanMs` as `interrupted`. */
  reapRunning(olderThanMs: number): void
}

export interface ReviewDraftRepository {
  create(draft: ReviewDraft): ReviewDraft
  getById(id: string): ReviewDraft | null
  findForSnapshot(pullRequestId: string, snapshotId: string): ReviewDraft | null
  latestForPr(pullRequestId: string): ReviewDraft | null
  update(id: string, patch: Partial<ReviewDraft>): ReviewDraft | null
  appendMarkdown(id: string, markdown: string): void
  setStatus(id: string, status: ReviewDraftStatus): void
  reapRunning(olderThanMs: number): void
}

export interface ReviewStatusRepository {
  upsert(status: ReviewStatus): ReviewStatus
  getForSnapshot(pullRequestId: string, snapshotId: string): ReviewStatus | null
  latestForPr(pullRequestId: string): ReviewStatus | null
  setStatus(pullRequestId: string, snapshotId: string, status: ReviewStatusValue, reviewedHeadSha?: string): ReviewStatus
}

export interface SettingsRepository {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): void
  getAll(): Record<string, unknown>
}

export interface Database {
  accounts: AccountRepository
  repos: RepoRepository
  pullRequests: PullRequestRepository
  snapshots: SnapshotRepository
  preflight: PreflightRepository
  drafts: ReviewDraftRepository
  reviewStatuses: ReviewStatusRepository
  settings: SettingsRepository
  close(): void
}

// Re-export for convenience
export type { PreflightStatus, ReasoningEffort }
