// ============================================================================
// CodexProcessManager (spec §9.3)
//
// Owns the long-lived `codex app-server` child process and speaks JSON-RPC 2.0
// over newline-delimited JSON on stdio.
//
//   - spawn via node:child_process (fine-grained stdio control)
//   - readline over stdout; route responses to pending request promises and
//     notifications to a registered handler
//   - stderr -> logger.debug (logger redacts secrets)
//   - per-request timeouts; reject all pending on process exit
//   - graceful stop(); restart-on-crash via a flag checked by ensureReady()
// ============================================================================

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'

import type { CodexAccount, CodexModel, ReasoningEffort } from '../../shared/types'
import { appError } from '../../shared/result'
import { logger } from '../app/Logger'
import type { RawCodexNotification } from './codexEvents'
import { shouldLogUnhandled } from './codexEvents'
import type {
  AccountReadResult,
  CodexInitializeResult,
  InitializeParams,
  InterruptTurnParams,
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  ModelListResult,
  RawCodexModel,
  ThreadResumeParams,
  ThreadStartParams,
  ThreadStartResult,
  TurnStartParams,
  TurnStartResult
} from './codexTypes'

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000
const STOP_GRACE_MS = 3_000

const CLIENT_INFO = { name: 'review-master', version: '0.1.0' } as const

const DEFAULT_REASONING_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timer: NodeJS.Timeout
  method: string
}

export type NotificationHandler = (n: RawCodexNotification) => void

export class CodexProcessManager {
  private child: ChildProcessWithoutNullStreams | null = null
  private rl: ReadlineInterface | null = null
  private started = false
  private stopping = false
  /** Set when the process exited unexpectedly; ensureReady() restarts on next call. */
  private crashed = false
  private nextId = 1
  private readonly pending = new Map<JsonRpcId, PendingRequest>()
  private notificationHandler: NotificationHandler | null = null

  constructor(private readonly binaryPath: string) {}

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  isStarted(): boolean {
    return this.started && this.child !== null && !this.crashed
  }

  onNotification(cb: NotificationHandler): void {
    this.notificationHandler = cb
  }

  async start(): Promise<void> {
    if (this.isStarted()) return

    // Clean any stale handle before re-spawning (e.g. after a crash).
    this.disposeChild()

    logger.info('[codex] spawning app-server:', this.binaryPath)
    const child = spawn(this.binaryPath, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    }) as ChildProcessWithoutNullStreams

    this.child = child
    this.started = true
    this.stopping = false
    this.crashed = false

