import type BetterSqlite3 from 'better-sqlite3'
import type {
  PreflightAnalysis,
  PreflightRecord,
  PreflightStatus,
  ReasoningEffort
} from '../../../shared/types'
import type { PreflightRepository as IPreflightRepository } from '../types'
import { newId } from '../../../shared/ids'
import { nowIso } from '../../../shared/dates'

interface PreflightRow {
  id: string
  pull_request_id: string
  snapshot_id: string
  model: string
  reasoning_effort: string
  status: string
  raw_json: string | null
  parsed_json: string | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

function rowToRecord(row: PreflightRow): PreflightRecord {
  return {
    id: row.id,
    pullRequestId: row.pull_request_id,
    snapshotId: row.snapshot_id,
    model: row.model,
    reasoningEffort: row.reasoning_effort as ReasoningEffort,
    status: row.status as PreflightStatus,
    analysis: row.parsed_json ? (JSON.parse(row.parsed_json) as PreflightAnalysis) : null,
    rawOutput: row.raw_json ?? null,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null
  }
}

export class PreflightRepository implements IPreflightRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(record: PreflightRecord): PreflightRecord {
    const id = record.id || newId('pf')
    const createdAt = record.createdAt || nowIso()
    this.db
      .prepare(
        `INSERT INTO preflight_analyses
           (id, pull_request_id, snapshot_id, model, reasoning_effort, status,
            raw_json, parsed_json, error_message, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        record.pullRequestId,
        record.snapshotId,
        record.model,
        record.reasoningEffort,
        record.status,
        record.rawOutput ?? null,
        record.analysis ? JSON.stringify(record.analysis) : null,
        record.errorMessage ?? null,
        createdAt,
        record.completedAt ?? null
      )
    return this.getById(id) as PreflightRecord
  }

  getById(id: string): PreflightRecord | null {
    const row = this.db
      .prepare('SELECT * FROM preflight_analyses WHERE id = ?')
      .get(id) as PreflightRow | undefined
    return row ? rowToRecord(row) : null
  }

  findCompletedForSnapshot(snapshotId: string): PreflightRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM preflight_analyses
          WHERE snapshot_id = ? AND status = 'completed'
          ORDER BY completed_at DESC LIMIT 1`
      )
      .get(snapshotId) as PreflightRow | undefined
    return row ? rowToRecord(row) : null
  }

  latestForPr(pullRequestId: string): PreflightRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM preflight_analyses WHERE pull_request_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(pullRequestId) as PreflightRow | undefined
    return row ? rowToRecord(row) : null
  }

  update(id: string, patch: Partial<PreflightRecord>): PreflightRecord | null {
    const existing = this.getById(id)
    if (!existing) return null

    const sets: string[] = []
    const values: unknown[] = []
    if (patch.model !== undefined) {
      sets.push('model = ?')
      values.push(patch.model)
    }
    if (patch.reasoningEffort !== undefined) {
      sets.push('reasoning_effort = ?')
      values.push(patch.reasoningEffort)
    }
    if (patch.status !== undefined) {
      sets.push('status = ?')
      values.push(patch.status)
    }
    if (patch.rawOutput !== undefined) {
      sets.push('raw_json = ?')
      values.push(patch.rawOutput ?? null)
    }
    if (patch.analysis !== undefined) {
      sets.push('parsed_json = ?')
      values.push(patch.analysis ? JSON.stringify(patch.analysis) : null)
    }
    if (patch.errorMessage !== undefined) {
      sets.push('error_message = ?')
      values.push(patch.errorMessage ?? null)
    }
    if (patch.createdAt !== undefined) {
      sets.push('created_at = ?')
      values.push(patch.createdAt)
    }
    if (patch.completedAt !== undefined) {
      sets.push('completed_at = ?')
      values.push(patch.completedAt ?? null)
    }

    if (sets.length > 0) {
      values.push(id)
      this.db.prepare(`UPDATE preflight_analyses SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }
    return this.getById(id)
  }

  markStaleForPrExcept(pullRequestId: string, keepSnapshotId: string): void {
    this.db
      .prepare(
        `UPDATE preflight_analyses
            SET status = 'stale'
          WHERE pull_request_id = ? AND snapshot_id != ? AND status = 'completed'`
      )
      .run(pullRequestId, keepSnapshotId)
  }

  reapRunning(olderThanMs: number): void {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString()
    this.db
      .prepare(
        `UPDATE preflight_analyses
            SET status = 'interrupted'
          WHERE status = 'running' AND created_at < ?`
      )
      .run(cutoff)
  }
}
