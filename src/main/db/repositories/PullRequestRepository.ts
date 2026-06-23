import type BetterSqlite3 from 'better-sqlite3'
import type { GitProviderId, PullRequest, PullRequestState } from '../../../shared/types'
import type { PullRequestRepository as IPullRequestRepository } from '../types'
import { newId } from '../../../shared/ids'

interface PullRequestRow {
  id: string
  provider_id: string
  account_id: string
  repo_id: string
  provider_pr_id: string
  number: number
  title: string
  body: string | null
  state: string | null
  draft: number | null
  author_login: string | null
  base_branch: string
  head_branch: string
  base_sha: string
  head_sha: string
  html_url: string | null
  created_at: string | null
  updated_at: string | null
  last_synced_at: string | null
}

function rowToPr(row: PullRequestRow): PullRequest {
  return {
    id: row.id,
    providerId: row.provider_id as GitProviderId,
    accountId: row.account_id,
    repoId: row.repo_id,
    providerPrId: row.provider_pr_id,
    number: row.number,
    title: row.title,
    body: row.body ?? undefined,
    state: (row.state ?? 'open') as PullRequestState,
    draft: row.draft == null ? undefined : row.draft === 1,
    author: row.author_login ? { login: row.author_login } : undefined,
    baseBranch: row.base_branch,
    headBranch: row.head_branch,
    baseSha: row.base_sha,
    headSha: row.head_sha,
    htmlUrl: row.html_url ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined
  }
}

export class PullRequestRepository implements IPullRequestRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  upsert(pr: PullRequest): PullRequest {
    this.db
      .prepare(
        `INSERT INTO pull_requests
           (id, provider_id, account_id, repo_id, provider_pr_id, number, title, body,
            state, draft, author_login, base_branch, head_branch, base_sha, head_sha,
            html_url, created_at, updated_at, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider_id, account_id, repo_id, number) DO UPDATE SET
           provider_pr_id = excluded.provider_pr_id,
           title = excluded.title,
           body = excluded.body,
           state = excluded.state,
           draft = excluded.draft,
           author_login = excluded.author_login,
           base_branch = excluded.base_branch,
           head_branch = excluded.head_branch,
           base_sha = excluded.base_sha,
           head_sha = excluded.head_sha,
           html_url = excluded.html_url,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           last_synced_at = excluded.last_synced_at`
      )
      .run(
        pr.id || newId('pr'),
        pr.providerId,
        pr.accountId,
        pr.repoId,
        pr.providerPrId,
        pr.number,
        pr.title,
        pr.body ?? null,
        pr.state,
        pr.draft == null ? null : pr.draft ? 1 : 0,
        pr.author?.login ?? null,
        pr.baseBranch,
        pr.headBranch,
        pr.baseSha,
        pr.headSha,
        pr.htmlUrl ?? null,
        pr.createdAt ?? null,
        pr.updatedAt ?? null,
        pr.lastSyncedAt ?? null
      )
    return this.getByNumber(pr.repoId, pr.number) as PullRequest
  }

  getById(id: string): PullRequest | null {
    const row = this.db
      .prepare('SELECT * FROM pull_requests WHERE id = ?')
      .get(id) as PullRequestRow | undefined
    return row ? rowToPr(row) : null
  }

  getByNumber(repoId: string, number: number): PullRequest | null {
    const row = this.db
      .prepare('SELECT * FROM pull_requests WHERE repo_id = ? AND number = ?')
      .get(repoId, number) as PullRequestRow | undefined
    return row ? rowToPr(row) : null
  }

  listByRepo(repoId: string): PullRequest[] {
    const rows = this.db
      .prepare('SELECT * FROM pull_requests WHERE repo_id = ? ORDER BY number DESC')
      .all(repoId) as PullRequestRow[]
    return rows.map(rowToPr)
  }
}
