import { useMemo, useState } from 'react'
import type {
  EditCommentParams,
  IssueComment,
  PrConversation,
  PullRequestRef,
  ReviewCommentThread,
  ReviewSummary
} from '@shared/types'
import { Avatar, EmptyState, Spinner, Badge, type BadgeTone } from '../ui/misc'
import { CheckIcon, XIcon, MessageIcon, AlertTriangleIcon } from '../ui/icons'
import { relativeTime } from '@shared/dates'
import {
  useConversation,
  useCreateComment,
  useEditComment,
  useReplyReviewComment
} from '../../queries/useConversation'
import { useAccounts } from '../../queries/useAccounts'
import { useAppStore } from '../../stores/appStore'
import { CommentMarkdown } from './CommentMarkdown'
import { CommentActionsMenu, quoteMarkdown } from './CommentActionsMenu'
import { CommentComposer, ExistingThreadView } from './InlineComments'

type TimelineItem =
  | { kind: 'comment'; at: number; comment: IssueComment }
  | { kind: 'review'; at: number; review: ReviewSummary }
  | { kind: 'thread'; at: number; thread: ReviewCommentThread }

function ts(value?: string): number {
  return Date.parse(value ?? '') || 0
}

const REVIEW_TONE: Record<ReviewSummary['state'], BadgeTone> = {
  APPROVED: 'success',
  CHANGES_REQUESTED: 'danger',
  COMMENTED: 'info',
  PENDING: 'neutral',
  DISMISSED: 'neutral'
}

const REVIEW_LABEL: Record<ReviewSummary['state'], string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'requested changes',
  COMMENTED: 'reviewed',
  PENDING: 'pending review',
  DISMISSED: 'dismissed review'
}

