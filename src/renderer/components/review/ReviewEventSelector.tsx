import { cn } from '../ui/cn'
import { Tooltip } from '../ui/Tooltip'
import { CheckIcon, MessageIcon, XIcon } from '../ui/icons'

export type ReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'

const OPTIONS: { value: ReviewEvent; label: string; Icon: typeof CheckIcon; restricted: boolean }[] = [
  { value: 'COMMENT', label: 'Comment', Icon: MessageIcon, restricted: false },
  { value: 'APPROVE', label: 'Approve', Icon: CheckIcon, restricted: true },
  { value: 'REQUEST_CHANGES', label: 'Request changes', Icon: XIcon, restricted: true }
]

/**
 * GitHub-style review-event picker. `disabledReason`, when set, disables the
 * approve / request-changes options (e.g. the viewer authored the PR, or it's
 * closed) — matching GitHub, which only allows COMMENT in those cases.
 */
export function ReviewEventSelector({
  value,
  onChange,
  disabledReason
}: {
  value: ReviewEvent
  onChange: (event: ReviewEvent) => void
  disabledReason?: string
}): JSX.Element {
  return (
    <div className="inline-flex rounded-md border border-border-strong p-0.5" role="radiogroup" aria-label="Review action">
      {OPTIONS.map((opt) => {
        const disabled = opt.restricted && !!disabledReason
        const active = value === opt.value
        const button = (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors',
              active ? 'bg-accent text-accent-foreground' : 'text-text-muted hover:text-text-primary',
              disabled && 'cursor-not-allowed opacity-40 hover:text-text-muted'
            )}
          >
            <opt.Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        )
        return disabled && disabledReason ? (
          <Tooltip key={opt.value} content={disabledReason}>
            <span className="inline-flex">{button}</span>
          </Tooltip>
        ) : (
          button
        )
      })}
    </div>
  )
}
