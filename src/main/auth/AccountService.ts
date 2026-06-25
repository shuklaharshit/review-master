import { rmSync } from 'node:fs'
import path from 'node:path'
import type { ConnectedAccount, GitProviderId, RemoveAccountOptions } from '../../shared/types'
import type { SecureTokenStore, StoredCredential, TokenRefresher } from '../contracts'
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
  /** GitHub Apps return no scopes; kept optional for non-App providers. */
  scopes?: string[]
  credential: StoredCredential
}

/** Refresh the access token this many ms before it actually expires. */
const REFRESH_SKEW_MS = 60_000

/**
 * Manages connected GitHub accounts: metadata in SQLite, the full credential
 * (access + refresh token + expiries, ADR-0007) as a JSON blob in the OS
 * keychain. Tokens are never logged and never returned to the renderer (only
 * AccountService.getToken hands an access token to other main-process services).
 *
 * getToken transparently refreshes an expiring access token via the injected
 * TokenRefresher, so callers never see expiry.
 */
export class AccountService {
  private readonly log = logger.scope('accounts')

  constructor(
    private readonly db: Database,
    private readonly tokens: SecureTokenStore,
    private readonly safePaths?: SafePaths,
    private readonly refresher?: TokenRefresher
  ) {}

  list(): ConnectedAccount[] {
    return this.db.accounts.list()
  }

  get(id: string): ConnectedAccount | null {
    return this.db.accounts.getById(id)
  }

  /**
   * Returns a usable access token for the account, transparently refreshing it
   * if it is expired or within REFRESH_SKEW_MS of expiry. Returns null if the
   * account is unknown, has no stored credential, or refresh failed and the
   * old token is already expired (the account is then flagged needs-reauth).
   */
  async getToken(accountId: string): Promise<string | null> {
    const account = this.db.accounts.getById(accountId)
    if (!account) return null
    const cred = await this.readCredential(account.tokenKey)
    if (!cred) return null

    if (this.isExpiring(cred) && cred.refreshToken && this.refresher) {
      const refreshed = await this.tryRefresh(accountId, account.tokenKey, cred)
      if (refreshed) {
        this.db.accounts.touchLastUsed(accountId)
        return refreshed.accessToken
      }
      // Refresh failed. If the current token is still valid, keep using it
      // (transient failure); otherwise it's unusable.
      if (this.isHardExpired(cred)) return null
    }

    this.db.accounts.touchLastUsed(accountId)
    return cred.accessToken
  }

  /**
   * Forces a refresh regardless of expiry (used to recover from a 401). Returns
   * the new access token, or null if there's no refresh token / refresh failed.
   */
  async forceRefresh(accountId: string): Promise<string | null> {
    const account = this.db.accounts.getById(accountId)
    if (!account) return null
    const cred = await this.readCredential(account.tokenKey)
    if (!cred?.refreshToken || !this.refresher) return null
    const refreshed = await this.tryRefresh(accountId, account.tokenKey, cred)
    return refreshed?.accessToken ?? null
  }

  private isExpiring(cred: StoredCredential): boolean {
    if (!cred.accessTokenExpiresAt) return false
    return Date.parse(cred.accessTokenExpiresAt) - Date.now() <= REFRESH_SKEW_MS
  }

  private isHardExpired(cred: StoredCredential): boolean {
    if (!cred.accessTokenExpiresAt) return false
    return Date.parse(cred.accessTokenExpiresAt) <= Date.now()
  }

  /** Performs one refresh attempt, persisting the new credential on success. */
  private async tryRefresh(
    accountId: string,
    tokenKey: string,
    cred: StoredCredential
  ): Promise<StoredCredential | null> {
    try {
      const next = await this.refresher!.refresh(cred.refreshToken as string)
      // GitHub rotates refresh tokens; keep the previous one only if absent.
      const merged: StoredCredential = {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken ?? cred.refreshToken,
        accessTokenExpiresAt: next.accessTokenExpiresAt,
        refreshTokenExpiresAt: next.refreshTokenExpiresAt ?? cred.refreshTokenExpiresAt
      }
      await this.writeCredential(tokenKey, merged)
      this.log.info('refreshed access token', { accountId, expiresAt: merged.accessTokenExpiresAt })
      return merged
    } catch (error) {
      this.log.warn('token refresh failed', {
        accountId,
        error: error instanceof Error ? error.message : String(error)
      })
      // Only force re-auth if the access token is genuinely unusable now.
      if (this.isHardExpired(cred)) this.setNeedsReauth(accountId, true)
      return null
    }
  }

  /** Reads + parses the credential, tolerating the legacy bare-token string. */
  private async readCredential(tokenKey: string): Promise<StoredCredential | null> {
    const raw = await this.tokens.get(tokenKey)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Partial<StoredCredential>
      if (parsed && typeof parsed.accessToken === 'string') return parsed as StoredCredential
    } catch {
      // Not JSON → legacy OAuth-App token stored as a bare string.
    }
    return { accessToken: raw }
  }

  private async writeCredential(tokenKey: string, cred: StoredCredential): Promise<void> {
    await this.tokens.set(tokenKey, JSON.stringify(cred))
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

    // Store credential first so we never persist metadata pointing at a missing secret.
    await this.writeCredential(tokenKey, input.credential)

    const account: ConnectedAccount = {
      id,
      providerId: input.providerId,
      providerAccountId: input.providerAccountId,
      login: input.login,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      tokenKey,
      scopes: input.scopes ?? [],
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

  /**
   * Part C of the GitHub-App migration (ADR-0007): existing accounts hold
   * classic OAuth-App tokens that won't behave under the GitHub App. They are
   * detectable because OAuth device flow stored granted `scopes` (e.g.
   * `repo`, `read:org`), whereas GitHub-App accounts store none. Flag those for
   * re-auth on launch; no local data is lost (drafts/snapshots are keyed
   * locally, not to the token). Idempotent.
   */
  markLegacyOAuthAccountsForReauth(): void {
    for (const account of this.db.accounts.list()) {
      if (account.providerId !== 'github') continue
      if (account.needsReauth) continue
      if ((account.scopes?.length ?? 0) > 0) {
        this.setNeedsReauth(account.id, true)
        this.log.info('flagged legacy OAuth account for re-auth', {
          id: account.id,
          login: account.login
        })
      }
    }
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
