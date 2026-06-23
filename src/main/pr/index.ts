// PR services layer — orchestration for diff building, preflight, review
// generation, and submission.

export { parseUnifiedDiff, parseGitHubPatch, detectLanguage, isGeneratedPath } from './diffParser'
export { buildDiffContext } from './diffContext'
export type { DiffContextResult } from './diffContext'
export { RepoCacheService } from './RepoCacheService'
export { PullRequestContextService, computeFilesHash } from './PullRequestContextService'
export { PreflightAnalysisService } from './PreflightAnalysisService'
export { AiReviewService } from './AiReviewService'
export { ReviewSubmissionService } from './ReviewSubmissionService'

export type {
  GetSettings,
  RepoIdentity,
  PullRequestContextDeps,
  PreflightServiceDeps,
  AiReviewServiceDeps,
  ReviewSubmissionDeps,
  RepoCacheDeps
} from './prTypes'

export { buildPreflightPrompt } from '../codex/prompts/preflightPrompt'
export type { PreflightPromptInput } from '../codex/prompts/preflightPrompt'
export { buildAiReviewPrompt } from '../codex/prompts/reviewPrompt'
export type { AiReviewPromptInput } from '../codex/prompts/reviewPrompt'
export { buildJsonRepairPrompt } from '../codex/prompts/jsonRepairPrompt'
