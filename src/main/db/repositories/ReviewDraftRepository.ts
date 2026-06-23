import type BetterSqlite3 from 'better-sqlite3'
import type { ReasoningEffort, ReviewDraft, ReviewDraftStatus } from '../../../shared/types'
import type { ReviewDraftRepository as IReviewDraftRepository } from '../types'
import { newId } from '../../../shared/ids'
import { nowIso } from '../../../shared/dates'

interface ReviewDraftRow {
  id: string
  pull_request_id: string
  snapshot_id: string
  preflight_analysis_id: string | null
  model: string
  reasoning_effort: string
  user_notes: string | null
  markdown: string
  status: string
  github_review_id: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

function rowToDraft(row: ReviewDraftRow): ReviewDraft {
  return {
    id: row.id,
    pullRequestId: row.pull_request_id,
    snapshotId: row.snapshot_id,
    preflightAnalysisId: row.preflight_analysis_id ?? undefined,
    model: row.model,
    reasoningEffort: row.reasoning_effort as ReasoningEffort,
    userNotes: row.user_notes ?? undefined,
    markdown: row.markdown,
    status: row.status as ReviewDraftStatus,
    githubReviewId: row.github_review_id ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class ReviewDraftRepository implements IReviewDraftRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(draft: ReviewDraft): ReviewDraft {
    const id = draft.id || newId('draft')
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO review_drafts
           (id, pull_request_id, snapshot_id, preflight_analysis_id, model, reasoning_effort,
            user_notes, markdown, status, github_review_id, submitted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        draft.pullRequestId,
        draft.snapshotId,
        draft.preflightAnalysisId ?? null,
        draft.model,
        draft.reasoningEffort,
        draft.userNotes ?? null,
        draft.markdown ?? '',
        draft.status,
        draft.githubReviewId ?? null,
        draft.submittedAt ?? null,
        draft.createdAt || now,
        draft.updatedAt || now
      )
    return this.getById(id) as ReviewDraft
  }

  getById(id: string): ReviewDraft | null {
    const row = this.db
      .prepare('SELECT * FROM review_drafts WHERE id = ?')
      .get(id) as ReviewDraftRow | undefined
    return row ? rowToDraft(row) : null
  }

  findForSnapshot(pullRequestId: string, snapshotId: string): ReviewDraft | null {
    const row = this.db
      .prepare(
        `SELECT * FROM review_drafts
          WHERE pull_request_id = ? AND snapshot_id = ?
          ORDER BY updated_at DESC LIMIT 1`
      )
      .get(pullRequestId, snapshotId) as ReviewDraftRow | undefined
    return row ? rowToDraft(row) : null
  }

  latestForPr(pullRequestId: string): ReviewDraft | null {
    const row = this.db
      .prepare(
        'SELECT * FROM review_drafts WHERE pull_request_id = ? ORDER BY updated_at DESC LIMIT 1'
      )
      .get(pullRequestId) as ReviewDraftRow | undefined
    return row ? rowToDraft(row) : null
  }

  update(id: string, patch: Partial<ReviewDraft>): ReviewDraft | null {
    const existing = this.getById(id)
    if (!existing) return null

    const sets: string[] = []
    const values: unknown[] = []
    if (patch.snapshotId !== undefined) {
      sets.push('snapshot_id = ?')
      values.push(patch.snapshotId)
    }
    if (patch.preflightAnalysisId !== undefined) {
      sets.push('preflight_analysis_id = ?')
      values.push(patch.preflightAnalysisId ?? null)
    }
    if (patch.model !== undefined) {
      sets.push('model = ?')
      values.push(patch.model)
    }
    if (patch.reasoningEffort !== undefined) {
      sets.push('reasoning_effort = ?')
      values.push(patch.reasoningEffort)
    }
    if (patch.userNotes !== undefined) {
      sets.push('user_notes = ?')
      values.push(patch.userNotes ?? null)
    }
    if (patch.markdown !== undefined) {
      sets.push('markdown = ?')
      values.push(patch.markdown)
    }
    if (patch.status !== undefined) {
      sets.push('status = ?')
      values.push(patch.status)
    }
    if (patch.githubReviewId !== undefined) {
      sets.push('github_review_id = ?')
      values.push(patch.githubReviewId ?? null)
    }
    if (patch.submittedAt !== undefined) {
      sets.push('submitted_at = ?')
      values.push(patch.submittedAt ?? null)
    }
    if (patch.createdAt !== undefined) {
      sets.push('created_at = ?')
      values.push(patch.createdAt)
    }

    // Always bump updated_at unless explicitly provided.
    sets.push('updated_at = ?')
    values.push(patch.updatedAt ?? nowIso())

    values.push(id)
    this.db.prepare(`UPDATE review_drafts SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    return this.getById(id)
  }

  appendMarkdown(id: string, markdown: string): void {
    this.db
      .prepare('UPDATE review_drafts SET markdown = markdown || ?, updated_at = ? WHERE id = ?')
      .run(markdown, nowIso(), id)
  }

  setStatus(id: string, status: ReviewDraftStatus): void {
    this.db
      .prepare('UPDATE review_drafts SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, nowIso(), id)
  }

  reapRunning(olderThanMs: number): void {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString()
    this.db
      .prepare(
        `UPDATE review_drafts
            SET status = 'interrupted', updated_at = ?
          WHERE status = 'running' AND created_at < ?`
      )
      .run(nowIso(), cutoff)
  }
}
