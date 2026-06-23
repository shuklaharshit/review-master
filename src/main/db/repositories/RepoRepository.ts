import type BetterSqlite3 from 'better-sqlite3'
import type { GitProviderId, Repository } from '../../../shared/types'
import type { RepoRepository as IRepoRepository } from '../types'
import { newId } from '../../../shared/ids'

interface RepoRow {
  id: string
  provider_id: string
  account_id: string
  provider_repo_id: string
  owner: string
  name: string
  full_name: string
  private: number
  default_branch: string | null
  html_url: string | null
  clone_url: string | null
  ssh_url: string | null
  description: string | null
  language: string | null
  updated_at: string | null
  last_synced_at: string | null
}

function rowToRepo(row: RepoRow): Repository {
  return {
    id: row.id,
    providerId: row.provider_id as GitProviderId,
    accountId: row.account_id,
    providerRepoId: row.provider_repo_id,
    owner: row.owner,
    name: row.name,
    fullName: row.full_name,
    private: row.private === 1,
    defaultBranch: row.default_branch ?? undefined,
    htmlUrl: row.html_url ?? undefined,
    cloneUrl: row.clone_url ?? undefined,
    sshUrl: row.ssh_url ?? undefined,
    description: row.description ?? undefined,
    language: row.language ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined
  }
}

export class RepoRepository implements IRepoRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  upsertMany(repos: Repository[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO repositories
         (id, provider_id, account_id, provider_repo_id, owner, name, full_name,
          private, default_branch, html_url, clone_url, ssh_url, description,
          language, updated_at, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider_id, account_id, provider_repo_id) DO UPDATE SET
         owner = excluded.owner,
         name = excluded.name,
         full_name = excluded.full_name,
         private = excluded.private,
         default_branch = excluded.default_branch,
         html_url = excluded.html_url,
         clone_url = excluded.clone_url,
         ssh_url = excluded.ssh_url,
         description = excluded.description,
         language = excluded.language,
         updated_at = excluded.updated_at,
         last_synced_at = excluded.last_synced_at`
    )
    const tx = this.db.transaction((items: Repository[]) => {
      for (const repo of items) {
        stmt.run(
          repo.id || newId('repo'),
          repo.providerId,
          repo.accountId,
          repo.providerRepoId,
          repo.owner,
          repo.name,
          repo.fullName,
          repo.private ? 1 : 0,
          repo.defaultBranch ?? null,
          repo.htmlUrl ?? null,
          repo.cloneUrl ?? null,
          repo.sshUrl ?? null,
          repo.description ?? null,
          repo.language ?? null,
          repo.updatedAt ?? null,
          repo.lastSyncedAt ?? null
        )
      }
    })
    tx(repos)
  }

  getById(id: string): Repository | null {
    const row = this.db
      .prepare('SELECT * FROM repositories WHERE id = ?')
      .get(id) as RepoRow | undefined
    return row ? rowToRepo(row) : null
  }

  listByAccount(accountId: string): Repository[] {
    const rows = this.db
      .prepare('SELECT * FROM repositories WHERE account_id = ? ORDER BY full_name ASC')
      .all(accountId) as RepoRow[]
    return rows.map(rowToRepo)
  }
}
