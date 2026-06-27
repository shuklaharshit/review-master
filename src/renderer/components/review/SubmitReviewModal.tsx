import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PullRequestRef, PullRequestState } from '@shared/types'
import { Dialog, DialogContent } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { AlertTriangleIcon, XIcon } from '../ui/icons'
import { useFinishReview } from '../../queries/useDraft'
import { usePendingReviewStore } from '../../stores/pendingReviewStore'
import { useAppStore } from '../../stores/appStore'
import { useIsOwnPr } from '../../lib/selfPr'
import { queryKeys } from '../../queries/keys'
import { ReviewEventSelector, type ReviewEvent } from './ReviewEventSelector'
import { PendingCommentsList } from './InlineComments'

/**
 * Finish a hand-authored review (no AI draft): an optional summary plus any
 * pending inline comments, submitted with the chosen event. Mirrors GitHub's
 * "Finish your review" dialog.
 */
export function SubmitReviewModal({
  open,
  onOpenChange,
  prRef,
  authorLogin,
  prState
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prRef: PullRequestRef
  authorLogin?: string
  prState?: PullRequestState
}): JSX.Element {
  const [summary, setSummary] = useState('')
  const [event, setEvent] = useState<ReviewEvent>('COMMENT')
  const [error, setError] = useState<string | null>(null)

  const pendingComments = usePendingReviewStore((s) => s.comments)
  const clearPending = usePendingReviewStore((s) => s.clear)
  const finishReview = useFinishReview()
  const pushToast = useAppStore((s) => s.pushToast)
  const qc = useQueryClient()

  const isOwnPr = useIsOwnPr(prRef, authorLogin)
  const prClosed = prState === 'closed' || prState === 'merged'
  const disabledReason = isOwnPr
    ? "You can't approve or request changes on your own pull request."
    : prClosed
      ? `This pull request is ${prState}.`
      : undefined
  const effectiveEvent: ReviewEvent = disabledReason && event !== 'COMMENT' ? 'COMMENT' : event

  const canSubmit = summary.trim().length > 0 || pendingComments.length > 0

  async function submit(): Promise<void> {
    setError(null)
    try {
      await finishReview.mutateAsync({
        ref: prRef,
        body: summary.trim() || undefined,
        event: effectiveEvent,
        comments: pendingComments.length > 0 ? pendingComments : undefined
      })
      clearPending()
      pushToast('success', 'Review submitted successfully.')
      void qc.invalidateQueries({ queryKey: queryKeys.workspace(prRef) })
      void qc.invalidateQueries({ queryKey: queryKeys.conversation(prRef) })
      onOpenChange(false)
      setSummary('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit review.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] max-w-[92vw] p-0">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Finish your review</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-text-muted hover:bg-background-panel-hover hover:text-text-primary"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-auto px-5 py-4">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Leave a summary comment (optional)…"
            rows={4}
            className="w-full resize-y rounded-md border border-border-strong bg-background px-3 py-2 text-[13px] leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <PendingCommentsList />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
          <div className="min-w-0">
            {error ? (
              <span className="flex items-center gap-1.5 text-[11px] text-danger">
                <AlertTriangleIcon className="h-3.5 w-3.5" /> {error}
              </span>
            ) : (
              <ReviewEventSelector value={effectiveEvent} onChange={setEvent} disabledReason={disabledReason} />
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            loading={finishReview.isPending}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            Submit review
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
