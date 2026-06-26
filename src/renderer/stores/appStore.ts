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

interface AppState {
  route: Route
  activeAccountId: string | null
  selectedRepo: Repository | null
  selectedPrRef: PullRequestRef | null

  bootstrap: BootstrapStatus | null
  codexState: CodexSessionState
  updateStatus: UpdateStatus | null

  toasts: Toast[]

  /** Active visual design iteration (see lib/designThemes). */
  designTheme: DesignThemeId

  // navigation
  setRoute: (route: Route) => void
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

export const useAppStore = create<AppState>((set) => ({
  route: 'onboarding',
  activeAccountId: null,
  selectedRepo: null,
  selectedPrRef: null,

  bootstrap: null,
  codexState: 'unknown',
  updateStatus: null,

  toasts: [],

  designTheme: loadStoredTheme(),

  setRoute: (route) => set({ route }),
  setDesignTheme: (id) => {
    applyDesignTheme(id)
    set({ designTheme: id })
  },
  setActiveAccountId: (id) => set({ activeAccountId: id }),
  selectRepo: (repo) => set({ selectedRepo: repo, route: repo ? 'prs' : 'repos' }),
  openWorkspaceFor: (ref) => set({ selectedPrRef: ref, route: 'workspace' }),

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
}))
