// ============================================================================
// CodexProviderService — implements CodexRuntime (../contracts).
//
// High-level facade over the Codex app-server. Hides the JSON-RPC/thread/turn
// protocol from PR services. Responsibilities:
//   - status/recheck: locate binary, start + initialize the process, read the
//     account and model list, build a CodexStatus, emit session state changes
//   - listModels / ensureReady (binary, auth, model availability checks)
//   - runTask: one fresh thread per task (spec §9.6), streaming deltas
//   - interrupt / shutdown
// ============================================================================

import type { CodexRunOptions, CodexRunResult, CodexRuntime, EventBus } from '../contracts'
import type { CodexAccount, CodexModel, CodexSessionState, CodexStatus } from '../../shared/types'
import { appError, type AppError } from '../../shared/result'
import { logger } from '../app/Logger'
import { CodexAdapter } from './CodexAdapter'
import { locateCodexBinary } from './CodexBinaryLocator'
import { CodexProcessManager } from './CodexProcessManager'

interface CodexSettings {
  codexBinaryMode: 'auto' | 'custom'
  codexBinaryPath?: string
}

interface ActiveTurn {
  controller: AbortController
}

export class CodexProviderService implements CodexRuntime {
  private manager: CodexProcessManager | null = null
  private adapter: CodexAdapter | null = null

  private binaryPath: string | undefined
  private version: string | undefined
  private account: CodexAccount | undefined
  private authenticated = false
  private models: CodexModel[] = []
  private sessionState: CodexSessionState = 'unknown'
  private lastError: string | undefined

  /** Maps taskId -> abort controller for the in-flight turn. */
  private readonly activeTurns = new Map<string, ActiveTurn>()

  /** Guards concurrent status checks (recheck while another is in flight). */
  private statusPromise: Promise<CodexStatus> | null = null

  constructor(
    private readonly eventBus: EventBus,
    private readonly getSettings: () => CodexSettings
  ) {}

  // --------------------------------------------------------------------------
  // Status
  // --------------------------------------------------------------------------

  async getStatus(): Promise<CodexStatus> {
    // If we are already ready, reuse the cached snapshot.
    if (this.sessionState === 'ready') return this.snapshot()
    return this.detect(false)
  }

  async recheck(): Promise<CodexStatus> {
    return this.detect(true)
  }

  private async detect(force: boolean): Promise<CodexStatus> {
    if (this.statusPromise && !force) return this.statusPromise
    this.statusPromise = this.runDetection(force).finally(() => {
      this.statusPromise = null
    })
    return this.statusPromise
  }

  private async runDetection(force: boolean): Promise<CodexStatus> {
    this.setState('starting')
    this.lastError = undefined

    try {
      // On a forced recheck, tear down any existing process to re-detect cleanly.
      if (force && this.manager) {
        await this.shutdown()
      }

      // 1. Locate the binary.
      const settings = this.getSettings()
      const custom = settings.codexBinaryMode === 'custom' ? settings.codexBinaryPath : undefined
      const located = await locateCodexBinary(custom)
      if (!located) {
        this.binaryPath = undefined
        this.version = undefined
        this.authenticated = false
        this.account = undefined
        this.lastError = 'Codex CLI not found'
        this.setState('error', this.lastError)
        return this.snapshot(false)
      }
      this.binaryPath = located.path
      this.version = located.version

      // 2. Start + initialize the process.
      await this.ensureProcess()
      const mgr = this.manager!
      await mgr.initialize()

      // 3. Account + model list.
      try {
        this.account = await mgr.accountRead()
        // Authenticated if the account read returned identifying info.
        this.authenticated = Boolean(
          this.account.email || this.account.plan || this.account.organization || this.account.authMethod
        )
      } catch (error) {
        logger.warn('[codex] account/read failed:', String(error))
        this.authenticated = false
        this.account = undefined
      }

      try {
        this.models = await mgr.modelList()
      } catch (error) {
        logger.warn('[codex] model/list failed:', String(error))
        this.models = []
      }

      if (!this.authenticated) {
        this.lastError = 'Codex is installed but not authenticated. Run `codex login`.'
        this.setState('error', this.lastError)
        return this.snapshot()
      }

      this.setState('ready')
      return this.snapshot()
    } catch (error) {
      const message = errorMessage(error)
      this.lastError = message
      this.setState('error', message)
      return this.snapshot(false)
    }
  }

