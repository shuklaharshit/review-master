import { Octokit } from '@octokit/rest'
import type { AppError } from '../../../shared/result'
import { appError } from '../../../shared/result'
import { logger } from '../../app/Logger'
import type { AccountService } from '../../auth/AccountService'
import type {
  GhCheckRun,
  GhCommit,
  GhCommitStatus,
  GhCreatedReview,
  GhFile,
  GhLabel,
  GhPullRequest,
  GhRepo,
  GhReview,
  GhUser
} from './GitHubTypes'

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

  /** Wraps a call so HTTP errors become typed AppErrors. */
  private async call<T>(accountId: string, fn: (octokit: Octokit) => Promise<T>): Promise<T> {
    const octokit = await this.octokit(accountId)
    try {
      return await fn(octokit)
    } catch (error) {
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

  async listRepos(
    accountId: string,
    page: number,
    perPage: number,
    sort: 'updated' | 'pushed' | 'full_name'
  ): Promise<GhRepo[]> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.repos.listForAuthenticatedUser({
        per_page: perPage,
        page,
        sort,
        affiliation: 'owner,collaborator,organization_member'
      })
      return res.data as unknown as GhRepo[]
    })
  }

  async searchRepos(
    accountId: string,
    login: string,
    query: string,
    page: number,
    perPage: number
  ): Promise<{ items: GhRepo[]; total: number }> {
    return this.call(accountId, async (octokit) => {
      // Scope the query to the authenticated user so results are relevant.
      const scoped = query.includes('user:') || query.includes('org:')
        ? query
        : `${query} user:${login}`
      const res = await octokit.rest.search.repos({
        q: scoped,
        per_page: perPage,
        page,
        sort: 'updated'
      })
      return {
        items: res.data.items as unknown as GhRepo[],
        total: res.data.total_count
      }
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
    params: { event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'; body: string; commitId?: string }
  ): Promise<GhCreatedReview> {
    return this.call(accountId, async (octokit) => {
      const res = await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: number,
        event: params.event,
        body: params.body,
        commit_id: params.commitId
      })
      return res.data as unknown as GhCreatedReview
    })
  }
}
