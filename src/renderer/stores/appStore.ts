import { create } from 'zustand'
import type { BootstrapStatus, CodexSessionState, PullRequestRef, Repository, UpdateStatus } from '@shared/types'
import { type DesignThemeId, applyDesignTheme, loadStoredTheme } from '../lib/designThemes'

export type Route = 'onboarding' | 'accounts' | 'repos' | 'prs' | 'workspace' | 'settings'

export type ToastLevel = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  level: ToastLevel
  message: string
}

/**
 * A full navigable location. A screen renders itself entirely from these four
 * fields (route + the selection context each route reads), so back/forward is
 * just restoring one of these snapshots atomically.
 */
export interface Location {
  route: Route
  activeAccountId: string | null
  selectedRepo: Repository | null
  selectedPrRef: PullRequestRef | null
}

/** Cap so a long session can't grow the stack unbounded. */
const MAX_HISTORY = 50

function repoKey(r: Repository | null): string {
  return r ? String(r.id) : ''
}
function prKey(r: PullRequestRef | null): string {
  return r ? `${r.accountId}/${r.repoId}#${r.number}` : ''
}

/** Two locations are the "same place" if their identity fields all match. */
function sameLocation(a: Location, b: Location): boolean {
  return (
    a.route === b.route &&
    a.activeAccountId === b.activeAccountId &&
    repoKey(a.selectedRepo) === repoKey(b.selectedRepo) &&
    prKey(a.selectedPrRef) === prKey(b.selectedPrRef)
  )
}

/** Bundle the history fields + their derived can-go flags for a single `set`. */
function navState(history: Location[], historyIndex: number) {
  return {
    history,
    historyIndex,
    canGoBack: historyIndex > 0,
    canGoForward: historyIndex < history.length - 1
  }
}

interface AppState {
  route: Route
  activeAccountId: string | null
  selectedRepo: Repository | null
  selectedPrRef: PullRequestRef | null

  // Navigation history (browser-style back/forward).
  history: Location[]
  historyIndex: number
  canGoBack: boolean
  canGoForward: boolean

  bootstrap: BootstrapStatus | null
  codexState: CodexSessionState
  updateStatus: UpdateStatus | null

  toasts: Toast[]

  /** Active visual design iteration (see lib/designThemes). */
  designTheme: DesignThemeId

  // navigation
  navigate: (patch: Partial<Location>, opts?: { replace?: boolean }) => void
  goBack: () => void
  goForward: () => void
  setRoute: (route: Route) => void
  switchAccount: (id: string | null) => void
  setDesignTheme: (id: DesignThemeId) => void
  setActiveAccountId: (id: string | null) => void
  selectRepo: (repo: Repository | null) => void
  openWorkspaceFor: (ref: PullRequestRef) => void

  // bootstrap / codex / updates
  setBootstrap: (status: BootstrapStatus) => void
  setCodexState: (state: CodexSessionState) => void
  setUpdateStatus: (status: UpdateStatus) => void

  // toasts
  pushToast: (level: ToastLevel, message: string) => void
  dismissToast: (id: string) => void
}

let toastSeq = 0

export const useAppStore = create<AppState>((set, get) => {
  function currentLocation(): Location {
    const s = get()
    return {
      route: s.route,
      activeAccountId: s.activeAccountId,
      selectedRepo: s.selectedRepo,
      selectedPrRef: s.selectedPrRef
    }
  }

  /** Spread a location's fields back onto the store so screens re-render. */
  function fields(loc: Location): Pick<AppState, keyof Location> {
    return {
      route: loc.route,
      activeAccountId: loc.activeAccountId,
      selectedRepo: loc.selectedRepo,
      selectedPrRef: loc.selectedPrRef
    }
  }

  return {
    route: 'onboarding',
    activeAccountId: null,
    selectedRepo: null,
    selectedPrRef: null,

    ...navState([], -1),

    bootstrap: null,
    codexState: 'unknown',
    updateStatus: null,

    toasts: [],

    designTheme: loadStoredTheme(),

    // The single choke-point for navigation. Every route change funnels here so
    // the history stack stays authoritative. `replace` overwrites the current
    // entry (used to seed the initial location) instead of pushing a new one.
    navigate: (patch, opts) => {
      const s = get()
      const current = currentLocation()
      const next: Location = { ...current, ...patch }

      // Don't record a dead entry for "navigating" to where we already are.
      if (!opts?.replace && s.historyIndex >= 0 && sameLocation(current, next)) {
        set(fields(next))
        return
      }

      let history: Location[]
      let historyIndex: number

      if (s.history.length === 0) {
        // First navigation seeds the stack (also the bootstrap entry point).
        history = [next]
        historyIndex = 0
      } else if (opts?.replace) {
        // Overwrite the current entry in place, keeping the rest of the stack.
        history = s.history.slice()
        history[s.historyIndex] = next
        historyIndex = s.historyIndex
      } else {
        // Drop any forward entries, then push — standard browser semantics.
        const kept = s.history.slice(0, s.historyIndex + 1)
        kept.push(next)
        const overflow = kept.length - MAX_HISTORY
        history = overflow > 0 ? kept.slice(overflow) : kept
        historyIndex = history.length - 1
      }

      set({ ...fields(next), ...navState(history, historyIndex) })
    },

    goBack: () => {
      const s = get()
      if (s.historyIndex <= 0) return
      const idx = s.historyIndex - 1
      set({ ...fields(s.history[idx]), ...navState(s.history, idx) })
    },

    goForward: () => {
      const s = get()
      if (s.historyIndex >= s.history.length - 1) return
      const idx = s.historyIndex + 1
      set({ ...fields(s.history[idx]), ...navState(s.history, idx) })
    },

    setRoute: (route) => get().navigate({ route }),

    // Switching accounts is one history entry: a fresh repos landing for the new
    // account, clearing the previous account's repo/PR selection.
    switchAccount: (id) =>
      get().navigate({ activeAccountId: id, selectedRepo: null, selectedPrRef: null, route: 'repos' }),

    setDesignTheme: (id) => {
      applyDesignTheme(id)
      set({ designTheme: id })
    },

    // In-place account update (bootstrap seeding, background account.added) — not
    // a navigation, so it mutates the current history entry rather than pushing.
    setActiveAccountId: (id) =>
      set((s) => {
        const history = s.history.slice()
        if (history[s.historyIndex]) {
          history[s.historyIndex] = { ...history[s.historyIndex], activeAccountId: id }
        }
        return { activeAccountId: id, history }
      }),

    selectRepo: (repo) => get().navigate({ selectedRepo: repo, route: repo ? 'prs' : 'repos' }),
    openWorkspaceFor: (ref) => get().navigate({ selectedPrRef: ref, route: 'workspace' }),

    setBootstrap: (status) =>
      set((s) => ({
        bootstrap: status,
        codexState: status.codex.serverState ?? s.codexState
      })),
    setCodexState: (state) => set({ codexState: state }),
    setUpdateStatus: (status) => set({ updateStatus: status }),

    pushToast: (level, message) =>
      set((s) => ({ toasts: [...s.toasts, { id: `t${++toastSeq}`, level, message }] })),
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
})
