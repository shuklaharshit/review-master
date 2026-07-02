// Shared jsdom render helper for component tests.
//
// A thin jsdom render helper over react-dom/client (React 18 createRoot) that
// queries the resulting DOM with standard APIs. We keep this lightweight custom
// renderer (rather than @testing-library/react) because these tests were
// authored against it; jest-dom matchers (toBeInTheDocument, toHaveTextContent,
// …) are registered — with proper Vitest types — via the `/vitest` entry.
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '../../ui/Tooltip'
import '@testing-library/jest-dom/vitest'

// Silence React 18 act() environment warnings.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export interface RenderResult {
  container: HTMLElement
  root: Root
  rerender: (el: ReactElement) => void
  unmount: () => void
}

// Mirror main.tsx: the app renders inside a TooltipProvider, so components
// using Tooltip need one in tests too.
function wrap(element: ReactElement): ReactElement {
  return createElement(TooltipProvider, null, element)
}

export function render(element: ReactElement): RenderResult {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(wrap(element))
  })
  return {
    container,
    root,
    rerender(el: ReactElement) {
      act(() => {
        root.render(wrap(el))
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  }
}

/** Find the first element whose trimmed text content contains `text`. */
export function findByText(container: ParentNode, text: string): HTMLElement | null {
  const all = container.querySelectorAll<HTMLElement>('*')
  for (const el of Array.from(all)) {
    // Only match elements whose own direct text (ignoring nested element text
    // duplication) contains the string; querySelectorAll is document order so
    // the most specific deepest match is preferred by iterating children-last.
    if (el.textContent && el.textContent.includes(text)) {
      // prefer the deepest matching element
      const deeper = Array.from(el.querySelectorAll<HTMLElement>('*')).find(
        (c) => c.textContent && c.textContent.includes(text)
      )
      if (!deeper) return el
    }
  }
  // Fall back to the shallowest match if no leaf-only match found.
  for (const el of Array.from(all)) {
    if (el.textContent && el.textContent.includes(text)) return el
  }
  return null
}

/** Click an element wrapped in act(). */
export function click(el: Element | null): void {
  if (!el) throw new Error('click: element not found')
  act(() => {
    ;(el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** Set a textarea/input value and dispatch a React-compatible change event. */
export function changeValue(el: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  act(() => {
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
