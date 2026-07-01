import type {
  AuthFlowStartResult,
  CheckSummary,
  CommitSummary,
  CreateCommentParams,
  FileContent,
  GetFileContentParams,
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
} from '../../../shared/types'
import { appError } from '../../../shared/result'
import { nowIso } from '../../../shared/dates'
import { logger } from '../../app/Logger'
import type { SecureTokenStore } from '../../contracts'
import type { Database } from '../../db/types'
import type { AccountService } from '../../auth/AccountService'
import type { GitProvider, SubmitReviewParams } from '../GitProvider'
import { GitHubApiClient, type CreateReviewComment, type ListPullsOptions } from './GitHubApiClient'
import { GitHubAuthService } from './GitHubAuthService'
import type { GhRepo } from './GitHubTypes'
import {
  buildReviewThreads,
  mapCheckRun,
  mapCommit,
  mapCommitStatus,
  mapFile,
  mapIssueComment,
  mapLabel,
  mapPullRequest,
  mapPullRequestDetail,
  mapRepository,
  mapReview,
  mapReviewComment,
  mapUsers
} from './GitHubMapper'

export interface GitHubProviderDeps {
  db: Database
  accounts: AccountService
  tokens: SecureTokenStore
  auth: GitHubAuthService
  api: GitHubApiClient
}

const DEFAULT_REPO_PER_PAGE = 20
const DEFAULT_PR_PER_PAGE = 30

export class GitHubProvider implements GitProvider {
  readonly id = 'github' as const
  readonly displayName = 'GitHub'

  private readonly log = logger.scope('github-provider')
  private readonly db: Database
  private readonly accounts: AccountService
  private readonly auth: GitHubAuthService
  private readonly api: GitHubApiClient

  constructor(deps: GitHubProviderDeps) {
    this.db = deps.db
    this.accounts = deps.accounts
    this.auth = deps.auth
    this.api = deps.api
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  async startAuthFlow(): Promise<AuthFlowStartResult> {
    return this.auth.startAuthFlow()
  }

  async cancelAuthFlow(flowId: string): Promise<void> {
    return this.auth.cancelAuthFlow(flowId)
  }

  async awaitAuthFlow(flowId: string): Promise<string> {
    const credential = await this.auth.awaitAuthFlow(flowId)
    const user = await this.auth.getAuthenticatedUser(credential.accessToken)
    const account = await this.accounts.saveAuthenticatedAccount({
      providerId: 'github',
      providerAccountId: String(user.id),
      login: user.login,
      displayName: user.name ?? undefined,
      avatarUrl: user.avatar_url,
      // GitHub Apps issue no scopes; access is governed by installation.
      credential
    })
    this.log.info('account authenticated', { accountId: account.id, login: account.login })
    return account.id
  }

  /** Whether the account's token can see any App installation (drives onboarding UI). */
  async hasInstallations(accountId: string): Promise<boolean> {
    return this.api.hasInstallations(accountId)
  }

  // -------------------------------------------------------------------------
  // Repositories
  // -------------------------------------------------------------------------

  // Under a GitHub App, repos come from installations (ADR-0007): we fetch the
  // full installation-scoped set once, then sort / paginate / filter in-process.
  async listRepositories(params: ListRepositoriesParams): Promise<PaginatedResult<Repository>> {
    const sorted = this.sortRepos(await this.api.listAllRepos(params.accountId), params.sort ?? 'updated')
    return this.paginateRepos(params.accountId, sorted, params.page, params.perPage)
  }

  async searchRepositories(params: SearchRepositoriesParams): Promise<PaginatedResult<Repository>> {
    if (!this.accounts.get(params.accountId)) {
      throw appError('account_unauthenticated', 'Unknown GitHub account.', true, {
        accountId: params.accountId
      })
    }

    const q = params.query.trim().toLowerCase()
    const sorted = this.sortRepos(await this.api.listAllRepos(params.accountId), 'updated')
    const filtered = q
      ? sorted.filter(
          (r) =>
            r.full_name.toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q) ||
            (r.description ?? '').toLowerCase().includes(q)
        )
      : sorted
    return this.paginateRepos(params.accountId, filtered, params.page, params.perPage)
  }

