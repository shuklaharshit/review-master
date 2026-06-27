import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { PullRequestRef, PullRequestState, ReviewDraft } from '@shared/types'
import { Dialog, DialogContent } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { CopyIcon, CheckIcon, XIcon, AlertTriangleIcon, MessageIcon } from '../ui/icons'
import { useSaveDraft, useSubmitDraft } from '../../queries/useDraft'
import { useTaskStore } from '../../stores/taskStore'
import { useAppStore } from '../../stores/appStore'
import { usePendingReviewStore } from '../../stores/pendingReviewStore'
import { useIsOwnPr } from '../../lib/selfPr'
import { queryKeys } from '../../queries/keys'
import { formatTime } from '@shared/dates'
import { DRAFT_AUTOSAVE_INTERVAL_MS } from '@shared/constants'
import { ReviewEventSelector, type ReviewEvent } from './ReviewEventSelector'

export function ReviewDraftModal({
  open,
  onOpenChange,
  draft,
  prRef,
  taskId,
  authorLogin,
  prState
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: ReviewDraft
  prRef: PullRequestRef
  taskId?: string
  authorLogin?: string
  prState?: PullRequestState
}): JSX.Element {
  const [markdown, setMarkdown] = useState(draft.markdown)
  const [lastSaved, setLastSaved] = useState<string | null>(draft.updatedAt ?? null)
  const [copied, setCopied] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [event, setEvent] = useState<ReviewEvent>('COMMENT')

  const task = useTaskStore((s) => (taskId ? s.tasks[taskId] : undefined))
  const streaming = task?.status === 'running'
  const pushToast = useAppStore((s) => s.pushToast)
  const qc = useQueryClient()
  const saveDraft = useSaveDraft()
  const submitDraft = useSubmitDraft()

  const pendingComments = usePendingReviewStore((s) => s.comments)
  const clearPending = usePendingReviewStore((s) => s.clear)
  const isOwnPr = useIsOwnPr(prRef, authorLogin)
  const prClosed = prState === 'closed' || prState === 'merged'
  const disabledReason = isOwnPr
    ? "You can't approve or request changes on your own pull request."
    : prClosed
      ? `This pull request is ${prState}.`
      : undefined
  // If approve/request-changes is disabled, force the event back to COMMENT.
  const effectiveEvent: ReviewEvent = disabledReason && event !== 'COMMENT' ? 'COMMENT' : event

  const dirtyRef = useRef(false)
  const lastSyncedTask = useRef<string>('')

  // While the review task streams, mirror its content into the editor (read-only).
  useEffect(() => {
    if (streaming && task) setMarkdown(task.content)
  }, [streaming, task])

  // When the task completes, adopt the final streamed content once.
  useEffect(() => {
    if (task && task.status === 'completed' && lastSyncedTask.current !== task.taskId) {
      lastSyncedTask.current = task.taskId
      if (task.content) setMarkdown(task.content)
    }
  }, [task])

  // Debounced autosave of manual edits.
  useEffect(() => {
    if (!dirtyRef.current || streaming) return
    const t = window.setTimeout(() => {
      saveDraft.mutate(
        { draftId: draft.id, markdown },
        {
          onSuccess: () => {
            setLastSaved(new Date().toISOString())
            dirtyRef.current = false
            void qc.invalidateQueries({ queryKey: queryKeys.draft(prRef) })
          }
        }
      )
    }, DRAFT_AUTOSAVE_INTERVAL_MS)
    return () => window.clearTimeout(t)
  }, [markdown, streaming, draft.id])

  function onEdit(value: string): void {
    dirtyRef.current = true
    setMarkdown(value)
  }

  function copyMarkdown(): void {
    void navigator.clipboard.writeText(markdown)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  async function submit(): Promise<void> {
    setSubmitError(null)
    // Ensure latest edits are persisted before submitting.
    if (dirtyRef.current) {
      await saveDraft.mutateAsync({ draftId: draft.id, markdown })
      dirtyRef.current = false
    }
    try {
      await submitDraft.mutateAsync({
        draftId: draft.id,
        ref: prRef,
        event: effectiveEvent,
        comments: pendingComments.length > 0 ? pendingComments : undefined
      })
      clearPending()
      pushToast('success', 'Review submitted successfully.')
      void qc.invalidateQueries({ queryKey: queryKeys.workspace(prRef) })
      void qc.invalidateQueries({ queryKey: queryKeys.draft(prRef) })
      void qc.invalidateQueries({ queryKey: queryKeys.conversation(prRef) })
      onOpenChange(false)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit review.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullSize className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-text-primary">AI Review Draft</h2>
            {streaming && <span className="text-[11px] text-info">Generating…</span>}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-text-muted hover:bg-background-panel-hover hover:text-text-primary"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body: split editor / preview */}
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border-subtle">
          <div className="flex min-h-0 flex-col">
            <div className="border-b border-border-subtle px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Raw Markdown
            </div>
            <textarea
              value={markdown}
              readOnly={streaming}
              onChange={(e) => onEdit(e.target.value)}
              spellCheck={false}
              className="mono min-h-0 flex-1 resize-none bg-background px-4 py-3 text-[12.5px] leading-relaxed text-text-primary focus:outline-none"
              placeholder={streaming ? 'Codex is writing the review…' : '# Review Summary'}
            />
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="border-b border-border-subtle px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Live Preview
            </div>
            <div className="markdown-body min-h-0 flex-1 overflow-auto px-5 py-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {markdown || '_Nothing to preview yet._'}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2.5 border-t border-border-subtle px-5 py-3">
          <div className="flex items-center gap-3">
            <ReviewEventSelector value={effectiveEvent} onChange={setEvent} disabledReason={disabledReason} />
            {pendingComments.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
                <MessageIcon className="h-3.5 w-3.5 text-accent-hover" />
                {pendingComments.length} inline comment{pendingComments.length === 1 ? '' : 's'} attached
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-text-muted">
              {submitError ? (
                <span className="flex items-center gap-1.5 text-danger">
                  <AlertTriangleIcon className="h-3.5 w-3.5" /> {submitError}
                </span>
              ) : (
                <span>Saved locally{lastSaved ? ` • Last edited ${formatTime(lastSaved)}` : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={copyMarkdown}>
                {copied ? <CheckIcon className="h-3.5 w-3.5 text-success" /> : <CopyIcon className="h-3.5 w-3.5" />}
                Copy Markdown
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={submitDraft.isPending}
                disabled={
                  streaming ||
                  (effectiveEvent !== 'APPROVE' && !markdown.trim() && pendingComments.length === 0)
                }
                onClick={() => void submit()}
              >
                {submitError ? 'Retry submit' : 'Submit Review'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
