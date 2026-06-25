import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../db'
import type { Database } from '../types'
import type { Repository } from '../../../shared/types'

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: '',
    providerId: 'github',
    accountId: 'acct_1',
    providerRepoId: '1001',
    owner: 'acme',
    name: 'widget',
    fullName: 'acme/widget',
    private: false,
    defaultBranch: 'main',
    htmlUrl: 'https://example.com/acme/widget',
    description: 'a widget',
    language: 'TypeScript',
    ...overrides
  }
}

describe('RepoRepository', () => {
  let db: Database

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('upsertMany inserts repos that round-trip via listByAccount and getById', () => {
    const repo = makeRepo({ id: 'repo_a', private: true })
    db.repos.upsertMany([repo])

    const byId = db.repos.getById('repo_a')
    expect(byId).not.toBeNull()
    expect(byId?.fullName).toBe('acme/widget')
    expect(byId?.private).toBe(true)
    expect(byId?.defaultBranch).toBe('main')

    const byAccount = db.repos.listByAccount('acct_1')
    expect(byAccount).toHaveLength(1)
    expect(byAccount[0].id).toBe('repo_a')
  })

  it('assigns a generated id when none supplied', () => {
    db.repos.upsertMany([makeRepo({ id: '' })])
    const repos = db.repos.listByAccount('acct_1')
    expect(repos).toHaveLength(1)
    expect(repos[0].id).toMatch(/^repo_/)
  })

  it('upsertMany conflict-updates on (provider_id, account_id, provider_repo_id)', () => {
    db.repos.upsertMany([makeRepo({ id: 'repo_a', name: 'old', fullName: 'acme/old' })])
    // Same provider/account/providerRepoId, different surrogate id -> updates existing row.
    db.repos.upsertMany([
      makeRepo({ id: 'repo_b', name: 'new', fullName: 'acme/new', language: 'Go' })
    ])

    const repos = db.repos.listByAccount('acct_1')
    expect(repos).toHaveLength(1)
    // Original primary key is retained; only the conflicting columns updated.
    expect(repos[0].id).toBe('repo_a')
    expect(repos[0].name).toBe('new')
    expect(repos[0].fullName).toBe('acme/new')
    expect(repos[0].language).toBe('Go')
  })

  it('listByAccount filters by account and orders by full_name ascending', () => {
    db.repos.upsertMany([
      makeRepo({ id: 'r1', accountId: 'acct_1', providerRepoId: '1', fullName: 'acme/zeta' }),
      makeRepo({ id: 'r2', accountId: 'acct_1', providerRepoId: '2', fullName: 'acme/alpha' }),
      makeRepo({ id: 'r3', accountId: 'acct_2', providerRepoId: '3', fullName: 'acme/beta' })
    ])

    const acct1 = db.repos.listByAccount('acct_1')
    expect(acct1.map((r) => r.fullName)).toEqual(['acme/alpha', 'acme/zeta'])

    const acct2 = db.repos.listByAccount('acct_2')
    expect(acct2.map((r) => r.id)).toEqual(['r3'])
  })

  it('getById returns null for unknown id', () => {
    expect(db.repos.getById('missing')).toBeNull()
  })

  it('upsertMany([]) is a no-op', () => {
    db.repos.upsertMany([])
    expect(db.repos.listByAccount('acct_1')).toHaveLength(0)
  })
})
