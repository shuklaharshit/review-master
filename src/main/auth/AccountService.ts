import { rmSync } from 'node:fs'
import path from 'node:path'
import type { ConnectedAccount, GitProviderId, RemoveAccountOptions } from '../../shared/types'
import type { SecureTokenStore } from '../contracts'
import type { Database } from '../db/types'
import { newId } from '../../shared/ids'
import { nowIso } from '../../shared/dates'
import { logger } from '../app/Logger'
import { tokenKeyForAccount } from './SecureTokenService'
import type { SafePaths } from '../security/safePaths'

export interface SaveAuthenticatedAccountInput {
  providerId: GitProviderId
  providerAccountId: string
  login: string
  displayName?: string
  avatarUrl?: string
  scopes: string[]
  token: string
}

/**
 * Manages connected GitHub accounts: metadata in SQLite, tokens in the OS
 * keychain. Tokens are never logged and never returned to the renderer
 * (only AccountService.getToken hands them to other main-process services).
 */
export class AccountService {
  private readonly log = logger.scope('accounts')

  constructor(
    private readonly db: Database,
    private readonly tokens: SecureTokenStore,
    private readonly safePaths?: SafePaths
  ) {}

  list(): ConnectedAccount[] {
    return this.db.accounts.list()
  }

  get(id: string): ConnectedAccount | null {
    return this.db.accounts.getById(id)
  }

  /** Reads the token for an account and updates its lastUsed timestamp. */
  async getToken(accountId: string): Promise<string | null> {
    const account = this.db.accounts.getById(accountId)
    if (!account) return null
    const token = await this.tokens.get(account.tokenKey)
    if (token) {
      this.db.accounts.touchLastUsed(accountId)
    }
    return token
  }

  /**
   * Stores an authenticated account: token in keychain, metadata in SQLite.
   * Dedupes by (providerId, providerAccountId); on re-add updates token,
   * scopes and metadata without creating a duplicate row (spec §11.3).
   */
  async saveAuthenticatedAccount(input: SaveAuthenticatedAccountInput): Promise<ConnectedAccount> {
    const existing = this.db.accounts.findByProviderAccount(
      input.providerId,
      input.providerAccountId
    )
    const id = existing?.id ?? newId('acct')
    const tokenKey = existing?.tokenKey ?? tokenKeyForAccount(id)
    const now = nowIso()

    // Store token first so we never persist metadata pointing at a missing secret.
    await this.tokens.set(tokenKey, input.token)

    const account: ConnectedAccount = {
      id,
      providerId: input.providerId,
      providerAccountId: input.providerAccountId,
      login: input.login,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      tokenKey,
      scopes: input.scopes,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastUsedAt: existing?.lastUsedAt,
      needsReauth: false
    }

    const saved = this.db.accounts.upsert(account)
    this.log.info(existing ? 'account updated' : 'account connected', {
      id: saved.id,
      login: saved.login
    })
    return saved
  }

  /**
   * Removes an account. The keychain token is ALWAYS deleted. The metadata row
   * is removed; if options.removeCachedData is set and a SafePaths is wired,
   * the on-disk repo cache for the account is also deleted (spec §11.5).
   */
  async remove(accountId: string, options?: RemoveAccountOptions): Promise<void> {
    const account = this.db.accounts.getById(accountId)
    if (!account) return

    // Always delete the token, even if later steps fail.
    try {
      await this.tokens.delete(account.tokenKey)
    } catch (error) {
      this.log.error('failed to delete token during account removal', {
        id: accountId,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    if (options?.removeCachedData) {
      this.removeCachedData(account)
    }

    this.db.accounts.remove(accountId)
    this.log.info('account removed', { id: accountId, removedCache: !!options?.removeCachedData })
  }

  setNeedsReauth(accountId: string, needsReauth: boolean): void {
    this.db.accounts.setNeedsReauth(accountId, needsReauth)
  }

  private removeCachedData(account: ConnectedAccount): void {
    if (!this.safePaths) return
    const accountCacheDir = path.join(
      this.safePaths.reposDir(),
      account.providerId,
      account.id
    )
    this.safePaths.assertInside(this.safePaths.reposDir(), accountCacheDir)
    try {
      rmSync(accountCacheDir, { recursive: true, force: true })
    } catch (error) {
      this.log.warn('failed to remove cached repo data', {
        id: account.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}
