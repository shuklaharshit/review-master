import type {
  PreflightAnalysis,
  PreflightRecord,
  RunPreflightParams,
  TaskHandle
} from '../../shared/types'
import type { CodexRuntime, EventBus, TaskManager } from '../contracts'
import type { Database } from '../db/types'
import type { GitProvider } from '../providers/GitProvider'
import { PreflightAnalysisSchema } from '../../shared/schemas'
import { PREFLIGHT_PHASES } from '../../shared/constants'
import { newId } from '../../shared/ids'
import { nowIso } from '../../shared/dates'
import { logger } from '../app/Logger'
import { buildPreflightPrompt } from '../codex/prompts/preflightPrompt'
import { buildJsonRepairPrompt } from '../codex/prompts/jsonRepairPrompt'
import { buildDiffContext } from './diffContext'
import type { PreflightServiceDeps } from './prTypes'
import type { RepoCacheService } from './RepoCacheService'
import { PullRequestContextService } from './PullRequestContextService'

const PREFLIGHT_SCHEMA_HINT = `{
  "schemaVersion": "2.0",
  "pr": { "provider": "github", "repoFullName": string, "pullRequestNumber": number, "title": string, "baseBranch": string, "headBranch": string, "baseSha": string, "headSha": string, "analysedCommitIds": string[] },
  "summary": { "shortTitle": string, "overview": string, "estimatedReviewComplexity": "low|medium|high|very_high", "suggestedReviewStrategy": string, "totalFiles": number, "totalAdditions": number, "totalDeletions": number },
  "reviewGroups": [ { "order": number, "title": string, "shortLabel"?: string, "explanation": string, "readExplanation": string, "priority": "low|medium|high|critical", "category": "entry_point|api_contract|business_logic|data_model|database_migration|ui|state_management|integration|configuration|test|documentation|build_tooling|security|performance|workflow|other", "stats": { "fileCount": number, "additions": number, "deletions": number }, "files": [ { "order": number, "fileReference": string, "path": string, "oldPath"?: string, "title": string, "details": string, "reasonForPosition": string, "priority": "low|medium|high|critical", "status": "added|modified|removed|renamed|copied|binary", "additions"?: number, "deletions"?: number, "relatedFiles"?: string[] } ] } ],
  "riskFindings": [ { "title": string, "type": "bug|security|regression|performance|maintainability|test_gap|data_loss|api_contract|accessibility|configuration|deployment|concurrency|compatibility|migration|dependency|other", "severity": "low|medium|high|critical", "details": string, "fileReferences"?: string[], "confidence": "low|medium|high", "relatedGroupOrders"?: number[] } ],
  "assumptions"?: string[],
  "warnings"?: string[]
}`

export class PreflightAnalysisService {
  private readonly log = logger.scope('preflight')
  private readonly db: Database
  private readonly provider: GitProvider
  private readonly repoCache: RepoCacheService
  private readonly codex: CodexRuntime
  private readonly events: EventBus
  private readonly tasks: TaskManager
  private readonly getSettings: PreflightServiceDeps['getSettings']
  private readonly context: PullRequestContextService

  constructor(deps: PreflightServiceDeps) {
    this.db = deps.db
    this.provider = deps.provider
    this.repoCache = deps.repoCache
    this.codex = deps.codex
    this.events = deps.events
    this.tasks = deps.tasks
    this.getSettings = deps.getSettings
    this.context = new PullRequestContextService({
      db: deps.db,
      provider: deps.provider,
      repoCache: deps.repoCache
    })
  }

  /** Kicks off preflight analysis; returns a TaskHandle synchronously. */
  run(params: RunPreflightParams): TaskHandle {
    const taskId = newId('task')
    const handle: TaskHandle = { taskId, kind: 'preflight' }
    void this.execute(taskId, params)
    return handle
  }

