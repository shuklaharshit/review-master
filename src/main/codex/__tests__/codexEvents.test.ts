import { describe, it, expect } from 'vitest'
import { shouldLogUnhandled, isAgentMessageDelta, isAgentMessageCompleted } from '../codexEvents'

describe('shouldLogUnhandled', () => {
  it('does not flag reasoning notifications consumed by the activity feed', () => {
    expect(shouldLogUnhandled('item/reasoning/summaryTextDelta')).toBe(false)
    expect(shouldLogUnhandled('item/reasoning/textDelta')).toBe(false)
  })

  it('does not flag supported or ignored notifications', () => {
    expect(shouldLogUnhandled('thread/started')).toBe(false) // supported
    expect(shouldLogUnhandled('turn/completed')).toBe(false) // supported
    expect(shouldLogUnhandled('thread/tokenUsage/updated')).toBe(false) // ignored
    expect(shouldLogUnhandled('item/started')).toBe(false) // ignored
  })

  it('flags genuinely unknown notifications', () => {
    expect(shouldLogUnhandled('some/brand/newMethod')).toBe(true)
  })
})

describe('agent message helpers', () => {
  it('matches camelCase and snake_case deltas', () => {
    expect(isAgentMessageDelta('item/agentMessage/delta')).toBe(true)
    expect(isAgentMessageDelta('item/agent_message/delta')).toBe(true)
    expect(isAgentMessageDelta('item/agentMessage/completed')).toBe(false)
  })

  it('matches camelCase and snake_case completions', () => {
    expect(isAgentMessageCompleted('item/agentMessage/completed')).toBe(true)
    expect(isAgentMessageCompleted('item/agent_message/completed')).toBe(true)
    expect(isAgentMessageCompleted('item/agentMessage/delta')).toBe(false)
  })
})
