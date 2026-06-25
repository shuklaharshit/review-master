import { beforeEach, describe, expect, it } from 'vitest'
import { useReviewWorkspaceStore } from '../reviewWorkspaceStore'
import type { ReviewGroup, WorkspaceState } from '@shared/types'

function makeFile(order: number, path: string): ReviewGroup['files'][number] {
  return {
    order,
    fileReference: path,
    path,
    title: `File ${path}`,
    details: 'details',
    reasonForPosition: 'reason',
    priority: 'medium',
    status: 'modified'
  }
}

function makeGroup(order: number, paths: string[]): ReviewGroup {
  return {
    order,
    title: `Group ${order}`,
    explanation: 'explanation',
    readExplanation: 'read explanation',
    priority: 'medium',
    category: 'business_logic',
    stats: { fileCount: paths.length, additions: 1, deletions: 1 },
    files: paths.map((p, i) => makeFile(i + 1, p))
  }
}

/** Minimal WorkspaceState carrying just the preflight analysis the store reads. */
function makeWorkspace(groups: ReviewGroup[]): WorkspaceState {
  return {
    preflight: {
      analysis: {
        reviewGroups: groups
      }
    }
  } as unknown as WorkspaceState
}

const GROUPS = [
  makeGroup(1, ['src/a.ts', 'src/b.ts']),
  makeGroup(2, ['src/c.ts'])
]

function resetStore(): void {
  useReviewWorkspaceStore.setState({
    selectedGroupOrder: null,
    selectedFilePath: null,
    viewedFiles: {},
    expandedExplanations: {},
    rightPanelTab: 'info',
    showOnlyUnviewed: false,
    workspace: null,
    snapshotId: null
  })
}

describe('reviewWorkspaceStore', () => {
  beforeEach(resetStore)

  it('setWorkspace stores the workspace', () => {
    const ws = makeWorkspace(GROUPS)
    useReviewWorkspaceStore.getState().setWorkspace(ws)
    expect(useReviewWorkspaceStore.getState().workspace).toBe(ws)
  })

  it('resetUi selects first group + its first file from preflight analysis', () => {
    const store = useReviewWorkspaceStore.getState()
    store.setWorkspace(makeWorkspace(GROUPS))
    store.resetUi('snap-1')
    const s = useReviewWorkspaceStore.getState()
    expect(s.snapshotId).toBe('snap-1')
    expect(s.selectedGroupOrder).toBe(1)
    expect(s.selectedFilePath).toBe('src/a.ts')
    // UI flags reset to defaults.
    expect(s.viewedFiles).toEqual({})
    expect(s.expandedExplanations).toEqual({})
    expect(s.showOnlyUnviewed).toBe(false)
  })

  it('resetUi with no groups leaves selections null', () => {
    const store = useReviewWorkspaceStore.getState()
    store.setWorkspace(makeWorkspace([]))
    store.resetUi('snap-empty')
    const s = useReviewWorkspaceStore.getState()
    expect(s.selectedGroupOrder).toBeNull()
    expect(s.selectedFilePath).toBeNull()
  })

  it('resetUi clears prior viewed/expanded state', () => {
    const store = useReviewWorkspaceStore.getState()
    store.setWorkspace(makeWorkspace(GROUPS))
    store.setViewed('src/a.ts', true)
    store.toggleExplanation(1)
    store.setShowOnlyUnviewed(true)
    store.resetUi('snap-2')
    const s = useReviewWorkspaceStore.getState()
    expect(s.viewedFiles).toEqual({})
    expect(s.expandedExplanations).toEqual({})
    expect(s.showOnlyUnviewed).toBe(false)
  })

  it('selectGroup selects the group order and its first file', () => {
    useReviewWorkspaceStore.getState().selectGroup(GROUPS[1])
    const s = useReviewWorkspaceStore.getState()
    expect(s.selectedGroupOrder).toBe(2)
    expect(s.selectedFilePath).toBe('src/c.ts')
  })

  it('selectGroup with no files keeps the current selected file', () => {
    const store = useReviewWorkspaceStore.getState()
    store.selectFile('keep-me.ts')
    store.selectGroup(makeGroup(9, []))
    const s = useReviewWorkspaceStore.getState()
    expect(s.selectedGroupOrder).toBe(9)
    expect(s.selectedFilePath).toBe('keep-me.ts')
  })

  it('selectFile sets the selected file path', () => {
    useReviewWorkspaceStore.getState().selectFile('src/x.ts')
    expect(useReviewWorkspaceStore.getState().selectedFilePath).toBe('src/x.ts')
  })

  it('toggleViewed flips the viewed flag per path', () => {
    const store = useReviewWorkspaceStore.getState()
    store.toggleViewed('src/a.ts')
    expect(useReviewWorkspaceStore.getState().viewedFiles['src/a.ts']).toBe(true)
    store.toggleViewed('src/a.ts')
    expect(useReviewWorkspaceStore.getState().viewedFiles['src/a.ts']).toBe(false)
  })

  it('setViewed sets the viewed flag explicitly', () => {
    const store = useReviewWorkspaceStore.getState()
    store.setViewed('src/a.ts', true)
    expect(useReviewWorkspaceStore.getState().viewedFiles['src/a.ts']).toBe(true)
    store.setViewed('src/a.ts', false)
    expect(useReviewWorkspaceStore.getState().viewedFiles['src/a.ts']).toBe(false)
  })

  it('toggleExplanation flips the expanded flag per group order', () => {
    const store = useReviewWorkspaceStore.getState()
    store.toggleExplanation(1)
    expect(useReviewWorkspaceStore.getState().expandedExplanations[1]).toBe(true)
    store.toggleExplanation(1)
    expect(useReviewWorkspaceStore.getState().expandedExplanations[1]).toBe(false)
  })

  it('setShowOnlyUnviewed sets the filter flag', () => {
    useReviewWorkspaceStore.getState().setShowOnlyUnviewed(true)
    expect(useReviewWorkspaceStore.getState().showOnlyUnviewed).toBe(true)
  })
})
