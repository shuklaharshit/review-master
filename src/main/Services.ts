import type { App } from 'electron'
import { createDatabase } from './db/db'
import type { Database } from './db/types'
import { SafePaths } from './security/safePaths'
import { SecureTokenService } from './auth/SecureTokenService'
import { AccountService } from './auth/AccountService'
import { SettingsService } from './app/SettingsService'
import { TaskRegistry } from './app/TaskRegistry'
import { AppBootstrapService } from './app/AppBootstrapService'
import { UpdateService } from './app/UpdateService'
import { EventBusImpl } from './app/EventBusImpl'
import { CodexProviderService } from './codex/CodexProviderService'
import { GitHubAuthService } from './providers/github/GitHubAuthService'
import { GitHubApiClient } from './providers/github/GitHubApiClient'
import { GitHubProvider } from './providers/github/GitHubProvider'
import { GitProviderRegistry } from './providers/GitProviderRegistry'
import { RepoCacheService } from './pr/RepoCacheService'
import { PullRequestContextService } from './pr/PullRequestContextService'
import { PreflightAnalysisService } from './pr/PreflightAnalysisService'
import { AiReviewService } from './pr/AiReviewService'
import { ReviewSubmissionService } from './pr/ReviewSubmissionService'
import { TASK_STALE_TIMEOUT_MS } from '../shared/constants'
import { logger } from './app/Logger'

export interface Services {
  app: App
  db: Database
  paths: SafePaths
  eventBus: EventBusImpl
  tokens: SecureTokenService
  accounts: AccountService
  settings: SettingsService
  tasks: TaskRegistry
  codex: CodexProviderService
  bootstrap: AppBootstrapService
  updates: UpdateService
  registry: GitProviderRegistry
  github: GitHubProvider
  prContext: PullRequestContextService
  preflight: PreflightAnalysisService
  aiReview: AiReviewService
  submission: ReviewSubmissionService
  getAppVersion: () => string
}

export function buildServices(app: App): Services {
  const getAppVersion = (): string => app.getVersion()

  const paths = new SafePaths(app.getPath('userData'))
  paths.ensureDirsSync()

  const db = createDatabase(paths.dbPath())

  // Crash recovery (spec §22.11): mark stuck running tasks as interrupted.
  try {
    db.preflight.reapRunning(TASK_STALE_TIMEOUT_MS)
    db.drafts.reapRunning(TASK_STALE_TIMEOUT_MS)
  } catch (e) {
    logger.warn('Task reaping failed', e)
  }

  const eventBus = new EventBusImpl()
  const tokens = new SecureTokenService()
  const accounts = new AccountService(db, tokens, paths)
  const settings = new SettingsService(db)
  const tasks = new TaskRegistry()

  const codex = new CodexProviderService(eventBus, () => {
    const s = settings.get()
    return { codexBinaryMode: s.codexBinaryMode, codexBinaryPath: s.codexBinaryPath }
  })

  const bootstrap = new AppBootstrapService(codex, accounts, getAppVersion)
  const updates = new UpdateService(eventBus, getAppVersion)

  const ghAuth = new GitHubAuthService()
  const ghApi = new GitHubApiClient(accounts)
  const github = new GitHubProvider({ db, accounts, tokens, auth: ghAuth, api: ghApi })
  const registry = new GitProviderRegistry(github)

  const repoCache = new RepoCacheService(paths, accounts)
  const getSettings = (): ReturnType<SettingsService['get']> => settings.get()

  const prContext = new PullRequestContextService({ db, provider: github, repoCache })
  const preflight = new PreflightAnalysisService({
    db,
    provider: github,
    repoCache,
    codex,
    events: eventBus,
    tasks,
    getSettings
  })
  const aiReview = new AiReviewService({
    db,
    provider: github,
    repoCache,
    codex,
    events: eventBus,
    tasks,
    getSettings,
    safePaths: paths
  })
  const submission = new ReviewSubmissionService({ db, provider: github })

  return {
    app,
    db,
    paths,
    eventBus,
    tokens,
    accounts,
    settings,
    tasks,
    codex,
    bootstrap,
    updates,
    registry,
    github,
    prContext,
    preflight,
    aiReview,
    submission,
    getAppVersion
  }
}
