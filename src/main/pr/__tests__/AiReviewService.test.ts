import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { AiReviewService } from '../AiReviewService'
import { TaskRegistry } from '../../app/TaskRegistry'
import type { Database } from '../../db/types'
import type { GitProvider } from '../../providers/GitProvider'
import type { CodexRuntime, CodexRunOptions, CodexRunResult, EventBus } from '../../contracts'
import type { RepoCacheService } from '../RepoCacheService'
import type { SafePaths } from '../../security/safePaths'
import type {
  AppEvent,
  AppSettings,
  GenerateReviewParams,
  NormalizedDiff,
  PullRequestRef,
  ReviewContext,
  ReviewDraft,
  SaveDraftParams
} from '../../../shared/types'

// ---------------------------------------------------------------------------
// AiReviewService streams deltas and saves drafts. Drive the fire-and-forget
// work by awaiting a terminal EventBus event.
// ---------------------------------------------------------------------------

const ref: PullRequestRef = {
  accountId: 'acct1',
  repoId: 'repo1',
  owner: 'acme',
  repo: 'review-master',
  number: 42
}

const params: GenerateReviewParams = {
  ref,
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

const emptyDiff: NormalizedDiff = { files: [], source: 'git', totalAdditions: 0, totalDeletions: 0 }

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

interface Fakes {
  service: AiReviewService
  received: AppEvent[]
  draftsCreate: ReturnType<typeof vi.fn>
  draftsUpdate: ReturnType<typeof vi.fn>
  draftsGetById: ReturnType<typeof vi.fn>
  draftsLatestForPr: ReturnType<typeof vi.fn>
  prGetByNumber: ReturnType<typeof vi.fn>
  preflightGetById: ReturnType<typeof vi.fn>
  preflightFindCompletedForSnapshot: ReturnType<typeof vi.fn>
  runTask: ReturnType<typeof vi.fn>
  fetchReviewContext: ReturnType<typeof vi.fn>
}

function buildFakes(
  runTaskImpl: (opts: CodexRunOptions) => Promise<CodexRunResult>
): Fakes {
  const received: AppEvent[] = []
  const events: EventBus = { emit: (e) => received.push(e) }

  // Track the "stored" draft so update() can return a merged object.
  let stored: ReviewDraft | null = null
  const draftsCreate = vi.fn().mockImplementation((d: ReviewDraft) => {
    stored = d
    return d
  })
  const draftsUpdate = vi.fn().mockImplementation((id: string, patch: Partial<ReviewDraft>) => {
    if (!stored || stored.id !== id) return null
    stored = { ...stored, ...patch }
    return stored
  })
  const draftsGetById = vi.fn().mockImplementation((id: string) => (stored && stored.id === id ? stored : null))
  const draftsLatestForPr = vi.fn().mockImplementation(() => stored)
  const prGetByNumber = vi.fn().mockReturnValue({ id: 'pr1' })
  const preflightGetById = vi.fn().mockReturnValue(null)
  const preflightFindCompletedForSnapshot = vi.fn().mockReturnValue(null)

  const db = {
    drafts: {
      create: draftsCreate,
      update: draftsUpdate,
      getById: draftsGetById,
      latestForPr: draftsLatestForPr
    },
    pullRequests: { getByNumber: prGetByNumber },
    preflight: {
      getById: preflightGetById,
      findCompletedForSnapshot: preflightFindCompletedForSnapshot
    },
    repos: { getById: vi.fn().mockReturnValue(null) }
  } as unknown as Database

  const fetchReviewContext = vi.fn().mockResolvedValue(reviewContext)
  const provider = { id: 'github', fetchReviewContext } as unknown as GitProvider

  const repoCache = {
    buildDiff: vi.fn().mockResolvedValue(emptyDiff)
  } as unknown as RepoCacheService

  const runTask = vi.fn().mockImplementation(runTaskImpl)
  const codex = { runTask } as unknown as CodexRuntime

  const tasks = new TaskRegistry()

  const reviewsDir = path.join(tmpdir(), 'rm-test-reviews')
  const safePaths = {
    generatedReviewsDir: () => reviewsDir,
    assertInside: () => undefined
  } as unknown as SafePaths

  const service = new AiReviewService({
    db,
    provider,
    repoCache,
    codex,
    events,
    tasks,
    safePaths,
    getSettings: () => settings
  })

  return {
    service,
    received,
    draftsCreate,
    draftsUpdate,
    draftsGetById,
    draftsLatestForPr,
    prGetByNumber,
    preflightGetById,
    preflightFindCompletedForSnapshot,
    runTask,
    fetchReviewContext
  }
}

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

describe('AiReviewService.run', () => {
  let f: Fakes

  beforeEach(() => {
    f = buildFakes(async (opts) => {
      opts.onDelta?.('Hello ')
      opts.onDelta?.('world.')
      return { text: 'Hello world.' }
    })
  })

  it('returns a TaskHandle synchronously with a review kind', () => {
    const handle = f.service.run(params)
    expect(handle.kind).toBe('review')
    expect(handle.taskId).toMatch(/^task/)
  })

  it('streams onDelta -> emits task.content.delta and accumulates into the saved draft', async () => {
    f.service.run(params)
    const terminal = await waitForTerminal(f.received)

    expect(terminal.type).toBe('task.completed')

    // Running draft created up front.
    expect(f.draftsCreate).toHaveBeenCalledTimes(1)
    const created = f.draftsCreate.mock.calls[0][0] as ReviewDraft
    expect(created.status).toBe('running')
    expect(created.markdown).toBe('')

    // Each delta emitted in order.
    const deltas = f.received.filter((e) => e.type === 'task.content.delta') as Extract<
      AppEvent,
      { type: 'task.content.delta' }
    >[]
    expect(deltas.map((d) => d.text)).toEqual(['Hello ', 'world.'])
    deltas.forEach((d) => expect(d.kind).toBe('review'))

    // Final update saves the full accumulated markdown with status 'draft'.
    const draftUpdate = f.draftsUpdate.mock.calls.find((c) => c[1].status === 'draft')
    expect(draftUpdate).toBeDefined()
    expect(draftUpdate?.[1].markdown).toBe('Hello world.')
  })

  it('completion -> draft status draft + task.completed(draftId)', async () => {
    f.service.run(params)
    const terminal = await waitForTerminal(f.received)
    const created = f.draftsCreate.mock.calls[0][0] as ReviewDraft

    expect(terminal.type).toBe('task.completed')
    if (terminal.type === 'task.completed') {
      expect(terminal.resultId).toBe(created.id)
      expect(terminal.kind).toBe('review')
    }
    // Final persisted status is 'draft'.
    const draftUpdate = f.draftsUpdate.mock.calls.find((c) => c[1].status === 'draft')
    expect(draftUpdate?.[1].status).toBe('draft')
  })

  it('prefers result.text over accumulated for the final markdown', async () => {
    f = buildFakes(async (opts) => {
      opts.onDelta?.('partial')
      return { text: 'FINAL CANONICAL TEXT' }
    })
    f.service.run(params)
    await waitForTerminal(f.received)
    const draftUpdate = f.draftsUpdate.mock.calls.find((c) => c[1].status === 'draft')
    expect(draftUpdate?.[1].markdown).toBe('FINAL CANONICAL TEXT')
  })

  it('interrupted -> partial kept with status interrupted, task.interrupted', async () => {
    f = buildFakes(async (opts) => {
      opts.onDelta?.('partial chunk')
      return { text: '', interrupted: true }
    })
    f.service.run(params)
    const terminal = await waitForTerminal(f.received)

    expect(terminal.type).toBe('task.interrupted')
    const interruptedUpdate = f.draftsUpdate.mock.calls.find((c) => c[1].status === 'interrupted')
    expect(interruptedUpdate).toBeDefined()
    expect(interruptedUpdate?.[1].markdown).toBe('partial chunk')
    // No 'draft' completion update.
    expect(f.draftsUpdate.mock.calls.find((c) => c[1].status === 'draft')).toBeUndefined()
  })

  it('failure -> partial kept with status failed, task.failed', async () => {
    f = buildFakes(async (opts) => {
      opts.onDelta?.('half a review')
      throw new Error('codex exploded')
    })
    f.service.run(params)
    const terminal = await waitForTerminal(f.received)

    expect(terminal.type).toBe('task.failed')
    if (terminal.type === 'task.failed') {
      expect(terminal.message).toBe('codex exploded')
      expect(terminal.recoverable).toBe(true)
    }
    const failedUpdate = f.draftsUpdate.mock.calls.find((c) => c[1].status === 'failed')
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate?.[1].markdown).toBe('half a review')
  })

  it('emits all 6 review phases on success', async () => {
    f.service.run(params)
    await waitForTerminal(f.received)
    const phases = f.received.filter((e) => e.type === 'task.phase') as Extract<AppEvent, { type: 'task.phase' }>[]
    expect(phases.length).toBe(6)
    expect(phases.map((p) => p.phaseIndex)).toEqual([0, 1, 2, 3, 4, 5])
    phases.forEach((p) => expect(p.phaseCount).toBe(6))
    expect(phases[0].phase).toBe('Loading PR context')
    expect(phases[5].phase).toBe('Opening editor')
  })

  it('wires onActivity to emit task.log', async () => {
    f = buildFakes(async (opts) => {
      opts.onActivity?.('reasoning...')
      return { text: 'done' }
    })
    f.service.run(params)
    await waitForTerminal(f.received)
    const logs = f.received.filter((e) => e.type === 'task.log') as Extract<AppEvent, { type: 'task.log' }>[]
    expect(logs.map((l) => l.message)).toContain('reasoning...')
    logs.forEach((l) => expect(l.kind).toBe('review'))
  })
})

