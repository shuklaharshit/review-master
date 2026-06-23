import type BetterSqlite3 from 'better-sqlite3'
import type { ReviewStatus, ReviewStatusValue } from '../../../shared/types'
import type { ReviewStatusRepository as IReviewStatusRepository } from '../types'
import { newId } from '../../../shared/ids'
import { nowIso } from '../../../shared/dates'

interface ReviewStatusRow {
  id: string
  pull_request_id: string
  snapshot_id: string
  review_draft_id: string | null
  status: string
  reviewed_head_sha: string | null
  reviewed_at: string | null
  updated_at: string
}

function rowToStatus(row: ReviewStatusRow): ReviewStatus {
  return {
    id: row.id,
    pullRequestId: row.pull_request_id,
    snapshotId: row.snapshot_id,
    reviewDraftId: row.review_draft_id ?? undefined,
    status: row.status as ReviewStatusValue,
    reviewedHeadSha: row.reviewed_head_sha ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    updatedAt: row.updated_at
  }
}

export class ReviewStatusRepository implements IReviewStatusRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  upsert(status: ReviewStatus): ReviewStatus {
    const existing = this.getForSnapshot(status.pullRequestId, status.snapshotId)
    const now = nowIso()
    if (existing) {
      this.db
        .prepare(
          `UPDATE review_statuses
              SET review_draft_id = ?,
                  status = ?,
                  reviewed_head_sha = ?,
                  reviewed_at = ?,
                  updated_at = ?
            WHERE id = ?`
        )
        .run(
          status.reviewDraftId ?? null,
          status.status,
          status.reviewedHeadSha ?? null,
          status.reviewedAt ?? null,
          status.updatedAt || now,
          existing.id
        )
      return this.getById(existing.id) as ReviewStatus
    }

    const id = status.id || newId('rs')
    this.db
      .prepare(
        `INSERT INTO review_statuses
           (id, pull_request_id, snapshot_id, review_draft_id, status,
            reviewed_head_sha, reviewed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        status.pullRequestId,
        status.snapshotId,
        status.reviewDraftId ?? null,
        status.status,
        status.reviewedHeadSha ?? null,
        status.reviewedAt ?? null,
        status.updatedAt || now
      )
    return this.getById(id) as ReviewStatus
  }

  getById(id: string): ReviewStatus | null {
    const row = this.db
      .prepare('SELECT * FROM review_statuses WHERE id = ?')
      .get(id) as ReviewStatusRow | undefined
    return row ? rowToStatus(row) : null
  }

  getForSnapshot(pullRequestId: string, snapshotId: string): ReviewStatus | null {
    const row = this.db
      .prepare('SELECT * FROM review_statuses WHERE pull_request_id = ? AND snapshot_id = ?')
      .get(pullRequestId, snapshotId) as ReviewStatusRow | undefined
    return row ? rowToStatus(row) : null
  }

  latestForPr(pullRequestId: string): ReviewStatus | null {
    const row = this.db
      .prepare(
        'SELECT * FROM review_statuses WHERE pull_request_id = ? ORDER BY updated_at DESC LIMIT 1'
      )
      .get(pullRequestId) as ReviewStatusRow | undefined
    return row ? rowToStatus(row) : null
  }

  setStatus(
    pullRequestId: string,
    snapshotId: string,
    status: ReviewStatusValue,
    reviewedHeadSha?: string
  ): ReviewStatus {
    const now = nowIso()
    const existing = this.getForSnapshot(pullRequestId, snapshotId)
    return this.upsert({
      id: existing?.id ?? newId('rs'),
      pullRequestId,
      snapshotId,
      reviewDraftId: existing?.reviewDraftId,
      status,
      reviewedHeadSha: reviewedHeadSha ?? existing?.reviewedHeadSha,
      reviewedAt: now,
      updatedAt: now
    })
  }
}
