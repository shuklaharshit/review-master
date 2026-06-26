import { useMemo, useRef } from 'react'
import type { NormalizedDiffFile, PullRequestDetail, PullRequestRef } from '@shared/types'
import { Dialog, DialogContent } from '../ui/Dialog'
import { AlertTriangleIcon, SpinnerIcon, XIcon } from '../ui/icons'
import { useFileContent } from '../../queries/useFileContent'
import { enrichWithWordDiff } from '../../lib/diffWords'
import { buildFullFileDiff, buildRemovedFileDiff } from '../../lib/fullFileDiff'
import { DiffRows } from './DiffRows'
import { DiffMinimap, MINIMAP_WIDTH } from './DiffMinimap'

/**
 * Shows a changed file in full, with its PR changes highlighted in place
 * (GitHub's "expand all context" experience). Unlike the inline `DiffViewer`
 * — which only renders the changed hunks — this fetches the file's complete
 * text at the relevant commit and splices the hunks back in (see
 * `lib/fullFileDiff.ts`), so the reviewer sees changes in their surroundings.
 *
 * Read side: deleted files only exist at the base commit, everything else is
 * read at head.
 */
export function FileViewerModal({
  open,
  onOpenChange,
  file,
  pr,
  prRef
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: NormalizedDiffFile
  pr: PullRequestDetail
  prRef: PullRequestRef
}): JSX.Element {
  const removed = file.status === 'removed'
  // Deleted files are read at base (the only place the content still exists),
  // at their old path; everything else is read at head.
  const target = useMemo(
    () =>
      removed
        ? { path: file.oldPath ?? file.path, sha: pr.baseSha }
        : { path: file.path, sha: pr.headSha },
    [removed, file.oldPath, file.path, pr.baseSha, pr.headSha]
  )

  const { data, isLoading, isError, error } = useFileContent(open ? prRef : null, open ? target : null)

  const lines = useMemo(() => {
    if (!data || data.text == null) return []
    return removed ? buildRemovedFileDiff(data.text) : buildFullFileDiff(file, data.text)
  }, [data, removed, file])
  const enriched = useMemo(() => enrichWithWordDiff(lines), [lines])

  const scrollRef = useRef<HTMLDivElement>(null)
  const showContent = !isLoading && !isError && !data?.isBinary && !data?.truncated && enriched.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullSize className="p-0">
        {/* Header: path, status, change stats, close. */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-3">
          <span className="text-[10px] font-semibold uppercase text-text-muted">{file.status}</span>
          <span className="mono min-w-0 flex-1 truncate text-[13px] text-text-primary" title={file.path}>
            {file.path}
          </span>
          <span className="mono shrink-0 text-[11px]">
            <span className="text-success">+{file.additions}</span>{' '}
            <span className="text-danger">-{file.deletions}</span>
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="ml-1 shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-background-panel-hover hover:text-text-primary"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body: code (scrollable) + VSCode-style minimap pinned to the right.
            Absolute positioning (rather than flex) so the code pane's wide,
            non-wrapping content can't squeeze the minimap off the edge — the
            code pane is simply inset by the minimap's width. */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            className="absolute inset-y-0 left-0 overflow-auto bg-background-panel"
            style={{ right: showContent ? MINIMAP_WIDTH : 0 }}
          >
            {isLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-[13px] text-text-muted">
                <SpinnerIcon className="h-4 w-4" /> Loading file…
              </div>
            ) : isError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[13px] text-text-muted">
                <AlertTriangleIcon className="h-5 w-5 text-warning" />
                {(error as Error)?.message ?? 'Could not load this file.'}
              </div>
            ) : data?.isBinary ? (
              <div className="flex h-full items-center justify-center text-[13px] text-text-muted">
                Binary file — cannot be displayed.
              </div>
            ) : data?.truncated || data?.text == null ? (
              <div className="flex h-full items-center justify-center text-[13px] text-text-muted">
                File is too large to display.
              </div>
            ) : (
              <table className="w-full border-collapse font-mono text-[12px] leading-[1.5]">
                <tbody>
                  <DiffRows lines={enriched} />
                </tbody>
              </table>
            )}
          </div>
          {showContent && <DiffMinimap scrollRef={scrollRef} lines={enriched} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
