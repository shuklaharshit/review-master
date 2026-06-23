import { describe, it, expect } from 'vitest'
import { CodexProcessManager } from '../CodexProcessManager'
import type { RawCodexNotification } from '../codexEvents'

// routeNotification is private; we exercise it through a typed escape hatch to
// verify the forwarding contract without spawning a real app-server process.
type WithRoute = { routeNotification(n: RawCodexNotification): void }

describe('CodexProcessManager.routeNotification', () => {
  it('forwards ALL notifications to the handler, including previously dropped ones', () => {
    const mgr = new CodexProcessManager('codex')
    const seen: string[] = []
    mgr.onNotification((n) => seen.push(n.method))

    const route = (mgr as unknown as WithRoute).routeNotification.bind(mgr)
    route({ method: 'item/reasoning/textDelta', params: { delta: 'x' } }) // previously dropped (unsupported)
    route({ method: 'thread/tokenUsage/updated', params: {} }) // previously dropped (ignored)
    route({ method: 'turn/completed', params: {} }) // supported
    route({ method: 'totally/unknown', params: {} }) // unhandled

    expect(seen).toEqual([
      'item/reasoning/textDelta',
      'thread/tokenUsage/updated',
      'turn/completed',
      'totally/unknown'
    ])
  })

  it('does not throw when no handler is registered', () => {
    const mgr = new CodexProcessManager('codex')
    const route = (mgr as unknown as WithRoute).routeNotification.bind(mgr)
    expect(() => route({ method: 'turn/started', params: {} })).not.toThrow()
  })
})
