import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  GenerateReviewParams,
  PreflightAnalysis,
  PreflightRecord,
  PullRequestRef,
  ReviewDraft,
  SaveDraftParams,
  TaskHandle
} from '../../shared/types'
import type { CodexRuntime, EventBus, TaskManager } from '../contracts'
import type { Database } from '../db/types'
import type { GitProvider } from '../providers/GitProvider'
import type { SafePaths } from '../security/safePaths'
import {
  DRAFT_AUTOSAVE_CHAR_THRESHOLD,
  DRAFT_AUTOSAVE_INTERVAL_MS,
  REVIEW_PHASES
} from '../../shared/constants'
import { newId } from '../../shared/ids'
import { nowIso } from '../../shared/dates'
import { logger } from '../app/Logger'
import { buildAiReviewPrompt } from '../codex/prompts/reviewPrompt'
import { buildDiffContext } from './diffContext'
import type { AiReviewServiceDeps } from './prTypes'
import type { RepoCacheService } from './RepoCacheService'
import { PullRequestContextService } from './PullRequestContextService'

export class AiReviewService {
  private readonly log = logger.scope('ai-review')
  private readonly db: Database
  private readonly provider: GitProvider
  private readonly repoCache: RepoCacheService
  private readonly codex: CodexRuntime
  private readonly events: EventBus
  private readonly tasks: TaskManager
  private readonly safePaths: SafePaths
  private readonly getSettings: AiReviewServiceDeps['getSettings']
  private readonly context: PullRequestContextService

  constructor(deps: AiReviewServiceDeps) {
    this.db = deps.db
    this.provider = deps.provider
    this.repoCache = deps.repoCache
    this.codex = deps.codex
    this.events = deps.events
    this.tasks = deps.tasks
    this.safePaths = deps.safePaths
    this.getSettings = deps.getSettings
    this.context = new PullRequestContextService({
      db: deps.db,
      provider: deps.provider,
      repoCache: deps.repoCache
    })
  }

  /** Kicks off review generation; returns a TaskHandle synchronously. */
  run(params: GenerateReviewParams): TaskHandle {
    const taskId = newId('task')
    const handle: TaskHandle = { taskId, kind: 'review' }
    void this.execute(taskId, params)
    return handle
  }

  /** Returns the latest draft for a PR (by repo + number resolution). */
  getDraft(ref: PullRequestRef): ReviewDraft | null {
    const pr = this.db.pullRequests.getByNumber(ref.repoId, ref.number)
    if (!pr) return null
    return this.db.drafts.latestForPr(pr.id)
  }

