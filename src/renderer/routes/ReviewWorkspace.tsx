import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ReviewMapPanel } from '../components/review/ReviewMapPanel'
import { PrDiffPanel } from '../components/review/PrDiffPanel'
import { PrIntelligencePanel } from '../components/review/PrIntelligencePanel'
import { PreflightConfirmModal } from '../components/review/PreflightConfirmModal'
import { AiReviewConfirmModal } from '../components/review/AiReviewConfirmModal'
import { ProgressModal } from '../components/review/ProgressModal'
import { ReviewDraftModal } from '../components/review/ReviewDraftModal'
import { SubmitReviewModal } from '../components/review/SubmitReviewModal'
import { Button } from '../components/ui/Button'
import { Tooltip } from '../components/ui/Tooltip'
import { Spinner } from '../components/ui/misc'
import { AlertTriangleIcon, ZapIcon, RefreshIcon, MessageIcon } from '../components/ui/icons'
import { useAppStore } from '../stores/appStore'
import { useReviewWorkspaceStore } from '../stores/reviewWorkspaceStore'
import { usePendingReviewStore } from '../stores/pendingReviewStore'
import { useTaskStore } from '../stores/taskStore'
import { useWorkspace, useRunPreflight, useGenerateReview, useInvalidateWorkspace } from '../queries/useWorkspace'
import { queryKeys } from '../queries/keys'
import { PREFLIGHT_PHASES, REVIEW_PHASES } from '@shared/constants'
import { api } from '../lib/api'

