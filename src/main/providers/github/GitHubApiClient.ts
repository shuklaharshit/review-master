import { Octokit } from '@octokit/rest'
import type { AppError } from '../../../shared/result'
import { appError } from '../../../shared/result'
import { logger } from '../../app/Logger'
import type { AccountService } from '../../auth/AccountService'
import type {
  GhCheckRun,
  GhCommit,
  GhCommitStatus,
  GhCreatedComment,
  GhCreatedReview,
  GhFile,
  GhIssueComment,
  GhLabel,
  GhPullRequest,
  GhRepo,
  GhReview,
  GhReviewComment,
  GhUser
} from './GitHubTypes'

/** A single inline comment passed to createReview (GitHub line-based API). */
export interface CreateReviewComment {
  path: string
  body: string
  line: number
  side?: 'LEFT' | 'RIGHT'
  start_line?: number
  start_side?: 'LEFT' | 'RIGHT'
}

/** A narrow view of the Octokit/HTTP error we care about. */
interface OctokitError {
  status?: number
  message?: string
  response?: {
    headers?: Record<string, string | undefined>
  }
}

export interface ListPullsOptions {
  state?: 'open' | 'closed' | 'all'
  page?: number
  perPage?: number
}

// Caps so a giant PR can't run unbounded pagination.
const MAX_FILE_PAGES = 3
const FILE_PER_PAGE = 100

// Caps for installation-scoped repo enumeration (ADR-0007).
const MAX_INSTALLATION_PAGES = 5
const INSTALLATIONS_PER_PAGE = 100
const MAX_INSTALL_REPO_PAGES = 10
const REPO_PER_PAGE = 100

/**
 * Per-account Octokit wrapper. Resolves the token from AccountService on each
 * call, normalises 401 (token revoked) and rate-limit errors into AppErrors,
 * and exposes the thin set of GitHub operations the provider needs.
 */
export class GitHubApiClient {
  private readonly log = logger.scope('github-api')

  constructor(private readonly accounts: AccountService) {}

  private async octokit(accountId: string): Promise<Octokit> {
    const token = await this.accounts.getToken(accountId)
    if (!token) {
      throw appError(
        'account_unauthenticated',
        'This GitHub account is not authenticated. Please reconnect it.',
        true,
        { accountId }
      )
    }
    return new Octokit({ auth: token })
  }

  /**
   * Wraps a call so HTTP errors become typed AppErrors. On a 401 (expired or
   * revoked token) it attempts a single transparent token refresh and retries
   * once before giving up; if the refresh fails, normalizeError flags the
   * account for re-auth (ADR-0007).
   */
  private async call<T>(accountId: string, fn: (octokit: Octokit) => Promise<T>): Promise<T> {
    const octokit = await this.octokit(accountId)
    try {
      return await fn(octokit)
    } catch (error) {
      if ((error as OctokitError)?.status === 401) {
        const refreshed = await this.accounts.forceRefresh(accountId)
        if (refreshed) {
          try {
            return await fn(new Octokit({ auth: refreshed }))
          } catch (retryError) {
            throw this.normalizeError(accountId, retryError)
          }
        }
      }
      throw this.normalizeError(accountId, error)
    }
  }

  private normalizeError(accountId: string, error: unknown): AppError {
    const e = error as OctokitError
    const status = e?.status
    const headers = e?.response?.headers ?? {}

    if (status === 401) {
      this.accounts.setNeedsReauth(accountId, true)
      return appError('token_revoked', 'Your GitHub token is no longer valid. Please reconnect.', true, {
        accountId
      })
    }

    const remaining = headers['x-ratelimit-remaining']
    const isRateLimited =
      (status === 403 || status === 429) && remaining !== undefined && Number(remaining) === 0
    if (isRateLimited) {
      const reset = headers['x-ratelimit-reset']
      const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : undefined
      return appError('rate_limited', 'GitHub API rate limit reached. Try again shortly.', true, {
        resetAt
      })
    }

    if (status === 403) {
      return appError('no_permission', 'You do not have permission for this GitHub resource.', false, {
        accountId
      })
    }
    if (status === 404) {
      return appError('not_found', 'The requested GitHub resource was not found.', false)
    }

    this.log.warn('github api error', { status, message: e?.message })
    return appError('github_api_error', e?.message || 'A GitHub API request failed.')
  }

  // -------------------------------------------------------------------------
  // Repositories
  // -------------------------------------------------------------------------

