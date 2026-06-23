import type { AppSettings } from '../../shared/types'
import type { CodexRuntime, EventBus, TaskManager } from '../contracts'
import type { Database } from '../db/types'
import type { GitProvider } from '../providers/GitProvider'
import type { AccountService } from '../auth/AccountService'
import type { SafePaths } from '../security/safePaths'
import type { RepoCacheService } from './RepoCacheService'

/** Returns the current app settings (model + reasoning effort defaults). */
export type GetSettings = () => AppSettings

/** Minimal repo identity used to build a local diff. */
export interface RepoIdentity {
  owner: string
  name: string
  cloneUrl: string
}

/** Dependencies for PullRequestContextService. */
export interface PullRequestContextDeps {
  db: Database
  provider: GitProvider
  repoCache: RepoCacheService
}

/** Dependencies for PreflightAnalysisService. */
export interface PreflightServiceDeps {
  db: Database
  provider: GitProvider
  repoCache: RepoCacheService
  codex: CodexRuntime
  events: EventBus
  tasks: TaskManager
  getSettings: GetSettings
}

/** Dependencies for AiReviewService. */
export interface AiReviewServiceDeps {
  db: Database
  provider: GitProvider
  repoCache: RepoCacheService
  codex: CodexRuntime
  events: EventBus
  tasks: TaskManager
  safePaths: SafePaths
  getSettings: GetSettings
}

/** Dependencies for ReviewSubmissionService. */
export interface ReviewSubmissionDeps {
  db: Database
  provider: GitProvider
}

/** Dependencies for RepoCacheService. */
export interface RepoCacheDeps {
  safePaths: SafePaths
  accounts: AccountService
}
