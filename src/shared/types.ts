// ============================================================================
// Review Master — Shared domain types (single source of truth across processes)
// ============================================================================

export type GitProviderId = 'github' | 'gitlab' | 'bitbucket'

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

// ----------------------------------------------------------------------------
// Bootstrap / onboarding
// ----------------------------------------------------------------------------

export interface CodexStatus {
  cliInstalled: boolean
  version?: string
  binaryPath?: string
  authenticated: boolean
  account?: CodexAccount
  serverState: CodexSessionState
  error?: string
}

export type CodexSessionState = 'starting' | 'ready' | 'error' | 'stopped' | 'unknown'

export interface CodexAccount {
  email?: string
  plan?: string
  organization?: string
  authMethod?: string
}

export interface CodexModel {
  id: string
  displayName?: string
  supportedReasoningEfforts?: ReasoningEffort[]
}

export interface GitStatus {
  available: boolean
  version?: string
}

export interface BootstrapStatus {
  appVersion: string
  codex: CodexStatus
  git: GitStatus
  hasAccounts: boolean
  accounts: ConnectedAccount[]
  ready: boolean
}

// ----------------------------------------------------------------------------
// Accounts
// ----------------------------------------------------------------------------

export interface ConnectedAccount {
  id: string
  providerId: GitProviderId
  providerAccountId: string
  login: string
  displayName?: string
  avatarUrl?: string
  tokenKey: string
  scopes: string[]
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  needsReauth?: boolean
}

export interface AuthFlowStartResult {
  flowId: string
  userCode: string
  verificationUri: string
  expiresInSeconds: number
  intervalSeconds: number
}

export interface RemoveAccountOptions {
  removeCachedData?: boolean
}

// ----------------------------------------------------------------------------
// Repositories
// ----------------------------------------------------------------------------

export interface Repository {
  id: string
  providerId: GitProviderId
  accountId: string
  providerRepoId: string
  owner: string
  name: string
  fullName: string
  private: boolean
  defaultBranch?: string
  htmlUrl?: string
  cloneUrl?: string
  sshUrl?: string
  description?: string
  language?: string
  updatedAt?: string
  lastSyncedAt?: string
}

export interface ListRepositoriesParams {
  accountId: string
  page?: number
  perPage?: number
  sort?: 'updated' | 'pushed' | 'full_name'
}

export interface SearchRepositoriesParams {
  accountId: string
  query: string
  page?: number
  perPage?: number
}

export interface PaginatedResult<T> {
  items: T[]
  page: number
  perPage: number
  hasMore: boolean
  total?: number
}

// ----------------------------------------------------------------------------
// Pull requests
// ----------------------------------------------------------------------------

export type PullRequestState = 'open' | 'closed' | 'merged'
export type PullRequestFilter = 'open' | 'closed' | 'merged' | 'all'

export interface UserSummary {
  login: string
  avatarUrl?: string
  htmlUrl?: string
}

export interface PullRequest {
  id: string
  providerId: GitProviderId
  accountId: string
  repoId: string
  providerPrId: string
  number: number
  title: string
  body?: string
  state: PullRequestState
  draft?: boolean
  author?: UserSummary
  baseBranch: string
  headBranch: string
  baseSha: string
  headSha: string
  htmlUrl?: string
  createdAt?: string
  updatedAt?: string
  lastSyncedAt?: string
  /** Locally derived review state for list badges. */
  localReviewState?: LocalPrReviewState
}

export interface ListPullRequestsParams {
  accountId: string
  repoId: string
  owner: string
  repo: string
  filter?: PullRequestFilter
  query?: string
  page?: number
  perPage?: number
}

export interface PullRequestRef {
  accountId: string
  repoId: string
  owner: string
  repo: string
  number: number
}

export interface CommitSummary {
  sha: string
  message: string
  author?: string
  authoredAt?: string
}

export interface PullRequestFile {
  path: string
  oldPath?: string
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'binary'
  additions: number
  deletions: number
  changes: number
  patch?: string
  isBinary?: boolean
}

export interface CheckSummary {
  name: string
  status: 'queued' | 'in_progress' | 'completed' | 'unknown'
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null
  detailsUrl?: string
}

export interface ReviewSummary {
  /** GitHub review id (absent for synthetic/pending entries). */
  id?: string
  login: string
  avatarUrl?: string
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'
  submittedAt?: string
  /** Review-level body (the summary comment), when the reviewer left one. */
  body?: string
  htmlUrl?: string
}

export interface LabelSummary {
  name: string
  color?: string
}

