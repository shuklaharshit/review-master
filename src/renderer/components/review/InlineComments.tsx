import { useEffect, useRef, useState } from 'react'
import type { DraftInlineComment, ReviewComment, ReviewCommentThread } from '@shared/types'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/misc'
import { MessageIcon } from '../ui/icons'
import { relativeTime } from '@shared/dates'
import { usePendingReviewStore } from '../../stores/pendingReviewStore'
import { CommentMarkdown } from './CommentMarkdown'
import { CommentActionsMenu, quoteMarkdown } from './CommentActionsMenu'

// ---------------------------------------------------------------------------
// Composer — a controlled textarea with submit/cancel, reused for new pending
// comments and thread replies.
// ---------------------------------------------------------------------------
export function CommentComposer({
  initialValue = '',
  placeholder,
  submitLabel,
  busy,
  autoFocus,
  error,
  onSubmit,
  onCancel
}: {
  initialValue?: string
  placeholder: string
  submitLabel: string
  busy?: boolean
  autoFocus?: boolean
  /** Inline error shown above the actions (e.g. a failed network submit). */
  error?: string | null
  onSubmit: (body: string) => void
  onCancel?: () => void
}): JSX.Element {
  const [value, setValue] = useState(initialValue)
  const trimmed = value.trim()
  const ref = useRef<HTMLTextAreaElement>(null)

  // When auto-focused (e.g. opened via "Quote reply"), place the cursor after
  // any seeded text and scroll the composer into view within its scroll
  // container. Deferred a frame so it runs after the dropdown menu finishes
  // closing (Radix otherwise restores focus to its trigger, stealing it back).
  useEffect(() => {
    if (!autoFocus) return
    const raf = requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      const end = el.value.length
      el.setSelectionRange(end, end)
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [autoFocus])

  return (
    <div className="rounded-md border border-border-strong bg-background-panel p-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={3}
        spellCheck={false}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && trimmed) onSubmit(trimmed)
          if (e.key === 'Escape' && onCancel) onCancel()
        }}
        className="min-h-[60px] w-full resize-y bg-transparent text-[12.5px] leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none"
      />
      {error && <p className="mt-1 px-0.5 text-[11px] text-danger">{error}</p>}
      <div className="mt-1.5 flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button variant="primary" size="sm" loading={busy} disabled={!trimmed} onClick={() => onSubmit(trimmed)}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A single posted comment (existing thread entry).
