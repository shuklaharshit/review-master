import type BetterSqlite3 from 'better-sqlite3'
import type { ConnectedAccount, GitProviderId } from '../../../shared/types'
import type { AccountRepository as IAccountRepository } from '../types'
import { newId } from '../../../shared/ids'
import { nowIso } from '../../../shared/dates'

interface AccountRow {
  id: string
  provider_id: string
  provider_account_id: string
  login: string
  display_name: string | null
  avatar_url: string | null
  token_key: string
  scopes_json: string | null
  created_at: string
  updated_at: string
  last_used_at: string | null
  needs_reauth: number
}

function rowToAccount(row: AccountRow): ConnectedAccount {
  return {
    id: row.id,
    providerId: row.provider_id as GitProviderId,
    providerAccountId: row.provider_account_id,
    login: row.login,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    tokenKey: row.token_key,
    scopes: row.scopes_json ? (JSON.parse(row.scopes_json) as string[]) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at ?? undefined,
    needsReauth: row.needs_reauth === 1
  }
}

export class AccountRepository implements IAccountRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  list(): ConnectedAccount[] {
    const rows = this.db
      .prepare('SELECT * FROM connected_accounts ORDER BY created_at ASC')
      .all() as AccountRow[]
    return rows.map(rowToAccount)
  }

  getById(id: string): ConnectedAccount | null {
    const row = this.db
      .prepare('SELECT * FROM connected_accounts WHERE id = ?')
      .get(id) as AccountRow | undefined
    return row ? rowToAccount(row) : null
  }

  findByProviderAccount(providerId: string, providerAccountId: string): ConnectedAccount | null {
    const row = this.db
      .prepare(
        'SELECT * FROM connected_accounts WHERE provider_id = ? AND provider_account_id = ?'
      )
      .get(providerId, providerAccountId) as AccountRow | undefined
    return row ? rowToAccount(row) : null
  }

  upsert(account: ConnectedAccount): ConnectedAccount {
    const existing = this.findByProviderAccount(account.providerId, account.providerAccountId)
    const now = nowIso()
    if (existing) {
      this.db
        .prepare(
          `UPDATE connected_accounts
             SET login = ?,
                 display_name = ?,
                 avatar_url = ?,
                 token_key = ?,
                 scopes_json = ?,
                 needs_reauth = ?,
                 updated_at = ?
           WHERE id = ?`
        )
        .run(
          account.login,
          account.displayName ?? null,
          account.avatarUrl ?? null,
          account.tokenKey,
          JSON.stringify(account.scopes ?? []),
          account.needsReauth ? 1 : 0,
          now,
          existing.id
        )
      return this.getById(existing.id) as ConnectedAccount
    }

    const id = account.id || newId('acct')
    const createdAt = account.createdAt || now
    this.db
      .prepare(
        `INSERT INTO connected_accounts
           (id, provider_id, provider_account_id, login, display_name, avatar_url,
            token_key, scopes_json, created_at, updated_at, last_used_at, needs_reauth)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        account.providerId,
        account.providerAccountId,
        account.login,
        account.displayName ?? null,
        account.avatarUrl ?? null,
        account.tokenKey,
        JSON.stringify(account.scopes ?? []),
        createdAt,
        account.updatedAt || now,
        account.lastUsedAt ?? null,
        account.needsReauth ? 1 : 0
      )
    return this.getById(id) as ConnectedAccount
  }

  touchLastUsed(id: string): void {
    this.db
      .prepare('UPDATE connected_accounts SET last_used_at = ? WHERE id = ?')
      .run(nowIso(), id)
  }

  setNeedsReauth(id: string, needsReauth: boolean): void {
    this.db
      .prepare('UPDATE connected_accounts SET needs_reauth = ?, updated_at = ? WHERE id = ?')
      .run(needsReauth ? 1 : 0, nowIso(), id)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM connected_accounts WHERE id = ?').run(id)
  }
}
