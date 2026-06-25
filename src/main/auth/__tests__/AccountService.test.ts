import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AccountService } from '../AccountService'
import type { Database } from '../../db/types'
import type { SecureTokenStore, StoredCredential, TokenRefresher } from '../../contracts'
import type { ConnectedAccount } from '../../../shared/types'

// ---------------------------------------------------------------------------
// Tests for the GitHub-App credential handling (ADR-0007): transparent access
// token refresh, legacy bare-token tolerance, and the Part C migration that
// flags classic OAuth-App accounts for re-auth.
// ---------------------------------------------------------------------------

function makeAccount(overrides: Partial<ConnectedAccount> = {}): ConnectedAccount {
  return {
    id: 'acct1',
    providerId: 'github',
    providerAccountId: '123',
    login: 'octocat',
    tokenKey: 'review-master.github.account.acct1',
    scopes: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    needsReauth: false,
    ...overrides
  }
}

interface Harness {
  service: AccountService
  store: Map<string, string>
  refresh: ReturnType<typeof vi.fn>
  setNeedsReauth: ReturnType<typeof vi.fn>
  touchLastUsed: ReturnType<typeof vi.fn>
}

function setup(account: ConnectedAccount | null, accounts: ConnectedAccount[] = []): Harness {
  const store = new Map<string, string>()
  const setNeedsReauth = vi.fn()
  const touchLastUsed = vi.fn()

  const db = {
    accounts: {
      getById: vi.fn(() => account),
      list: vi.fn(() => accounts),
      touchLastUsed,
      setNeedsReauth
    }
  } as unknown as Database

  const tokens: SecureTokenStore = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => void store.set(key, value)),
    delete: vi.fn(async (key: string) => void store.delete(key))
  }

  const refresh = vi.fn()
  const refresher = { refresh } as unknown as TokenRefresher

  const service = new AccountService(db, tokens, undefined, refresher)
  return { service, store, refresh, setNeedsReauth, touchLastUsed }
}

function future(ms = 60 * 60 * 1000): string {
  return new Date(Date.now() + ms).toISOString()
}
function past(ms = 60 * 1000): string {
  return new Date(Date.now() - ms).toISOString()
}

describe('AccountService — credential handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the stored access token when it is not near expiry', async () => {
    const account = makeAccount()
    const h = setup(account)
    const cred: StoredCredential = {
      accessToken: 'tok-fresh',
      refreshToken: 'ref-1',
      accessTokenExpiresAt: future()
    }
    h.store.set(account.tokenKey, JSON.stringify(cred))

    const token = await h.service.getToken(account.id)

    expect(token).toBe('tok-fresh')
    expect(h.refresh).not.toHaveBeenCalled()
    expect(h.touchLastUsed).toHaveBeenCalledWith(account.id)
  })

  it('refreshes an expiring access token and persists the rotated credential', async () => {
    const account = makeAccount()
    const h = setup(account)
    h.store.set(
      account.tokenKey,
      JSON.stringify({ accessToken: 'tok-old', refreshToken: 'ref-old', accessTokenExpiresAt: past() })
    )
    h.refresh.mockResolvedValue({
      accessToken: 'tok-new',
      refreshToken: 'ref-new',
      accessTokenExpiresAt: future()
    } satisfies StoredCredential)

    const token = await h.service.getToken(account.id)

    expect(h.refresh).toHaveBeenCalledWith('ref-old')
    expect(token).toBe('tok-new')
    const persisted = JSON.parse(h.store.get(account.tokenKey) as string) as StoredCredential
    expect(persisted.accessToken).toBe('tok-new')
    expect(persisted.refreshToken).toBe('ref-new')
  })

  it('keeps the previous refresh token if the refresh response omits one', async () => {
    const account = makeAccount()
    const h = setup(account)
    h.store.set(
      account.tokenKey,
      JSON.stringify({ accessToken: 'tok-old', refreshToken: 'ref-keep', accessTokenExpiresAt: past() })
    )
    h.refresh.mockResolvedValue({ accessToken: 'tok-new', accessTokenExpiresAt: future() })

    await h.service.getToken(account.id)

    const persisted = JSON.parse(h.store.get(account.tokenKey) as string) as StoredCredential
    expect(persisted.refreshToken).toBe('ref-keep')
  })

  it('tolerates a legacy bare-string token (pre-migration OAuth account)', async () => {
    const account = makeAccount()
    const h = setup(account)
    h.store.set(account.tokenKey, 'legacy-oauth-token')

    const token = await h.service.getToken(account.id)

    expect(token).toBe('legacy-oauth-token')
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('flags the account for re-auth when refresh fails and the token is hard-expired', async () => {
    const account = makeAccount()
    const h = setup(account)
    h.store.set(
      account.tokenKey,
      JSON.stringify({ accessToken: 'tok-dead', refreshToken: 'ref-dead', accessTokenExpiresAt: past() })
    )
    h.refresh.mockRejectedValue(new Error('refresh token expired'))

    const token = await h.service.getToken(account.id)

    expect(token).toBeNull()
    expect(h.setNeedsReauth).toHaveBeenCalledWith(account.id, true)
  })

  it('forceRefresh exchanges the refresh token and returns the new access token', async () => {
    const account = makeAccount()
    const h = setup(account)
    h.store.set(
      account.tokenKey,
      JSON.stringify({ accessToken: 'tok-old', refreshToken: 'ref-1', accessTokenExpiresAt: future() })
    )
    h.refresh.mockResolvedValue({ accessToken: 'tok-forced', accessTokenExpiresAt: future() })

    const token = await h.service.forceRefresh(account.id)

    expect(token).toBe('tok-forced')
  })

  it('forceRefresh returns null when there is no refresh token', async () => {
    const account = makeAccount()
    const h = setup(account)
    h.store.set(account.tokenKey, JSON.stringify({ accessToken: 'tok-only' }))

    expect(await h.service.forceRefresh(account.id)).toBeNull()
    expect(h.refresh).not.toHaveBeenCalled()
  })
})

describe('AccountService.markLegacyOAuthAccountsForReauth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('flags github accounts that still carry OAuth scopes, and only those', async () => {
    const legacy = makeAccount({ id: 'legacy', scopes: ['repo', 'read:org', 'read:user'] })
    const fresh = makeAccount({ id: 'fresh', scopes: [] })
    const alreadyFlagged = makeAccount({ id: 'flagged', scopes: ['repo'], needsReauth: true })
    const h = setup(null, [legacy, fresh, alreadyFlagged])

    h.service.markLegacyOAuthAccountsForReauth()

    expect(h.setNeedsReauth).toHaveBeenCalledTimes(1)
    expect(h.setNeedsReauth).toHaveBeenCalledWith('legacy', true)
  })
})
