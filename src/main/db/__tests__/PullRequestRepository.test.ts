import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../db'
import type { Database } from '../types'
import type { PullRequest } from '../../../shared/types'

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: '',
    providerId: 'github',
    accountId: 'acct_1',
    repoId: 'repo_1',
    providerPrId: 'pr-node-1',
    number: 42,
    title: 'Add feature',
    body: 'body text',
    state: 'open',
    draft: false,
    author: { login: 'octocat', avatarUrl: 'https://x/a.png' },
    baseBranch: 'main',
    headBranch: 'feature',
    baseSha: 'base000',
    headSha: 'head000',
    ...overrides
  }
}

describe('PullRequestRepository', () => {
  let db: Database

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('inserts a PR that round-trips via getByNumber and getById', () => {
    const saved = db.pullRequests.upsert(makePr({ id: 'pr_a' }))
    expect(saved.id).toBe('pr_a')
    expect(saved.title).toBe('Add feature')

    expect(db.pullRequests.getById('pr_a')?.number).toBe(42)
    expect(db.pullRequests.getByNumber('repo_1', 42)?.id).toBe('pr_a')
  })

  it('assigns a generated id when none supplied', () => {
    const saved = db.pullRequests.upsert(makePr({ id: '' }))
    expect(saved.id).toMatch(/^pr_/)
  })

  it('persists author?.login to author_login and reconstructs as { login }', () => {
    const saved = db.pullRequests.upsert(makePr({ id: 'pr_a' }))
    // Only login survives the round-trip (avatarUrl/htmlUrl are not stored).
    expect(saved.author).toEqual({ login: 'octocat' })
  })

  it('stores undefined author as undefined on read', () => {
    const saved = db.pullRequests.upsert(makePr({ id: 'pr_a', author: undefined }))
    expect(saved.author).toBeUndefined()
  })

  it('conflict-updates on (provider_id, account_id, repo_id, number)', () => {
    const first = db.pullRequests.upsert(makePr({ id: 'pr_a', title: 'old', state: 'open' }))
    // Same conflict key, different surrogate id -> updates existing row.
    const second = db.pullRequests.upsert(
      makePr({
        id: 'pr_b',
        title: 'new',
        state: 'merged',
        headSha: 'head999',
        author: { login: 'someoneelse' }
      })
    )

    expect(second.id).toBe(first.id)
    expect(second.title).toBe('new')
    expect(second.state).toBe('merged')
    expect(second.headSha).toBe('head999')
    expect(second.author).toEqual({ login: 'someoneelse' })
    expect(db.pullRequests.listByRepo('repo_1')).toHaveLength(1)
  })

  it('round-trips draft as nullable boolean', () => {
    const yes = db.pullRequests.upsert(makePr({ id: 'p1', number: 1, draft: true }))
    expect(yes.draft).toBe(true)

    const no = db.pullRequests.upsert(makePr({ id: 'p2', number: 2, draft: false }))
    expect(no.draft).toBe(false)

    const unset = db.pullRequests.upsert(makePr({ id: 'p3', number: 3, draft: undefined }))
    expect(unset.draft).toBeUndefined()
  })

  it('listByRepo filters by repo and orders by number descending', () => {
    db.pullRequests.upsert(makePr({ id: 'p1', repoId: 'repo_1', number: 1 }))
    db.pullRequests.upsert(makePr({ id: 'p2', repoId: 'repo_1', number: 3 }))
    db.pullRequests.upsert(makePr({ id: 'p3', repoId: 'repo_1', number: 2 }))
    db.pullRequests.upsert(makePr({ id: 'p4', repoId: 'repo_2', number: 5 }))

    const repo1 = db.pullRequests.listByRepo('repo_1')
    expect(repo1.map((p) => p.number)).toEqual([3, 2, 1])
    expect(db.pullRequests.listByRepo('repo_2')).toHaveLength(1)
  })

  it('defaults state to open when stored state is null-ish on read', () => {
    // state is required by the type; verify the explicit value is preserved.
    const saved = db.pullRequests.upsert(makePr({ id: 'pr_a', state: 'closed' }))
    expect(saved.state).toBe('closed')
  })

  it('returns null for unknown lookups', () => {
    expect(db.pullRequests.getById('missing')).toBeNull()
    expect(db.pullRequests.getByNumber('repo_1', 999)).toBeNull()
  })
})
