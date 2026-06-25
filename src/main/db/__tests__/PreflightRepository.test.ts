import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../db'
import type { Database } from '../types'
import type { PreflightAnalysis, PreflightRecord } from '../../../shared/types'

function makeAnalysis(): PreflightAnalysis {
  return {
    schemaVersion: '2.0',
    pr: {
      provider: 'github',
      repoFullName: 'acme/widget',
      pullRequestNumber: 1,
      title: 't',
      baseBranch: 'main',
      headBranch: 'feat',
      baseSha: 'b',
      headSha: 'h',
      analysedCommitIds: ['c1']
    },
    summary: {
      shortTitle: 'short',
      overview: 'overview',
      estimatedReviewComplexity: 'low',
      suggestedReviewStrategy: 'strategy',
      totalFiles: 1,
      totalAdditions: 2,
      totalDeletions: 3
    },
    reviewGroups: [],
    riskFindings: []
  }
}

function makeRecord(overrides: Partial<PreflightRecord> = {}): PreflightRecord {
  return {
    id: '',
    pullRequestId: 'pr_1',
    snapshotId: 'snap_1',
    model: 'gpt-x',
    reasoningEffort: 'medium',
    status: 'running',
    createdAt: '',
    ...overrides
  }
}

describe('PreflightRepository', () => {
  let db: Database

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('create assigns id, persists, and getById round-trips', () => {
    const rec = db.preflight.create(makeRecord({ status: 'running' }))
    expect(rec.id).toMatch(/^pf_/)
    expect(rec.status).toBe('running')
    expect(rec.createdAt).toBeTruthy()
    expect(db.preflight.getById(rec.id)?.model).toBe('gpt-x')
  })

  it('round-trips analysis JSON, and is null-safe', () => {
    const withAnalysis = db.preflight.create(
      makeRecord({ id: 'pf_a', status: 'completed', analysis: makeAnalysis() })
    )
    expect(withAnalysis.analysis?.summary.shortTitle).toBe('short')
    expect(db.preflight.getById('pf_a')?.analysis?.pr.repoFullName).toBe('acme/widget')

    const noAnalysis = db.preflight.create(makeRecord({ id: 'pf_b' }))
    expect(noAnalysis.analysis).toBeNull()
  })

  it('round-trips rawOutput and errorMessage (null-safe)', () => {
    const rec = db.preflight.create(
      makeRecord({ id: 'pf_a', rawOutput: 'raw text', errorMessage: 'boom' })
    )
    expect(rec.rawOutput).toBe('raw text')
    expect(rec.errorMessage).toBe('boom')

    const empty = db.preflight.create(makeRecord({ id: 'pf_b' }))
    expect(empty.rawOutput).toBeNull()
    expect(empty.errorMessage).toBeNull()
  })

  it('findCompletedForSnapshot returns only completed records', () => {
    db.preflight.create(makeRecord({ id: 'pf_run', snapshotId: 'snap_x', status: 'running' }))
    db.preflight.create(makeRecord({ id: 'pf_fail', snapshotId: 'snap_x', status: 'failed' }))

    expect(db.preflight.findCompletedForSnapshot('snap_x')).toBeNull()

    db.preflight.create(
      makeRecord({
        id: 'pf_done',
        snapshotId: 'snap_x',
        status: 'completed',
        completedAt: '2024-01-01T00:00:00.000Z'
      })
    )
    expect(db.preflight.findCompletedForSnapshot('snap_x')?.id).toBe('pf_done')
  })

  it('findCompletedForSnapshot returns the most recently completed', () => {
    db.preflight.create(
      makeRecord({
        id: 'pf_old',
        snapshotId: 'snap_x',
        status: 'completed',
        completedAt: '2024-01-01T00:00:00.000Z'
      })
    )
    db.preflight.create(
      makeRecord({
        id: 'pf_new',
        snapshotId: 'snap_x',
        status: 'completed',
        completedAt: '2024-06-01T00:00:00.000Z'
      })
    )
    expect(db.preflight.findCompletedForSnapshot('snap_x')?.id).toBe('pf_new')
  })

  it('latestForPr returns the newest by created_at', () => {
    db.preflight.create(
      makeRecord({ id: 'pf_old', createdAt: '2024-01-01T00:00:00.000Z' })
    )
    db.preflight.create(
      makeRecord({ id: 'pf_new', createdAt: '2024-06-01T00:00:00.000Z' })
    )
    expect(db.preflight.latestForPr('pr_1')?.id).toBe('pf_new')
    expect(db.preflight.latestForPr('nope')).toBeNull()
  })

  it('update applies a patch and re-serializes analysis', () => {
    const rec = db.preflight.create(makeRecord({ id: 'pf_a', status: 'running' }))
    const updated = db.preflight.update(rec.id, {
      status: 'completed',
      analysis: makeAnalysis(),
      completedAt: '2024-01-01T00:00:00.000Z'
    })
    expect(updated?.status).toBe('completed')
    expect(updated?.analysis?.summary.totalFiles).toBe(1)
    expect(updated?.completedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('update returns null for unknown id', () => {
    expect(db.preflight.update('missing', { status: 'failed' })).toBeNull()
  })

  it('markStaleForPrExcept flips other completed rows to stale, keeping the named snapshot', () => {
    db.preflight.create(
      makeRecord({ id: 'pf_keep', snapshotId: 'snap_keep', status: 'completed' })
    )
    db.preflight.create(
      makeRecord({ id: 'pf_other', snapshotId: 'snap_other', status: 'completed' })
    )
    // A non-completed row on a different snapshot should be left untouched.
    db.preflight.create(
      makeRecord({ id: 'pf_running', snapshotId: 'snap_running', status: 'running' })
    )

    db.preflight.markStaleForPrExcept('pr_1', 'snap_keep')

    expect(db.preflight.getById('pf_keep')?.status).toBe('completed')
    expect(db.preflight.getById('pf_other')?.status).toBe('stale')
    expect(db.preflight.getById('pf_running')?.status).toBe('running')
  })

  it('markStaleForPrExcept is scoped to the given PR', () => {
    db.preflight.create(
      makeRecord({
        id: 'pf_otherpr',
        pullRequestId: 'pr_2',
        snapshotId: 'snap_z',
        status: 'completed'
      })
    )
    db.preflight.markStaleForPrExcept('pr_1', 'snap_keep')
    expect(db.preflight.getById('pf_otherpr')?.status).toBe('completed')
  })

  it('reapRunning marks old running rows interrupted, leaving recent ones running', () => {
    const old = new Date(Date.now() - 60_000).toISOString()
    const recent = new Date().toISOString()

    db.preflight.create(makeRecord({ id: 'pf_old', status: 'running', createdAt: old }))
    db.preflight.create(makeRecord({ id: 'pf_recent', status: 'running', createdAt: recent }))
    // A completed old row is not affected (only status='running').
    db.preflight.create(makeRecord({ id: 'pf_done', status: 'completed', createdAt: old }))

    db.preflight.reapRunning(30_000)

    expect(db.preflight.getById('pf_old')?.status).toBe('interrupted')
    expect(db.preflight.getById('pf_recent')?.status).toBe('running')
    expect(db.preflight.getById('pf_done')?.status).toBe('completed')
  })
})
