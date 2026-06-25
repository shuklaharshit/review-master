import { z } from 'zod'

// ============================================================================
// Preflight analysis schema (spec §14.5) — schemaVersion 2.0
// ============================================================================

export const PreflightAnalysisSchema = z.object({
  schemaVersion: z.literal('2.0'),
  pr: z.object({
    provider: z.literal('github'),
    repoFullName: z.string(),
    pullRequestNumber: z.number(),
    title: z.string(),
    baseBranch: z.string(),
    headBranch: z.string(),
    baseSha: z.string(),
    headSha: z.string(),
    analysedCommitIds: z.array(z.string())
  }),
  summary: z.object({
    shortTitle: z.string(),
    overview: z.string(),
    estimatedReviewComplexity: z.enum(['low', 'medium', 'high', 'very_high']),
    suggestedReviewStrategy: z.string(),
    totalFiles: z.number(),
    totalAdditions: z.number(),
    totalDeletions: z.number()
  }),
  reviewGroups: z.array(
    z.object({
      order: z.number(),
      title: z.string(),
      shortLabel: z.string().optional(),
      explanation: z.string(),
      readExplanation: z.string(),
      priority: z.enum(['low', 'medium', 'high', 'critical']),
      category: z.enum([
        'entry_point',
        'api_contract',
        'business_logic',
        'data_model',
        'database_migration',
        'ui',
        'state_management',
        'integration',
        'configuration',
        'test',
        'documentation',
        'build_tooling',
        'security',
        'performance',
        'workflow',
        'other'
      ]),
      stats: z.object({
        fileCount: z.number(),
        additions: z.number(),
        deletions: z.number()
      }),
      files: z.array(
        z.object({
          order: z.number(),
          fileReference: z.string(),
          path: z.string(),
          oldPath: z.string().optional(),
          title: z.string(),
          details: z.string(),
          reasonForPosition: z.string(),
          priority: z.enum(['low', 'medium', 'high', 'critical']),
          status: z.enum(['added', 'modified', 'removed', 'renamed', 'copied', 'binary']),
          additions: z.number().optional(),
          deletions: z.number().optional(),
          relatedFiles: z.array(z.string()).optional()
        })
      )
    })
  ),
  riskFindings: z.array(
    z.object({
      title: z.string(),
      type: z.enum([
        'bug',
        'security',
        'regression',
        'performance',
        'maintainability',
        'test_gap',
        'data_loss',
        'api_contract',
        'accessibility',
        'configuration',
        'deployment',
        'concurrency',
        'compatibility',
        'migration',
        'dependency',
        'other'
      ]),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      details: z.string(),
      fileReferences: z.array(z.string()).optional(),
      confidence: z.enum(['low', 'medium', 'high']),
      relatedGroupOrders: z.array(z.number()).optional()
    })
  ),
  assumptions: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional()
})

export type PreflightAnalysisParsed = z.infer<typeof PreflightAnalysisSchema>

// ============================================================================
// IPC input validators (spec §7 — validate all IPC inputs with Zod in main)
// ============================================================================

const ReasoningEffortSchema = z.enum(['low', 'medium', 'high', 'xhigh'])
const GitProviderIdSchema = z.enum(['github', 'gitlab', 'bitbucket'])

export const PullRequestRefSchema = z.object({
  accountId: z.string().min(1),
  repoId: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive()
})

export const ListRepositoriesParamsSchema = z.object({
  accountId: z.string().min(1),
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().max(100).optional(),
  sort: z.enum(['updated', 'pushed', 'full_name']).optional()
})

export const SearchRepositoriesParamsSchema = z.object({
  accountId: z.string().min(1),
  query: z.string(),
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().max(100).optional()
})

export const ListPullRequestsParamsSchema = z.object({
  accountId: z.string().min(1),
  repoId: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  filter: z.enum(['open', 'closed', 'merged', 'all']).optional(),
  query: z.string().optional(),
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().max(100).optional()
})

export const RunPreflightParamsSchema = z.object({
  ref: PullRequestRefSchema,
  pullRequestId: z.string().min(1),
  snapshotId: z.string().min(1),
  force: z.boolean().optional()
})

export const GenerateReviewParamsSchema = z.object({
  ref: PullRequestRefSchema,
  pullRequestId: z.string().min(1),
  snapshotId: z.string().min(1),
  preflightAnalysisId: z.string().optional(),
  userNotes: z.string().max(8000).optional()
})

export const SaveDraftParamsSchema = z.object({
  draftId: z.string().min(1),
  markdown: z.string()
})

export const SubmitDraftParamsSchema = z.object({
  draftId: z.string().min(1),
  ref: PullRequestRefSchema,
  event: z.enum(['COMMENT', 'REQUEST_CHANGES', 'APPROVE']).optional()
})

export const AppSettingsPatchSchema = z
  .object({
    defaultPreflightModel: z.string(),
    defaultPreflightReasoningEffort: ReasoningEffortSchema,
    defaultReviewModel: z.string(),
    defaultReviewReasoningEffort: ReasoningEffortSchema,
    codexBinaryMode: z.enum(['auto', 'custom']),
    codexBinaryPath: z.string().optional(),
    autoCheckUpdates: z.boolean(),
    activeAccountId: z.string().optional(),
    devMode: z.boolean().optional()
  })
  .partial()

export const StartAddAccountSchema = z.object({ providerId: GitProviderIdSchema })
export const RemoveAccountSchema = z.object({
  accountId: z.string().min(1),
  options: z.object({ removeCachedData: z.boolean().optional() }).optional()
})
export const SetActiveAccountSchema = z.object({ accountId: z.string().min(1) })
export const HasInstallationsSchema = z.object({ accountId: z.string().min(1) })
export const CancelFlowSchema = z.object({ flowId: z.string().min(1) })
export const OpenExternalSchema = z.object({ url: z.string().url() })
export const CancelTaskSchema = z.object({ taskId: z.string().min(1) })