  /** Maps + caches the full set, returns one client-side page with totals. */
  private paginateRepos(
    accountId: string,
    raw: GhRepo[],
    page = 1,
    perPage = DEFAULT_REPO_PER_PAGE
  ): PaginatedResult<Repository> {
    const items = raw.map((r) => mapRepository(accountId, r))
    this.db.repos.upsertMany(items)
    const start = (page - 1) * perPage
    return {
      items: items.slice(start, start + perPage),
      page,
      perPage,
      hasMore: start + perPage < items.length,
      total: items.length
    }
  }

  private sortRepos(repos: GhRepo[], sort: 'updated' | 'pushed' | 'full_name'): GhRepo[] {
    const copy = [...repos]
    if (sort === 'full_name') {
      return copy.sort((a, b) => a.full_name.localeCompare(b.full_name))
    }
    // 'updated'/'pushed' → most-recently-updated first (we only carry updated_at).
    return copy.sort((a, b) => (Date.parse(b.updated_at ?? '') || 0) - (Date.parse(a.updated_at ?? '') || 0))
  }

  // -------------------------------------------------------------------------
  // Pull requests
  // -------------------------------------------------------------------------

  async listPullRequests(params: ListPullRequestsParams): Promise<PaginatedResult<PullRequest>> {
    const page = params.page ?? 1
    const perPage = params.perPage ?? DEFAULT_PR_PER_PAGE
    const filter = params.filter ?? 'open'

    // Map our filter to the GitHub `state` query. `merged` is a subset of
    // `closed` (closed PRs that were merged), filtered locally afterwards.
    const options: ListPullsOptions = {
      state: filter === 'all' ? 'all' : filter === 'merged' ? 'closed' : filter,
      page,
      perPage
    }

    const raw = await this.api.listPulls(params.accountId, params.owner, params.repo, options)
    let items = raw.map((pr) => mapPullRequest(params.accountId, params.repoId, pr))

    if (filter === 'merged') {
      items = items.filter((pr) => pr.state === 'merged')
    }

    if (params.query) {
      const q = params.query.toLowerCase()
      items = items.filter(
        (pr) => pr.title.toLowerCase().includes(q) || String(pr.number).includes(q)
      )
    }

    for (const pr of items) {
      pr.localReviewState = this.localReviewState(pr.id)
      this.db.pullRequests.upsert(pr)
    }

    return { items, page, perPage, hasMore: raw.length === perPage }
  }

  async getPullRequest(params: PullRequestRef): Promise<PullRequestDetail> {
    const raw = await this.api.getPull(params.accountId, params.owner, params.repo, params.number)
    const detail = mapPullRequestDetail(params.accountId, params.repoId, raw)
    detail.localReviewState = this.localReviewState(detail.id)
    this.db.pullRequests.upsert(detail)
    return detail
  }

  async getPullRequestCommits(params: PullRequestRef): Promise<CommitSummary[]> {
    const raw = await this.api.listPullCommits(
      params.accountId,
      params.owner,
      params.repo,
      params.number
    )
    return raw.map(mapCommit)
  }

  async getPullRequestFiles(params: PullRequestRef): Promise<PullRequestFile[]> {
    const raw = await this.api.listPullFiles(
      params.accountId,
      params.owner,
      params.repo,
      params.number
    )
    return raw.map(mapFile)
  }

  async getFileContent(params: GetFileContentParams): Promise<FileContent> {
    const raw = await this.api.getFileContent(
      params.ref.accountId,
      params.ref.owner,
      params.ref.repo,
      params.path,
      params.sha
    )
    return { path: params.path, sha: params.sha, ...raw }
  }

  async getPullRequestChecks(params: PullRequestRef): Promise<CheckSummary[]> {
    const headSha = await this.resolveHeadSha(params)
    const [runs, statuses] = await Promise.all([
      this.api.listCheckRuns(params.accountId, params.owner, params.repo, headSha),
      this.api.listCommitStatuses(params.accountId, params.owner, params.repo, headSha)
    ])
    return [...runs.map(mapCheckRun), ...statuses.map(mapCommitStatus)]
  }

  async getPullRequestReviews(params: PullRequestRef): Promise<ReviewSummary[]> {
    const raw = await this.api.listReviews(
      params.accountId,
      params.owner,
      params.repo,
      params.number
    )
    return raw.map(mapReview)
  }

