import { Fragment, type ReactNode } from 'react'
import { cn } from '../ui/cn'
import type { RenderableDiffLine, WordSegment } from '../../lib/diffWords'

/**
 * Shared, presentational diff-line rendering used by both the inline
 * `DiffViewer` and the full-file `FileViewerModal`, so they look identical.
 *
 * Layout mirrors GitHub: two line-number gutters, a sign column, then the code.
 * The gutters carry a slightly stronger tint than the row body, and changed
 * lines that came with intra-line word segments highlight the exact spans that
 * differ (a stronger tint again). Render inside a `<table><tbody>`.
 *
 * When `onRequestComment` is supplied, hovering a line reveals a "+" affordance
 * in the line-number gutter (GitHub's add-inline-comment gesture); when
 * `renderLineExtras` returns content for a line, it's rendered in a full-width
 * row beneath it (existing threads, pending comments, and the composer).
 */

// Per-change-type Tailwind classes. Gutters are tinted a notch stronger than
// the code body — that contrast is what makes the diff readable at a glance
// (the old viewer's flat 10% tint was nearly invisible on the dark theme).
const ROW_STYLES = {
  added: { body: 'bg-diff-add-bg', gutter: 'bg-diff-add-gutter', sign: 'text-success', glyph: '+' },
  removed: { body: 'bg-diff-del-bg', gutter: 'bg-diff-del-gutter', sign: 'text-danger', glyph: '-' },
  context: { body: '', gutter: 'bg-background-panel', sign: 'text-text-muted', glyph: ' ' }
} as const

function Content({
  segments,
  content,
  changed
}: {
  segments?: WordSegment[]
  content: string
  changed: 'added' | 'removed' | null
}): JSX.Element {
  if (!segments || !changed) return <>{content}</>
  const wordBg = changed === 'added' ? 'bg-diff-add-word' : 'bg-diff-del-word'
  return (
    <>
      {segments.map((seg, i) =>
        seg.changed ? (
          <span key={i} className={cn('rounded-sm', wordBg)}>
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  )
}

export function DiffRows({
  lines,
  onRequestComment,
  renderLineExtras
}: {
  lines: RenderableDiffLine[]
  /** When set, hovering a line shows a "+" to start an inline comment. */
  onRequestComment?: (line: RenderableDiffLine) => void
  /** Content rendered in a full-width row beneath a line (comments/composer). */
  renderLineExtras?: (line: RenderableDiffLine) => ReactNode
}): JSX.Element {
  return (
    <>
      {lines.map((line, i) => {
        const style = ROW_STYLES[line.type]
        const extras = renderLineExtras?.(line)
        const canComment = !!onRequestComment
        return (
          <Fragment key={i}>
            <tr className="group">
              <td
                className={cn(
                  'w-12 select-none px-2 text-right align-top text-[10px] text-text-muted',
                  style.gutter
                )}
              >
                {line.oldLineNumber ?? ''}
              </td>
              <td
                className={cn(
                  'relative w-12 select-none border-r border-border-subtle px-2 text-right align-top text-[10px] text-text-muted',
                  style.gutter
                )}
              >
                {canComment && (
                  <button
                    type="button"
                    onClick={() => onRequestComment?.(line)}
                    title="Add inline comment"
                    aria-label="Add inline comment"
                    className="absolute left-0.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 items-center justify-center rounded bg-accent text-[11px] font-bold leading-none text-accent-foreground group-hover:flex"
                  >
                    +
                  </button>
                )}
                {line.newLineNumber ?? ''}
              </td>
              <td className={cn('w-5 select-none px-1 text-center align-top', style.sign, style.body)}>
                {style.glyph}
              </td>
              <td className={cn('whitespace-pre px-2 text-text-primary', style.body)}>
                <Content
                  segments={line.segments}
                  content={line.content}
                  changed={line.type === 'context' ? null : line.type}
                />
              </td>
            </tr>
            {extras ? (
              <tr>
                <td colSpan={4} className="bg-background px-3 py-2">
                  <div className="whitespace-normal font-sans">{extras}</div>
                </td>
              </tr>
            ) : null}
          </Fragment>
        )
      })}
    </>
  )
}

/** The "@@ … @@" hunk separator row (inline viewer only). */
export function HunkHeaderRow({ header }: { header: string }): JSX.Element {
  return (
    <tr className="bg-diff-hunk-bg">
      <td colSpan={4} className="select-none px-3 py-0.5 text-[11px] text-accent-hover">
        {header}
      </td>
    </tr>
  )
}
