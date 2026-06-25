import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PreflightAnalysisService } from '../PreflightAnalysisService'
import { TaskRegistry } from '../../app/TaskRegistry'
import type { Database } from '../../db/types'
import type { GitProvider } from '../../providers/GitProvider'
import type { CodexRuntime, CodexRunOptions, CodexRunResult, EventBus } from '../../contracts'
import type { RepoCacheService } from '../RepoCacheService'
import type {
  AppEvent,
  AppSettings,
  NormalizedDiff,
  PreflightAnalysis,
  PreflightRecord,
  ReviewContext,
  RunPreflightParams
} from '../../../shared/types'

// ---------------------------------------------------------------------------
// PreflightAnalysisService kicks off fire-and-forget async work. We drive it by
// awaiting a terminal EventBus event (task.completed / .failed / .interrupted).
// ---------------------------------------------------------------------------

const params: RunPreflightParams = {
  ref: { accountId: 'acct1', repoId: 'repo1', owner: 'acme', repo: 'review-master', number: 42 },
  pullRequestId: 'pr1',
  snapshotId: 'snap1'
}

const settings: AppSettings = {
  defaultPreflightModel: 'gpt-5.4',
  defaultPreflightReasoningEffort: 'medium',
  defaultReviewModel: 'gpt-5.4',
  defaultReviewReasoningEffort: 'medium',
  codexBinaryMode: 'auto',
  autoCheckUpdates: true
}

const emptyDiff: NormalizedDiff = {
  files: [],
  source: 'git',
  totalAdditions: 0,
  totalDeletions: 0
}

const reviewContext: ReviewContext = {
  pr: {
    id: 'pr1',
    providerId: 'github',
    accountId: 'acct1',
    repoId: 'repo1',
    providerPrId: 'gh-42',
    number: 42,
    title: 'Add feature',
    body: 'body',
    state: 'open',
    baseBranch: 'main',
    headBranch: 'feature',
    baseSha: 'base',
    headSha: 'head'
  },
  commits: [{ sha: 'c1', message: 'first' }],
  files: [],
  checks: [],
  reviews: [],
  labels: [],
  assignees: [],
  requestedReviewers: []
}

function validAnalysis(): PreflightAnalysis {
  return {
    schemaVersion: '2.0',
    pr: {
      provider: 'github',
      repoFullName: 'acme/review-master',
      pullRequestNumber: 42,
      title: 'Add feature',
      baseBranch: 'main',
      headBranch: 'feature',
      baseSha: 'base',
      headSha: 'head',
      analysedCommitIds: ['c1']
    },
    summary: {
      shortTitle: 'Feature',
      overview: 'Adds a feature.',
      estimatedReviewComplexity: 'low',
      suggestedReviewStrategy: 'Read top-down.',
      totalFiles: 1,
      totalAdditions: 10,
      totalDeletions: 2
    },
    reviewGroups: [],
    riskFindings: []
  }
}

interface Fakes {
  service: PreflightAnalysisService
  events: EventBus
  received: AppEvent[]
  preflightCreate: ReturnType<typeof vi.fn>
  preflightUpdate: ReturnType<typeof vi.fn>
  markStaleForPrExcept: ReturnType<typeof vi.fn>
  latestForPr: ReturnType<typeof vi.fn>
  runTask: ReturnType<typeof vi.fn>
  fetchReviewContext: ReturnType<typeof vi.fn>
  tasks: TaskRegistry
}

function buildFakes(
  runTaskImpl: (opts: CodexRunOptions) => Promise<CodexRunResult>,
  opts: { latestRecord?: PreflightRecord | null } = {}
): Fakes {
  const received: AppEvent[] = []
  const events: EventBus = { emit: (e) => received.push(e) }

  const preflightCreate = vi.fn().mockImplementation((r: PreflightRecord) => r)
  const preflightUpdate = vi.fn().mockImplementation((id: string, patch: Partial<PreflightRecord>) => ({ id, ...patch }))
  const markStaleForPrExcept = vi.fn()
  const latestForPr = vi.fn().mockReturnValue(opts.latestRecord ?? null)

  const db = {
    preflight: {
      create: preflightCreate,
      update: preflightUpdate,
      markStaleForPrExcept,
      latestForPr
    },
    // resolveRepoIdentity reads repos.getById; return null cloneUrl -> API fallback
    repos: { getById: vi.fn().mockReturnValue(null) }
  } as unknown as Database

  const fetchReviewContext = vi.fn().mockResolvedValue(reviewContext)
  const provider = {
    id: 'github',
    fetchReviewContext
  } as unknown as GitProvider

  // repoCache.buildDiff returns a diff so we never touch parseGitHubPatch.
  const repoCache = {
    buildDiff: vi.fn().mockResolvedValue(emptyDiff)
  } as unknown as RepoCacheService

  const runTask = vi.fn().mockImplementation(runTaskImpl)
  const codex = { runTask } as unknown as CodexRuntime

  const tasks = new TaskRegistry()

  const service = new PreflightAnalysisService({
    db,
    provider,
    repoCache,
    codex,
    events,
    tasks,
    getSettings: () => settings
  })

  return {
    service,
    events,
    received,
    preflightCreate,
    preflightUpdate,
    markStaleForPrExcept,
    latestForPr,
    runTask,
    fetchReviewContext,
    tasks
  }
}

