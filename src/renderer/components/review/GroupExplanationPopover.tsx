import type { ReviewGroup } from '@shared/types'

/** Inline expansion content for a review group's "Read explanation" action. */
export function GroupExplanationContent({ group }: { group: ReviewGroup }) {
  return (
    <div className="mt-2 space-y-2 rounded-md border border-border-subtle bg-background-elevated p-3 text-[12px] leading-relaxed text-text-secondary">
      {group.explanation && (
        <div>
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">What changed</div>
          <p>{group.explanation}</p>
        </div>
      )}
      {group.readExplanation && (
        <div>
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Why this matters &amp; how to review
          </div>
          <p className="whitespace-pre-wrap">{group.readExplanation}</p>
        </div>
      )}
    </div>
  )
}