  async getPullRequestLabels(params: PullRequestRef): Promise<LabelSummary[]> {
    const raw = await this.api.getIssueLabels(
      params.accountId,
      params.owner,
      params.repo,
      params.number
    )
    return raw.map(mapLabel)
  }

  async getPullRequestAssignees(params: PullRequestRef): Promise<UserSummary[]> {
    const { assignees } = await this.api.getAssigneesAndReviewers(
      params.accountId,
      params.owner,
      params.repo,
      params.number
    )
    return mapUsers(assignees)
  }

  // -------------------------------------------------------------------------
  // Conversation (discussion timeline)
  // -------------------------------------------------------------------------

  async getPullRequestConversation(params: PullRequestRef): Promise<PrConversation> {
    const [issueRaw, reviewsRaw, reviewCommentsRaw] = await Promise.all([
      this.api.listIssueComments(params.accountId, params.owner, params.repo, params.number),
      this.api.listReviews(params.accountId, params.owner, params.repo, params.number),
      this.api.listReviewComments(params.accountId, params.owner, params.repo, params.number)
    ])

    const issueComments = issueRaw.map(mapIssueComment)
    // Drop empty PENDING reviews (no body, no state of interest) — they're the
    // reviewer's own in-progress draft and add only noise to the timeline.
    const reviews = reviewsRaw
      .map(mapReview)
      .filter((r) => r.state !== 'PENDING')
    const threads = buildReviewThreads(reviewCommentsRaw.map(mapReviewComment))

    return { issueComments, reviews, threads }
  }

  // -------------------------------------------------------------------------
  // Aggregated review context
  // -------------------------------------------------------------------------

  async fetchReviewContext(params: PullRequestRef): Promise<ReviewContext> {
    // Fetch the PR detail first so we know the head sha for checks.
    const raw = await this.api.getPull(params.accountId, params.owner, params.repo, params.number)
    const pr = mapPullRequestDetail(params.accountId, params.repoId, raw)
    pr.localReviewState = this.localReviewState(pr.id)
    this.db.pullRequests.upsert(pr)

    const headSha = raw.head.sha

    const [commitsRaw, filesRaw, runsRaw, statusesRaw, reviewsRaw, labelsRaw] = await Promise.all([
      this.api.listPullCommits(params.accountId, params.owner, params.repo, params.number),
      this.api.listPullFiles(params.accountId, params.owner, params.repo, params.number),
      this.api.listCheckRuns(params.accountId, params.owner, params.repo, headSha),
      this.api.listCommitStatuses(params.accountId, params.owner, params.repo, headSha),
      this.api.listReviews(params.accountId, params.owner, params.repo, params.number),
      this.api.getIssueLabels(params.accountId, params.owner, params.repo, params.number)
    ])

    const commits = commitsRaw.map(mapCommit)
    const files = filesRaw.map(mapFile)
    const checks = [...runsRaw.map(mapCheckRun), ...statusesRaw.map(mapCommitStatus)]
    const reviews = reviewsRaw.map(mapReview)
    const labels = labelsRaw.map(mapLabel)
    const assignees = mapUsers(raw.assignees)
    const requestedReviewers = mapUsers(raw.requested_reviewers)

    // Enrich the detail with the aggregated collections.
    pr.commits = commits
    pr.checks = checks
    pr.reviews = reviews
    pr.labels = labels
    pr.assignees = assignees
    pr.requestedReviewers = requestedReviewers

    return { pr, commits, files, checks, reviews, labels, assignees, requestedReviewers }
  }

  // -------------------------------------------------------------------------
  // Review submission (spec §16)
  // -------------------------------------------------------------------------

  async submitPullRequestReview(params: SubmitReviewParams): Promise<SubmittedReview> {
    const { ref } = params
    const comments: CreateReviewComment[] | undefined = params.comments?.length
      ? params.comments.map((c) => ({
          path: c.path,
          body: c.body,
          line: c.line,
          side: c.side,
          start_line: c.startLine,
          start_side: c.startSide
        }))
      : undefined
    // Anchor inline comments to the current head so line numbers resolve against
    // the right commit; review-level-only submissions don't need a commit id.
    const commitId =
      params.commitId ?? (comments ? await this.resolveHeadSha(ref).catch(() => undefined) : undefined)
    try {
      const created = await this.api.createReview(ref.accountId, ref.owner, ref.repo, ref.number, {
        event: params.event,
        body: params.body,
        commitId,
        comments
      })
      return {
        githubReviewId: String(created.id),
        htmlUrl: created.html_url,
        submittedAt: created.submitted_at ?? nowIso()
      }
    } catch (error) {
      throw this.mapSubmitError(error)
    }
  }