// ----------------------------------------------------------------------------
// Conversation (discussion timeline) — issue comments, review bodies, and
// inline review-comment threads, fetched live for the Discussion tab.
// ----------------------------------------------------------------------------

/** A top-level PR comment (the "conversation" tab on GitHub). */
export interface IssueComment {
  id: string
  author?: UserSummary
  body: string
  createdAt?: string
  updatedAt?: string
  htmlUrl?: string
}

/** Which side of the diff an inline comment is anchored to. */
export type DiffSide = 'LEFT' | 'RIGHT'

/** A single inline code-review comment (on a diff line). */
export interface ReviewComment {
  id: string
  author?: UserSummary
  body: string
  path: string
  /** The line in the file the comment is anchored to (head side unless LEFT). */
  line?: number
  side?: DiffSide
  /** Start line for a multi-line comment range. */
  startLine?: number
  /** The diff hunk GitHub captured at comment time (for standalone display). */
  diffHunk?: string
  /** Root comment id for replies; absent on the thread's first comment. */
  inReplyToId?: string
  createdAt?: string
  htmlUrl?: string
}

/** A resolved-or-open thread of inline comments anchored to one location. */
export interface ReviewCommentThread {
  /** Id of the root comment that opened the thread. */
  id: string
  path: string
  line?: number
  side?: DiffSide
  diffHunk?: string
  comments: ReviewComment[]
}

/** Aggregated discussion for a PR (built by the provider, ordered in the UI). */
export interface PrConversation {
  issueComments: IssueComment[]
  reviews: ReviewSummary[]
  threads: ReviewCommentThread[]
}

/** Result of posting an issue comment or inline reply. */
export interface PostedComment {
  id: string
  htmlUrl?: string
  createdAt?: string
}

export interface ReviewContext {
  pr: PullRequestDetail
  commits: CommitSummary[]
  files: PullRequestFile[]
  checks: CheckSummary[]
  reviews: ReviewSummary[]
  labels: LabelSummary[]
  assignees: UserSummary[]
  requestedReviewers: UserSummary[]
}

export interface PullRequestDetail extends PullRequest {
  commits?: CommitSummary[]
  filesChanged?: number
  additions?: number
  deletions?: number
  mergeable?: boolean | null
  checks?: CheckSummary[]
  reviews?: ReviewSummary[]
  labels?: LabelSummary[]
  assignees?: UserSummary[]
  requestedReviewers?: UserSummary[]
}

// ----------------------------------------------------------------------------
// Normalised diff model
// ----------------------------------------------------------------------------

export type DiffFileStatus = 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'binary'

export interface DiffLine {
  type: 'context' | 'added' | 'removed'
  oldLineNumber?: number
  newLineNumber?: number
  content: string
}

