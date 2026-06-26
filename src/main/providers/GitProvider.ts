import type {
  AuthFlowStartResult,
  CheckSummary,
  CommitSummary,
  FileContent,
  GetFileContentParams,
  GitProviderId,
  LabelSummary,
  ListPullRequestsParams,
  ListRepositoriesParams,
  PaginatedResult,
  PullRequest,
  PullRequestDetail,
  PullRequestFile,
  PullRequestRef,
  Repository,
  ReviewContext,
  ReviewSummary,
  SearchRepositoriesParams,
  SubmittedReview,
  UserSummary
} from '../../shared/types'

export interface SubmitReviewParams {
  ref: PullRequestRef
  body: string
  event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'
  commitId?: string
}

/** Provider abstraction (spec §10). MVP implements GitHub only. */
export interface GitProvider {
  readonly id: GitProviderId
  readonly displayName: string

  startAuthFlow(): Promise<AuthFlowStartResult>
  cancelAuthFlow(flowId: string): Promise<void>
  /** Completes once the user authorises (polls token endpoint). Resolves with the persisted account id. */
  awaitAuthFlow(flowId: string): Promise<string>

  /** Whether the account can see any App installation (GitHub App onboarding, ADR-0007). */
  hasInstallations(accountId: string): Promise<boolean>

  listRepositories(params: ListRepositoriesParams): Promise<PaginatedResult<Repository>>
  searchRepositories(params: SearchRepositoriesParams): Promise<PaginatedResult<Repository>>

  listPullRequests(params: ListPullRequestsParams): Promise<PaginatedResult<PullRequest>>
  getPullRequest(params: PullRequestRef): Promise<PullRequestDetail>

  getPullRequestCommits(params: PullRequestRef): Promise<CommitSummary[]>
  getPullRequestFiles(params: PullRequestRef): Promise<PullRequestFile[]>

  /** Full text of a single file at a given commit (for the "view entire file" view). */
  getFileContent(params: GetFileContentParams): Promise<FileContent>
  getPullRequestChecks(params: PullRequestRef): Promise<CheckSummary[]>
  getPullRequestReviews(params: PullRequestRef): Promise<ReviewSummary[]>
  getPullRequestLabels(params: PullRequestRef): Promise<LabelSummary[]>
  getPullRequestAssignees(params: PullRequestRef): Promise<UserSummary[]>

  fetchReviewContext(params: PullRequestRef): Promise<ReviewContext>
  submitPullRequestReview(params: SubmitReviewParams): Promise<SubmittedReview>
}
