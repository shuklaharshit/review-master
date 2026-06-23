import { describe, it, expect } from 'vitest'
import { ActivityTranslator } from '../codexActivity'

describe('ActivityTranslator', () => {
  it('announces the start of a turn', () => {
    const t = new ActivityTranslator()
    expect(t.translate({ method: 'turn/started', params: {} }, 0)).toEqual(['Codex started analysing the diff…'])
  })

  it('buffers reasoning deltas and flushes on a newline', () => {
    const t = new ActivityTranslator()
    expect(t.translate({ method: 'item/reasoning/textDelta', params: { delta: 'Analy' } }, 0)).toEqual([])
    expect(t.translate({ method: 'item/reasoning/textDelta', params: { delta: 'zing the diff\n' } }, 0)).toEqual([
      'Analyzing the diff'
    ])
  })

  it('flushes buffered reasoning when an item completes', () => {
    const t = new ActivityTranslator()
    expect(t.translate({ method: 'item/reasoning/summaryTextDelta', params: { delta: 'partial thought' } }, 0)).toEqual(
      []
    )
    expect(t.translate({ method: 'item/completed', params: {} }, 0)).toEqual(['partial thought'])
  })

  it('flushes long reasoning even without a newline', () => {
    const t = new ActivityTranslator()
    const long = 'x'.repeat(130)
    expect(t.translate({ method: 'item/reasoning/textDelta', params: { delta: long } }, 0)).toEqual([long])
  })

  it('throttles token-usage updates', () => {
    const t = new ActivityTranslator(1500)
    const note = (out: number) => ({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { total: { outputTokens: out } } } })
    expect(t.translate(note(100), 10_000)).toEqual(['Generating… (100 output tokens)'])
    expect(t.translate(note(180), 10_500)).toEqual([]) // within throttle window
    expect(t.translate(note(260), 12_000)).toEqual(['Generating… (260 output tokens)']) // window elapsed
  })

  it('labels known item lifecycle starts and skips agentMessage', () => {
    const t = new ActivityTranslator()
    expect(t.translate({ method: 'item/started', params: { item: { type: 'commandExecution' } } }, 0)).toEqual([
      'Running a command…'
    ])
    expect(t.translate({ method: 'item/started', params: { item: { type: 'agentMessage' } } }, 0)).toEqual([])
    expect(t.translate({ method: 'item/started', params: { item: { type: 'mysteryType' } } }, 0)).toEqual([])
  })

  it('emits the writing marker once when output begins', () => {
    const t = new ActivityTranslator()
    expect(t.translate({ method: 'item/agentMessage/delta', params: { delta: 'Hello' } }, 0)).toEqual([
      'Writing the analysis…'
    ])
    expect(t.translate({ method: 'item/agentMessage/delta', params: { delta: ' world' } }, 0)).toEqual([])
  })

  it('flushes pending reasoning before switching to the writing marker', () => {
    const t = new ActivityTranslator()
    t.translate({ method: 'item/reasoning/textDelta', params: { delta: 'final thought' } }, 0)
    expect(t.translate({ method: 'item/agentMessage/delta', params: { delta: 'X' } }, 0)).toEqual([
      'final thought',
      'Writing the analysis…'
    ])
  })

  it('ignores notifications it does not translate', () => {
    const t = new ActivityTranslator()
    expect(t.translate({ method: 'thread/started', params: {} }, 0)).toEqual([])
    expect(t.translate({ method: 'turn/completed', params: {} }, 0)).toEqual([])
  })
})