export interface DiffHunk {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface NormalizedDiffFile {
  path: string
  oldPath?: string
  status: DiffFileStatus
  additions: number
  deletions: number
  hunks: DiffHunk[]
  patch?: string
  isLarge?: boolean
  isGenerated?: boolean
  isBinary?: boolean
  language?: string
}

export interface NormalizedDiff {
  files: NormalizedDiffFile[]
  source: 'git' | 'github_api'
  totalAdditions: number
  totalDeletions: number
  truncated?: boolean
}

// ----------------------------------------------------------------------------
// Full file content (for the "view entire file" modal)
// ----------------------------------------------------------------------------
// The diff endpoints only return patch hunks; to show a changed file in the
// context of its whole content we fetch the file's full text at a specific
// commit. We read at the head commit for added/modified/renamed files and at
// the base commit for removed files (the only place the content still exists).

export interface GetFileContentParams {
  ref: PullRequestRef
  /** Repo-relative file path. */
  path: string
  /** Commit SHA to read the file at (head for live files, base for deletions). */
  sha: string
}

export interface FileContent {
  path: string
  sha: string
  /** UTF-8 text, or null when the file is binary or too large to inline. */
  text: string | null
  isBinary: boolean
  /** True when GitHub declined to inline the blob (over its ~1MB size cap). */
  truncated: boolean
  byteSize: number
}

// ----------------------------------------------------------------------------
// Snapshots
// ----------------------------------------------------------------------------

export interface PrCommitSnapshot {
  id: string
  pullRequestId: string
  baseSha: string
  headSha: string
  commitIds: string[]
  filesHash: string
  createdAt: string
}

// ----------------------------------------------------------------------------
// Preflight analysis
// ----------------------------------------------------------------------------

export type PreflightStatus = 'running' | 'completed' | 'failed' | 'stale' | 'interrupted'

export type GroupPriority = 'low' | 'medium' | 'high' | 'critical'

export type GroupCategory =
  | 'entry_point'
  | 'api_contract'
  | 'business_logic'
  | 'data_model'
  | 'database_migration'
  | 'ui'
  | 'state_management'
  | 'integration'
  | 'configuration'
  | 'test'
  | 'documentation'
  | 'build_tooling'
  | 'security'
  | 'performance'
  | 'workflow'
  | 'other'

export type RiskType =
  | 'bug'
  | 'security'
  | 'regression'
  | 'performance'
  | 'maintainability'
  | 'test_gap'
  | 'data_loss'
  | 'api_contract'
  | 'accessibility'
  | 'configuration'
  | 'deployment'
  | 'concurrency'
  | 'compatibility'
  | 'migration'
  | 'dependency'
  | 'other'

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical'
export type Confidence = 'low' | 'medium' | 'high'

export interface ReviewGroupFile {
  order: number
  fileReference: string
  path: string
  oldPath?: string
  title: string
  details: string
  reasonForPosition: string
  priority: GroupPriority
  status: DiffFileStatus
  additions?: number
  deletions?: number
  relatedFiles?: string[]
}

export interface ReviewGroup {
  order: number
  title: string
  shortLabel?: string
  explanation: string
  readExplanation: string
  priority: GroupPriority
  category: GroupCategory
  stats: { fileCount: number; additions: number; deletions: number }
  files: ReviewGroupFile[]
}

export interface RiskFinding {
  title: string
  type: RiskType
  severity: RiskSeverity
  details: string
  fileReferences?: string[]
  confidence: Confidence
  relatedGroupOrders?: number[]
}

export interface PreflightAnalysis {
  schemaVersion: '2.0'
  pr: {
    provider: 'github'
    repoFullName: string
    pullRequestNumber: number
    title: string
    baseBranch: string
    headBranch: string
    baseSha: string
    headSha: string
    analysedCommitIds: string[]
  }
  summary: {
    shortTitle: string
    overview: string
    estimatedReviewComplexity: 'low' | 'medium' | 'high' | 'very_high'
    suggestedReviewStrategy: string
    totalFiles: number
    totalAdditions: number
    totalDeletions: number
  }
  reviewGroups: ReviewGroup[]
  riskFindings: RiskFinding[]
  assumptions?: string[]
  warnings?: string[]
}

export interface PreflightRecord {
  id: string
  pullRequestId: string
  snapshotId: string
  model: string
  reasoningEffort: ReasoningEffort
  status: PreflightStatus
  analysis?: PreflightAnalysis | null
  rawOutput?: string | null
  errorMessage?: string | null
  createdAt: string
  completedAt?: string | null
}

// ----------------------------------------------------------------------------
// Review drafts & submission
// ----------------------------------------------------------------------------

export type ReviewDraftStatus = 'running' | 'draft' | 'submitted' | 'failed' | 'stale' | 'interrupted'

export interface ReviewDraft {
  id: string
  pullRequestId: string
  snapshotId: string
  preflightAnalysisId?: string
  model: string
  reasoningEffort: ReasoningEffort
  userNotes?: string
  markdown: string
  status: ReviewDraftStatus
  githubReviewId?: string
  submittedAt?: string
  createdAt: string
  updatedAt: string
}

export interface SubmittedReview {
  githubReviewId: string
  htmlUrl?: string
  submittedAt: string
}

export type ReviewStatusValue = 'reviewed' | 'needs_rereview' | 'draft_available'

export interface ReviewStatus {
  id: string
  pullRequestId: string
  snapshotId: string
  reviewDraftId?: string
  status: ReviewStatusValue
  reviewedHeadSha?: string
  reviewedAt?: string
  updatedAt: string
}

// ----------------------------------------------------------------------------
// Local PR review state machine
// ----------------------------------------------------------------------------

export type LocalPrReviewState =
  | 'new'
  | 'preflight_running'
  | 'preflight_ready'
  | 'preflight_failed'
  | 'preflight_stale'
  | 'review_generating'
  | 'draft_available'
  | 'review_submitted'
  | 'needs_rereview'

// ----------------------------------------------------------------------------
// Workspace
// ----------------------------------------------------------------------------

export interface WorkspaceState {
  pr: PullRequestDetail
  context: ReviewContext
  diff: NormalizedDiff
  snapshot: PrCommitSnapshot
  preflight: PreflightRecord | null
  draft: ReviewDraft | null
  reviewStatus: ReviewStatus | null
  reviewState: LocalPrReviewState
  preflightStale: boolean
  draftStale: boolean
  gitAvailable: boolean
}

// ----------------------------------------------------------------------------
// Tasks
// ----------------------------------------------------------------------------

export type TaskKind = 'preflight' | 'review'

export interface TaskHandle {
  taskId: string
  kind: TaskKind
}

export interface RunPreflightParams {
  ref: PullRequestRef
  pullRequestId: string
  snapshotId: string
  force?: boolean
}

export interface GenerateReviewParams {
  ref: PullRequestRef
  pullRequestId: string
  snapshotId: string
  preflightAnalysisId?: string
  userNotes?: string
}

export interface SaveDraftParams {
  draftId: string
  markdown: string
}

/**
 * A pending inline comment authored in the app before the review is submitted
 * (GitHub's "start a review" model). It is anchored to a diff line and batched
 * into the review submission as a single GitHub `comments[]` entry.
 */
export interface DraftInlineComment {
  /** Stable local id (renderer-minted) so the list can edit/remove entries. */
  localId: string
  path: string
  /** Line number in the file (head side for RIGHT, base side for LEFT). */
  line: number
  side: DiffSide
  /** Start of a multi-line range (optional). */
  startLine?: number
  startSide?: DiffSide
  body: string
  /** The diff line's text, kept only for rendering the pending list. */
  lineContent?: string
}

export interface SubmitDraftParams {
  draftId: string
  ref: PullRequestRef
  event?: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'
  /** Pending inline comments to attach to the review (pending-review model). */
  comments?: DraftInlineComment[]
}

/**
 * Submit a PR review without an AI draft — a review made of a free-form summary
 * and/or pending inline comments. Used by the "Finish review" flow so the user
 * can review entirely by hand from the workspace.
 */
export interface FinishReviewParams {
  ref: PullRequestRef
  body?: string
  event?: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'
  comments?: DraftInlineComment[]
}

export interface CreateCommentParams {
  ref: PullRequestRef
  body: string
}

export interface ReplyReviewCommentParams {
  ref: PullRequestRef
  /** The root (or any) comment id of the thread to reply to. */
  inReplyToId: string
  body: string
}

// ----------------------------------------------------------------------------
// Settings
// ----------------------------------------------------------------------------

export interface AppSettings {
  defaultPreflightModel: string
  defaultPreflightReasoningEffort: ReasoningEffort
  defaultReviewModel: string
  defaultReviewReasoningEffort: ReasoningEffort
  codexBinaryMode: 'auto' | 'custom'
  codexBinaryPath?: string
  autoCheckUpdates: boolean
  activeAccountId?: string
  devMode?: boolean
}

// ----------------------------------------------------------------------------
// Updates
// ----------------------------------------------------------------------------

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  newVersion?: string
  progressPercent?: number
  message?: string
  forced?: boolean
}

