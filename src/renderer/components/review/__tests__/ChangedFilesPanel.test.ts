// @vitest-environment jsdom
import { createElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { NormalizedDiffFile } from '@shared/types'
import { ChangedFilesPanel } from '../ChangedFilesPanel'
import { useReviewWorkspaceStore } from '../../../stores/reviewWorkspaceStore'
import { click, render } from './renderHelper'

function makeFile(path: string, status: NormalizedDiffFile['status'] = 'modified'): NormalizedDiffFile {
  return { path, status, additions: 1, deletions: 1, hunks: [] }
}

const FILES: NormalizedDiffFile[] = [
  makeFile('src/i18n/locales/es.json'),
  makeFile('src/i18n/locales/en.json'),
  makeFile('src/utils/constants.ts', 'added'),
  makeFile('README.md', 'removed')
]

function renderPanel(files: NormalizedDiffFile[] = FILES) {
  return render(createElement(ChangedFilesPanel, { files }))
}

/** All row buttons in document order, keyed by their visible text. */
function rowTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '')
}

function rowByText(container: HTMLElement, text: string): HTMLButtonElement {
  const row = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)
  if (!row) throw new Error(`row not found: ${text}`)
  return row
}

describe('ChangedFilesPanel', () => {
  beforeEach(() => {
    useReviewWorkspaceStore.setState({
      selectedGroupOrder: null,
      selectedFilePath: null,
      viewedFiles: {},
      expandedExplanations: {},
      leftPanelTab: 'files',
      rightPanelTab: 'info',
      showOnlyUnviewed: false,
      workspace: null,
      snapshotId: null
    })
  })

  it('compresses single-child directory chains into one row', () => {
    const { container } = renderPanel()
    const texts = rowTexts(container)
    // i18n has only the locales dir inside it → rendered as one "i18n/locales" row.
    expect(texts).toContain('i18n/locales')
    expect(texts).not.toContain('i18n')
    expect(texts).not.toContain('locales')
  })

  it('does not compress a directory with multiple children', () => {
    const { container } = renderPanel()
    // src holds both i18n and utils, so it stays its own row.
    expect(rowTexts(container)).toContain('src')
  })

  it('sorts folders before files, both alphabetically', () => {
    const { container } = renderPanel()
    expect(rowTexts(container)).toEqual([
      'src',
      'i18n/locales',
      'en.json',
      'es.json',
      'utils',
      'constants.ts',
      'README.md'
    ])
  })

  it('collapses and re-expands a folder on click', () => {
    const { container } = renderPanel()
    click(rowByText(container, 'i18n/locales'))
    let texts = rowTexts(container)
    expect(texts).not.toContain('en.json')
    expect(texts).not.toContain('es.json')
    // Siblings unaffected.
    expect(texts).toContain('constants.ts')

    click(rowByText(container, 'i18n/locales'))
    texts = rowTexts(container)
    expect(texts).toContain('en.json')
  })

  it('collapsing a parent hides the whole subtree', () => {
    const { container } = renderPanel()
    click(rowByText(container, 'src'))
    const texts = rowTexts(container)
    expect(texts).not.toContain('i18n/locales')
    expect(texts).not.toContain('en.json')
    expect(texts).not.toContain('constants.ts')
    expect(texts).toContain('README.md')
  })

  it('clicking a file selects it in the workspace store', () => {
    const { container } = renderPanel()
    click(rowByText(container, 'en.json'))
    expect(useReviewWorkspaceStore.getState().selectedFilePath).toBe('src/i18n/locales/en.json')
  })

  it('shows a status dot for non-modified files only', () => {
    const { container } = renderPanel()
    expect(rowByText(container, 'constants.ts').querySelector('.rounded-full')).not.toBeNull()
    expect(rowByText(container, 'README.md').querySelector('.rounded-full')).not.toBeNull()
    expect(rowByText(container, 'en.json').querySelector('.rounded-full')).toBeNull()
  })

  it('header counts viewed files', () => {
    useReviewWorkspaceStore.getState().setViewed('README.md', true)
    const { container } = renderPanel()
    expect(container.textContent).toContain('1/4 viewed')
  })

  it('strikes through viewed files', () => {
    useReviewWorkspaceStore.getState().setViewed('README.md', true)
    const { container } = renderPanel()
    expect(rowByText(container, 'README.md').querySelector('.line-through')).not.toBeNull()
    expect(rowByText(container, 'en.json').querySelector('.line-through')).toBeNull()
  })

  it('shows an empty state when there are no changed files', () => {
    const { container } = renderPanel([])
    expect(container.textContent).toContain('No changed files.')
  })
})
