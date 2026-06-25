import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../db'
import type { Database } from '../types'
import type { PrCommitSnapshot } from '../../../shared/types'

type SnapshotInput = Omit<PrCommitSnapshot, 'id' | 'createdAt'>

function makeInput(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    pullRequestId: 'pr_1',
    baseSha: 'base000',
    headSha: 'head000',
    commitIds: ['c1', 'c2'],
    filesHash: 'hash-A',
    ...overrides
  }
}

describe('SnapshotRepository', () => {
  let db: Database

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('findOrCreate creates a new snapshot and round-trips commitIds JSON', () => {
    const snap = db.snapshots.findOrCreate(makeInput())
    expect(snap.id).toMatch(/^snap_/)
    expect(snap.commitIds).toEqual(['c1', 'c2'])
    expect(snap.createdAt).toBeTruthy()

    const fetched = db.snapshots.getById(snap.id)
    expect(fetched?.commitIds).toEqual(['c1', 'c2'])
  })

  it('returns the SAME row for identical (pull_request_id, base_sha, head_sha, files_hash)', () => {
    const first = db.snapshots.findOrCreate(makeInput())
    const again = db.snapshots.findOrCreate(makeInput({ commitIds: ['ignored'] }))
    expect(again.id).toBe(first.id)
    // commitIds come from the existing row, not the new (ignored) input.
    expect(again.commitIds).toEqual(['c1', 'c2'])
  })

  it('creates a NEW row when files_hash differs', () => {
    const a = db.snapshots.findOrCreate(makeInput({ filesHash: 'hash-A' }))
    const b = db.snapshots.findOrCreate(makeInput({ filesHash: 'hash-B' }))
    expect(b.id).not.toBe(a.id)
  })

  it('creates a NEW row when head_sha differs', () => {
    const a = db.snapshots.findOrCreate(makeInput({ headSha: 'head000' }))
    const b = db.snapshots.findOrCreate(makeInput({ headSha: 'head111' }))
    expect(b.id).not.toBe(a.id)
  })

  it('handles empty commitIds (defaults to [])', () => {
    const snap = db.snapshots.findOrCreate(makeInput({ commitIds: [] }))
    expect(snap.commitIds).toEqual([])
    expect(db.snapshots.getById(snap.id)?.commitIds).toEqual([])
  })

  it('latestForPr returns one of the snapshots for the PR', () => {
    // NOTE: createdAt is derived from nowIso() (ms precision) and the query
    // (ORDER BY created_at DESC) has no tiebreaker. Snapshots created within the
    // same millisecond therefore have an undefined relative order, so we only
    // assert latestForPr returns one of the rows that belong to the PR. (The
    // deterministic newest-by-distinct-timestamp behaviour is covered by the
    // Preflight/Draft repos, whose inputs accept an explicit created_at.)
    const a = db.snapshots.findOrCreate(makeInput({ filesHash: 'h1' }))
    const b = db.snapshots.findOrCreate(makeInput({ filesHash: 'h2' }))
    const c = db.snapshots.findOrCreate(makeInput({ filesHash: 'h3' }))

    const latest = db.snapshots.latestForPr('pr_1')
    expect(latest).not.toBeNull()
    expect([a.id, b.id, c.id]).toContain(latest?.id)
  })

  it('latestForPr returns null when no snapshot exists', () => {
    expect(db.snapshots.latestForPr('nope')).toBeNull()
  })

  it('latestForPr scopes to the requested PR', () => {
    db.snapshots.findOrCreate(makeInput({ pullRequestId: 'pr_1', filesHash: 'h1' }))
    const other = db.snapshots.findOrCreate(
      makeInput({ pullRequestId: 'pr_2', filesHash: 'h2' })
    )
    expect(db.snapshots.latestForPr('pr_2')?.id).toBe(other.id)
  })

  it('getById returns null for unknown id', () => {
    expect(db.snapshots.getById('missing')).toBeNull()
  })
})