export interface VersionPolicy {
  minimumSupportedVersion: string
  message?: string
  critical?: boolean
}

// ----------------------------------------------------------------------------
// Review flags (future-friendly placeholder)
// ----------------------------------------------------------------------------

export interface ReviewFlag {
  id: string
  pullRequestId: string
  snapshotId: string
  title: string
  details?: string
  fileReference?: string
  createdAt: string
}

// ----------------------------------------------------------------------------
// App events (renderer consumes these only)
// ----------------------------------------------------------------------------

export type TaskPhase = string

export type AppEvent =
  | { type: 'codex.session.state.changed'; state: CodexSessionState; message?: string }
  | { type: 'task.phase'; taskId: string; kind: TaskKind; phase: TaskPhase; phaseIndex: number; phaseCount: number }
  | { type: 'task.log'; taskId: string; kind: TaskKind; message: string }
  | { type: 'task.content.delta'; taskId: string; kind: TaskKind; text: string }
  | { type: 'task.completed'; taskId: string; kind: TaskKind; resultId?: string }
  | { type: 'task.failed'; taskId: string; kind: TaskKind; message: string; recoverable: boolean }
  | { type: 'task.interrupted'; taskId: string; kind: TaskKind }
  | { type: 'draft.saved'; draftId: string; updatedAt: string }
  | { type: 'update.status'; status: UpdateStatus }
  | { type: 'account.needsReauth'; accountId: string }
  | { type: 'account.added'; accountId: string; login: string }
  | { type: 'auth.failed'; flowId: string; message: string }
  | { type: 'toast'; level: 'info' | 'success' | 'warning' | 'error'; message: string }
