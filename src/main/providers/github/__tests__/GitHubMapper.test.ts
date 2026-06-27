import { describe, it, expect } from 'vitest'
import {
  mapRepository,
  mapPullRequest,
  mapFile,
  mapIssueComment,
  mapReview,
  mapReviewComment,
  buildReviewThreads,
  repositoryId,
  pullRequestId,
  providerRepoId
} from '../GitHubMapper'
import type {
  GhRepo,
  GhPullRequest,
  GhFile,
  GhIssueComment,
  GhReview,
  GhReviewComment
} from '../GitHubTypes'

const repo: GhRepo = {
  id: 12345,
  name: 'review-master',
  full_name: 'acme/review-master',
  private: true,
  owner: { login: 'acme' },
  default_branch: 'main',
  html_url: 'https://github.com/acme/review-master',
  clone_url: 'https://github.com/acme/review-master.git',
  ssh_url: 'git@github.com:acme/review-master.git',
  description: 'desc',
  language: 'TypeScript',
  updated_at: '2026-01-01T00:00:00Z'
}

function basePr(): GhPullRequest {
  return {
    id: 9000,
    number: 42,
    title: 'A change',
    body: 'body text',
    state: 'open',
    draft: false,
    user: { login: 'octocat', avatar_url: 'a', html_url: 'h' },
    base: { ref: 'main', sha: 'baseSha' },
    head: { ref: 'feature', sha: 'headSha' },
    html_url: 'https://github.com/acme/review-master/pull/42'
  }
}

describe('id helpers', () => {
  it('providerRepoId stringifies the numeric id', () => {
    expect(providerRepoId({ id: 12345 })).toBe('12345')
  })

  it('repositoryId is deterministic and account-scoped', () => {
    expect(repositoryId('acct1', '12345')).toBe(repositoryId('acct1', '12345'))
    expect(repositoryId('acct1', '12345')).not.toBe(repositoryId('acct2', '12345'))
    expect(repositoryId('acct1', '12345')).not.toBe(repositoryId('acct1', '99999'))
  })

  it('pullRequestId is deterministic and number-scoped', () => {
    const repoId = repositoryId('acct1', '12345')
    expect(pullRequestId(repoId, 42)).toBe(pullRequestId(repoId, 42))
    expect(pullRequestId(repoId, 42)).not.toBe(pullRequestId(repoId, 43))
  })
})

describe('mapRepository', () => {
  it('maps a GhRepo to a Repository with stable id', () => {
    const mapped = mapRepository('acct1', repo)
    expect(mapped.id).toBe(repositoryId('acct1', '12345'))
    expect(mapped.providerId).toBe('github')
    expect(mapped.accountId).toBe('acct1')
    expect(mapped.providerRepoId).toBe('12345')
    expect(mapped.owner).toBe('acme')
    expect(mapped.name).toBe('review-master')
    expect(mapped.fullName).toBe('acme/review-master')
    expect(mapped.private).toBe(true)
    expect(mapped.language).toBe('TypeScript')
  })

  it('derives owner from full_name when owner.login is missing', () => {
    const noOwner: GhRepo = { ...repo, owner: null }
    expect(mapRepository('acct1', noOwner).owner).toBe('acme')
  })

  it('produces the same id across calls (stability)', () => {
    expect(mapRepository('acct1', repo).id).toBe(mapRepository('acct1', repo).id)
  })
})

describe('mapPullRequest state derivation', () => {
  it('maps an open PR', () => {
    const pr = mapPullRequest('acct1', 'repo1', basePr())
    expect(pr.state).toBe('open')
    expect(pr.id).toBe(pullRequestId('repo1', 42))
    expect(pr.baseSha).toBe('baseSha')
    expect(pr.headSha).toBe('headSha')
    expect(pr.author?.login).toBe('octocat')
  })

  it('maps a closed PR', () => {
    const pr = mapPullRequest('acct1', 'repo1', { ...basePr(), state: 'closed' })
    expect(pr.state).toBe('closed')
  })

  it('maps merged when merged_at is set', () => {
    const pr = mapPullRequest('acct1', 'repo1', {
      ...basePr(),
      state: 'closed',
      merged_at: '2026-01-02T00:00:00Z'
    })
    expect(pr.state).toBe('merged')
  })

  it('maps merged when merged flag is set', () => {
    const pr = mapPullRequest('acct1', 'repo1', { ...basePr(), state: 'closed', merged: true })
    expect(pr.state).toBe('merged')
  })
})

