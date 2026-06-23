// Cross-service contracts shared by main-process layers.
import type { AppEvent, CodexModel, CodexStatus, ReasoningEffort } from '../shared/types'

/** Emits canonical app events to the renderer. */
export interface EventBus {
  emit(event: AppEvent): void
}

/** OS-keychain backed secret store (keytar). Tokens never reach the renderer. */
export interface SecureTokenStore {
  get(tokenKey: string): Promise<string | null>
  set(tokenKey: string, token: string): Promise<void>
  delete(tokenKey: string): Promise<void>
}

export interface CodexRunOptions {
  taskId: string
  model: string
  reasoningEffort: ReasoningEffort
  prompt: string
  /** Called as streamed assistant text arrives. */
  onDelta?: (text: string) => void
  /** Called with human-readable progress lines (reasoning, item lifecycle, tokens) for the live-activity feed. */
  onActivity?: (message: string) => void
  signal?: AbortSignal
}

export interface CodexRunResult {
  text: string
  interrupted?: boolean
}

/** High-level Codex facade consumed by PR services. Hides thread/turn protocol. */
export interface CodexRuntime {
  getStatus(): Promise<CodexStatus>
  recheck(): Promise<CodexStatus>
  listModels(): Promise<CodexModel[]>
  /** Throws an AppError if Codex is unavailable/unauthenticated or model missing. */
  ensureReady(model?: string): Promise<void>
  /** Runs a single prompt on a fresh thread, streaming deltas, and returns the full text. */
  runTask(opts: CodexRunOptions): Promise<CodexRunResult>
  interrupt(taskId: string): Promise<void>
  shutdown(): Promise<void>
}

/** Tracks in-flight cancellable tasks. */
export interface TaskManager {
  create(taskId: string): AbortController
  get(taskId: string): AbortController | undefined
  cancel(taskId: string): void
  done(taskId: string): void
}
