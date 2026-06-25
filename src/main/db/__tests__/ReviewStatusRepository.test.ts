import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../db'
import type { Database } from '../types'
import type { ReviewStatus } from '../../../shared/types'

function makeStatus(overrides: Partial<ReviewStatus> = {}): ReviewStatus {
  return {
    id: '',
    pullRequestId: 'pr_1',
    snapshotId: 'snap_1',
    status: 'reviewed',
    updatedAt: '',
    ...overrides
  }
}

describe('ReviewStatusRepository', () => {
  let db: Database

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('upsert inserts a new status with a generated id', () => {
    const status = db.reviewStatuses.upsert(makeStatus({ reviewedHeadSha: 'head000' }))
    expect(status.id).toMatch(/^rs_/)
    expect(status.status).toBe('reviewed')
    expect(status.reviewedHeadSha).toBe('head000')
  })

  it('upsert dedupes on (pull_request_id, snapshot_id), keeping the same id', () => {
    const first = db.reviewStatuses.upsert(makeStatus({ status: 'reviewed' }))
    const second = db.reviewStatuses.upsert(
      makeStatus({ id: 'ignored', status: 'needs_rereview', reviewDraftId: 'd1' })
    )
    expect(second.id).toBe(first.id)
    expect(second.status).toBe('needs_rereview')
    expect(second.reviewDraftId).toBe('d1')
  })

  it('getForSnapshot returns the status keyed by (pr, snapshot)', () => {
    const status = db.reviewStatuses.upsert(makeStatus({ snapshotId: 'snap_1' }))
    expect(db.reviewStatuses.getForSnapshot('pr_1', 'snap_1')?.id).toBe(status.id)
    expect(db.reviewStatuses.getForSnapshot('pr_1', 'snap_2')).toBeNull()
  })

  it('keeps distinct rows per snapshot for the same PR', () => {
    db.reviewStatuses.upsert(makeStatus({ snapshotId: 'snap_1' }))
    db.reviewStatuses.upsert(makeStatus({ snapshotId: 'snap_2' }))
    expect(db.reviewStatuses.getForSnapshot('pr_1', 'snap_1')).not.toBeNull()
    expect(db.reviewStatuses.getForSnapshot('pr_1', 'snap_2')).not.toBeNull()
  })

  it('setStatus creates then updates the same row, stamping reviewedAt', () => {
    const created = db.reviewStatuses.setStatus('pr_1', 'snap_1', 'draft_available')
    expect(created.status).toBe('draft_available')
    expect(created.reviewedAt).toBeTruthy()

    const updated = db.reviewStatuses.setStatus('pr_1', 'snap_1', 'reviewed', 'head777')
    expect(updated.id).toBe(created.id)
    expect(updated.status).toBe('reviewed')
    expect(updated.reviewedHeadSha).toBe('head777')
  })

  it('setStatus preserves prior reviewedHeadSha when not supplied', () => {
    db.reviewStatuses.setStatus('pr_1', 'snap_1', 'reviewed', 'head111')
    const next = db.reviewStatuses.setStatus('pr_1', 'snap_1', 'needs_rereview')
    expect(next.reviewedHeadSha).toBe('head111')
  })

  it('latestForPr returns the most recently updated status', () => {
    db.reviewStatuses.upsert(
      makeStatus({ snapshotId: 'snap_1', updatedAt: '2024-01-01T00:00:00.000Z' })
    )
    db.reviewStatuses.upsert(
      makeStatus({ snapshotId: 'snap_2', updatedAt: '2024-06-01T00:00:00.000Z' })
    )
    expect(db.reviewStatuses.latestForPr('pr_1')?.snapshotId).toBe('snap_2')
    expect(db.reviewStatuses.latestForPr('nope')).toBeNull()
  })
})
