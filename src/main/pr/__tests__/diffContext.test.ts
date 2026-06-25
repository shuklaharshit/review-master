import { describe, it, expect } from 'vitest'
import { buildDiffContext } from '../diffContext'
import type { NormalizedDiff, NormalizedDiffFile } from '../../../shared/types'
import {
  MAX_DIRECT_REVIEW_FILES,
  MAX_DIRECT_REVIEW_PATCH_CHARS,
  MAX_SINGLE_FILE_PATCH_CHARS
} from '../../../shared/constants'

function file(overrides: Partial<NormalizedDiffFile> & { path: string }): NormalizedDiffFile {
  return {
    status: 'modified',
    additions: 1,
    deletions: 0,
    hunks: [],
    patch: '@@ -1 +1 @@\n-a\n+b',
    ...overrides
  }
}

function diff(files: NormalizedDiffFile[], overrides: Partial<NormalizedDiff> = {}): NormalizedDiff {
  return {
    files,
    source: 'github_api',
    totalAdditions: files.reduce((s, f) => s + f.additions, 0),
    totalDeletions: files.reduce((s, f) => s + f.deletions, 0),
    ...overrides
  }
}

describe('buildDiffContext', () => {
  it('includes a small diff in full and is not truncated', () => {
    const d = diff([file({ path: 'src/a.ts', patch: '@@ -1 +1 @@\n-old\n+new' })])
    const res = buildDiffContext(d)
    expect(res.truncated).toBe(false)
    expect(res.warnings).toEqual([])
    expect(res.text).toContain('### src/a.ts')
    expect(res.text).toContain('```diff')
    expect(res.text).toContain('+new')
  })

  it('emits a summary line with source and totals', () => {
    const d = diff([file({ path: 'src/a.ts', additions: 3, deletions: 2 })], { source: 'git' })
    const res = buildDiffContext(d)
    expect(res.text).toContain('Diff source: git.')
    expect(res.text).toContain('1 changed file(s)')
    expect(res.text).toContain('+3 -2')
  })

  it('renders a "No textual diff available" note when patch is missing', () => {
    const d = diff([file({ path: 'src/empty.ts', patch: undefined })])
    const res = buildDiffContext(d)
    expect(res.text).toContain('### src/empty.ts')
    expect(res.text).toContain('_No textual diff available._')
  })

  it('formats renamed files in the header', () => {
    const d = diff([
      file({ path: 'src/new.ts', oldPath: 'src/old.ts', status: 'renamed' })
    ])
    const res = buildDiffContext(d)
    expect(res.text).toContain('renamed src/old.ts -> src/new.ts')
  })

  it('emits a large-PR warning when the file-count threshold is exceeded', () => {
    // NOTE: exceeding the file count flips `isLarge` (and thus the large-PR
    // warning), but with tiny patches nothing is summarised/omitted, so
    // `truncated` stays false. `isLarge` alone does not set `truncated`.
    const files = Array.from({ length: MAX_DIRECT_REVIEW_FILES + 1 }, (_, i) =>
      file({ path: `src/f${i}.ts`, patch: '@@ -1 +1 @@\n-a\n+b' })
    )
    const res = buildDiffContext(diff(files))
    expect(res.warnings.some((w) => w.includes('This PR is large'))).toBe(true)
    expect(res.truncated).toBe(false)
  })

  it('sets truncated + warning when the total patch-char threshold is exceeded', () => {
    // Two files whose combined patch length exceeds the total budget.
    const halfPlus = 'x'.repeat(Math.floor(MAX_DIRECT_REVIEW_PATCH_CHARS / 2) + 1000)
    const files = [
      file({ path: 'src/big1.ts', patch: halfPlus, isLarge: false }),
      file({ path: 'src/big2.ts', patch: halfPlus, isLarge: false })
    ]
    const res = buildDiffContext(diff(files))
    expect(res.truncated).toBe(true)
    expect(res.warnings.some((w) => w.includes('This PR is large'))).toBe(true)
  })

  it('summarises generated files in a large PR rather than dumping their patch', () => {
    // Make the PR large via file count, and include a generated lockfile.
    const normal = Array.from({ length: MAX_DIRECT_REVIEW_FILES }, (_, i) =>
      file({ path: `src/f${i}.ts`, patch: '@@ -1 +1 @@\n-a\n+b' })
    )
    const generated = file({
      path: 'yarn.lock',
      patch: 'GENERATED_PATCH_CONTENT_SHOULD_NOT_APPEAR'.repeat(10),
      isGenerated: true,
      additions: 500,
      deletions: 400
    })
    const res = buildDiffContext(diff([...normal, generated]))
    expect(res.truncated).toBe(true)
    expect(res.text).toContain('### yarn.lock')
    expect(res.text).toContain('Generated/noisy file. Patch omitted')
    expect(res.text).not.toContain('GENERATED_PATCH_CONTENT_SHOULD_NOT_APPEAR')
    expect(res.warnings.some((w) => w.includes('Summarised') && w.includes('yarn.lock'))).toBe(true)
  })

  it('summarises an oversized single file (over MAX_SINGLE_FILE_PATCH_CHARS) even in a small PR', () => {
    const huge = 'z'.repeat(MAX_SINGLE_FILE_PATCH_CHARS + 1)
    const d = diff([file({ path: 'dist/bundle.js', patch: huge })])
    const res = buildDiffContext(d)
    expect(res.truncated).toBe(true)
    expect(res.text).toContain('### dist/bundle.js')
    expect(res.text).toContain('File patch is very large')
    expect(res.text).not.toContain(huge)
    expect(res.warnings.some((w) => w.includes('oversized'))).toBe(true)
  })

  it('summarises a file flagged isLarge regardless of patch size', () => {
    const d = diff([file({ path: 'src/big.ts', patch: 'small patch', isLarge: true })])
    const res = buildDiffContext(d)
    expect(res.truncated).toBe(true)
    expect(res.text).toContain('File patch is very large')
  })

  it('lists binary files but never dumps their content', () => {
    const d = diff([
      file({ path: 'src/a.ts', patch: '@@ -1 +1 @@\n-a\n+b' }),
      file({ path: 'assets/logo.png', status: 'binary', patch: 'BINARY_BYTES_SHOULD_NOT_APPEAR' })
    ])
    const res = buildDiffContext(d)
    expect(res.text).toContain('### Binary files (not analysed)')
    expect(res.text).toContain('assets/logo.png')
    expect(res.text).toContain('Binary file changed — not analysed.')
    expect(res.text).not.toContain('BINARY_BYTES_SHOULD_NOT_APPEAR')
  })

  it('treats files with isBinary flag as binary (no content dumped)', () => {
    const d = diff([
      file({ path: 'img.gif', status: 'modified', isBinary: true, patch: 'RAWGIFBYTES' })
    ])
    const res = buildDiffContext(d)
    expect(res.text).toContain('### Binary files (not analysed)')
    expect(res.text).toContain('img.gif')
    expect(res.text).not.toContain('RAWGIFBYTES')
  })

  it('propagates upstream truncation from the diff', () => {
    const d = diff([file({ path: 'src/a.ts' })], { truncated: true })
    const res = buildDiffContext(d)
    expect(res.truncated).toBe(true)
  })

  it('omits files that overflow the budget in a large PR and warns', () => {
    // Make the PR large by file count; many medium files will overflow the
    // total-char budget so some are dropped with an "Omitted ... size budget" warning.
    const chunk = 'q'.repeat(5000)
    const files = Array.from({ length: MAX_DIRECT_REVIEW_FILES + 5 }, (_, i) =>
      file({ path: `src/f${i}.ts`, patch: chunk, additions: 50, deletions: 50 })
    )
    const res = buildDiffContext(diff(files))
    expect(res.truncated).toBe(true)
    // Total patch chars > budget, so the budget-omission path should trigger.
    expect(res.warnings.some((w) => w.includes('size budget'))).toBe(true)
  })
})
