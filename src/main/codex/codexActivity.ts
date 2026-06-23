// Pure translation of raw Codex notifications into human-readable
// live-activity lines for the progress modal. Kept free of process/IO state so
// it can be unit-tested directly (buffering, flush, throttle).
import { isAgentMessageDelta } from './codexEvents'

/** Friendly labels for ThreadItem.type lifecycle notifications. */
export const ITEM_LABELS: Record<string, string> = {
  reasoning: 'Reasoning',
  agentMessage: 'Writing response',
  plan: 'Planning',
  commandExecution: 'Running a command',
  fileChange: 'Preparing file changes',
  mcpToolCall: 'Calling a tool',
  webSearch: 'Searching the web'
}

export interface ActivityNotification {
  method: string
  params?: unknown
}

const REASONING_FLUSH_CHARS = 120

/**
 * Stateful, deterministic translator. One instance per turn. `translate`
 * returns zero or more activity lines for a single notification; the caller
 * forwards them to the UI. `nowMs` is injected so token throttling is testable.
 */
export class ActivityTranslator {
  private reasoningBuf = ''
  private writingStarted = false
  private lastTokenEmit = 0

  constructor(private readonly tokenThrottleMs = 1500) {}

  translate(n: ActivityNotification, nowMs: number): string[] {
    const { method } = n
    const p = (n.params ?? {}) as Record<string, unknown>
    const out: string[] = []

    if (method === 'turn/started') {
      out.push('Codex started analysing the diff…')
      return out
    }

    if (method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') {
      const delta = p.delta
      if (typeof delta === 'string' && delta) {
        this.reasoningBuf += delta
        this.flush(out, false)
      }
      return out
    }

    if (method === 'item/started') {
      const type = (p.item as { type?: string } | undefined)?.type
      const label = type ? ITEM_LABELS[type] : undefined
      // agentMessage start is covered by the "Writing the analysis…" marker below.
      if (label && type !== 'agentMessage') out.push(`${label}…`)
      return out
    }

    if (method === 'item/completed') {
      this.flush(out, true)
      return out
    }

    if (method === 'thread/tokenUsage/updated') {
      const usage = p.tokenUsage as { total?: Record<string, number> } | undefined
      const total = usage?.total ?? {}
      const output = total.outputTokens ?? total.output_tokens
      if (typeof output === 'number' && nowMs - this.lastTokenEmit > this.tokenThrottleMs) {
        this.lastTokenEmit = nowMs
        out.push(`Generating… (${output.toLocaleString()} output tokens)`)
      }
      return out
    }

    if (isAgentMessageDelta(method)) {
      if (!this.writingStarted) {
        this.writingStarted = true
        this.flush(out, true) // emit any trailing reasoning before switching to output
        out.push('Writing the analysis…')
      }
      return out
    }

    return out
  }

  /** Emit buffered reasoning as line(s) when forced, or once a line/length boundary is hit. */
  private flush(out: string[], force: boolean): void {
    const text = this.reasoningBuf.trim()
    if (!text) return
    if (force || this.reasoningBuf.includes('\n') || this.reasoningBuf.length > REASONING_FLUSH_CHARS) {
      for (const line of text.split('\n')) {
        const t = line.trim()
        if (t) out.push(t)
      }
      this.reasoningBuf = ''
    }
  }
}