function buildTimeline(c: PrConversation): TimelineItem[] {
  const items: TimelineItem[] = [
    ...c.issueComments.map((comment) => ({ kind: 'comment' as const, at: ts(comment.createdAt), comment })),
    // Reviews with neither a body nor inline comments add nothing but the state,
    // which the Reviewers panel already shows — keep only the substantive ones.
    ...c.reviews
      .filter((r) => (r.body && r.body.trim().length > 0) || r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED')
      .map((review) => ({ kind: 'review' as const, at: ts(review.submittedAt), review })),
    ...c.threads.map((thread) => ({ kind: 'thread' as const, at: ts(thread.comments[0]?.createdAt), thread }))
  ]
  return items.sort((a, b) => a.at - b.at)
}

export function ConversationTab({ prRef }: { prRef: PullRequestRef }): JSX.Element {
  const { data, isLoading, isError, error } = useConversation(prRef)
  const createComment = useCreateComment(prRef)
  const reply = useReplyReviewComment(prRef)
  const editComment = useEditComment(prRef)
  const pushToast = useAppStore((s) => s.pushToast)
  const activeAccountId = useAppStore((s) => s.activeAccountId)
  const { data: accounts } = useAccounts()

  const [composing, setComposing] = useState(false)
  // Seed text for the top-level composer (used by "Quote reply"); the nonce
  // forces a remount so the composer picks up a fresh initialValue each time.
  const [seed, setSeed] = useState('')
  const [seedNonce, setSeedNonce] = useState(0)

  const currentLogin = useMemo(
    () => accounts?.find((a) => a.id === activeAccountId)?.login,
    [accounts, activeAccountId]
  )

  function openComposer(initial = ''): void {
    setSeed(initial)
    setSeedNonce((n) => n + 1)
    setComposing(true)
  }

  const editIssue = (commentId: string, body: string): Promise<unknown> =>
    editComment.mutateAsync({ ref: prRef, commentId, kind: 'issue', body } satisfies EditCommentParams)

  const timeline = useMemo(() => (data ? buildTimeline(data) : []), [data])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-text-muted">
        <Spinner className="h-4 w-4" /> Loading discussion…
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-danger">
        <AlertTriangleIcon className="h-4 w-4" />
        {error instanceof Error ? error.message : 'Failed to load discussion.'}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {timeline.length === 0 ? (
        <EmptyState title="No discussion yet" description="Comments, reviews, and replies on this PR will appear here." />
      ) : (
        timeline.map((item, i) => {
          if (item.kind === 'comment') {
            return (
              <IssueCommentCard
                key={`c${item.comment.id}`}
                comment={item.comment}
                canEdit={!!currentLogin && item.comment.author?.login === currentLogin}
                onQuoteReply={() => openComposer(quoteMarkdown(item.comment.body))}
                onSaveEdit={(body) => editIssue(item.comment.id, body)}
              />
            )
          }
          if (item.kind === 'review') {
            return (
              <ReviewCard
                key={`r${item.review.id ?? i}`}
                review={item.review}
                onQuoteReply={() => openComposer(quoteMarkdown(item.review.body ?? ''))}
              />
            )
          }
          return (
            <div key={`t${item.thread.id}`} className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <MessageIcon className="h-3.5 w-3.5" />
                <span className="mono">
                  {item.thread.path}
                  {item.thread.line ? `:${item.thread.line}` : ''}
                </span>
              </div>
              <ExistingThreadView
                thread={item.thread}
                replyBusy={reply.isPending}
                onReply={(body) => reply.mutateAsync({ ref: prRef, inReplyToId: item.thread.id, body })}
                currentLogin={currentLogin}
                onEditComment={(commentId, body) =>
                  editComment.mutateAsync({ ref: prRef, commentId, kind: 'review', body })
                }
              />
            </div>
          )
        })
      )}

      {/* Add a top-level comment */}
      <div className="border-t border-border-subtle pt-4">
        {composing ? (
          <CommentComposer
            key={seedNonce}
            initialValue={seed}
            placeholder="Add a comment to the conversation…"
            submitLabel="Comment"
            busy={createComment.isPending}
            autoFocus
            onSubmit={(body) =>
              createComment.mutate(
                { ref: prRef, body },
                {
                  onSuccess: () => {
                    setComposing(false)
                    setSeed('')
                    pushToast('success', 'Comment posted.')
                  },
                  onError: (e) => pushToast('error', e instanceof Error ? e.message : 'Failed to post comment.')
                }
              )
            }
            onCancel={() => {
              setComposing(false)
              setSeed('')
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => openComposer()}
            className="w-full rounded-md border border-border-strong bg-background-panel px-3 py-2 text-left text-[12px] text-text-muted hover:text-text-primary"
          >
            Add a comment…
          </button>
        )}
      </div>
    </div>
  )
}

function IssueCommentCard({
  comment,
  canEdit,
  onQuoteReply,
  onSaveEdit
}: {
  comment: IssueComment
  canEdit: boolean
  onQuoteReply: () => void
  onSaveEdit: (body: string) => Promise<unknown>
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  return (
    <div className="rounded-lg border border-border-subtle bg-background-panel">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 text-[12px]">
        <Avatar src={comment.author?.avatarUrl} alt={comment.author?.login ?? '?'} size={18} />
        <span className="font-medium text-text-primary">{comment.author?.login ?? 'unknown'}</span>
        {comment.createdAt && <span className="text-text-muted">commented {relativeTime(comment.createdAt)}</span>}
        <div className="ml-auto">
          <CommentActionsMenu
            htmlUrl={comment.htmlUrl}
            body={comment.body}
            onQuoteReply={onQuoteReply}
            onEdit={canEdit ? () => setEditing(true) : undefined}
          />
        </div>
      </div>
      <div className="px-3 py-2">
        {editing ? (
          <CommentComposer
            initialValue={comment.body}
            placeholder="Edit comment…"
            submitLabel="Update comment"
            autoFocus
            error={editError}
            onSubmit={async (body) => {
              setEditError(null)
              try {
                await onSaveEdit(body)
                setEditing(false)
              } catch (e) {
                setEditError(e instanceof Error ? e.message : 'Failed to update comment.')
              }
            }}
            onCancel={() => {
              setEditError(null)
              setEditing(false)
            }}
          />
        ) : (
          <CommentMarkdown>{comment.body}</CommentMarkdown>
        )}
      </div>
    </div>
  )
}

function ReviewCard({ review, onQuoteReply }: { review: ReviewSummary; onQuoteReply: () => void }): JSX.Element {
  const Icon = review.state === 'APPROVED' ? CheckIcon : review.state === 'CHANGES_REQUESTED' ? XIcon : MessageIcon
  const hasBody = !!review.body && review.body.trim().length > 0
  return (
    <div className="rounded-lg border border-border-subtle bg-background-panel">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 text-[12px]">
        <Avatar src={review.avatarUrl} alt={review.login} size={18} />
        <span className="font-medium text-text-primary">{review.login}</span>
        <Badge tone={REVIEW_TONE[review.state]} className="gap-1">
          <Icon className="h-3 w-3" /> {REVIEW_LABEL[review.state]}
        </Badge>
        {review.submittedAt && <span className="text-text-muted">{relativeTime(review.submittedAt)}</span>}
        {(review.htmlUrl || hasBody) && (
          <div className="ml-auto">
            <CommentActionsMenu
              htmlUrl={review.htmlUrl}
              body={review.body ?? ''}
              onQuoteReply={hasBody ? onQuoteReply : undefined}
            />
          </div>
        )}
      </div>
      {hasBody && (
        <div className="px-3 py-2">
          <CommentMarkdown>{review.body ?? ''}</CommentMarkdown>
        </div>
      )}
    </div>
  )
}
