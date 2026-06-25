// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedDiffFile } from '@shared/types'
import { DiffViewer } from '../DiffViewer'
import { click, render } from './renderHelper'

const open: Array<() => void> = []
afterEach(() => {
  open.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})

function textFile(): NormalizedDiffFile {
  return {
    path: 'src/feature/foo.ts',
    status: 'modified',
    additions: 2,
    deletions: 1,
    hunks: [
      {
        header: '@@ -10,3 +10,4 @@ function foo()',
        oldStart: 10,
        oldLines: 3,
        newStart: 10,
        newLines: 4,
        lines: [
          { type: 'context', oldLineNumber: 10, newLineNumber: 10, content: 'const a = 1' },
          { type: 'removed', oldLineNumber: 11, content: 'const old = 2' },
          { type: 'added', newLineNumber: 11, content: 'const fresh = 2' },
          { type: 'added', newLineNumber: 12, content: 'const extra = 3' }
        ]
      }
    ]
  }
}

function renderViewer(file: NormalizedDiffFile, viewed = false, onToggleViewed = vi.fn()) {
  const result = render(createElement(DiffViewer, { file, viewed, onToggleViewed }))
  open.push(result.unmount)
  return { ...result, onToggleViewed }
}

describe('DiffViewer', () => {
  it('renders the file path and add/remove counts', () => {
    const { container } = renderViewer(textFile())
    expect(container.textContent).toContain('src/feature/foo.ts')
    expect(container.textContent).toContain('+2')
    expect(container.textContent).toContain('-1')
  })

  it('renders added and removed line content with their line numbers', () => {
    const { container } = renderViewer(textFile())
    const rows = Array.from(container.querySelectorAll('tbody tr'))
    // Locate the added line row by its content.
    const addedRow = rows.find((r) => r.textContent?.includes('const fresh = 2'))
    expect(addedRow).toBeTruthy()
    // New line number 11 present in the row's cells.
    expect(addedRow!.textContent).toContain('11')

    const removedRow = rows.find((r) => r.textContent?.includes('const old = 2'))
    expect(removedRow).toBeTruthy()
    // Old line number 11 present.
    expect(removedRow!.textContent).toContain('11')

    // Hunk header rendered.
    expect(container.textContent).toContain('@@ -10,3 +10,4 @@ function foo()')
  })

  it('marks added rows with success background and removed with danger background', () => {
    const { container } = renderViewer(textFile())
    const rows = Array.from(container.querySelectorAll('tbody tr'))
    const addedRow = rows.find((r) => r.textContent?.includes('const fresh = 2'))!
    const removedRow = rows.find((r) => r.textContent?.includes('const old = 2'))!
    expect(addedRow.className).toContain('bg-success/10')
    expect(removedRow.className).toContain('bg-danger/10')
  })

  it('shows binary-file message when the file is binary', () => {
    const { container } = renderViewer({
      path: 'assets/logo.png',
      status: 'binary',
      additions: 0,
      deletions: 0,
      hunks: [],
      isBinary: true
    })
    expect(container.textContent).toContain('Binary file changed — not analysed.')
    // No diff table rendered.
    expect(container.querySelector('table')).toBeNull()
  })

  it('shows the "Mark viewed" label and calls onToggleViewed on click', () => {
    const onToggleViewed = vi.fn()
    const { container } = renderViewer(textFile(), false, onToggleViewed)
    const viewedBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark viewed')
    )
    expect(viewedBtn).toBeTruthy()
    click(viewedBtn!)
    expect(onToggleViewed).toHaveBeenCalledTimes(1)
  })

  it('shows "Viewed" label when viewed is true', () => {
    const { container } = renderViewer(textFile(), true)
    const viewedBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('title') === 'Mark as viewed (local only)'
    )
    expect(viewedBtn!.textContent).toContain('Viewed')
    expect(viewedBtn!.textContent).not.toContain('Mark viewed')
  })

  it('copies the file path to the clipboard when the copy button is clicked', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const { container } = renderViewer(textFile())
    const copyBtn = container.querySelector('button[aria-label="Copy file path"]')
    expect(copyBtn).toBeTruthy()
    click(copyBtn)
    expect(writeText).toHaveBeenCalledWith('src/feature/foo.ts')
  })

  it('renders a rename arrow when oldPath differs from path', () => {
    const { container } = renderViewer({
      path: 'src/new.ts',
      oldPath: 'src/old.ts',
      status: 'renamed',
      additions: 0,
      deletions: 0,
      hunks: []
    })
    expect(container.textContent).toContain('src/old.ts')
    expect(container.textContent).toContain('src/new.ts')
    expect(container.textContent).toContain('→')
  })

  it('shows an empty-state message when there are no hunks and not binary', () => {
    const { container } = renderViewer({
      path: 'src/empty.ts',
      status: 'modified',
      additions: 0,
      deletions: 0,
      hunks: []
    })
    expect(container.textContent).toContain('No textual changes to display.')
  })
})
