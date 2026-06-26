import { describe, it, expect } from 'vitest'
import { buildFullFileDiff, buildRemovedFileDiff } from '../fullFileDiff'
import type { NormalizedDiffFile } from '@shared/types'

function modifiedFile(): NormalizedDiffFile {
  // One line changed (line3 -> NEW3) in the middle of a 6-line file. The patch
  // only carries the hunk around that change; the rest of the file is implied.
  return {
    path: 'src/a.ts',
    status: 'modified',
    additions: 1,
    deletions: 1,
    hunks: [
      {
        header: '@@ -2,3 +2,3 @@',
        oldStart: 2,
        oldLines: 3,
        newStart: 2,
        newLines: 3,
        lines: [
          { type: 'context', oldLineNumber: 2, newLineNumber: 2, content: 'line2' },
          { type: 'removed', oldLineNumber: 3, content: 'line3' },
          { type: 'added', newLineNumber: 3, content: 'NEW3' },
          { type: 'context', oldLineNumber: 4, newLineNumber: 4, content: 'line4' }
        ]
      }
    ]
  }
}

describe('buildFullFileDiff', () => {
  it('fills unchanged gaps from the full head text around the hunk', () => {
    const head = 'line1\nline2\nNEW3\nline4\nline5\nline6\n'
    const lines = buildFullFileDiff(modifiedFile(), head)

    // The new-side view (everything except removed lines) must reproduce the
    // whole file in order — gaps before, within, and after the hunk.
    const newSide = lines.filter((l) => l.type !== 'removed').map((l) => l.content)
    expect(newSide).toEqual(['line1', 'line2', 'NEW3', 'line4', 'line5', 'line6'])

    // New-side line numbers are contiguous 1..6.
    expect(lines.filter((l) => l.type !== 'removed').map((l) => l.newLineNumber)).toEqual([
      1, 2, 3, 4, 5, 6
    ])

    // The deletion is preserved in place with its old line number.
    const removed = lines.filter((l) => l.type === 'removed')
    expect(removed).toEqual([{ type: 'removed', oldLineNumber: 3, content: 'line3' }])
  })

  it('handles an added file whose single hunk already covers the whole file', () => {
    const added: NormalizedDiffFile = {
      path: 'new.ts',
      status: 'added',
      additions: 3,
      deletions: 0,
      hunks: [
        {
          header: '@@ -0,0 +1,3 @@',
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 3,
          lines: [
            { type: 'added', newLineNumber: 1, content: 'a' },
            { type: 'added', newLineNumber: 2, content: 'b' },
            { type: 'added', newLineNumber: 3, content: 'c' }
          ]
        }
      ]
    }
    const lines = buildFullFileDiff(added, 'a\nb\nc\n')
    expect(lines.every((l) => l.type === 'added')).toBe(true)
    expect(lines.map((l) => l.content)).toEqual(['a', 'b', 'c'])
  })

  it('does not emit a phantom trailing blank line for a newline-terminated file', () => {
    const lines = buildFullFileDiff(
      { path: 'x', status: 'modified', additions: 0, deletions: 0, hunks: [] },
      'a\nb\n'
    )
    expect(lines.map((l) => l.content)).toEqual(['a', 'b'])
  })
})

describe('buildRemovedFileDiff', () => {
  it('renders every base line as a removal', () => {
    const lines = buildRemovedFileDiff('x\ny\n')
    expect(lines).toEqual([
      { type: 'removed', oldLineNumber: 1, content: 'x' },
      { type: 'removed', oldLineNumber: 2, content: 'y' }
    ])
  })
})
