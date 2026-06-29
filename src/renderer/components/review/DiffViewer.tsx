import { Fragment, useMemo, useState } from 'react'
import type { NormalizedDiffFile, PullRequestRef, ReviewCommentThread } from '@shared/types'
import { cn } from '../ui/cn'
import { CopyIcon, CheckIcon, EyeIcon, FileIcon, MessageIcon } from '../ui/icons'
import { enrichWithWordDiff, type RenderableDiffLine } from '../../lib/diffWords'
import { DiffRows, HunkHeaderRow } from './DiffRows'
import { usePendingReviewStore, anchorKey, lineAnchor } from '../../stores/pendingReviewStore'
import { useReplyReviewComment } from '../../queries/useConversation'
import { CommentComposer, ExistingThreadView, PendingCommentView } from './InlineComments'

const statusTone: Record<string, string> = {
  added: 'text-success',
  removed: 'text-danger',
  modified: 'text-info',
  renamed: 'text-warning',
  copied: 'text-warning',
  binary: 'text-text-muted'
}

export function DiffViewer({
  file,
  viewed,
  onToggleViewed,
  onViewFullFile,
  prRef,
  threads = [],
  enableComments = true
}: {
  file: NormalizedDiffFile
  viewed: boolean
  onToggleViewed: () => void
  /** Opens the full-file modal. Omitted (button hidden) when unavailable. */
  onViewFullFile?: () => void
  /** PR ref — required to post inline replies. */
  prRef?: PullRequestRef
  /** Existing inline-comment threads (all files; filtered here by path). */
  threads?: ReviewCommentThread[]
  /** Whether the add-inline-comment affordance is shown. */
  enableComments?: boolean
}): JSX.Element {
  const [copied, setCopied] = useState(false)

  // Composer anchor currently open for a brand-new pending comment.
  const [composer, setComposer] = useState<{ key: string; side: 'LEFT' | 'RIGHT'; line: number; content: string } | null>(
    null
  )

  const pendingComments = usePendingReviewStore((s) => s.comments)
  const addComment = usePendingReviewStore((s) => s.addComment)
  const updateComment = usePendingReviewStore((s) => s.updateComment)
  const removeComment = usePendingReviewStore((s) => s.removeComment)
  const reply = useReplyReviewComment(prRef ?? null)

  const commentsEnabled = enableComments && !!onViewFullFile // inline viewer only (modal omits onViewFullFile)

  // Whole file is shown only as changed hunks here; word-level segments are
  // computed once per file so the rows can highlight intra-line edits.
  const hunks = useMemo(
    () => file.hunks.map((h) => ({ header: h.header, lines: enrichWithWordDiff(h.lines) })),
    [file.hunks]
  )

  // Index existing threads + pending comments by diff-line anchor.
  const threadsByAnchor = useMemo(() => {
    const map = new Map<string, ReviewCommentThread[]>()
    for (const t of threads) {
      if (t.path !== file.path || !t.line || !t.side) continue
      const key = anchorKey(t.side, t.line)
      const bucket = map.get(key)
      if (bucket) bucket.push(t)
      else map.set(key, [t])
    }
    return map
  }, [threads, file.path])

  const pendingByAnchor = useMemo(() => {
    const map = new Map<string, typeof pendingComments>()
    for (const c of pendingComments) {
      if (c.path !== file.path) continue
      const key = anchorKey(c.side, c.line)
      const bucket = map.get(key)
      if (bucket) bucket.push(c)
      else map.set(key, [c])
    }
    return map
  }, [pendingComments, file.path])

  const fileThreadCount = useMemo(
    () => threads.filter((t) => t.path === file.path).length,
    [threads, file.path]
  )
  const filePendingCount = pendingComments.filter((c) => c.path === file.path).length

  const canViewFull = !!onViewFullFile && !file.isBinary && file.status !== 'binary'

  function copyPath(): void {
    void navigator.clipboard.writeText(file.path)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  function onRequestComment(line: RenderableDiffLine): void {
    const anchor = lineAnchor(line)
    if (!anchor) return
    setComposer({ key: anchorKey(anchor.side, anchor.line), side: anchor.side, line: anchor.line, content: line.content })
  }

  function renderLineExtras(line: RenderableDiffLine): JSX.Element | null {
    const anchor = lineAnchor(line)
    if (!anchor) return null
    const key = anchorKey(anchor.side, anchor.line)
    const lineThreads = threadsByAnchor.get(key) ?? []
    const linePending = pendingByAnchor.get(key) ?? []
    const showComposer = composer?.key === key
    if (lineThreads.length === 0 && linePending.length === 0 && !showComposer) return null

    return (
      <div className="space-y-2 py-1">
        {lineThreads.map((t) => (
          <ExistingThreadView
            key={t.id}
            thread={t}
            replyBusy={reply.isPending}
            onReply={prRef ? (body) => reply.mutateAsync({ ref: prRef, inReplyToId: t.id, body }) : undefined}
          />
        ))}
        {linePending.map((c) => (
          <PendingCommentView
            key={c.localId}
            comment={c}
            onUpdate={(body) => updateComment(c.localId, body)}
            onRemove={() => removeComment(c.localId)}
          />
        ))}
        {showComposer && composer && (
          <CommentComposer
            placeholder="Leave a comment on this line…"
            submitLabel="Add comment"
            autoFocus
            onSubmit={(body) => {
              addComment({
                path: file.path,
                line: composer.line,
                side: composer.side,
                body,
                lineContent: composer.content
              })
              setComposer(null)
            }}
            onCancel={() => setComposer(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-background-panel">
      {/* File header */}
      <div className="flex items-center gap-2 border-b border-border-subtle bg-background-elevated px-3 py-2">
        <span className={cn('text-[10px] font-semibold uppercase', statusTone[file.status] ?? 'text-text-muted')}>
          {file.status}
        </span>
        <div className="min-w-0 flex-1">
          {file.oldPath && file.oldPath !== file.path ? (
            <span className="mono truncate text-[12px] text-text-secondary" title={`${file.oldPath} → ${file.path}`}>
              <span className="text-text-muted line-through">{file.oldPath}</span> → {file.path}
            </span>
          ) : (
            <span className="mono truncate text-[12px] text-text-primary" title={file.path}>
              {file.path}
            </span>
          )}
        </div>
        {(fileThreadCount > 0 || filePendingCount > 0) && (
          <span
            className="inline-flex shrink-0 items-center gap-1 text-[11px] text-text-muted"
            title={`${fileThreadCount} thread(s), ${filePendingCount} pending`}
          >
            <MessageIcon className="h-3.5 w-3.5" />
            {fileThreadCount + filePendingCount}
          </span>
        )}
        <span className="mono shrink-0 text-[11px]">
          <span className="text-success">+{file.additions}</span> <span className="text-danger">-{file.deletions}</span>
        </span>
        <button
          type="button"
          onClick={copyPath}
          className="shrink-0 rounded p-1 text-text-muted hover:bg-background-panel-hover hover:text-text-primary"
          aria-label="Copy file path"
          title="Copy file path"
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5 text-success" /> : <CopyIcon className="h-3.5 w-3.5" />}
        </button>
        {canViewFull && (
          <button
            type="button"
            onClick={onViewFullFile}
            className="flex shrink-0 items-center gap-1 rounded border border-border-strong px-1.5 py-0.5 text-[11px] text-text-muted transition-colors hover:text-text-primary"
            title="View the entire file with changes highlighted"
          >
            <FileIcon className="h-3.5 w-3.5" /> View file
          </button>
        )}
        <button
          type="button"
          onClick={onToggleViewed}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors',
            viewed
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-border-strong text-text-muted hover:text-text-primary'
          )}
          title="Mark as viewed (local only)"
        >
          <EyeIcon className="h-3.5 w-3.5" /> {viewed ? 'Viewed' : 'Mark viewed'}
        </button>
      </div>

      {/* Body */}
      {file.isBinary || file.status === 'binary' ? (
        <div className="px-4 py-6 text-center text-[12px] text-text-muted">Binary file changed — not analysed.</div>
      ) : file.hunks.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-text-muted">
          {file.isLarge ? 'File too large to display inline.' : 'No textual changes to display.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[12px] leading-[1.5]">
            <tbody>
              {hunks.map((hunk, hi) => (
                <Fragment key={hi}>
                  <HunkHeaderRow header={hunk.header} />
                  <DiffRows
                    lines={hunk.lines}
                    onRequestComment={commentsEnabled ? onRequestComment : undefined}
                    renderLineExtras={commentsEnabled ? renderLineExtras : undefined}
                  />
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
