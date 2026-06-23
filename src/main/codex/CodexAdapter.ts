// ============================================================================
// CodexAdapter
//
// Translates raw Codex notifications into a per-turn streaming interface.
// Orchestrates threadStart -> turnStart -> stream until completion for a single
// task on a FRESH thread (spec §9.6). Accumulates agentMessage deltas, resolves
// with the final text on turn/completed (or the completed message item), and:
//   - rejects the active turn on thread/status/changed { type: 'systemError' }
//   - on AbortSignal, fires interruptTurn and resolves as interrupted with the
//     partial text accumulated so far (never leaves the UI stuck streaming).
// ============================================================================

import type { ReasoningEffort } from '../../shared/types'
import { appError } from '../../shared/result'
import { logger } from '../app/Logger'
import type { CodexProcessManager } from './CodexProcessManager'
import type { RawCodexNotification } from './codexEvents'
import { isAgentMessageCompleted, isAgentMessageDelta } from './codexEvents'
import type { ThreadStartResult, TurnStartResult } from './codexTypes'

export interface RunTurnParams {
  taskId: string
  model: string
  reasoningEffort: ReasoningEffort
  prompt: string
  onDelta?: (text: string) => void
  onActivity?: (message: string) => void
  signal?: AbortSignal
}

/** Friendly labels for ThreadItem.type lifecycle notifications. */
const ITEM_LABELS: Record<string, string> = {
  reasoning: 'Reasoning',
  agentMessage: 'Writing response',
  plan: 'Planning',
  commandExecution: 'Running a command',
  fileChange: 'Preparing file changes',
  mcpToolCall: 'Calling a tool',
  webSearch: 'Searching the web'
}

export interface RunTurnResult {
  text: string
  interrupted: boolean
}

// ----------------------------------------------------------------------------
// Defensive id extraction (spec §9.3)
// ----------------------------------------------------------------------------

function pickThreadId(r: ThreadStartResult | undefined): string | undefined {
  return r?.threadId ?? r?.thread_id ?? r?.thread?.id ?? r?.id
}

function pickTurnId(r: TurnStartResult | undefined): string | undefined {
  return r?.turnId ?? r?.turn_id ?? r?.turn?.id ?? r?.id
}

/** Pull a text-ish value out of arbitrary notification params. */
function extractDeltaText(params: unknown): string | undefined {
  if (typeof params === 'string') return params
  if (!params || typeof params !== 'object') return undefined
  const p = params as Record<string, unknown>
  // Common shapes: { delta }, { text }, { item: { text } }, { content }, { delta: { text } }
  if (typeof p.delta === 'string') return p.delta
  if (typeof p.text === 'string') return p.text
  if (typeof p.content === 'string') return p.content
  const delta = p.delta as Record<string, unknown> | undefined
  if (delta && typeof delta.text === 'string') return delta.text
  const item = p.item as Record<string, unknown> | undefined
  if (item) {
    if (typeof item.text === 'string') return item.text
    if (typeof item.content === 'string') return item.content
  }
  return undefined
}

/** Pull the final assistant text out of a completed-item / turn payload. */
function extractCompletedText(params: unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined
  const p = params as Record<string, unknown>
  const item = (p.item ?? p.message ?? p) as Record<string, unknown>
  if (typeof item.text === 'string') return item.text
  if (typeof item.content === 'string') return item.content
  // content may be an array of { type:'text', text } parts
  const content = item.content
  if (Array.isArray(content)) {
    const parts = content
      .map((c) => (c && typeof c === 'object' && typeof (c as Record<string, unknown>).text === 'string'
        ? ((c as Record<string, unknown>).text as string)
        : ''))
      .join('')
    if (parts.length > 0) return parts
  }
  return undefined
}

/** Detect a thread/status/changed systemError and return its message. */
function systemErrorMessage(params: unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined
  const status = (params as Record<string, unknown>).status as Record<string, unknown> | undefined
  if (!status) return undefined
  const type = status.type
  if (type === 'systemError' || type === 'system_error') {
    const msg = status.message
    return typeof msg === 'string' && msg.length > 0 ? msg : 'Codex reported a system error'
  }
  return undefined
}

export class CodexAdapter {
  constructor(private readonly manager: CodexProcessManager) {}

