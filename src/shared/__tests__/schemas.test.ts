import { describe, it, expect } from 'vitest'
import { PreflightAnalysisSchema, SubmitDraftParamsSchema } from '../schemas'

const validPreflight = {
  schemaVersion: '2.0',
  pr: {
    provider: 'github',
    repoFullName: 'owner/repo',
    pullRequestNumber: 8961,
    title: 'Add developer instructions',
    baseBranch: 'main',
    headBranch: 'feature',
    baseSha: 'abc',
    headSha: 'def',
    analysedCommitIds: ['c1', 'c2']
  },
  summary: {
    shortTitle: 'DeveloperInstructions',
    overview: 'Adds a new builder.',
    estimatedReviewComplexity: 'medium',
    suggestedReviewStrategy: 'Start with the contract.',
    totalFiles: 10,
    totalAdditions: 237,
    totalDeletions: 28
  },
  reviewGroups: [
    {
      order: 1,
      title: 'New DeveloperInstructions Builder',
      explanation: 'What changed.',
      readExplanation: 'Fuller explanation.',
      priority: 'high',
      category: 'business_logic',
      stats: { fileCount: 1, additions: 120, deletions: 20 },
      files: [
        {
          order: 1,
          fileReference: 'src/x.rs:42',
          path: 'src/x.rs',
          title: 'Builder',
          details: 'Adds builder.',
          reasonForPosition: 'Core change.',
          priority: 'high',
          status: 'added'
        }
      ]
    }
  ],
  riskFindings: [
    {
      title: 'Permissions not updated on cwd change',
      type: 'bug',
      severity: 'high',
      details: 'Detail.',
      confidence: 'medium'
    }
  ]
}

describe('PreflightAnalysisSchema', () => {
  it('accepts a valid analysis', () => {
    const r = PreflightAnalysisSchema.safeParse(validPreflight)
    expect(r.success).toBe(true)
  })

  it('rejects wrong schemaVersion', () => {
    const r = PreflightAnalysisSchema.safeParse({ ...validPreflight, schemaVersion: '1.0' })
    expect(r.success).toBe(false)
  })

  it('rejects an invalid risk type', () => {
    const bad = { ...validPreflight, riskFindings: [{ ...validPreflight.riskFindings[0], type: 'nit' }] }
    expect(PreflightAnalysisSchema.safeParse(bad).success).toBe(false)
  })
})

describe('SubmitDraftParamsSchema', () => {
  it('defaults are optional and validates event enum', () => {
    const ok = SubmitDraftParamsSchema.safeParse({
      draftId: 'd1',
      ref: { accountId: 'a', repoId: 'r', owner: 'o', repo: 'x', number: 1 },
      event: 'COMMENT'
    })
    expect(ok.success).toBe(true)
    const bad = SubmitDraftParamsSchema.safeParse({
      draftId: 'd1',
      ref: { accountId: 'a', repoId: 'r', owner: 'o', repo: 'x', number: 1 },
      event: 'MERGE'
    })
    expect(bad.success).toBe(false)
  })
})
