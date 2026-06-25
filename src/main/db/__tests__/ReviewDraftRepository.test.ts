import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../db'
import type { Database } from '../types'
import type { ReviewDraft } from '../../../shared/types'

function makeDraft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    id: '',
    pullRequestId: 'pr_1',
    snapshotId: 'snap_1',
    model: 'gpt-x',
    reasoningEffort: 'high',
    markdown: '',
    status: 'running',
    createdAt: '',
    updatedAt: '',
    ...overrides
  }
}

describe('ReviewDraftRepository', () => {
  let db: Database

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('create assigns id and round-trips via getById', () => {
    const draft = db.drafts.create(makeDraft())
    expect(draft.id).toMatch(/^draft_/)
    expect(draft.status).toBe('running')
    expect(draft.markdown).toBe('')
    expect(db.drafts.getById(draft.id)?.model).toBe('gpt-x')
  })

  it('persists optional fields (preflightAnalysisId, userNotes)', () => {
    const draft = db.drafts.create(
      makeDraft({ id: 'd1', preflightAnalysisId: 'pf_1', userNotes: 'note' })
    )
    expect(draft.preflightAnalysisId).toBe('pf_1')
    expect(draft.userNotes).toBe('note')

    const bare = db.drafts.create(makeDraft({ id: 'd2' }))
    expect(bare.preflightAnalysisId).toBeUndefined()
    expect(bare.userNotes).toBeUndefined()
  })

  it('appendMarkdown concatenates onto existing markdown', () => {
    const draft = db.drafts.create(makeDraft({ id: 'd1', markdown: 'A' }))
    db.drafts.appendMarkdown(draft.id, 'B')
    db.drafts.appendMarkdown(draft.id, 'C')
    expect(db.drafts.getById('d1')?.markdown).toBe('ABC')
  })

  it('appendMarkdown starts from empty default markdown', () => {
    const draft = db.drafts.create(makeDraft({ id: 'd1', markdown: '' }))
    db.drafts.appendMarkdown(draft.id, 'hello')
    expect(db.drafts.getById('d1')?.markdown).toBe('hello')
  })

  it('setStatus updates the status', () => {
    const draft = db.drafts.create(makeDraft({ id: 'd1', status: 'running' }))
    db.drafts.setStatus(draft.id, 'draft')
    expect(db.drafts.getById('d1')?.status).toBe('draft')
    db.drafts.setStatus(draft.id, 'submitted')
    expect(db.drafts.getById('d1')?.status).toBe('submitted')
  })

  it('findForSnapshot returns the latest matching draft by updated_at', () => {
    db.drafts.create(
      makeDraft({
        id: 'd_old',
        pullRequestId: 'pr_1',
        snapshotId: 'snap_1',
        updatedAt: '2024-01-01T00:00:00.000Z'
      })
    )
    db.drafts.create(
      makeDraft({
        id: 'd_new',
        pullRequestId: 'pr_1',
        snapshotId: 'snap_1',
        updatedAt: '2024-06-01T00:00:00.000Z'
      })
    )
    // Different snapshot -> excluded.
    db.drafts.create(makeDraft({ id: 'd_other', snapshotId: 'snap_2' }))

    expect(db.drafts.findForSnapshot('pr_1', 'snap_1')?.id).toBe('d_new')
    expect(db.drafts.findForSnapshot('pr_1', 'missing')).toBeNull()
  })

  it('latestForPr returns the newest draft by updated_at', () => {
    db.drafts.create(makeDraft({ id: 'd_old', updatedAt: '2024-01-01T00:00:00.000Z' }))
    db.drafts.create(makeDraft({ id: 'd_new', updatedAt: '2024-06-01T00:00:00.000Z' }))
    expect(db.drafts.latestForPr('pr_1')?.id).toBe('d_new')
    expect(db.drafts.latestForPr('nope')).toBeNull()
  })

  it('update patches fields and returns null for unknown id', () => {
    const draft = db.drafts.create(makeDraft({ id: 'd1' }))
    const updated = db.drafts.update(draft.id, { status: 'failed', githubReviewId: 'gh_1' })
    expect(updated?.status).toBe('failed')
    expect(updated?.githubReviewId).toBe('gh_1')
    expect(db.drafts.update('missing', { status: 'failed' })).toBeNull()
  })

  it('reapRunning marks old running drafts interrupted, leaving recent ones', () => {
    const old = new Date(Date.now() - 60_000).toISOString()
    const recent = new Date().toISOString()

    db.drafts.create(makeDraft({ id: 'd_old', status: 'running', createdAt: old }))
    db.drafts.create(makeDraft({ id: 'd_recent', status: 'running', createdAt: recent }))
    db.drafts.create(makeDraft({ id: 'd_draft', status: 'draft', createdAt: old }))

    db.drafts.reapRunning(30_000)

    expect(db.drafts.getById('d_old')?.status).toBe('interrupted')
    expect(db.drafts.getById('d_recent')?.status).toBe('running')
    expect(db.drafts.getById('d_draft')?.status).toBe('draft')
  })
})