  private async execute(taskId: string, params: RunPreflightParams): Promise<void> {
    const controller = this.tasks.create(taskId)
    const signal = controller.signal
    const settings = this.getSettings()
    let recordId: string | null = null
    let phaseIndex = 0

    const phase = (label: string): void => {
      this.events.emit({
        type: 'task.phase',
        taskId,
        kind: 'preflight',
        phase: label,
        phaseIndex: phaseIndex++,
        phaseCount: PREFLIGHT_PHASES.length
      })
    }

    try {
      // Create the running record up front so the UI can reflect state.
      const record: PreflightRecord = {
        id: newId('pf'),
        pullRequestId: params.pullRequestId,
        snapshotId: params.snapshotId,
        model: settings.defaultPreflightModel,
        reasoningEffort: settings.defaultPreflightReasoningEffort,
        status: 'running',
        analysis: null,
        rawOutput: null,
        errorMessage: null,
        createdAt: nowIso(),
        completedAt: null
      }
      this.db.preflight.create(record)
      recordId = record.id

      // Phase 1-3: gather context + build diff.
      phase(PREFLIGHT_PHASES[0]) // Syncing PR metadata
      const context = await this.provider.fetchReviewContext(params.ref)
      this.throwIfAborted(signal)

      phase(PREFLIGHT_PHASES[1]) // Fetching commits
      const commitIds = context.commits.map((c) => c.sha)

      phase(PREFLIGHT_PHASES[2]) // Building diff context
      const diff = await this.context.buildDiff(params.ref, context, context.pr)
      const diffContext = buildDiffContext(diff)
      this.throwIfAborted(signal)

      // Phase 4: build prompt (include previous completed preflight if any).
      phase(PREFLIGHT_PHASES[3]) // Preparing Codex prompt
      const previousPreflight = this.loadPreviousAnalysis(params)
      const prompt = buildPreflightPrompt({
        provider: this.provider.id,
        repoFullName: `${params.ref.owner}/${params.ref.repo}`,
        pullRequestNumber: context.pr.number,
        title: context.pr.title,
        body: context.pr.body ?? '',
        author: context.pr.author?.login ?? 'unknown',
        baseBranch: context.pr.baseBranch,
        headBranch: context.pr.headBranch,
        baseSha: context.pr.baseSha,
        headSha: context.pr.headSha,
        commitIds,
        previousPreflight,
        diffContext: diffContext.text
      })

      // Phase 5: run Codex.
      phase(PREFLIGHT_PHASES[4]) // Running preflight analysis
      const result = await this.codex.runTask({
        taskId,
        model: settings.defaultPreflightModel,
        reasoningEffort: settings.defaultPreflightReasoningEffort,
        prompt,
        signal
      })
      if (result.interrupted) {
        this.handleInterrupted(taskId, recordId, result.text)
        return
      }
      this.throwIfAborted(signal)

      // Phase 6: validate JSON, with one repair pass.
      phase(PREFLIGHT_PHASES[5]) // Validating JSON output
      let analysis = this.tryParseAnalysis(result.text)
      let rawOutput = result.text
      if (!analysis) {
        this.log.warn('preflight JSON invalid, attempting repair pass', { taskId })
        const repair = await this.codex.runTask({
          taskId,
          model: settings.defaultPreflightModel,
          reasoningEffort: settings.defaultPreflightReasoningEffort,
          prompt: buildJsonRepairPrompt(result.text, PREFLIGHT_SCHEMA_HINT),
          signal
        })
        if (repair.interrupted) {
          this.handleInterrupted(taskId, recordId, repair.text || rawOutput)
          return
        }
        rawOutput = repair.text
        analysis = this.tryParseAnalysis(repair.text)
      }

      if (!analysis) {
        // Still invalid: keep raw output, mark failed (spec §14.8).
        this.db.preflight.update(recordId, {
          status: 'failed',
          rawOutput,
          errorMessage: 'Codex did not return valid preflight JSON after a repair attempt.',
          completedAt: nowIso()
        })
        this.events.emit({
          type: 'task.failed',
          taskId,
          kind: 'preflight',
          message: 'Preflight analysis returned invalid JSON.',
          recoverable: true
        })
        return
      }

      // Phase 7: persist + mark completed.
      phase(PREFLIGHT_PHASES[6]) // Saving locally
      this.db.preflight.update(recordId, {
        status: 'completed',
        analysis,
        rawOutput,
        errorMessage: null,
        completedAt: nowIso()
      })
      this.db.preflight.markStaleForPrExcept(params.pullRequestId, params.snapshotId)

      this.events.emit({
        type: 'task.completed',
        taskId,
        kind: 'preflight',
        resultId: recordId
      })
    } catch (error) {
      if (this.isAbort(error, signal)) {
        this.handleInterrupted(taskId, recordId, null)
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      this.log.error('preflight failed', { taskId, error: message })
      if (recordId) {
        this.db.preflight.update(recordId, {
          status: 'failed',
          errorMessage: message,
          completedAt: nowIso()
        })
      }
      this.events.emit({
        type: 'task.failed',
        taskId,
        kind: 'preflight',
        message,
        recoverable: true
      })
    } finally {
      this.tasks.done(taskId)
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private loadPreviousAnalysis(params: RunPreflightParams): PreflightAnalysis | null {
    const latest = this.db.preflight.latestForPr(params.pullRequestId)
    if (latest && latest.status === 'completed' && latest.analysis) {
      return latest.analysis
    }
    return null
  }

  private tryParseAnalysis(text: string): PreflightAnalysis | null {
    const json = this.extractJson(text)
    if (json === null) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return null
    }
    const result = PreflightAnalysisSchema.safeParse(parsed)
    if (!result.success) return null
    return result.data as PreflightAnalysis
  }

  /**
   * Extracts the JSON document from raw Codex output. Tolerates accidental
   * code fences by stripping them, then trims to the outermost braces.
   */
  private extractJson(text: string): string | null {
    if (!text) return null
    let cleaned = text.trim()
    const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(cleaned)
    if (fence) cleaned = fence[1].trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end < 0 || end <= start) return null
    return cleaned.slice(start, end + 1)
  }

  private handleInterrupted(taskId: string, recordId: string | null, raw: string | null): void {
    if (recordId) {
      this.db.preflight.update(recordId, {
        status: 'interrupted',
        rawOutput: raw,
        completedAt: nowIso()
      })
    }
    this.events.emit({ type: 'task.interrupted', taskId, kind: 'preflight' })
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
  }

  private isAbort(error: unknown, signal: AbortSignal): boolean {
    if (signal.aborted) return true
    return error instanceof Error && error.name === 'AbortError'
  }
}