// ---------------------------------------------------------------------------
function PostedComment({
  comment,
  canEdit,
  onQuoteReply,
  onSaveEdit
}: {
  comment: ReviewComment
  canEdit?: boolean
  onQuoteReply?: () => void
  onSaveEdit?: (body: string) => Promise<unknown>
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Only show the menu when it would carry at least one action.
  const showMenu = !!comment.htmlUrl || !!onQuoteReply || (canEdit && !!onSaveEdit)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <Avatar src={comment.author?.avatarUrl} alt={comment.author?.login ?? '?'} size={16} />
        <span className="font-medium text-text-secondary">{comment.author?.login ?? 'unknown'}</span>
        {comment.createdAt && <span>· {relativeTime(comment.createdAt)}</span>}
        {showMenu && (
          <div className="ml-auto">
            <CommentActionsMenu
              htmlUrl={comment.htmlUrl}
              body={comment.body}
              onQuoteReply={onQuoteReply}
              onEdit={canEdit && onSaveEdit ? () => setEditing(true) : undefined}
            />
          </div>
        )}
      </div>
      {editing && onSaveEdit ? (
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
  )
}

// ---------------------------------------------------------------------------
// An existing inline thread + reply box.
// ---------------------------------------------------------------------------
export function ExistingThreadView({
  thread,
  replyBusy,
  onReply,
  currentLogin,
  onEditComment
}: {
  thread: ReviewCommentThread
  replyBusy?: boolean
  /** Posts a reply. Must reject (or throw) on failure so the draft is kept. */
  onReply?: (body: string) => Promise<unknown> | void
  /** Login of the signed-in user, to decide which comments show "Edit". */
  currentLogin?: string
  /** Edits an inline comment in this thread. Must reject on failure. */
  onEditComment?: (commentId: string, body: string) => Promise<unknown>
}): JSX.Element {
  const [replying, setReplying] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  // Seed + nonce let "Quote reply" prefill the reply composer (remount on change).
  const [replySeed, setReplySeed] = useState('')
  const [replyNonce, setReplyNonce] = useState(0)

  function openReply(initial = ''): void {
    setReplySeed(initial)
    setReplyNonce((n) => n + 1)
    setReplying(true)
  }

  return (
    <div className="space-y-3 rounded-md border border-border-subtle bg-background-elevated p-2.5">
      {thread.comments.map((c) => (
        <PostedComment
          key={c.id}
          comment={c}
          canEdit={!!currentLogin && c.author?.login === currentLogin}
          onQuoteReply={onReply ? () => openReply(quoteMarkdown(c.body)) : undefined}
          onSaveEdit={onEditComment ? (body) => onEditComment(c.id, body) : undefined}
        />
      ))}
      {onReply &&
        (replying ? (
          <CommentComposer
            key={replyNonce}
            initialValue={replySeed}
            placeholder="Reply…"
            submitLabel="Reply"
            busy={replyBusy}
            autoFocus
            error={replyError}
            // Await the post before closing — on failure keep the composer open
            // (and its typed text) and show the error rather than dropping it.
            onSubmit={async (body) => {
              setReplyError(null)
              try {
                await onReply(body)
                setReplying(false)
                setReplySeed('')
              } catch (e) {
                setReplyError(e instanceof Error ? e.message : 'Failed to post reply.')
              }
            }}
            onCancel={() => {
              setReplyError(null)
              setReplying(false)
              setReplySeed('')
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => openReply()}
            className="text-[11px] font-medium text-text-muted hover:text-text-primary"
          >
            Reply
          </button>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A pending (not-yet-submitted) inline comment with edit/remove.
// ---------------------------------------------------------------------------
export function PendingCommentView({
  comment,
  onUpdate,
  onRemove
}: {
  comment: DraftInlineComment
  onUpdate: (body: string) => void
  onRemove: () => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <CommentComposer
        initialValue={comment.body}
        placeholder="Edit comment…"
        submitLabel="Save"
        autoFocus
        onSubmit={(body) => {
          onUpdate(body)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }
  return (
    <div className="rounded-md border border-accent/40 bg-accent-soft p-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[11px]">
        <MessageIcon className="h-3.5 w-3.5 text-accent-hover" />
        <span className="font-semibold uppercase tracking-wide text-accent-hover">Pending</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-text-muted hover:text-text-primary">
            Edit
          </button>
          <button type="button" onClick={onRemove} className="text-text-muted hover:text-danger">
            Remove
          </button>
        </div>
      </div>
      <CommentMarkdown>{comment.body}</CommentMarkdown>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Read-only summary of all pending inline comments, shown on the submit
// surfaces so the reviewer sees exactly what will be attached to the review.
// ---------------------------------------------------------------------------
export function PendingCommentsList(): JSX.Element | null {
  const comments = usePendingReviewStore((s) => s.comments)
  const removeComment = usePendingReviewStore((s) => s.removeComment)
  if (comments.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {comments.length} inline comment{comments.length === 1 ? '' : 's'}
      </div>
      {comments.map((c) => (
        <div key={c.localId} className="rounded-md border border-border-subtle bg-background-panel p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="mono truncate">
              {c.path}:{c.line}
            </span>
            <button
              type="button"
              onClick={() => removeComment(c.localId)}
              className="ml-auto shrink-0 hover:text-danger"
            >
              Remove
            </button>
          </div>
          {c.lineContent && (
            <pre className="mono mb-1.5 truncate rounded bg-background px-2 py-1 text-[11px] text-text-secondary">
              {c.lineContent}
            </pre>
          )}
          <CommentMarkdown>{c.body}</CommentMarkdown>
        </div>
      ))}
    </div>
  )
}
