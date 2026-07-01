import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'

/** True when focus is in a field where `[` / `]` are real input, not shortcuts. */
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Global back/forward gestures, mounted once at the app root:
 *   - Cmd+[ / Cmd+]  (macOS)   and   Ctrl+[ / Ctrl+]  (Windows/Linux)
 *   - the dedicated mouse back/forward buttons (buttons 3 and 4)
 *
 * Reads goBack/goForward from the store imperatively (getState) so the handlers
 * stay stable and don't re-subscribe on every history change.
 */
export function useNavigationShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      if (e.key !== '[' && e.key !== ']') return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      const { goBack, goForward } = useAppStore.getState()
      if (e.key === '[') goBack()
      else goForward()
    }

    function onMouseUp(e: MouseEvent): void {
      // 3 = browser-back, 4 = browser-forward on most mice.
      if (e.button !== 3 && e.button !== 4) return
      e.preventDefault()
      const { goBack, goForward } = useAppStore.getState()
      if (e.button === 3) goBack()
      else goForward()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])
}
