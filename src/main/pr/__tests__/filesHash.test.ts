import { describe, it, expect } from 'vitest'
import { computeFilesHash } from '../PullRequestContextService'
import type { NormalizedDiffFile } from '../../../shared/types'

type HashFile = Pick<NormalizedDiffFile, 'path' | 'status' | 'additions' | 'deletions' | 'patch'>

const fileA: HashFile = {
  path: 'src/a.ts',
  status: 'modified',
  additions: 3,
  deletions: 1,
  patch: '@@ -1 +1 @@\n-a\n+b'
}
const fileB: HashFile = {
  path: 'src/b.ts',
  status: 'added',
  additions: 10,
  deletions: 0,
  patch: '@@ -0,0 +1 @@\n+new'
}

describe('computeFilesHash', () => {
  it('is deterministic for the same input', () => {
    const h1 = computeFilesHash([fileA, fileB], 'base', 'head')
    const h2 = computeFilesHash([fileA, fileB], 'base', 'head')
    expect(h1).toBe(h2)
  })

  it('is independent of file array order', () => {
    const h1 = computeFilesHash([fileA, fileB], 'base', 'head')
    const h2 = computeFilesHash([fileB, fileA], 'base', 'head')
    expect(h1).toBe(h2)
  })

  it('changes when baseSha changes', () => {
    const base = computeFilesHash([fileA], 'base1', 'head')
    expect(computeFilesHash([fileA], 'base2', 'head')).not.toBe(base)
  })

  it('changes when headSha changes', () => {
    const base = computeFilesHash([fileA], 'base', 'head1')
    expect(computeFilesHash([fileA], 'base', 'head2')).not.toBe(base)
  })

  it('changes when a file patch changes', () => {
    const base = computeFilesHash([fileA], 'base', 'head')
    const changed = computeFilesHash([{ ...fileA, patch: '@@ -1 +1 @@\n-a\n+c' }], 'base', 'head')
    expect(changed).not.toBe(base)
  })

  it('changes when a file status changes', () => {
    const base = computeFilesHash([fileA], 'base', 'head')
    expect(computeFilesHash([{ ...fileA, status: 'removed' }], 'base', 'head')).not.toBe(base)
  })

  it('changes when additions or deletions change', () => {
    const base = computeFilesHash([fileA], 'base', 'head')
    expect(computeFilesHash([{ ...fileA, additions: 4 }], 'base', 'head')).not.toBe(base)
    expect(computeFilesHash([{ ...fileA, deletions: 2 }], 'base', 'head')).not.toBe(base)
  })

  it('treats a missing patch differently from a present patch', () => {
    const withPatch = computeFilesHash([fileA], 'base', 'head')
    const noPatch = computeFilesHash([{ ...fileA, patch: undefined }], 'base', 'head')
    expect(noPatch).not.toBe(withPatch)
  })
})
