// ============================================================================
// Raw Codex notifications + canonical internal events.
//
// The process manager receives RawCodexNotification objects off stdio and the
// adapter translates the supported subset into CanonicalCodexEvent values that
// the higher layers (CodexProviderService / PR services) consume.
// ============================================================================

/** A notification line (method + params, no response expected). */
export interface RawCodexNotification {
  method: string
  params?: unknown
}

// ----------------------------------------------------------------------------
// Supported / ignored notification methods (spec §9.4)
// ----------------------------------------------------------------------------

export const SUPPORTED_NOTIFICATIONS = [
  'thread/started',
  'turn/started',
  'turn/completed',
  'item/agentMessage/delta',
  'item/agent_message/delta',
  'item/agentMessage/completed',
  'item/agent_message/completed',
  'item/updated',
  'item/completed',
  'thread/status/changed'
] as const

export const IGNORED_NOTIFICATIONS = [
  'remoteControl/status/changed',
  'mcpServer/startupStatus/updated',
  'session/configChanged',
  'account/rateLimits/updated',
  'thread/tokenUsage/updated',
  'item/started'
] as const

export type SupportedNotification = (typeof SUPPORTED_NOTIFICATIONS)[number]
export type IgnoredNotification = (typeof IGNORED_NOTIFICATIONS)[number]

const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_NOTIFICATIONS)
const IGNORED_SET: ReadonlySet<string> = new Set(IGNORED_NOTIFICATIONS)

export function isSupportedNotification(method: string): boolean {
  return SUPPORTED_SET.has(method)
}

export function isIgnoredNotification(method: string): boolean {
  return IGNORED_SET.has(method)
}

/** Normalise both camelCase and snake_case delta/completed methods. */
export function isAgentMessageDelta(method: string): boolean {
  return method === 'item/agentMessage/delta' || method === 'item/agent_message/delta'
}

export function isAgentMessageCompleted(method: string): boolean {
  return method === 'item/agentMessage/completed' || method === 'item/agent_message/completed'
}

// ----------------------------------------------------------------------------
// Canonical internal events emitted by the adapter (spec §9.5)
// ----------------------------------------------------------------------------

export type CanonicalCodexEvent =
  | { type: 'thread.started'; taskId: string; threadId: string; resumeCursor?: string }
  | { type: 'turn.started'; taskId: string; turnId: string }
  | { type: 'content.delta'; taskId: string; turnId: string; text: string }
  | { type: 'content.completed'; taskId: string; turnId: string; text: string }
  | { type: 'turn.completed'; taskId: string; turnId: string }
  | { type: 'runtime.error'; taskId?: string; message: string; recoverable: boolean }
