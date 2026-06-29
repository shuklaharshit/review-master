// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewEventSelector } from '../ReviewEventSelector'
import { TooltipProvider } from '../../ui/Tooltip'
import { click, render } from './renderHelper'

const open: Array<() => void> = []
afterEach(() => open.splice(0).forEach((fn) => fn()))

function withProvider(el: ReactElement): ReactElement {
  return createElement(TooltipProvider, null, el)
}

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'))
}
function byText(container: HTMLElement, text: string): HTMLButtonElement {
  const b = buttons(container).find((el) => el.textContent?.includes(text))
  if (!b) throw new Error(`button "${text}" not found`)
  return b
}

describe('ReviewEventSelector', () => {
  it('enables all actions and reports selection when no reason is given', () => {
    const onChange = vi.fn()
    const r = render(withProvider(createElement(ReviewEventSelector, { value: 'COMMENT', onChange })))
    open.push(r.unmount)
    expect(byText(r.container, 'Approve').disabled).toBe(false)
    expect(byText(r.container, 'Request changes').disabled).toBe(false)
    click(byText(r.container, 'Approve'))
    expect(onChange).toHaveBeenCalledWith('APPROVE')
  })

  it('disables approve + request-changes on your own PR, keeps comment enabled', () => {
    const r = render(
      withProvider(
        createElement(ReviewEventSelector, {
          value: 'COMMENT',
          onChange: vi.fn(),
          disabledReason: "You can't approve your own pull request."
        })
      )
    )
    open.push(r.unmount)
    expect(byText(r.container, 'Approve').disabled).toBe(true)
    expect(byText(r.container, 'Request changes').disabled).toBe(true)
    expect(byText(r.container, 'Comment').disabled).toBe(false)
  })
})
