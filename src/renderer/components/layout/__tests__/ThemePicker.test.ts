// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemePicker } from '../ThemePicker'
import { useAppStore } from '../../../stores/appStore'
import { DESIGN_THEMES } from '../../../lib/designThemes'
import { click, render } from '../../review/__tests__/renderHelper'

afterEach(() => {
  // The appStore is a module singleton; reset it so tests don't leak themes.
  useAppStore.setState({ designTheme: 'graphite' })
  localStorage.clear()
  delete document.documentElement.dataset.rmTheme
})

function cardButton(container: HTMLElement, name: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(name)
  )
  if (!btn) throw new Error(`theme card not found: ${name}`)
  return btn as HTMLButtonElement
}

describe('ThemePicker', () => {
  it('renders a card for every registered theme', () => {
    const { container, unmount } = render(createElement(ThemePicker))
    for (const theme of DESIGN_THEMES) {
      expect(container.textContent).toContain(theme.name)
    }
    unmount()
  })

  it('selecting a card switches the system-wide theme and marks it active', () => {
    useAppStore.setState({ designTheme: 'graphite' })
    const { container, unmount } = render(createElement(ThemePicker))

    expect(cardButton(container, 'Graphite').getAttribute('aria-pressed')).toBe('true')

    click(cardButton(container, 'Carbon'))

    expect(useAppStore.getState().designTheme).toBe('carbon')
    expect(document.documentElement.dataset.rmTheme).toBe('carbon')
    expect(cardButton(container, 'Carbon').getAttribute('aria-pressed')).toBe('true')
    expect(cardButton(container, 'Graphite').getAttribute('aria-pressed')).toBe('false')
    unmount()
  })
})
