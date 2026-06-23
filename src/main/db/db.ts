import Database from 'better-sqlite3'
import type { Database as ReviewDb } from './types'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema'
import { AccountRepository } from './repositories/AccountRepository'
import { RepoRepository } from './repositories/RepoRepository'
import { PullRequestRepository } from './repositories/PullRequestRepository'
import { SnapshotRepository } from './repositories/SnapshotRepository'
import { PreflightRepository } from './repositories/PreflightRepository'
import { ReviewDraftRepository } from './repositories/ReviewDraftRepository'
import { ReviewStatusRepository } from './repositories/ReviewStatusRepository'
import { SettingsRepository } from './repositories/SettingsRepository'

export function createDatabase(dbPath: string): ReviewDb {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(SCHEMA_SQL)
  // Record schema version for future migrations.
  sqlite.pragma(`user_version = ${SCHEMA_VERSION}`)

  const accounts = new AccountRepository(sqlite)
  const repos = new RepoRepository(sqlite)
  const pullRequests = new PullRequestRepository(sqlite)
  const snapshots = new SnapshotRepository(sqlite)
  const preflight = new PreflightRepository(sqlite)
  const drafts = new ReviewDraftRepository(sqlite)
  const reviewStatuses = new ReviewStatusRepository(sqlite)
  const settings = new SettingsRepository(sqlite)

  return {
    accounts,
    repos,
    pullRequests,
    snapshots,
    preflight,
    drafts,
    reviewStatuses,
    settings,
    close(): void {
      sqlite.close()
    }
  }
}
