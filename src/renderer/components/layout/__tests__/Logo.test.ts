// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Logo, DEFAULT_LOGO } from '../Logo'
import { render } from '../../review/__tests__/renderHelper'

const open: Array<() => void> = []
afterEach(() => open.splice(0).forEach((fn) => fn()))

describe('Logo', () => {
  it('ships the Review Note mark by default', () => {
    expect(DEFAULT_LOGO).toBe('review-diff')
  })

  it('renders an svg, and the review-diff mark carries green/red diff lines', () => {
    const { container, unmount } = render(createElement(Logo))
    open.push(unmount)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    // bubble (currentColor) + two explicitly-coloured diff lines
    const colored = container.querySelectorAll('path[stroke="var(--success)"], path[stroke="var(--danger)"]')
    expect(colored).toHaveLength(2)
  })

  it('switches geometry by variant', () => {
    const { container, unmount } = render(createElement(Logo, { variant: 'inspect' }))
    open.push(unmount)
    // the inspect mark is the only one with a magnifier lens circle of r=6.3
    expect(container.querySelector('circle[r="6.3"]')).not.toBeNull()
  })
})