describe('AiReviewService.getDraft', () => {
  it('returns the latest draft for a resolved PR', () => {
    const f = buildFakes(async () => ({ text: '' }))
    const draft: ReviewDraft = {
      id: 'draft1',
      pullRequestId: 'pr1',
      snapshotId: 'snap1',
      model: 'gpt-5.4',
      reasoningEffort: 'medium',
      markdown: 'existing',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
    f.prGetByNumber.mockReturnValue({ id: 'pr1' })
    f.draftsLatestForPr.mockReturnValue(draft)

    const result = f.service.getDraft(ref)
    expect(f.prGetByNumber).toHaveBeenCalledWith('repo1', 42)
    expect(f.draftsLatestForPr).toHaveBeenCalledWith('pr1')
    expect(result).toEqual(draft)
  })

  it('returns null when the PR is unknown', () => {
    const f = buildFakes(async () => ({ text: '' }))
    f.prGetByNumber.mockReturnValue(null)
    const result = f.service.getDraft(ref)
    expect(result).toBeNull()
    expect(f.draftsLatestForPr).not.toHaveBeenCalled()
  })
})

describe('AiReviewService.saveDraft', () => {
  it('updates the draft, writes the file, and emits draft.saved', async () => {
    const f = buildFakes(async () => ({ text: '' }))
    const draft: ReviewDraft = {
      id: 'draft1',
      pullRequestId: 'pr1',
      snapshotId: 'snap1',
      model: 'gpt-5.4',
      reasoningEffort: 'medium',
      markdown: 'old',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
    // saveDraft uses db.drafts.update directly; make it return the updated draft.
    f.draftsUpdate.mockImplementation((id: string, patch: Partial<ReviewDraft>) =>
      id === 'draft1' ? { ...draft, ...patch } : null
    )

    const saveParams: SaveDraftParams = { draftId: 'draft1', markdown: 'edited body' }
    const result = await f.service.saveDraft(saveParams)

    expect(result).not.toBeNull()
    expect(result?.markdown).toBe('edited body')
    expect(f.draftsUpdate).toHaveBeenCalledWith(
      'draft1',
      expect.objectContaining({ markdown: 'edited body' })
    )
    const saved = f.received.find((e) => e.type === 'draft.saved') as Extract<AppEvent, { type: 'draft.saved' }>
    expect(saved).toBeDefined()
    expect(saved.draftId).toBe('draft1')
  })

  it('returns null and emits nothing when the draft does not exist', async () => {
    const f = buildFakes(async () => ({ text: '' }))
    f.draftsUpdate.mockReturnValue(null)
    const result = await f.service.saveDraft({ draftId: 'missing', markdown: 'x' })
    expect(result).toBeNull()
    expect(f.received.find((e) => e.type === 'draft.saved')).toBeUndefined()
  })
})