describe('mapFile status + binary detection', () => {
  it('maps a normal modified file', () => {
    const file: GhFile = {
      filename: 'src/x.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      changes: 3,
      patch: '@@ -1 +1 @@\n-a\n+b'
    }
    const mapped = mapFile(file)
    expect(mapped.path).toBe('src/x.ts')
    expect(mapped.status).toBe('modified')
    expect(mapped.isBinary).toBeUndefined()
  })

  it('maps "changed" status to modified', () => {
    const file: GhFile = {
      filename: 'src/x.ts',
      status: 'changed',
      additions: 1,
      deletions: 0,
      changes: 1,
      patch: '@@ -1 +1 @@\n+a'
    }
    expect(mapFile(file).status).toBe('modified')
  })

  it('detects binary when no patch but content changed', () => {
    const file: GhFile = {
      filename: 'assets/logo.png',
      status: 'modified',
      additions: 0,
      deletions: 0,
      changes: 4
    }
    const mapped = mapFile(file)
    expect(mapped.status).toBe('binary')
    expect(mapped.isBinary).toBe(true)
  })

  it('does not flag binary when there are no changes and no patch', () => {
    const file: GhFile = {
      filename: 'empty.txt',
      status: 'modified',
      additions: 0,
      deletions: 0,
      changes: 0
    }
    const mapped = mapFile(file)
    expect(mapped.status).toBe('modified')
    expect(mapped.isBinary).toBeUndefined()
  })

  it('carries oldPath through for renames', () => {
    const file: GhFile = {
      filename: 'src/new.ts',
      previous_filename: 'src/old.ts',
      status: 'renamed',
      additions: 0,
      deletions: 0,
      changes: 0
    }
    const mapped = mapFile(file)
    expect(mapped.status).toBe('renamed')
    expect(mapped.oldPath).toBe('src/old.ts')
  })
})

describe('comment mappers', () => {
  it('maps an issue comment', () => {
    const c: GhIssueComment = {
      id: 7,
      user: { login: 'octocat', avatar_url: 'a.png' },
      body: 'Nice work',
      created_at: '2026-01-01T00:00:00Z',
      html_url: 'https://github.com/x/1#issuecomment-7'
    }
    const m = mapIssueComment(c)
    expect(m).toMatchObject({ id: '7', body: 'Nice work', author: { login: 'octocat' } })
  })

  it('carries the review body + state + id', () => {
    const r: GhReview = {
      id: 99,
      user: { login: 'rev' },
      state: 'CHANGES_REQUESTED',
      body: 'Please fix',
      submitted_at: '2026-01-02T00:00:00Z'
    }
    const m = mapReview(r)
    expect(m).toMatchObject({ id: '99', state: 'CHANGES_REQUESTED', body: 'Please fix' })
  })

  it('maps an inline review comment with anchor + reply linkage', () => {
    const c: GhReviewComment = {
      id: 5,
      user: { login: 'rev' },
      body: 'bug here',
      path: 'src/a.ts',
      line: 12,
      side: 'RIGHT',
      diff_hunk: '@@ -1 +1 @@',
      in_reply_to_id: 3
    }
    const m = mapReviewComment(c)
    expect(m).toMatchObject({ id: '5', path: 'src/a.ts', line: 12, side: 'RIGHT', inReplyToId: '3' })
  })
})

describe('buildReviewThreads', () => {
  it('groups replies under their root and orders by time', () => {
    const comments = [
      mapReviewComment({ id: 1, path: 'a.ts', line: 3, side: 'RIGHT', created_at: '2026-01-01T00:00:00Z', body: 'root' }),
      mapReviewComment({ id: 2, path: 'a.ts', line: 3, side: 'RIGHT', in_reply_to_id: 1, created_at: '2026-01-01T01:00:00Z', body: 'reply' }),
      mapReviewComment({ id: 9, path: 'b.ts', line: 8, side: 'LEFT', created_at: '2026-01-01T02:00:00Z', body: 'other' })
    ]
    const threads = buildReviewThreads(comments)
    expect(threads).toHaveLength(2)
    const first = threads.find((t) => t.id === '1')!
    expect(first.comments.map((c) => c.id)).toEqual(['1', '2'])
    expect(first.path).toBe('a.ts')
    expect(first.line).toBe(3)
    // threads sorted by their first comment's time
    expect(threads[0].id).toBe('1')
    expect(threads[1].id).toBe('9')
  })
})
