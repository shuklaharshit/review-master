import type BetterSqlite3 from 'better-sqlite3'
import type { PrCommitSnapshot } from '../../../shared/types'
import type { SnapshotRepository as ISnapshotRepository } from '../types'
import { newId } from '../../../shared/ids'
import { nowIso } from '../../../shared/dates'

interface SnapshotRow {
  id: string
  pull_request_id: string
  base_sha: string
  head_sha: string
  commit_ids_json: string
  files_hash: string
  created_at: string
}

function rowToSnapshot(row: SnapshotRow): PrCommitSnapshot {
  return {
    id: row.id,
    pullRequestId: row.pull_request_id,
    baseSha: row.base_sha,
    headSha: row.head_sha,
    commitIds: JSON.parse(row.commit_ids_json) as string[],
    filesHash: row.files_hash,
    createdAt: row.created_at
  }
}

export class SnapshotRepository implements ISnapshotRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  findOrCreate(input: Omit<PrCommitSnapshot, 'id' | 'createdAt'>): PrCommitSnapshot {
    const existing = this.db
      .prepare(
        `SELECT * FROM pr_commit_snapshots
          WHERE pull_request_id = ? AND base_sha = ? AND head_sha = ? AND files_hash = ?`
      )
      .get(input.pullRequestId, input.baseSha, input.headSha, input.filesHash) as
      | SnapshotRow
      | undefined
    if (existing) return rowToSnapshot(existing)

    const id = newId('snap')
    const createdAt = nowIso()
    this.db
      .prepare(
        `INSERT INTO pr_commit_snapshots
           (id, pull_request_id, base_sha, head_sha, commit_ids_json, files_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.pullRequestId,
        input.baseSha,
        input.headSha,
        JSON.stringify(input.commitIds ?? []),
        input.filesHash,
        createdAt
      )
    return {
      id,
      pullRequestId: input.pullRequestId,
      baseSha: input.baseSha,
      headSha: input.headSha,
      commitIds: input.commitIds ?? [],
      filesHash: input.filesHash,
      createdAt
    }
  }

  getById(id: string): PrCommitSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM pr_commit_snapshots WHERE id = ?')
      .get(id) as SnapshotRow | undefined
    return row ? rowToSnapshot(row) : null
  }

  latestForPr(pullRequestId: string): PrCommitSnapshot | null {
    const row = this.db
      .prepare(
        'SELECT * FROM pr_commit_snapshots WHERE pull_request_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(pullRequestId) as SnapshotRow | undefined
    return row ? rowToSnapshot(row) : null
  }
}
