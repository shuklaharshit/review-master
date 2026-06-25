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

/**
 * The full credential we persist per account (ADR-0007, F-1=ON). Serialized as
 * JSON into the single keychain entry for the account. Legacy OAuth-App accounts
 * stored a bare access-token string instead; readers tolerate both shapes.
 * Expiry fields are absolute ISO timestamps.
 */
export interface StoredCredential {
  accessToken: string
  refreshToken?: string
  accessTokenExpiresAt?: string
  refreshTokenExpiresAt?: string
}

/**
 * Exchanges a refresh token for a fresh credential. Implemented by the GitHub
 * provider's auth service; injected into AccountService so token renewal stays
 * provider-agnostic at the account layer.
 */
export interface TokenRefresher {
  refresh(refreshToken: string): Promise<StoredCredential>
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