    child.stdout.setEncoding('utf8')
    this.rl = createInterface({ input: child.stdout })
    this.rl.on('line', (line) => this.handleLine(line))

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      const text = String(chunk).trimEnd()
      if (text.length > 0) logger.debug('[codex stderr]', text)
    })

    child.on('error', (error) => {
      logger.error('[codex] process error:', String(error))
      this.handleExit(null, 'process-error')
    })

    child.on('exit', (code, sig) => {
      logger.warn('[codex] app-server exited', { code, signal: sig })
      this.handleExit(code, sig ?? null)
    })

    // Wait briefly for spawn failure to surface (ENOENT etc.).
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        child.removeListener('spawn', onSpawn)
        reject(appError('codex_spawn_failed', `Failed to launch codex app-server: ${error.message}`, true))
      }
      const onSpawn = () => {
        child.removeListener('error', onError)
        resolve()
      }
      child.once('error', onError)
      child.once('spawn', onSpawn)
    })
  }

  async stop(): Promise<void> {
    if (!this.child) {
      this.started = false
      return
    }
    this.stopping = true
    const child = this.child

    // Best-effort graceful shutdown; protocol has no documented shutdown verb,
    // so we send one defensively then fall back to signals.
    try {
      this.sendNotification('shutdown')
    } catch {
      // ignore — we are tearing down anyway
    }

    await new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // ignore
        }
        finish()
      }, STOP_GRACE_MS)

      child.once('exit', finish)
      try {
        child.kill('SIGTERM')
      } catch {
        finish()
      }
    })

    this.rejectAllPending(appError('codex_stopped', 'Codex process stopped', true))
    this.disposeChild()
    this.started = false
    this.stopping = false
  }

  // --------------------------------------------------------------------------
  // Protocol methods (spec §9.3)
  // --------------------------------------------------------------------------

  async initialize(): Promise<CodexInitializeResult> {
    const params: InitializeParams = { clientInfo: { ...CLIENT_INFO }, capabilities: {} }
    const result = (await this.sendRequest('initialize', params)) as CodexInitializeResult
    // Per protocol, follow with an `initialized` notification.
    this.sendNotification('initialized')
    return result ?? {}
  }

  async accountRead(): Promise<CodexAccount> {
    const raw = (await this.sendRequest('account/read', {})) as AccountReadResult | undefined
    const acc = raw?.account ?? raw ?? {}
    const account: CodexAccount = {
      email: typeof acc.email === 'string' ? acc.email : undefined,
      plan: typeof acc.plan === 'string' ? acc.plan : undefined,
      organization:
        typeof acc.organization === 'string'
          ? acc.organization
          : typeof acc.org === 'string'
            ? acc.org
            : undefined,
      authMethod:
        typeof acc.authMethod === 'string'
          ? acc.authMethod
          : typeof acc.auth_method === 'string'
            ? acc.auth_method
            : undefined
    }
    return account
  }

  async modelList(): Promise<CodexModel[]> {
    const raw = (await this.sendRequest('model/list', {})) as ModelListResult | RawCodexModel[] | undefined
    const list: RawCodexModel[] = Array.isArray(raw) ? raw : (raw?.models ?? raw?.data ?? [])
    return list
      .map((m) => this.mapModel(m))
      .filter((m): m is CodexModel => m !== null)
  }

  async threadStart(params: ThreadStartParams): Promise<ThreadStartResult> {
    return (await this.sendRequest('thread/start', params)) as ThreadStartResult
  }

  async threadResume(params: ThreadResumeParams): Promise<ThreadStartResult> {
    return (await this.sendRequest('thread/resume', params)) as ThreadStartResult
  }

  async turnStart(params: TurnStartParams): Promise<TurnStartResult> {
    if (!params.threadId) {
      throw appError('codex_protocol', 'turn/start requires a threadId', true)
    }
    return (await this.sendRequest('turn/start', params)) as TurnStartResult
  }

  async interruptTurn(params: InterruptTurnParams): Promise<void> {
    // Documented as `interruptTurn`; tolerate the slash-cased alias too.
    await this.sendRequest('turn/interrupt', params).catch(async (error) => {
      logger.debug('[codex] turn/interrupt failed, retrying interruptTurn:', String(error))
      await this.sendRequest('interruptTurn', params)
    })
  }

  // --------------------------------------------------------------------------
  // Request/notification plumbing
  // --------------------------------------------------------------------------

  sendRequest(method: string, params?: unknown, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<unknown> {
    if (!this.child || this.crashed) {
      return Promise.reject(appError('codex_unavailable', 'Codex process is not running', true))
    }
    const id = this.nextId++
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(appError('codex_timeout', `Codex request "${method}" timed out`, true))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timer, method })

      try {
        this.write(payload)
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(appError('codex_write_failed', `Failed to write to codex: ${String(error)}`, true))
      }
    })
  }

  sendNotification(method: string, params?: unknown): void {
    if (!this.child) return
    const payload: JsonRpcNotification = { jsonrpc: '2.0', method, params }
    this.write(payload)
  }

  private write(payload: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.child) throw new Error('process not running')
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  // --------------------------------------------------------------------------
  // stdout line routing
  // --------------------------------------------------------------------------

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (trimmed.length === 0) return

    let msg: JsonRpcMessage
    try {
      msg = JSON.parse(trimmed) as JsonRpcMessage
    } catch {
      // Non-JSON noise on stdout — log and skip.
      logger.debug('[codex stdout non-json]', trimmed)
      return
    }

    // A response: has an id we are waiting on (and no method).
    if (msg.id !== undefined && msg.method === undefined) {
      this.resolveResponse(msg)
      return
    }

    // A notification: has a method.
    if (typeof msg.method === 'string') {
      this.routeNotification({ method: msg.method, params: msg.params })
      return
    }

    logger.debug('[codex] unclassified message', trimmed)
  }

  private resolveResponse(msg: JsonRpcMessage): void {
    const id = msg.id as JsonRpcId
    const entry = this.pending.get(id)
    if (!entry) {
      logger.debug('[codex] response for unknown id', String(id))
      return
    }
    this.pending.delete(id)
    clearTimeout(entry.timer)

    if (msg.error) {
      entry.reject(
        appError('codex_rpc_error', `Codex "${entry.method}" failed: ${msg.error.message}`, true, msg.error)
      )
      return
    }
    entry.resolve(msg.result ?? {})
  }

  private routeNotification(n: RawCodexNotification): void {
    // Forward ALL notifications to the active handler. The adapter decides what
    // to act on; progress notifications (reasoning deltas, item lifecycle, token
    // usage) power the live-activity feed and must not be dropped here. The
    // SUPPORTED/IGNORED lists are now used only to keep the debug log quiet.
    if (shouldLogUnhandled(n.method)) {
      logger.debug('[codex] unhandled notification', n.method)
    }
    try {
      this.notificationHandler?.(n)
    } catch (error) {
      logger.error('[codex] notification handler threw:', String(error))
    }
  }

  // --------------------------------------------------------------------------
  // Crash / exit handling
  // --------------------------------------------------------------------------

  private handleExit(_code: number | null, _signal: NodeJS.Signals | string | null): void {
    const unexpected = this.started && !this.stopping
    this.rejectAllPending(
      appError('codex_crashed', 'Codex process exited unexpectedly', true)
    )
    this.disposeChild()
    if (unexpected) {
      // Flag for restart-on-crash; ensureReady() (caller) will re-start.
      this.crashed = true
      this.started = false
    }
  }

  private rejectAllPending(error: unknown): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    this.pending.clear()
  }

  private disposeChild(): void {
    if (this.rl) {
      this.rl.removeAllListeners()
      this.rl.close()
      this.rl = null
    }
    if (this.child) {
      this.child.removeAllListeners()
      this.child.stdout?.removeAllListeners()
      this.child.stderr?.removeAllListeners()
      this.child = null
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private mapModel(m: RawCodexModel): CodexModel | null {
    const id =
      (typeof m.id === 'string' && m.id) ||
      (typeof m.slug === 'string' && m.slug) ||
      (typeof m.name === 'string' && m.name) ||
      ''
    if (!id) return null

    const displayName =
      (typeof m.displayName === 'string' && m.displayName) ||
      (typeof m.display_name === 'string' && m.display_name) ||
      (typeof m.name === 'string' && m.name) ||
      id

    const rawEfforts =
      m.supportedReasoningEfforts ??
      m.supported_reasoning_efforts ??
      m.reasoningEfforts ??
      m.reasoning_efforts

    const supportedReasoningEfforts = Array.isArray(rawEfforts)
      ? (rawEfforts.filter((e): e is ReasoningEffort =>
          (DEFAULT_REASONING_EFFORTS as string[]).includes(e)
        ) as ReasoningEffort[])
      : [...DEFAULT_REASONING_EFFORTS]

    return {
      id,
      displayName,
      supportedReasoningEfforts:
        supportedReasoningEfforts.length > 0 ? supportedReasoningEfforts : [...DEFAULT_REASONING_EFFORTS]
    }
  }
}
