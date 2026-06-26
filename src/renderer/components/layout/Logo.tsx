import type { SVGProps } from 'react'

/**
 * Review Master brand mark. Four concepts live here so the chosen one is a
 * one-prop swap (and the brand sheet can preview them all). All are monochrome
 * stroke marks on a 24×24 grid using `currentColor`, so they inherit the theme
 * accent in the header tile and stay crisp at 16px.
 *
 *  - merge-check  : a git branch resolving into a checkmark (PR + approval).
 *  - monogram     : an "R" whose leg ends in a commit node (name-based).
 *  - review-diff  : a review bubble holding +/- diff lines (comment on a diff).
 *  - inspect      : a magnifier with a checkmark lens (scrutiny + approval).
 */
export type LogoVariant = 'merge-check' | 'monogram' | 'review-diff' | 'inspect'

/** The shipped mark. Change this one line to adopt a different concept. */
export const DEFAULT_LOGO: LogoVariant = 'review-diff'

interface LogoProps extends SVGProps<SVGSVGElement> {
  variant?: LogoVariant
}

export function Logo({ variant = DEFAULT_LOGO, ...props }: LogoProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={16}
      height={16}
      {...props}
    >
      {MARKS[variant]}
    </svg>
  )
}

const MARKS: Record<LogoVariant, JSX.Element> = {
  'merge-check': (
    <>
      <circle cx="6" cy="18" r="2.4" fill="currentColor" stroke="none" />
      <path d="M6 15.6v-4.1C6 8 8 6.6 10.8 6.3" />
      <path d="M9.6 6.5l2.6 2.6 5.2-5.6" />
    </>
  ),
  monogram: (
    <>
      <path d="M7.6 20V4.8h5.1a4 4 0 0 1 0 8.4H7.6" />
      <path d="M11 13.2l5.2 5.9" />
      <circle cx="17.2" cy="19.6" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  // The bubble inherits currentColor; the two diff lines are explicitly green
  // (added) and red (removed) — the colour cue is this concept's whole point.
  // Theme-aware via the --success / --danger vars, so it adapts per skin.
  'review-diff': (
    <>
      <path d="M21 12a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M7 8.2h10" stroke="var(--success)" />
      <path d="M7 11.4h5.5" stroke="var(--danger)" />
    </>
  ),
  inspect: (
    <>
      <circle cx="10.5" cy="10.5" r="6.3" />
      <path d="M15.5 15.5l5 5" />
      <path d="M7.6 10.7l2.1 2.1 3.9-4.3" />
    </>
  )
}
