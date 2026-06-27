import { describe, it, expect } from 'vitest'
import { withReviewBranding } from '../reviewBranding'
import { APP_NAME, APP_REPO_URL } from '../../../shared/constants'

describe('withReviewBranding', () => {
  it('appends an attribution footer linking to the app repo', () => {
    const out = withReviewBranding('LGTM with a few nits.')
    expect(out).toContain('LGTM with a few nits.')
    expect(out).toContain(`[${APP_NAME}](${APP_REPO_URL})`)
    // separated from the review body by a horizontal rule
    expect(out).toContain('\n---\n')
  })

  it('keeps the original body first, footer last', () => {
    const out = withReviewBranding('Body text.')
    expect(out.indexOf('Body text.')).toBeLessThan(out.indexOf(APP_REPO_URL))
  })

  it('trims trailing whitespace before appending so spacing is consistent', () => {
    const out = withReviewBranding('Body text.\n\n\n')
    expect(out).toContain('Body text.\n\n---\n')
  })

  it('is idempotent — never double-stamps an already-branded body', () => {
    const once = withReviewBranding('Review.')
    expect(withReviewBranding(once)).toBe(once)
  })

  it('still stamps a body that merely links to the repo in prose (not just the footer)', () => {
    const body = `Looks good. See ${APP_REPO_URL}/issues/12 for prior context.`
    const out = withReviewBranding(body)
    expect(out).toContain(`${APP_REPO_URL}/issues/12`)
    // footer appended exactly once, despite the URL already appearing in prose
    expect(out.split('AI-assisted review by')).toHaveLength(2)
    expect(out.trimEnd().endsWith(`[${APP_NAME}](${APP_REPO_URL})*`)).toBe(true)
  })
})
