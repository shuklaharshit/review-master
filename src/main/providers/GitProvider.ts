import type {
  AuthFlowStartResult,
  CheckSummary,
  CommitSummary,
  CreateCommentParams,
  DiffSide,
  FileContent,
  GetFileContentParams,
  GitProviderId,
  LabelSummary,
  ListPullRequestsParams,
  ListRepositoriesParams,
  MergePullRequestParams,
  MergeResult,
  PaginatedResult,
  PostedComment,
  PrConversation,
  PullRequest,
  PullRequestDetail,
  PullRequestFile,
  PullRequestRef,
  ReplyReviewCommentParams,
  EditCommentParams,
  Repository,
  ReviewContext,
  ReviewSummary,
  SearchRepositoriesParams,
  SubmittedReview,
  UserSummary
} from '../../shared/types'

/** One inline comment to attach to a submitted review (line-based). */
export interface SubmitReviewInlineComment {
  path: string
  body: string
  line: number
  side?: DiffSide
  startLine?: number
  startSide?: DiffSide
}

export interface SubmitReviewParams {
  ref: PullRequestRef
  body: string
  event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'
  commitId?: string
  comments?: SubmitReviewInlineComment[]
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

  /** Aggregated discussion: issue comments, reviews (with bodies), inline threads. */
  getPullRequestConversation(params: PullRequestRef): Promise<PrConversation>

  fetchReviewContext(params: PullRequestRef): Promise<ReviewContext>
  submitPullRequestReview(params: SubmitReviewParams): Promise<SubmittedReview>

  /** Posts a top-level PR comment. */
  createComment(params: CreateCommentParams): Promise<PostedComment>
  /** Replies to an existing inline review-comment thread. */
  replyToReviewComment(params: ReplyReviewCommentParams): Promise<PostedComment>
  /** Edits an existing conversation or inline review comment. */
  editComment(params: EditCommentParams): Promise<PostedComment>

  /** Merges the pull request with the chosen method. */
  mergePullRequest(params: MergePullRequestParams): Promise<MergeResult>
}