/** Resolves when a terminal task event is emitted into `received`. */
function waitForTerminal(received: AppEvent[]): Promise<AppEvent> {
  const terminal = (e: AppEvent): boolean =>
    e.type === 'task.completed' || e.type === 'task.failed' || e.type === 'task.interrupted'
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = (): void => {
      const found = received.find(terminal)
      if (found) return resolve(found)
      if (Date.now() - started > 3000) return reject(new Error('timed out waiting for terminal event'))
      setImmediate(tick)
    }
    tick()
  })
}

const completedResult = (text: string): CodexRunResult => ({ text })

describe('PreflightAnalysisService.run', () => {
  let f: Fakes

  beforeEach(() => {
    f = buildFakes(async () => completedResult(JSON.stringify(validAnalysis())))
  })

  it('returns a TaskHandle synchronously with a preflight kind', () => {
    const handle = f.service.run(params)
    expect(handle.kind).toBe('preflight')
    expect(handle.taskId).toMatch(/^task/)
  })

  it('(a) valid JSON -> record completed with parsed analysis, markStaleForPrExcept, task.completed', async () => {
    f.service.run(params)
    const terminal = await waitForTerminal(f.received)

    expect(terminal.type).toBe('task.completed')

    // The running record was created up front.
    expect(f.preflightCreate).toHaveBeenCalledTimes(1)
    const created = f.preflightCreate.mock.calls[0][0] as PreflightRecord
    expect(created.status).toBe('running')
    expect(created.pullRequestId).toBe('pr1')
    expect(created.snapshotId).toBe('snap1')

    // Final update marks completed with parsed analysis.
    const completedUpdate = f.preflightUpdate.mock.calls.find((c) => c[1].status === 'completed')
    expect(completedUpdate).toBeDefined()
    const [updatedId, patch] = completedUpdate as [string, Partial<PreflightRecord>]
    expect(updatedId).toBe(created.id)
    expect(patch.analysis).toMatchObject({ schemaVersion: '2.0' })
    expect(patch.rawOutput).toContain('schemaVersion')
    expect(patch.completedAt).toBeTruthy()

    // Stale-marking called with the right pr + snapshot.
    expect(f.markStaleForPrExcept).toHaveBeenCalledWith('pr1', 'snap1')

    // Terminal event carries the record id.
    if (terminal.type === 'task.completed') {
      expect(terminal.resultId).toBe(created.id)
    }

    // Only one Codex call (no repair needed).
    expect(f.runTask).toHaveBeenCalledTimes(1)
  })

  it('(a) wires onActivity to emit task.log', async () => {
    f = buildFakes(async (opts) => {
      opts.onActivity?.('thinking...')
      return completedResult(JSON.stringify(validAnalysis()))
    })
    f.service.run(params)
    await waitForTerminal(f.received)
    const logs = f.received.filter((e) => e.type === 'task.log')
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs[0]).toMatchObject({ type: 'task.log', kind: 'preflight', message: 'thinking...' })
  })

  it('(b) invalid then valid repair -> ONE repair pass, completed', async () => {
    let call = 0
    f = buildFakes(async () => {
      call += 1
      if (call === 1) return completedResult('not json at all')
      return completedResult(JSON.stringify(validAnalysis()))
    })
    f.service.run(params)
    const terminal = await waitForTerminal(f.received)

    expect(terminal.type).toBe('task.completed')
    expect(f.runTask).toHaveBeenCalledTimes(2) // original + one repair
    const completedUpdate = f.preflightUpdate.mock.calls.find((c) => c[1].status === 'completed')
    expect(completedUpdate?.[1].analysis).toMatchObject({ schemaVersion: '2.0' })
  })

  it('(b) repair pass also wires onActivity', async () => {
    let call = 0
    f = buildFakes(async (opts) => {
      call += 1
      opts.onActivity?.(`activity-${call}`)
      if (call === 1) return completedResult('garbage')
      return completedResult(JSON.stringify(validAnalysis()))
    })
    f.service.run(params)
    await waitForTerminal(f.received)
    const logs = f.received.filter((e) => e.type === 'task.log') as Extract<AppEvent, { type: 'task.log' }>[]
    const messages = logs.map((l) => l.message)
    expect(messages).toContain('activity-1')
    expect(messages).toContain('activity-2')
  })

  it('(c) repair still invalid -> failed, RAW output preserved, task.failed', async () => {
    f = buildFakes(async () => completedResult('still not json {oops'))
    f.service.run(params)
    const terminal = await waitForTerminal(f.received)

    expect(terminal.type).toBe('task.failed')
    expect(f.runTask).toHaveBeenCalledTimes(2)

    const failedUpdate = f.preflightUpdate.mock.calls.find((c) => c[1].status === 'failed')
    expect(failedUpdate).toBeDefined()
    const patch = failedUpdate?.[1] as Partial<PreflightRecord>
    // Raw output from the (repair) attempt is preserved.
    expect(patch.rawOutput).toBe('still not json {oops')
    expect(patch.errorMessage).toMatch(/valid preflight JSON/i)
    expect(patch.analysis).toBeUndefined()

    if (terminal.type === 'task.failed') {
      expect(terminal.recoverable).toBe(true)
    }
    // markStale NOT called on failure.
    expect(f.markStaleForPrExcept).not.toHaveBeenCalled()
  })

  it('(d) Codex resolves interrupted -> record interrupted, task.interrupted', async () => {
    f = buildFakes(async () => ({ text: 'partial output', interrupted: true }))
    f.service.run(params)
    const terminal = await waitForTerminal(f.received)

    expect(terminal.type).toBe('task.interrupted')
    const interruptedUpdate = f.preflightUpdate.mock.calls.find((c) => c[1].status === 'interrupted')
    expect(interruptedUpdate).toBeDefined()
    expect(interruptedUpdate?.[1].rawOutput).toBe('partial output')
    // No repair attempted, no completion.
    expect(f.runTask).toHaveBeenCalledTimes(1)
    expect(f.markStaleForPrExcept).not.toHaveBeenCalled()
  })

  it('(d) interrupted during repair pass -> interrupted', async () => {
    let call = 0
    f = buildFakes(async () => {
      call += 1
      if (call === 1) return completedResult('garbage')
      return { text: 'repair-partial', interrupted: true }
    })
    f.service.run(params)
    const terminal = await waitForTerminal(f.received)
    expect(terminal.type).toBe('task.interrupted')
    expect(f.runTask).toHaveBeenCalledTimes(2)
    const interruptedUpdate = f.preflightUpdate.mock.calls.find((c) => c[1].status === 'interrupted')
    expect(interruptedUpdate?.[1].rawOutput).toBe('repair-partial')
  })

  it('(e) emits task.phase events across the run (all 7 phases for success)', async () => {
    f.service.run(params)
    await waitForTerminal(f.received)
    const phases = f.received.filter((e) => e.type === 'task.phase') as Extract<AppEvent, { type: 'task.phase' }>[]
    expect(phases.length).toBe(7)
    expect(phases.map((p) => p.phaseIndex)).toEqual([0, 1, 2, 3, 4, 5, 6])
    phases.forEach((p) => {
      expect(p.kind).toBe('preflight')
      expect(p.phaseCount).toBe(7)
    })
    expect(phases[0].phase).toBe('Syncing PR metadata')
    expect(phases[6].phase).toBe('Saving locally')
  })

  it('provider failure -> record failed with the error message, task.failed', async () => {
    f = buildFakes(async () => completedResult(JSON.stringify(validAnalysis())))
    ;(f.fetchReviewContext as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'))
    f.service.run(params)
    const terminal = await waitForTerminal(f.received)
    expect(terminal.type).toBe('task.failed')
    const failedUpdate = f.preflightUpdate.mock.calls.find((c) => c[1].status === 'failed')
    expect(failedUpdate?.[1].errorMessage).toBe('network down')
    expect(f.runTask).not.toHaveBeenCalled()
  })

  it('feeds a previous completed analysis into the prompt builder', async () => {
    const prev: PreflightRecord = {
      id: 'pf-prev',
      pullRequestId: 'pr1',
      snapshotId: 'snap0',
      model: 'gpt-5.4',
      reasoningEffort: 'medium',
      status: 'completed',
      analysis: validAnalysis(),
      createdAt: '2026-01-01T00:00:00Z'
    }
    f = buildFakes(async () => completedResult(JSON.stringify(validAnalysis())), { latestRecord: prev })
    f.service.run(params)
    await waitForTerminal(f.received)
    expect(f.latestForPr).toHaveBeenCalledWith('pr1')
    // The prompt was built (run succeeded), previous analysis was loaded without error.
    expect(f.runTask).toHaveBeenCalledTimes(1)
  })
})