  // --------------------------------------------------------------------------
  // Models
  // --------------------------------------------------------------------------

  async listModels(): Promise<CodexModel[]> {
    if (this.sessionState !== 'ready') {
      await this.getStatus()
    }
    if (this.manager?.isStarted()) {
      try {
        this.models = await this.manager.modelList()
      } catch (error) {
        logger.debug('[codex] listModels refresh failed:', String(error))
      }
    }
    return this.models
  }

  // --------------------------------------------------------------------------
  // Readiness
  // --------------------------------------------------------------------------

  async ensureReady(model?: string): Promise<void> {
    if (this.sessionState !== 'ready' || !this.manager?.isStarted()) {
      await this.detect(false)
    }

    if (!this.binaryPath) {
      throw appError('codex_unavailable', 'Codex CLI is not installed or could not be located.', true)
    }
    if (!this.manager?.isStarted()) {
      throw appError('codex_unavailable', this.lastError ?? 'Codex process is not running.', true)
    }
    if (!this.authenticated) {
      throw appError(
        'codex_unauthenticated',
        'Codex is installed but not authenticated. Run `codex login` and click Recheck.',
        true
      )
    }
    if (model) {
      const available = this.models.some((m) => m.id === model)
      if (!available && this.models.length > 0) {
        throw appError(
          'model_unavailable',
          `Model "${model}" is not available. Please choose another model.`,
          true,
          { available: this.models.map((m) => m.id) }
        )
      }
    }
  }

  // --------------------------------------------------------------------------
  // Run a task
  // --------------------------------------------------------------------------

  async runTask(opts: CodexRunOptions): Promise<CodexRunResult> {
    await this.ensureReady(opts.model)
    const adapter = this.adapter
    if (!adapter) {
      throw appError('codex_unavailable', 'Codex adapter is not initialised.', true)
    }

    // Bridge any caller signal with our own controller so interrupt(taskId)
    // can also abort the turn.
    const controller = new AbortController()
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort()
      else opts.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    this.activeTurns.set(opts.taskId, { controller })

    try {
      const result = await adapter.runTurn({
        taskId: opts.taskId,
        model: opts.model,
        reasoningEffort: opts.reasoningEffort,
        prompt: opts.prompt,
        onDelta: opts.onDelta,
        signal: controller.signal
      })
      return { text: result.text, interrupted: result.interrupted }
    } finally {
      this.activeTurns.delete(opts.taskId)
    }
  }

  async interrupt(taskId: string): Promise<void> {
    const active = this.activeTurns.get(taskId)
    if (!active) {
      logger.debug('[codex] interrupt: no active turn for task', taskId)
      return
    }
    active.controller.abort()
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    // Abort any in-flight turns first.
    for (const [, turn] of this.activeTurns) {
      try {
        turn.controller.abort()
      } catch {
        // ignore
      }
    }
    this.activeTurns.clear()

    if (this.manager) {
      try {
        await this.manager.stop()
      } catch (error) {
        logger.debug('[codex] shutdown stop error:', String(error))
      }
    }
    this.manager = null
    this.adapter = null
    this.setState('stopped')
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private async ensureProcess(): Promise<void> {
    if (this.manager?.isStarted()) return
    if (!this.binaryPath) {
      throw appError('codex_unavailable', 'No codex binary located.', true)
    }
    // Re-create the manager if missing or previously crashed.
    if (!this.manager) {
      this.manager = new CodexProcessManager(this.binaryPath)
      this.adapter = new CodexAdapter(this.manager)
    }
    await this.manager.start()
  }

  private setState(state: CodexSessionState, message?: string): void {
    if (this.sessionState === state && !message) return
    this.sessionState = state
    // The AppEvent union only carries the live transition states; emit those.
    if (state === 'starting' || state === 'ready' || state === 'error' || state === 'stopped') {
      this.eventBus.emit({ type: 'codex.session.state.changed', state, message })
    }
  }

  private snapshot(includeAuth = true): CodexStatus {
    return {
      cliInstalled: Boolean(this.binaryPath),
      version: this.version,
      binaryPath: this.binaryPath,
      authenticated: includeAuth ? this.authenticated : false,
      account: this.account,
      serverState: this.sessionState,
      error: this.lastError
    }
  }
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const e = error as AppError
    return typeof e.message === 'string' ? e.message : String(error)
  }
  return String(error)
}
