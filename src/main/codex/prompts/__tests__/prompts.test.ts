import { describe, expect, it } from 'vitest'
import { buildPreflightPrompt, type PreflightPromptInput } from '../preflightPrompt'
import { buildAiReviewPrompt, type AiReviewPromptInput } from '../reviewPrompt'
import { buildJsonRepairPrompt } from '../jsonRepairPrompt'

function preflightInput(overrides: Partial<PreflightPromptInput> = {}): PreflightPromptInput {
  return {
    provider: 'github',
    repoFullName: 'acme/widgets',
    pullRequestNumber: 4242,
    title: 'Add refund flow',
    body: 'This PR adds a refund flow.',
    author: 'octocat',
    baseBranch: 'main',
    headBranch: 'feature/refunds',
    baseSha: 'aaa111',
    headSha: 'bbb222',
    commitIds: ['c1', 'c2', 'c3'],
    previousPreflight: null,
    diffContext: 'DIFF_CONTEXT_MARKER_diff --git a/x b/x',
    ...overrides
  }
}

function reviewInput(overrides: Partial<AiReviewPromptInput> = {}): AiReviewPromptInput {
  return {
    provider: 'github',
    repoFullName: 'acme/widgets',
    pullRequestNumber: 4242,
    title: 'Add refund flow',
    body: 'This PR adds a refund flow.',
    author: 'octocat',
    baseBranch: 'main',
    headBranch: 'feature/refunds',
    baseSha: 'aaa111',
    headSha: 'bbb222',
    commitIds: ['c1', 'c2'],
    userNotes: null,
    preflightSummary: 'PREFLIGHT_SUMMARY_MARKER',
    reviewGroups: 'REVIEW_GROUPS_MARKER',
    riskFindings: 'RISK_FINDINGS_MARKER',
    diffContext: 'DIFF_CONTEXT_MARKER',
    ...overrides
  }
}

describe('buildPreflightPrompt', () => {
  it('returns a string', () => {
    expect(typeof buildPreflightPrompt(preflightInput())).toBe('string')
  })

  it('interpolates PR metadata inputs', () => {
    const out = buildPreflightPrompt(preflightInput())
    expect(out).toContain('Repository: acme/widgets')
    expect(out).toContain('PR number: 4242')
    expect(out).toContain('PR title: Add refund flow')
    expect(out).toContain('Author: octocat')
    expect(out).toContain('Base branch: main')
    expect(out).toContain('Head branch: feature/refunds')
    expect(out).toContain('Base SHA: aaa111')
    expect(out).toContain('Head SHA: bbb222')
  })

  it('joins commit ids with commas', () => {
    const out = buildPreflightPrompt(preflightInput())
    expect(out).toContain('Commit IDs analysed: c1, c2, c3')
  })

  it('embeds the diff context', () => {
    const out = buildPreflightPrompt(preflightInput())
    expect(out).toContain('DIFF_CONTEXT_MARKER_diff --git a/x b/x')
  })

  it("renders 'null' when there is no previous preflight", () => {
    const out = buildPreflightPrompt(preflightInput({ previousPreflight: null }))
    expect(out).toContain('Previous preflight analysis:\nnull')
  })

  it('serializes a provided previous preflight as JSON', () => {
    const prev = { schemaVersion: '2.0', warnings: ['was-large'] } as never
    const out = buildPreflightPrompt(preflightInput({ previousPreflight: prev }))
    expect(out).toContain('"schemaVersion": "2.0"')
    expect(out).toContain('"was-large"')
  })

  it('includes the required schema and instruction sections', () => {
    const out = buildPreflightPrompt(preflightInput())
    expect(out).toContain('Return ONLY valid JSON matching the requested schema.')
    expect(out).toContain('Required output schema:')
    expect(out).toContain('"reviewGroups"')
    expect(out).toContain('"riskFindings"')
    expect(out).toContain('Rules:')
    expect(out).toContain('Return strict JSON only.')
  })
})

describe('buildAiReviewPrompt', () => {
  it('returns a string', () => {
    expect(typeof buildAiReviewPrompt(reviewInput())).toBe('string')
  })

  it('interpolates PR metadata and preflight context inputs', () => {
    const out = buildAiReviewPrompt(reviewInput())
    expect(out).toContain('Repository: acme/widgets')
    expect(out).toContain('PR number: 4242')
    expect(out).toContain('Commit IDs analysed: c1, c2')
    expect(out).toContain('PREFLIGHT_SUMMARY_MARKER')
    expect(out).toContain('REVIEW_GROUPS_MARKER')
    expect(out).toContain('RISK_FINDINGS_MARKER')
    expect(out).toContain('DIFF_CONTEXT_MARKER')
  })

  it("uses 'None provided' when userNotes is null", () => {
    const out = buildAiReviewPrompt(reviewInput({ userNotes: null }))
    expect(out).toContain('User reviewer notes:\nNone provided')
  })

  it("uses 'None provided' when userNotes is whitespace only", () => {
    const out = buildAiReviewPrompt(reviewInput({ userNotes: '   ' }))
    expect(out).toContain('None provided')
  })

  it('includes the actual user notes when provided', () => {
    const out = buildAiReviewPrompt(reviewInput({ userNotes: 'Watch the auth path' }))
    expect(out).toContain('User reviewer notes:\nWatch the auth path')
    expect(out).not.toContain('None provided')
  })

  it('includes the required markdown structure headers and instructions', () => {
    const out = buildAiReviewPrompt(reviewInput())
    expect(out).toContain('Return markdown only.')
    expect(out).toContain('# Review Summary')
    expect(out).toContain('# Findings')
    expect(out).toContain('# Final Recommendation')
    expect(out).toContain('Instructions:')
  })
})

describe('buildJsonRepairPrompt', () => {
  it('returns a string', () => {
    expect(typeof buildJsonRepairPrompt('{bad}', 'SCHEMA')).toBe('string')
  })

  it('embeds the raw output and schema hint', () => {
    const out = buildJsonRepairPrompt('RAW_OUTPUT_MARKER', 'SCHEMA_HINT_MARKER')
    expect(out).toContain('RAW_OUTPUT_MARKER')
    expect(out).toContain('SCHEMA_HINT_MARKER')
  })

  it('includes the strict-JSON repair requirements', () => {
    const out = buildJsonRepairPrompt('x', 'y')
    expect(out).toContain('Return ONLY corrected, strict JSON.')
    expect(out).toContain('Do NOT wrap the JSON in backticks or code fences.')
    expect(out).toContain('Remove any trailing commas.')
    expect(out).toContain('Return only the corrected JSON document.')
  })
})
