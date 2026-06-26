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

export function DiffRows({ lines }: { lines: RenderableDiffLine[] }): JSX.Element {
  return (
    <>
      {lines.map((line, i) => {
        const style = ROW_STYLES[line.type]
        return (
          <tr key={i}>
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
                'w-12 select-none border-r border-border-subtle px-2 text-right align-top text-[10px] text-text-muted',
                style.gutter
              )}
            >
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
