// ============================================================================
// JSON-RPC 2.0 envelope + Codex app-server params/results.
//
// The real `codex app-server` speaks JSON-RPC 2.0 over newline-delimited JSON
// on stdio. Field names vary across versions (camelCase vs snake_case), so all
// *Result types keep fields optional and we parse defensively at the call site.
// ============================================================================

export type JsonRpcId = number | string

/** A JSON-RPC request we send (always has an id). */
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: unknown
}

/** A JSON-RPC notification (no id, no response expected). */
export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

/** A JSON-RPC response keyed by the originating request id. */
export interface JsonRpcResponse {
  jsonrpc?: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: JsonRpcError
}

/** Anything read off stdout before classification. */
export interface JsonRpcMessage {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: unknown
  result?: unknown
  error?: JsonRpcError
}

// ----------------------------------------------------------------------------
// initialize
// ----------------------------------------------------------------------------

export interface ClientInfo {
  name: string
  version: string
}

export interface InitializeParams {
  clientInfo: ClientInfo
  capabilities: Record<string, unknown>
}

/** Loose — the server echoes its own info/capabilities, shape may vary. */
export interface CodexInitializeResult {
  serverInfo?: { name?: string; version?: string }
  server_info?: { name?: string; version?: string }
  capabilities?: Record<string, unknown>
  protocolVersion?: string
  protocol_version?: string
  [key: string]: unknown
}

// ----------------------------------------------------------------------------
// account/read
// ----------------------------------------------------------------------------

/** Loose account payload — may be flat or nested under `account`. */
export interface AccountReadResult {
  account?: {
    email?: string
    plan?: string
    organization?: string
    org?: string
    authMethod?: string
    auth_method?: string
    [key: string]: unknown
  }
  email?: string
  plan?: string
  organization?: string
  org?: string
  authMethod?: string
  auth_method?: string
  authenticated?: boolean
  [key: string]: unknown
}

// ----------------------------------------------------------------------------
// model/list
// ----------------------------------------------------------------------------

export interface RawCodexModel {
  id?: string
  name?: string
  slug?: string
  displayName?: string
  display_name?: string
  supportedReasoningEfforts?: string[]
  supported_reasoning_efforts?: string[]
  reasoningEfforts?: string[]
  reasoning_efforts?: string[]
  [key: string]: unknown
}

/** model/list may return an array directly or wrap it under `models`. */
export interface ModelListResult {
  models?: RawCodexModel[]
  data?: RawCodexModel[]
  [key: string]: unknown
}

// ----------------------------------------------------------------------------
// thread/start, thread/resume
// ----------------------------------------------------------------------------

export interface ThreadStartParams {
  model?: string
  reasoningEffort?: string
  reasoning_effort?: string
  [key: string]: unknown
}

export interface ThreadResumeParams {
  threadId: string
  thread_id?: string
  cursor?: string
  resumeCursor?: string
  [key: string]: unknown
}

/** Loose result — threadId may live in several shapes. */
export interface ThreadStartResult {
  threadId?: string
  thread_id?: string
  thread?: { id?: string; [key: string]: unknown }
  id?: string
  resumeCursor?: string
  resume_cursor?: string
  cursor?: string
  [key: string]: unknown
}

// ----------------------------------------------------------------------------
// turn/start
// ----------------------------------------------------------------------------

export interface TurnStartInputItem {
  type: 'text'
  text: string
}

export interface TurnStartParams {
  /** Every turn/start MUST include threadId (spec §9.3). */
  threadId: string
  thread_id?: string
  model?: string
  reasoningEffort?: string
  reasoning_effort?: string
  /** Prompt payload — sent both as `input` items and a plain `prompt` string. */
  input?: TurnStartInputItem[]
  prompt?: string
  [key: string]: unknown
}

export interface TurnStartResult {
  turnId?: string
  turn_id?: string
  turn?: { id?: string; [key: string]: unknown }
  id?: string
  taskId?: string
  task_id?: string
  [key: string]: unknown
}

// ----------------------------------------------------------------------------
// turn/interrupt
// ----------------------------------------------------------------------------

export interface InterruptTurnParams {
  threadId: string
  thread_id?: string
  turnId?: string
  turn_id?: string
  [key: string]: unknown
}