  async runTurn(params: RunTurnParams): Promise<RunTurnResult> {
    const { taskId, model, reasoningEffort, prompt, onDelta, onActivity, signal } = params

    if (signal?.aborted) {
      return { text: '', interrupted: true }
    }

    // 1. Fresh thread per task (spec §9.6).
    const threadResult = await this.manager.threadStart({
      model,
      reasoningEffort,
      reasoning_effort: reasoningEffort
    })
    const threadId = pickThreadId(threadResult)
    if (!threadId) {
      throw appError('codex_protocol', 'thread/start did not return a thread id', true)
    }

    // State for this turn's streaming lifecycle.
    let buffer = ''
    let turnId: string | undefined
    let settled = false
    let interrupted = false

    // Live-activity state.
    let reasoningBuf = ''
    let writingStarted = false
    let lastTokenEmit = 0
    const emitActivity = (message: string): void => {
      if (!message) return
      try {
        onActivity?.(message)
      } catch (error) {
        logger.debug('[codex] onActivity threw:', String(error))
      }
    }
    const flushReasoning = (force = false): void => {
      const text = reasoningBuf.trim()
      if (!text) return
      if (force || reasoningBuf.includes('\n') || reasoningBuf.length > 120) {
        // Emit the latest complete-ish reasoning line(s).
        for (const line of text.split('\n')) {
          const t = line.trim()
          if (t) emitActivity(t)
        }
        reasoningBuf = ''
      }
    }

    return await new Promise<RunTurnResult>((resolve, reject) => {
      const cleanup = (): void => {
        this.manager.onNotification(() => {
          /* detached no-op until next runTurn re-registers */
        })
        if (signal) signal.removeEventListener('abort', onAbort)
      }

      const finish = (result: RunTurnResult): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      }

      const fail = (error: unknown): void => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }

      const onAbort = (): void => {
        if (settled) return
        interrupted = true
        logger.info('[codex] interrupting turn', { taskId, threadId, turnId })
        // Best-effort interrupt; resolve as interrupted with partial text regardless.
        const interruptParams = {
          threadId,
          thread_id: threadId,
          turnId,
          turn_id: turnId
        }
        void this.manager
          .interruptTurn(interruptParams)
          .catch((error) => logger.debug('[codex] interruptTurn error:', String(error)))
          .finally(() => finish({ text: buffer, interrupted: true }))
      }

      // 2. Notification handler for this turn.
      this.manager.onNotification((n: RawCodexNotification) => {
        if (settled) return
        const { method, params: np } = n

        // System error -> reject the active turn (recoverable).
        const sysErr = systemErrorMessage(np)
        if (method === 'thread/status/changed' && sysErr) {
          fail(appError('codex_system_error', sysErr, true, { taskId, threadId, turnId }))
          return
        }

        // --- Live-activity feed (informational; never settles the turn) ---
        if (method === 'turn/started') {
          emitActivity('Codex started analysing the diff…')
          return
        }
        if (method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') {
          const d = (np as Record<string, unknown>)?.delta
          if (typeof d === 'string' && d) {
            reasoningBuf += d
            flushReasoning()
          }
          return
        }
        if (method === 'item/started') {
          const type = ((np as Record<string, unknown>)?.item as { type?: string } | undefined)?.type
          const label = type ? ITEM_LABELS[type] : undefined
          if (label && type !== 'agentMessage') emitActivity(`${label}…`)
          return
        }
        if (method === 'item/completed') {
          flushReasoning(true)
          return
        }
        if (method === 'thread/tokenUsage/updated') {
          const usage = (np as Record<string, unknown>)?.tokenUsage as { total?: Record<string, number> } | undefined
          const total = usage?.total ?? {}
          const out = total.outputTokens ?? total.output_tokens
          const now = Date.now()
          if (typeof out === 'number' && now - lastTokenEmit > 1500) {
            lastTokenEmit = now
            emitActivity(`Generating… (${out.toLocaleString()} output tokens)`)
          }
          return
        }

        if (isAgentMessageDelta(method)) {
          const delta = extractDeltaText(np)
          if (delta) {
            if (!writingStarted) {
              writingStarted = true
              flushReasoning(true)
              emitActivity('Writing the analysis…')
            }
            buffer += delta
            try {
              onDelta?.(delta)
            } catch (error) {
              logger.debug('[codex] onDelta threw:', String(error))
            }
          }
          return
        }

        if (isAgentMessageCompleted(method)) {
          const finalText = extractCompletedText(np)
          if (finalText && finalText.length >= buffer.length) buffer = finalText
          // Wait for turn/completed to settle unless it never arrives; keep buffer.
          return
        }

        if (method === 'turn/completed') {
          finish({ text: buffer, interrupted })
          return
        }

        // item/updated, item/completed, turn/started, thread/started are
        // informational here; the completed text is captured above.
      })

      // 3. Wire abort.
      if (signal) {
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }

      // 4. Start the turn — MUST include threadId (spec §9.3).
      this.manager
        .turnStart({
          threadId,
          thread_id: threadId,
          model,
          reasoningEffort,
          reasoning_effort: reasoningEffort,
          prompt,
          input: [{ type: 'text', text: prompt }]
        })
        .then((turnResult) => {
          turnId = pickTurnId(turnResult)
        })
        .catch((error) => fail(error))
    })
  }
}