  /**
   * Repo access under a GitHub App is installation-scoped (ADR-0007): the user
   * token can only see repos in installations it can access. We aggregate the
   * full set across installations and let the provider sort / paginate / filter
   * client-side — `search.repos` is unreliable under an App token (it only
   * matches installed repos and silently omits others), so we don't use it.
   */
  async listAllRepos(accountId: string): Promise<GhRepo[]> {
    const installationIds = await this.listInstallationIds(accountId)
    const byId = new Map<number, GhRepo>()
    for (const installationId of installationIds) {
      for (const repo of await this.listReposForInstallation(accountId, installationId)) {
        byId.set(repo.id, repo)
      }
    }
    return [...byId.values()]
  }

  /** True if the user token can access at least one App installation. */
  async hasInstallations(accountId: string): Promise<boolean> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.apps.listInstallationsForAuthenticatedUser({ per_page: 1 })
      const count = res.data.total_count ?? res.data.installations.length
      return count > 0
    })
  }

  private async listInstallationIds(accountId: string): Promise<number[]> {
    return this.call(accountId, async (octokit) => {
      const ids: number[] = []
      for (let page = 1; page <= MAX_INSTALLATION_PAGES; page++) {
        const res = await octokit.rest.apps.listInstallationsForAuthenticatedUser({
          per_page: INSTALLATIONS_PER_PAGE,
          page
        })
        const batch = res.data.installations
        ids.push(...batch.map((i) => i.id))
        if (batch.length < INSTALLATIONS_PER_PAGE) break
        if (page === MAX_INSTALLATION_PAGES) {
          this.log.warn('installation list truncated at cap', { accountId })
        }
      }
      return ids
    })
  }

  private async listReposForInstallation(
    accountId: string,
    installationId: number
  ): Promise<GhRepo[]> {
    return this.call(accountId, async (octokit) => {
      const repos: GhRepo[] = []
      for (let page = 1; page <= MAX_INSTALL_REPO_PAGES; page++) {
        const res = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
          installation_id: installationId,
          per_page: REPO_PER_PAGE,
          page
        })
        const batch = res.data.repositories as unknown as GhRepo[]
        repos.push(...batch)
        if (batch.length < REPO_PER_PAGE) break
        if (page === MAX_INSTALL_REPO_PAGES) {
          this.log.warn('installation repos truncated at cap', { accountId, installationId })
        }
      }
      return repos
    })
  }

  // -------------------------------------------------------------------------
  // Pull requests
  // -------------------------------------------------------------------------

  async listPulls(
    accountId: string,
    owner: string,
    repo: string,
    options: ListPullsOptions
  ): Promise<GhPullRequest[]> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.pulls.list({
        owner,
        repo,
        state: options.state ?? 'open',
        per_page: options.perPage ?? 30,
        page: options.page ?? 1,
        sort: 'updated',
        direction: 'desc'
      })
      return res.data as unknown as GhPullRequest[]
    })
  }

  async getPull(
    accountId: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<GhPullRequest> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.pulls.get({ owner, repo, pull_number: number })
      return res.data as unknown as GhPullRequest
    })
  }

  async listPullCommits(
    accountId: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<GhCommit[]> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: number,
        per_page: 100
      })
      return res.data as unknown as GhCommit[]
    })
  }

  async listPullFiles(
    accountId: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<GhFile[]> {
    return this.call(accountId, async (octokit) => {
      const files: GhFile[] = []
      for (let page = 1; page <= MAX_FILE_PAGES; page++) {
        const res = await octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: number,
          per_page: FILE_PER_PAGE,
          page
        })
        const batch = res.data as unknown as GhFile[]
        files.push(...batch)
        if (batch.length < FILE_PER_PAGE) break
      }
      return files
    })
  }

  // -------------------------------------------------------------------------
  // File content (for "view entire file")
  // -------------------------------------------------------------------------

  /**
   * Fetches the full text of one file at a commit via the Contents API. GitHub
   * returns the blob base64-encoded for files under ~1MB; above that it omits
   * the content (we surface that as `truncated`). Binary files are detected by
   * a NUL byte in the decoded bytes and surfaced as `isBinary` (no text).
   */
  async getFileContent(
    accountId: string,
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<{ text: string | null; isBinary: boolean; truncated: boolean; byteSize: number }> {
    // Only the HTTP call goes through `call()` (so 401 refresh / rate-limit
    // normalisation applies). Validation/decoding happens after, so the typed
    // AppError below isn't re-wrapped by normalizeError.
    const data = await this.call(accountId, async (octokit) => {
      const res = await octokit.rest.repos.getContent({ owner, repo, path, ref })
      return res.data
    })

    // A path that resolves to a directory (or submodule/symlink) comes back as
    // an array or a non-"file" type — there's no single file to display.
    if (Array.isArray(data) || data.type !== 'file') {
      throw appError('not_found', 'That path is not a file.', false, { path })
    }

    const byteSize = data.size ?? 0
    const encoded = data.content ?? ''
    // Over the size cap GitHub returns an empty body — nothing to inline.
    if (!encoded && byteSize > 0) {
      return { text: null, isBinary: false, truncated: true, byteSize }
    }
    const buf = Buffer.from(encoded, 'base64')
    if (buf.includes(0)) {
      return { text: null, isBinary: true, truncated: false, byteSize }
    }
    return { text: buf.toString('utf8'), isBinary: false, truncated: false, byteSize }
  }

  // -------------------------------------------------------------------------
  // Checks & statuses (combine check-runs + legacy commit statuses)
  // -------------------------------------------------------------------------

  async listCheckRuns(
    accountId: string,
    owner: string,
    repo: string,
    ref: string
  ): Promise<GhCheckRun[]> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.checks.listForRef({
        owner,
        repo,
        ref,
        per_page: 100
      })
      return res.data.check_runs as unknown as GhCheckRun[]
    })
  }

  async listCommitStatuses(
    accountId: string,
    owner: string,
    repo: string,
    ref: string
  ): Promise<GhCommitStatus[]> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.repos.listCommitStatusesForRef({
        owner,
        repo,
        ref,
        per_page: 100
      })
      return res.data as unknown as GhCommitStatus[]
    })
  }

  // -------------------------------------------------------------------------
  // Reviews, labels, assignees, requested reviewers
  // -------------------------------------------------------------------------

  async listReviews(
    accountId: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<GhReview[]> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: number,
        per_page: 100
      })
      return res.data as unknown as GhReview[]
    })
  }

  async getIssueLabels(
    accountId: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<GhLabel[]> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.issues.listLabelsOnIssue({
        owner,
        repo,
        issue_number: number,
        per_page: 100
      })
      return res.data as unknown as GhLabel[]
    })
  }

  /** Top-level PR comments (the conversation tab). */
  async listIssueComments(
    accountId: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<GhIssueComment[]> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: number,
        per_page: 100
      })
      return res.data as unknown as GhIssueComment[]
    })
  }

  /** Inline review comments (anchored to diff lines). */
  async listReviewComments(
    accountId: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<GhReviewComment[]> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: number,
        per_page: 100
      })
      return res.data as unknown as GhReviewComment[]
    })
  }

  /** Assignees + requested reviewers come from the PR object itself. */
  async getAssigneesAndReviewers(
    accountId: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<{ assignees: GhUser[]; requestedReviewers: GhUser[] }> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.pulls.get({ owner, repo, pull_number: number })
      const pr = res.data as unknown as GhPullRequest
      return {
        assignees: pr.assignees ?? [],
        requestedReviewers: pr.requested_reviewers ?? []
      }
    })
  }

  // -------------------------------------------------------------------------
  // Review submission
  // -------------------------------------------------------------------------

  async createReview(
    accountId: string,
    owner: string,
    repo: string,
    number: number,
    params: {
      event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'
      body: string
      commitId?: string
      comments?: CreateReviewComment[]
    }
  ): Promise<GhCreatedReview> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: number,
        event: params.event,
        body: params.body,
        commit_id: params.commitId,
        // Line-based inline comments; cast keeps us off Octokit's legacy
        // position-based comment shape.
        comments: params.comments as unknown as undefined
      })
      return res.data as unknown as GhCreatedReview
    })
  }

  /** Posts a top-level PR comment. */
  async createIssueComment(
    accountId: string,
    owner: string,
    repo: string,
    number: number,
    body: string
  ): Promise<GhCreatedComment> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: number,
        body
      })
      return res.data as unknown as GhCreatedComment
    })
  }

  /** Replies to an existing inline review-comment thread. */
  async replyReviewComment(
    accountId: string,
    owner: string,
    repo: string,
    number: number,
    commentId: number,
    body: string
  ): Promise<GhCreatedComment> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.pulls.createReplyForReviewComment({
        owner,
        repo,
        pull_number: number,
        comment_id: commentId,
        body
      })
      return res.data as unknown as GhCreatedComment
    })
  }
}
