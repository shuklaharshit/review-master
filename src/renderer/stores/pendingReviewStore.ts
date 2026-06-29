import { create } from 'zustand'
import type { DiffSide, DraftInlineComment } from '@shared/types'

/**
 * Holds inline comments the reviewer is drafting before the review is submitted
 * (GitHub's "pending review" model). They live only in the renderer until the
 * review is submitted, at which point they're batched into the GitHub review as
 * `comments[]`. State is keyed by snapshot id so it resets when the PR/snapshot
 * changes (a stale comment anchored to an old diff would be meaningless).
 */
export interface PendingReviewStore {
  snapshotId: string | null
  comments: DraftInlineComment[]

  reset: (snapshotId: string | null) => void
  addComment: (input: Omit<DraftInlineComment, 'localId'>) => void
  updateComment: (localId: string, body: string) => void
  removeComment: (localId: string) => void
  clear: () => void
}

let seq = 0

export const usePendingReviewStore = create<PendingReviewStore>((set) => ({
  snapshotId: null,
  comments: [],

  reset: (snapshotId) => set({ snapshotId, comments: [] }),

  addComment: (input) =>
    set((s) => ({
      comments: [...s.comments, { ...input, localId: `pc${++seq}` }]
    })),

  updateComment: (localId, body) =>
    set((s) => ({
      comments: s.comments.map((c) => (c.localId === localId ? { ...c, body } : c))
    })),

  removeComment: (localId) =>
    set((s) => ({ comments: s.comments.filter((c) => c.localId !== localId) })),

  clear: () => set({ comments: [] })
}))

/** Stable anchor key for a diff line so comments attach to the right row. */
export function anchorKey(side: DiffSide, line: number): string {
  return `${side}:${line}`
}

/**
 * Maps a diff line to the GitHub comment anchor: additions/context attach to the
 * RIGHT (head) side at the new line number; deletions attach to the LEFT (base)
 * side at the old line number. Returns null for lines we can't anchor.
 */
export function lineAnchor(line: {
  type: 'context' | 'added' | 'removed'
  oldLineNumber?: number
  newLineNumber?: number
}): { side: DiffSide; line: number } | null {
  if (line.type === 'removed') {
    return line.oldLineNumber ? { side: 'LEFT', line: line.oldLineNumber } : null
  }
  return line.newLineNumber ? { side: 'RIGHT', line: line.newLineNumber } : null
}
