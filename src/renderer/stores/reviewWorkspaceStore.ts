import { create } from 'zustand'
import type { ReviewGroup, WorkspaceState } from '@shared/types'

export interface ReviewWorkspaceUiState {
  selectedGroupOrder: number | null
  selectedFilePath: string | null
  viewedFiles: Record<string, boolean>
  expandedExplanations: Record<number, boolean>
  rightPanelTab: 'info'
  showOnlyUnviewed: boolean
}

interface ReviewWorkspaceStore extends ReviewWorkspaceUiState {
  /** Currently loaded workspace (null while loading). */
  workspace: WorkspaceState | null
  /** Key (snapshot id) the UI state belongs to, used to reset on PR change. */
  snapshotId: string | null

  setWorkspace: (workspace: WorkspaceState) => void
  resetUi: (snapshotId: string | null) => void

  selectGroup: (group: ReviewGroup) => void
  selectFile: (path: string) => void
  toggleViewed: (path: string) => void
  setViewed: (path: string, viewed: boolean) => void
  toggleExplanation: (order: number) => void
  setShowOnlyUnviewed: (value: boolean) => void
}

const initialUi: ReviewWorkspaceUiState = {
  selectedGroupOrder: null,
  selectedFilePath: null,
  viewedFiles: {},
  expandedExplanations: {},
  rightPanelTab: 'info',
  showOnlyUnviewed: false
}

export const useReviewWorkspaceStore = create<ReviewWorkspaceStore>((set, get) => ({
  ...initialUi,
  workspace: null,
  snapshotId: null,

  setWorkspace: (workspace) => set({ workspace }),

  resetUi: (snapshotId) => {
    const groups = get().workspace?.preflight?.analysis?.reviewGroups ?? []
    const first = groups[0]
    set({
      ...initialUi,
      snapshotId,
      selectedGroupOrder: first?.order ?? null,
      selectedFilePath: first?.files?.[0]?.path ?? null
    })
  },

  selectGroup: (group) =>
    set({
      selectedGroupOrder: group.order,
      selectedFilePath: group.files[0]?.path ?? get().selectedFilePath
    }),

  selectFile: (path) => set({ selectedFilePath: path }),

  toggleViewed: (path) =>
    set((s) => ({ viewedFiles: { ...s.viewedFiles, [path]: !s.viewedFiles[path] } })),

  setViewed: (path, viewed) =>
    set((s) => ({ viewedFiles: { ...s.viewedFiles, [path]: viewed } })),

  toggleExplanation: (order) =>
    set((s) => ({ expandedExplanations: { ...s.expandedExplanations, [order]: !s.expandedExplanations[order] } })),

  setShowOnlyUnviewed: (value) => set({ showOnlyUnviewed: value })
}))