export function ReviewWorkspace(): JSX.Element {
  const ref = useAppStore((s) => s.selectedPrRef)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const codexState = useAppStore((s) => s.codexState)
  const pushToast = useAppStore((s) => s.pushToast)
  const setRoute = useAppStore((s) => s.setRoute)

  const qc = useQueryClient()
  const invalidateWorkspace = useInvalidateWorkspace()
  const { data: workspace, isLoading, isError, error } = useWorkspace(ref)

  const setWorkspace = useReviewWorkspaceStore((s) => s.setWorkspace)
  const resetUi = useReviewWorkspaceStore((s) => s.resetUi)
  const storedSnapshotId = useReviewWorkspaceStore((s) => s.snapshotId)
  const resetPendingReview = usePendingReviewStore((s) => s.reset)

  const runPreflight = useRunPreflight()
  const generateReview = useGenerateReview()

  const [dismissedPreflight, setDismissedPreflight] = useState(false)
  const [showReviewConfirm, setShowReviewConfirm] = useState(false)
  const [showDraft, setShowDraft] = useState(false)
  const [showFinishReview, setShowFinishReview] = useState(false)
  const pendingCommentCount = usePendingReviewStore((s) => s.comments.length)
  const [preflightTaskId, setPreflightTaskId] = useState<string | null>(null)
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null)

  const preflightTask = useTaskStore((s) => (preflightTaskId ? s.tasks[preflightTaskId] : undefined))
  const reviewTask = useTaskStore((s) => (reviewTaskId ? s.tasks[reviewTaskId] : undefined))
  const clearTask = useTaskStore((s) => s.clearTask)

  // Sync loaded workspace into the store, resetting UI state on snapshot change.
  useEffect(() => {
    if (!workspace) return
    setWorkspace(workspace)
    if (workspace.snapshot.id !== storedSnapshotId) {
      resetUi(workspace.snapshot.id)
      resetPendingReview(workspace.snapshot.id)
      setDismissedPreflight(false)
    }
  }, [workspace, storedSnapshotId, setWorkspace, resetUi, resetPendingReview])

  // React to preflight task completion. Evict the finished task so its activity
  // log doesn't stay resident for the rest of the session.
  useEffect(() => {
    if (!preflightTask) return
    if (preflightTask.status === 'completed') {
      if (ref) void invalidateWorkspace(ref)
      clearTask(preflightTask.taskId)
      setPreflightTaskId(null)
    } else if (preflightTask.status === 'failed' || preflightTask.status === 'interrupted') {
      clearTask(preflightTask.taskId)
      setPreflightTaskId(null)
    }
  }, [preflightTask, ref, clearTask])

  // React to review task completion → refresh + open draft modal.
  useEffect(() => {
    if (!reviewTask) return
    if (reviewTask.status === 'completed') {
      if (ref) {
        void invalidateWorkspace(ref)
        void qc.invalidateQueries({ queryKey: queryKeys.draft(ref) })
      }
      setShowDraft(true)
      clearTask(reviewTask.taskId)
      setReviewTaskId(null)
    } else if (reviewTask.status === 'failed' || reviewTask.status === 'interrupted') {
      clearTask(reviewTask.taskId)
      setReviewTaskId(null)
    }
  }, [reviewTask, ref, clearTask])

  if (!ref) {
    return <Centered>No pull request selected.</Centered>
  }
  if (isLoading) {
    return (
      <Centered>
        <Spinner className="h-5 w-5" /> Loading workspace…
      </Centered>
    )
  }
  if (isError || !workspace) {
    return (
      <Centered>
        <AlertTriangleIcon className="h-5 w-5 text-danger" />
        {error instanceof Error ? error.message : 'Failed to load workspace.'}
        <Button variant="secondary" size="sm" onClick={() => setRoute('prs')}>
          Back to pull requests
        </Button>
      </Centered>
    )
  }

  const codexAvailable = !!bootstrap?.codex.cliInstalled && !!bootstrap?.codex.authenticated && codexState !== 'error'
  const preflight = workspace.preflight
  const hasPreflight = !!preflight?.analysis
  const preflightRunning = !!preflightTaskId || workspace.reviewState === 'preflight_running'
  const reviewRunning = !!reviewTaskId || workspace.reviewState === 'review_generating'
  const draft = workspace.draft
  const hasDraft = !!draft && draft.status !== 'submitted'

  const needsPreflightConfirm =
    !hasPreflight && !preflightRunning && !dismissedPreflight

  function startPreflight(force: boolean): void {
    if (!ref || !workspace) return
    runPreflight.mutate(
      { ref, pullRequestId: workspace.snapshot.pullRequestId, snapshotId: workspace.snapshot.id, force },
      {
        onSuccess: (handle) => setPreflightTaskId(handle.taskId),
        onError: (e) => pushToast('error', e instanceof Error ? e.message : 'Failed to start preflight.')
      }
    )
    setDismissedPreflight(true)
  }

  function startReview(notes: string): void {
    if (!ref || !workspace) return
    setShowReviewConfirm(false)
    generateReview.mutate(
      {
        ref,
        pullRequestId: workspace.snapshot.pullRequestId,
        snapshotId: workspace.snapshot.id,
        preflightAnalysisId: preflight?.id,
        userNotes: notes || undefined
      },
      {
        onSuccess: (handle) => setReviewTaskId(handle.taskId),
        onError: (e) => pushToast('error', e instanceof Error ? e.message : 'Failed to start review.')
      }
    )
  }

  function cancelTask(taskId: string | null): void {
    if (taskId) void api.review.cancelTask(taskId)
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* LEFT: AI review map */}
      {hasPreflight && preflight?.analysis ? (
        <ReviewMapPanel analysis={preflight.analysis} stale={workspace.preflightStale} />
      ) : (
        <aside className="flex w-[300px] shrink-0 flex-col items-center justify-center gap-3 border-r border-border-subtle bg-background p-6 text-center">
          {preflightRunning ? (
            <>
              <Spinner className="h-5 w-5" />
              <p className="text-[12px] text-text-muted">Building the guided review map…</p>
            </>
          ) : (
            <>
              <ZapIcon className="h-6 w-6 text-accent" />
              <p className="text-[13px] font-medium text-text-primary">No preflight analysis yet</p>
              <p className="text-[12px] text-text-muted">
                Run preflight to group changes, order files, and surface risks.
              </p>
              <Button variant="primary" size="sm" disabled={!codexAvailable} onClick={() => setDismissedPreflight(false)}>
                Run preflight
              </Button>
              {!codexAvailable && <p className="text-[11px] text-warning">Codex is not available.</p>}
            </>
          )}
        </aside>
      )}

      {/* CENTRE: diff */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {workspace.preflightStale && hasPreflight && (
          <Banner tone="warning">
            This preflight is stale — the PR has new commits.{' '}
            <button className="underline" onClick={() => startPreflight(true)}>
              Regenerate
            </button>
          </Banner>
        )}
        {hasDraft && !showDraft && (
          <Banner tone="accent">
            You have a saved AI review draft for this PR.{' '}
            <button className="underline" onClick={() => setShowDraft(true)}>
              Open draft
            </button>{' '}
            ·{' '}
            <button className="underline" onClick={() => setShowReviewConfirm(true)}>
              Regenerate
            </button>
          </Banner>
        )}

        <PrDiffPanel workspace={workspace} prRef={ref} />

        {/* Floating review actions */}
        <div className="pointer-events-none absolute bottom-5 right-5 flex flex-col items-end gap-2">
          {pendingCommentCount > 0 && !hasDraft && (
            <Button
              variant="secondary"
              size="lg"
              className="pointer-events-auto shadow-xl"
              onClick={() => setShowFinishReview(true)}
            >
              <MessageIcon className="h-4 w-4" /> Finish review ({pendingCommentCount})
            </Button>
          )}
          <Tooltip
            content={
              !codexAvailable
                ? 'Codex is not available'
                : !hasPreflight
                  ? 'Run preflight first'
                  : 'Generate an AI review draft'
            }
          >
            <span className="pointer-events-auto inline-flex">
              {hasDraft ? (
                <Button variant="primary" size="lg" className="shadow-xl" onClick={() => setShowDraft(true)}>
                  Open AI Draft
                  {pendingCommentCount > 0 ? ` (${pendingCommentCount})` : ''}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  className="shadow-xl"
                  disabled={!codexAvailable || !hasPreflight || reviewRunning || preflightRunning}
                  onClick={() => setShowReviewConfirm(true)}
                >
                  <ZapIcon className="h-4 w-4" /> Generate AI Review
                </Button>
              )}
            </span>
          </Tooltip>
        </div>
      </div>

      {/* RIGHT: intelligence */}
      <PrIntelligencePanel workspace={workspace} />

      {/* Modals */}
      <PreflightConfirmModal
        open={needsPreflightConfirm || (workspace.preflightStale && !hasPreflight && !dismissedPreflight)}
        onOpenChange={(o) => !o && setDismissedPreflight(true)}
        mode={workspace.preflightStale ? 'newCommits' : 'first'}
        loading={runPreflight.isPending}
        onRun={() => startPreflight(true)}
        onUseOld={() => setDismissedPreflight(true)}
      />

      <AiReviewConfirmModal
        open={showReviewConfirm}
        onOpenChange={setShowReviewConfirm}
        loading={generateReview.isPending}
        onGenerate={startReview}
      />

      <ProgressModal
        open={preflightRunning && !!preflightTaskId}
        onOpenChange={() => undefined}
        task={preflightTask ?? null}
        title="Running preflight analysis"
        phases={PREFLIGHT_PHASES}
        onCancel={() => cancelTask(preflightTaskId)}
      />

      <ProgressModal
        open={reviewRunning && !!reviewTaskId}
        onOpenChange={() => undefined}
        task={reviewTask ?? null}
        title="Generating AI Review"
        phases={REVIEW_PHASES}
        onCancel={() => cancelTask(reviewTaskId)}
      />

      {showDraft && draft && (
        <ReviewDraftModal
          open={showDraft}
          onOpenChange={setShowDraft}
          draft={draft}
          prRef={ref}
          authorLogin={workspace.pr.author?.login}
          prState={workspace.pr.state}
        />
      )}

      <SubmitReviewModal
        open={showFinishReview}
        onOpenChange={setShowFinishReview}
        prRef={ref}
        authorLogin={workspace.pr.author?.login}
        prState={workspace.pr.state}
      />
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-[13px] text-text-secondary">
      {children}
    </div>
  )
}

function Banner({ tone, children }: { tone: 'warning' | 'accent'; children: React.ReactNode }): JSX.Element {
  const cls =
    tone === 'warning'
      ? 'border-warning/40 bg-warning/10 text-warning'
      : 'border-accent/40 bg-accent-soft text-accent-hover'
  return <div className={`shrink-0 border-b px-5 py-2 text-[12px] ${cls}`}>{children}</div>
}

export default ReviewWorkspace
