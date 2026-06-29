import { useMemo, useState } from 'react'
import type {
  IssueComment,
  PrConversation,
  PullRequestRef,
  ReviewCommentThread,
  ReviewSummary
} from '@shared/types'
import { Avatar, EmptyState, Spinner, Badge, type BadgeTone } from '../ui/misc'
import { CheckIcon, XIcon, MessageIcon, AlertTriangleIcon } from '../ui/icons'
import { relativeTime } from '@shared/dates'
import { useConversation, useCreateComment, useReplyReviewComment } from '../../queries/useConversation'
import { useAppStore } from '../../stores/appStore'
import { CommentMarkdown } from './CommentMarkdown'
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
  const pushToast = useAppStore((s) => s.pushToast)
  const [composing, setComposing] = useState(false)

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
            return <IssueCommentCard key={`c${item.comment.id}`} comment={item.comment} />
          }
          if (item.kind === 'review') {
            return <ReviewCard key={`r${item.review.id ?? i}`} review={item.review} />
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
              />
            </div>
          )
        })
      )}

      {/* Add a top-level comment */}
      <div className="border-t border-border-subtle pt-4">
        {composing ? (
          <CommentComposer
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
                    pushToast('success', 'Comment posted.')
                  },
                  onError: (e) => pushToast('error', e instanceof Error ? e.message : 'Failed to post comment.')
                }
              )
            }
            onCancel={() => setComposing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="w-full rounded-md border border-border-strong bg-background-panel px-3 py-2 text-left text-[12px] text-text-muted hover:text-text-primary"
          >
            Add a comment…
          </button>
        )}
      </div>
    </div>
  )
}

function IssueCommentCard({ comment }: { comment: IssueComment }): JSX.Element {
  return (
    <div className="rounded-lg border border-border-subtle bg-background-panel">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 text-[12px]">
        <Avatar src={comment.author?.avatarUrl} alt={comment.author?.login ?? '?'} size={18} />
        <span className="font-medium text-text-primary">{comment.author?.login ?? 'unknown'}</span>
        {comment.createdAt && <span className="text-text-muted">commented {relativeTime(comment.createdAt)}</span>}
      </div>
      <div className="px-3 py-2">
        <CommentMarkdown>{comment.body}</CommentMarkdown>
      </div>
    </div>
  )
}

function ReviewCard({ review }: { review: ReviewSummary }): JSX.Element {
  const Icon = review.state === 'APPROVED' ? CheckIcon : review.state === 'CHANGES_REQUESTED' ? XIcon : MessageIcon
  return (
    <div className="rounded-lg border border-border-subtle bg-background-panel">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 text-[12px]">
        <Avatar src={review.avatarUrl} alt={review.login} size={18} />
        <span className="font-medium text-text-primary">{review.login}</span>
        <Badge tone={REVIEW_TONE[review.state]} className="gap-1">
          <Icon className="h-3 w-3" /> {REVIEW_LABEL[review.state]}
        </Badge>
        {review.submittedAt && <span className="text-text-muted">{relativeTime(review.submittedAt)}</span>}
      </div>
      {review.body && review.body.trim().length > 0 && (
        <div className="px-3 py-2">
          <CommentMarkdown>{review.body}</CommentMarkdown>
        </div>
      )}
    </div>
  )
}
