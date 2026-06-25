import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../db'
import type { Database } from '../types'
import type { ConnectedAccount } from '../../../shared/types'

function makeAccount(overrides: Partial<ConnectedAccount> = {}): ConnectedAccount {
  return {
    id: '',
    providerId: 'github',
    providerAccountId: '12345',
    login: 'octocat',
    displayName: 'The Octocat',
    avatarUrl: 'https://example.com/a.png',
    tokenKey: 'token-key-1',
    scopes: ['repo', 'read:user'],
    createdAt: '',
    updatedAt: '',
    ...overrides
  }
}

describe('AccountRepository', () => {
  let db: Database

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('inserts a new account and assigns an id when none provided', () => {
    const saved = db.accounts.upsert(makeAccount())
    expect(saved.id).toBeTruthy()
    expect(saved.id).toMatch(/^acct_/)
    expect(saved.login).toBe('octocat')
    expect(db.accounts.list()).toHaveLength(1)
  })

  it('round-trips scopes via JSON', () => {
    const saved = db.accounts.upsert(makeAccount({ scopes: ['a', 'b', 'c'] }))
    const fetched = db.accounts.getById(saved.id)
    expect(fetched?.scopes).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty scopes array when none stored', () => {
    const saved = db.accounts.upsert(makeAccount({ scopes: [] }))
    const fetched = db.accounts.getById(saved.id)
    expect(fetched?.scopes).toEqual([])
  })

  it('dedupes on (provider_id, provider_account_id), keeping the same id and updating fields', () => {
    const first = db.accounts.upsert(makeAccount({ login: 'old-login', scopes: ['repo'] }))

    const second = db.accounts.upsert(
      makeAccount({
        // different id supplied, but same provider account -> should update existing
        id: 'should-be-ignored',
        login: 'new-login',
        scopes: ['repo', 'gist'],
        tokenKey: 'token-key-2'
      })
    )

    expect(second.id).toBe(first.id)
    expect(second.login).toBe('new-login')
    expect(second.scopes).toEqual(['repo', 'gist'])
    expect(second.tokenKey).toBe('token-key-2')
    // No duplicate row.
    expect(db.accounts.list()).toHaveLength(1)
  })

  it('treats different provider accounts as distinct rows', () => {
    db.accounts.upsert(makeAccount({ providerAccountId: '1' }))
    db.accounts.upsert(makeAccount({ providerAccountId: '2' }))
    expect(db.accounts.list()).toHaveLength(2)
  })

  it('stores needs_reauth as a boolean read back', () => {
    const saved = db.accounts.upsert(makeAccount({ needsReauth: true }))
    expect(db.accounts.getById(saved.id)?.needsReauth).toBe(true)

    db.accounts.setNeedsReauth(saved.id, false)
    expect(db.accounts.getById(saved.id)?.needsReauth).toBe(false)

    db.accounts.setNeedsReauth(saved.id, true)
    expect(db.accounts.getById(saved.id)?.needsReauth).toBe(true)
  })

  it('defaults needsReauth to false when not specified', () => {
    const saved = db.accounts.upsert(makeAccount())
    expect(saved.needsReauth).toBe(false)
  })

  it('findByProviderAccount returns the matching account or null', () => {
    const saved = db.accounts.upsert(makeAccount({ providerAccountId: '99' }))
    expect(db.accounts.findByProviderAccount('github', '99')?.id).toBe(saved.id)
    expect(db.accounts.findByProviderAccount('github', 'nope')).toBeNull()
    expect(db.accounts.findByProviderAccount('gitlab', '99')).toBeNull()
  })

  it('touchLastUsed sets last_used_at', () => {
    const saved = db.accounts.upsert(makeAccount())
    expect(saved.lastUsedAt).toBeUndefined()
    db.accounts.touchLastUsed(saved.id)
    const fetched = db.accounts.getById(saved.id)
    expect(fetched?.lastUsedAt).toBeTruthy()
  })

  it('remove deletes the account', () => {
    const saved = db.accounts.upsert(makeAccount())
    db.accounts.remove(saved.id)
    expect(db.accounts.getById(saved.id)).toBeNull()
    expect(db.accounts.list()).toHaveLength(0)
  })

  it('getById returns null for unknown id', () => {
    expect(db.accounts.getById('missing')).toBeNull()
  })

  it('list orders by created_at ascending', () => {
    const a = db.accounts.upsert(
      makeAccount({ providerAccountId: '1', createdAt: '2020-01-01T00:00:00.000Z' })
    )
    const b = db.accounts.upsert(
      makeAccount({ providerAccountId: '2', createdAt: '2021-01-01T00:00:00.000Z' })
    )
    const ids = db.accounts.list().map((x) => x.id)
    expect(ids).toEqual([a.id, b.id])
  })
})