  /** Saves edited draft markdown: persists to DB + file, emits draft.saved. */
  async saveDraft(params: SaveDraftParams): Promise<ReviewDraft | null> {
    const updatedAt = nowIso()
    const updated = this.db.drafts.update(params.draftId, {
      markdown: params.markdown,
      updatedAt
    })
    if (!updated) return null
    this.writeDraftFile(updated.pullRequestId, updated.snapshotId, params.markdown)
    this.events.emit({ type: 'draft.saved', draftId: params.draftId, updatedAt })
    return updated
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  private async execute(taskId: string, params: GenerateReviewParams): Promise<void> {
    const controller = this.tasks.create(taskId)
    const signal = controller.signal
    const settings = this.getSettings()
    let draftId: string | null = null
    let phaseIndex = 0
    let accumulated = ''
    let lastSaveAt = Date.now()
    let charsSinceSave = 0

    const phase = (label: string): void => {
      this.events.emit({
        type: 'task.phase',
        taskId,
        kind: 'review',
        phase: label,
        phaseIndex: phaseIndex++,
        phaseCount: REVIEW_PHASES.length
      })
    }

    try {
      // Create the running draft up front.
      const draft: ReviewDraft = {
        id: newId('draft'),
        pullRequestId: params.pullRequestId,
        snapshotId: params.snapshotId,
        preflightAnalysisId: params.preflightAnalysisId,
        model: settings.defaultReviewModel,
        reasoningEffort: settings.defaultReviewReasoningEffort,
        userNotes: params.userNotes,
        markdown: '',
        status: 'running',
        createdAt: nowIso(),
        updatedAt: nowIso()
      }
      this.db.drafts.create(draft)
      draftId = draft.id

      // Phase 1: load PR context + diff.
      phase(REVIEW_PHASES[0]) // Loading PR context
      const context = await this.provider.fetchReviewContext(params.ref)
      this.throwIfAborted(signal)
      const diff = await this.context.buildDiff(params.ref, context, context.pr)
      const diffContext = buildDiffContext(diff)

      // Phase 2: load preflight analysis.
      phase(REVIEW_PHASES[1]) // Loading preflight analysis
      const analysis = this.loadAnalysis(params)

      // Phase 3: build prompt.
      phase(REVIEW_PHASES[2]) // Preparing review prompt
      const prompt = buildAiReviewPrompt({
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
        commitIds: context.commits.map((c) => c.sha),
        userNotes: params.userNotes ?? null,
        preflightSummary: this.serialiseSummary(analysis),
        reviewGroups: this.serialiseReviewGroups(analysis),
        riskFindings: this.serialiseRiskFindings(analysis),
        diffContext: diffContext.text
      })

      // Phase 4: generate with streaming + throttled local saving.
      phase(REVIEW_PHASES[3]) // Generating review with Codex
      const flush = (force: boolean): void => {
        if (!draftId) return
        const now = Date.now()
        const due =
          force || charsSinceSave >= DRAFT_AUTOSAVE_CHAR_THRESHOLD || now - lastSaveAt >= DRAFT_AUTOSAVE_INTERVAL_MS
        if (!due) return
        this.db.drafts.update(draftId, { markdown: accumulated, updatedAt: nowIso() })
        this.writeDraftFile(params.pullRequestId, params.snapshotId, accumulated)
        lastSaveAt = now
        charsSinceSave = 0
      }

      const result = await this.codex.runTask({
        taskId,
        model: settings.defaultReviewModel,
        reasoningEffort: settings.defaultReviewReasoningEffort,
        prompt,
        signal,
        onActivity: (message) => this.events.emit({ type: 'task.log', taskId, kind: 'review', message }),
        onDelta: (text) => {
          accumulated += text
          charsSinceSave += text.length
          this.events.emit({ type: 'task.content.delta', taskId, kind: 'review', text })
          flush(false)
        }
      })

      if (result.interrupted) {
        this.finalisePartial(taskId, draftId, accumulated || result.text, 'interrupted', params)
        this.events.emit({ type: 'task.interrupted', taskId, kind: 'review' })
        return
      }
      this.throwIfAborted(signal)

      const finalMarkdown = result.text || accumulated

      // Phase 5: save final draft locally.
      phase(REVIEW_PHASES[4]) // Saving draft locally
      this.db.drafts.update(draftId, {
        markdown: finalMarkdown,
        status: 'draft',
        updatedAt: nowIso()
      })
      this.writeDraftFile(params.pullRequestId, params.snapshotId, finalMarkdown)

      // Phase 6: open editor (signalled to renderer via completion).
      phase(REVIEW_PHASES[5]) // Opening editor
      this.events.emit({ type: 'task.completed', taskId, kind: 'review', resultId: draftId })
    } catch (error) {
      if (this.isAbort(error, signal)) {
        this.finalisePartial(taskId, draftId, accumulated, 'interrupted', params)
        this.events.emit({ type: 'task.interrupted', taskId, kind: 'review' })
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      this.log.error('review generation failed', { taskId, error: message })
      this.finalisePartial(taskId, draftId, accumulated, 'failed', params)
      this.events.emit({
        type: 'task.failed',
        taskId,
        kind: 'review',
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

  private finalisePartial(
    taskId: string,
    draftId: string | null,
    markdown: string,
    status: ReviewDraft['status'],
    params: GenerateReviewParams
  ): void {
    if (!draftId) return
    this.db.drafts.update(draftId, { markdown, status, updatedAt: nowIso() })
    if (markdown) this.writeDraftFile(params.pullRequestId, params.snapshotId, markdown)
  }

  private loadAnalysis(params: GenerateReviewParams): PreflightAnalysis | null {
    let record: PreflightRecord | null = null
    if (params.preflightAnalysisId) {
      record = this.db.preflight.getById(params.preflightAnalysisId)
    }
    if (!record) {
      record = this.db.preflight.findCompletedForSnapshot(params.snapshotId)
    }
    return record?.analysis ?? null
  }

  private serialiseSummary(analysis: PreflightAnalysis | null): string {
    if (!analysis) return 'No preflight analysis available.'
    const s = analysis.summary
    return [
      `Title: ${s.shortTitle}`,
      `Overview: ${s.overview}`,
      `Estimated complexity: ${s.estimatedReviewComplexity}`,
      `Suggested strategy: ${s.suggestedReviewStrategy}`,
      `Totals: ${s.totalFiles} files, +${s.totalAdditions} -${s.totalDeletions}`
    ].join('\n')
  }

  private serialiseReviewGroups(analysis: PreflightAnalysis | null): string {
    if (!analysis || analysis.reviewGroups.length === 0) return 'None.'
    return analysis.reviewGroups
      .map((g) => {
        const files = g.files
          .map((f) => `    - ${f.path} [${f.status}] (${f.priority}): ${f.title}`)
          .join('\n')
        return `${g.order}. ${g.title} [${g.priority}/${g.category}] (${g.stats.fileCount} files, +${g.stats.additions} -${g.stats.deletions})\n  ${g.explanation}\n${files}`
      })
      .join('\n\n')
  }

  private serialiseRiskFindings(analysis: PreflightAnalysis | null): string {
    if (!analysis || analysis.riskFindings.length === 0) return 'None.'
    return analysis.riskFindings
      .map((r) => {
        const refs = r.fileReferences && r.fileReferences.length > 0 ? ` (${r.fileReferences.join(', ')})` : ''
        return `- [${r.severity}/${r.type}, confidence ${r.confidence}] ${r.title}${refs}: ${r.details}`
      })
      .join('\n')
  }

  /** Writes the draft markdown to <generatedReviewsDir>/<prId>__<snapshotId>.md. */
  private writeDraftFile(pullRequestId: string, snapshotId: string, markdown: string): void {
    try {
      const dir = this.safePaths.generatedReviewsDir()
      mkdirSync(dir, { recursive: true })
      const safeName = `${this.sanitise(pullRequestId)}__${this.sanitise(snapshotId)}.md`
      const filePath = path.join(dir, safeName)
      this.safePaths.assertInside(dir, filePath)
      writeFileSync(filePath, markdown, 'utf8')
    } catch (error) {
      this.log.warn('failed to persist draft markdown file', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private sanitise(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  private isAbort(error: unknown, signal: AbortSignal): boolean {
    if (signal.aborted) return true
    return error instanceof Error && error.name === 'AbortError'
  }
}
