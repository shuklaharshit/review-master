import { useState } from 'react'
import type { DiffLine, NormalizedDiffFile } from '@shared/types'
import { cn } from '../ui/cn'
import { CopyIcon, CheckIcon, EyeIcon } from '../ui/icons'
import { splitPath } from '../../lib/paths'

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
  onToggleViewed
}: {
  file: NormalizedDiffFile
  viewed: boolean
  onToggleViewed: () => void
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const { name } = splitPath(file.path)

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
              {file.hunks.map((hunk, hi) => (
                <HunkRows key={hi} header={hunk.header} lines={hunk.lines} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HunkRows({ header, lines }: { header: string; lines: DiffLine[] }): JSX.Element {
  return (
    <>
      <tr className="bg-accent-soft/30">
        <td colSpan={3} className="select-none px-3 py-0.5 text-[11px] text-accent-hover">
          {header}
        </td>
      </tr>
      {lines.map((line, i) => {
        const bg =
          line.type === 'added'
            ? 'bg-success/10'
            : line.type === 'removed'
              ? 'bg-danger/10'
              : ''
        const sign = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '
        const signColor =
          line.type === 'added' ? 'text-success' : line.type === 'removed' ? 'text-danger' : 'text-text-muted'
        return (
          <tr key={i} className={bg}>
            <td className="w-10 select-none border-r border-border-subtle px-2 text-right text-[10px] text-text-muted">
              {line.oldLineNumber ?? ''}
            </td>
            <td className="w-10 select-none border-r border-border-subtle px-2 text-right text-[10px] text-text-muted">
              {line.newLineNumber ?? ''}
            </td>
            <td className="whitespace-pre px-2 text-text-primary">
              <span className={cn('mr-1 select-none', signColor)}>{sign}</span>
              {line.content}
            </td>
          </tr>
        )
      })}
    </>
  )
}
