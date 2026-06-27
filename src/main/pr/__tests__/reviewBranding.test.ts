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
})