  // -------------------------------------------------------------------------
  // Standalone comments (conversation replies)
  // -------------------------------------------------------------------------

  async createComment(params: CreateCommentParams): Promise<PostedComment> {
    const { ref } = params
    const created = await this.api.createIssueComment(
      ref.accountId,
      ref.owner,
      ref.repo,
      ref.number,
      params.body
    )
    return { id: String(created.id), htmlUrl: created.html_url, createdAt: created.created_at ?? undefined }
  }

  async replyToReviewComment(params: ReplyReviewCommentParams): Promise<PostedComment> {
    const { ref } = params
    const created = await this.api.replyReviewComment(
      ref.accountId,
      ref.owner,
      ref.repo,
      ref.number,
      Number(params.inReplyToId),
      params.body
    )
    return { id: String(created.id), htmlUrl: created.html_url, createdAt: created.created_at ?? undefined }
  }

  async editComment(params: EditCommentParams): Promise<PostedComment> {
    const { ref } = params
    const id = Number(params.commentId)
    const updated =
      params.kind === 'issue'
        ? await this.api.updateIssueComment(ref.accountId, ref.owner, ref.repo, id, params.body)
        : await this.api.updateReviewComment(ref.accountId, ref.owner, ref.repo, id, params.body)
    return { id: String(updated.id), htmlUrl: updated.html_url, createdAt: updated.created_at ?? undefined }
  }

  // -------------------------------------------------------------------------
  // Merge
  // -------------------------------------------------------------------------

  async mergePullRequest(params: MergePullRequestParams): Promise<MergeResult> {
    const { ref } = params
    try {
      return await this.api.mergePull(ref.accountId, ref.owner, ref.repo, ref.number, {
        merge_method: params.method,
        commit_title: params.commitTitle,
        commit_message: params.commitMessage
      })
    } catch (error) {
      throw this.mapMergeError(error)
    }
  }

  private mapMergeError(error: unknown): unknown {
    const e = error as { code?: string; details?: { status?: number }; message?: string }
    // 405 → not mergeable (checks/branch protection); 409 → conflict or the head
    // moved since the page loaded. GitHubApiClient surfaces both as github_api_error.
    if (e?.code === 'github_api_error') {
      return appError('merge_failed', e.message || 'GitHub could not merge this pull request.', true, e?.details)
    }
    if (e?.code === 'not_found') {
      return appError('pr_closed', 'The pull request could not be found or is closed.', false)
    }
    return error
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async resolveHeadSha(params: PullRequestRef): Promise<string> {
    const local = this.db.pullRequests.getByNumber(params.repoId, params.number)
    if (local?.headSha) return local.headSha
    const raw = await this.api.getPull(params.accountId, params.owner, params.repo, params.number)
    return raw.head.sha
  }

  private localReviewState(prId: string): PullRequest['localReviewState'] | undefined {
    try {
      const status = this.db.reviewStatuses.latestForPr(prId)
      if (!status) return undefined
      switch (status.status) {
        case 'reviewed':
          return 'review_submitted'
        case 'needs_rereview':
          return 'needs_rereview'
        case 'draft_available':
          return 'draft_available'
        default:
          return undefined
      }
    } catch {
      return undefined
    }
  }

  private mapSubmitError(error: unknown): unknown {
    const e = error as { code?: string; details?: { status?: number } }
    // Errors coming from GitHubApiClient are already AppErrors.
    if (e?.code === 'no_permission') {
      return appError('no_permission', 'You do not have permission to review this pull request.', false)
    }
    if (e?.code === 'not_found') {
      return appError('pr_closed', 'The pull request could not be found or is closed.', false)
    }
    if (e?.code === 'github_api_error') {
      // 422 from createReview typically means the PR is closed or already reviewed.
      return appError(
        'pr_closed',
        'GitHub rejected the review. The pull request may be closed.',
        false,
        e?.details
      )
    }
    return error
  }
}
