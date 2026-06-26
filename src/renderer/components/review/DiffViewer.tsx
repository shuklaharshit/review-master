import { Fragment, useMemo, useState } from 'react'
import type { NormalizedDiffFile } from '@shared/types'
import { cn } from '../ui/cn'
import { CopyIcon, CheckIcon, EyeIcon, FileIcon } from '../ui/icons'
import { splitPath } from '../../lib/paths'
import { enrichWithWordDiff } from '../../lib/diffWords'
import { DiffRows, HunkHeaderRow } from './DiffRows'

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
  onViewFullFile
}: {
  file: NormalizedDiffFile
  viewed: boolean
  onToggleViewed: () => void
  /** Opens the full-file modal. Omitted (button hidden) when unavailable. */
  onViewFullFile?: () => void
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const { name } = splitPath(file.path)

  // Whole file is shown only as changed hunks here; word-level segments are
  // computed once per file so the rows can highlight intra-line edits.
  const hunks = useMemo(
    () => file.hunks.map((h) => ({ header: h.header, lines: enrichWithWordDiff(h.lines) })),
    [file.hunks]
  )

  // Full-file view only makes sense for inline-able text files.
  const canViewFull = !!onViewFullFile && !file.isBinary && file.status !== 'binary'

  function copyPath(): void {
    void navigator.clipboard.writeText(file.path)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
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
                  <DiffRows lines={hunk.lines} />
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
