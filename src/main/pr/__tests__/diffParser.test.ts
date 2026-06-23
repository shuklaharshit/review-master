import { describe, it, expect } from 'vitest'
import { parseUnifiedDiff, parseGitHubPatch, detectLanguage, isGeneratedPath } from '../diffParser'
import { MAX_SINGLE_FILE_PATCH_CHARS } from '../../../shared/constants'
import type { PullRequestFile } from '../../../shared/types'

// A realistic multi-file unified `git diff` exercising add / modify / delete /
// rename / binary.
const MULTI_FILE_DIFF = [
  // Modified file.
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,4 +1,5 @@',
  ' import x from "x"',
  '-const a = 1',
  '+const a = 2',
  '+const b = 3',
  ' export default a',
  // Added file.
  'diff --git a/src/new.ts b/src/new.ts',
  'new file mode 100644',
  'index 0000000..3333333',
  '--- /dev/null',
  '+++ b/src/new.ts',
  '@@ -0,0 +1,2 @@',
  '+export const hello = "world"',
  '+export const n = 1',
  // Removed file.
  'diff --git a/src/old.ts b/src/old.ts',
  'deleted file mode 100644',
  'index 4444444..0000000',
  '--- a/src/old.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-const gone = true',
  '-export default gone',
  // Renamed file (with a content change).
  'diff --git a/src/from.ts b/src/to.ts',
  'similarity index 90%',
  'rename from src/from.ts',
  'rename to src/to.ts',
  '--- a/src/from.ts',
  '+++ b/src/to.ts',
  '@@ -1,3 +1,3 @@',
  ' line one',
  '-line two',
  '+line two changed',
  ' line three',
  // Binary file.
  'diff --git a/assets/logo.png b/assets/logo.png',
  'index 5555555..6666666 100644',
  'Binary files a/assets/logo.png and b/assets/logo.png differ'
].join('\n')

describe('detectLanguage', () => {
  it('maps extensions and special filenames', () => {
    expect(detectLanguage('src/x.ts')).toBe('typescript')
    expect(detectLanguage('a/b/Dockerfile')).toBe('dockerfile')
    expect(detectLanguage('BUILD.bazel')).toBe('starlark')
    expect(detectLanguage('noext')).toBeUndefined()
    expect(detectLanguage('weird.unknownext')).toBeUndefined()
  })
})

describe('isGeneratedPath', () => {
  it('detects lockfiles, build/dist dirs and minified files', () => {
    expect(isGeneratedPath('yarn.lock')).toBe(true)
    expect(isGeneratedPath('pkg/package-lock.json')).toBe(true)
    expect(isGeneratedPath('dist/index.js')).toBe(true)
    expect(isGeneratedPath('vendor/jquery.min.js')).toBe(true)
    expect(isGeneratedPath('src/app.ts')).toBe(false)
  })
})

describe('parseUnifiedDiff', () => {
  it('returns [] for empty input', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })

  it('parses a realistic multi-file diff with correct paths and statuses', () => {
    const files = parseUnifiedDiff(MULTI_FILE_DIFF)
    expect(files.map((f) => f.path)).toEqual([
      'src/app.ts',
      'src/new.ts',
      'src/old.ts',
      'src/to.ts',
      'assets/logo.png'
    ])
    expect(files.map((f) => f.status)).toEqual([
      'modified',
      'added',
      'removed',
      'renamed',
      'binary'
    ])
  })

  it('tracks additions/deletions per file', () => {
    const files = parseUnifiedDiff(MULTI_FILE_DIFF)
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]))
    // modified: +2 (-1)
    expect(byPath['src/app.ts'].additions).toBe(2)
    expect(byPath['src/app.ts'].deletions).toBe(1)
    // added: +2
    expect(byPath['src/new.ts'].additions).toBe(2)
    expect(byPath['src/new.ts'].deletions).toBe(0)
    // removed: -2
    expect(byPath['src/old.ts'].additions).toBe(0)
    expect(byPath['src/old.ts'].deletions).toBe(2)
    // renamed with a single line change
    expect(byPath['src/to.ts'].additions).toBe(1)
    expect(byPath['src/to.ts'].deletions).toBe(1)
  })

  it('records oldPath only when it differs from the new path', () => {
    const files = parseUnifiedDiff(MULTI_FILE_DIFF)
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]))
    expect(byPath['src/to.ts'].oldPath).toBe('src/from.ts')
    expect(byPath['src/app.ts'].oldPath).toBeUndefined()
  })

  it('flags binary files and gives them no patch lines', () => {
    const files = parseUnifiedDiff(MULTI_FILE_DIFF)
    const bin = files.find((f) => f.path === 'assets/logo.png')!
    expect(bin.isBinary).toBe(true)
    expect(bin.status).toBe('binary')
    expect(bin.hunks).toEqual([])
    expect(bin.patch).toBeUndefined()
  })

  it('tracks hunk header line numbers (oldStart/newStart)', () => {
    const files = parseUnifiedDiff(MULTI_FILE_DIFF)
    const modified = files.find((f) => f.path === 'src/app.ts')!
    expect(modified.hunks).toHaveLength(1)
    const hunk = modified.hunks[0]
    expect(hunk.oldStart).toBe(1)
    expect(hunk.oldLines).toBe(4)
    expect(hunk.newStart).toBe(1)
    expect(hunk.newLines).toBe(5)
  })

  it('tracks per-line old/new line numbers across context/added/removed', () => {
    const files = parseUnifiedDiff(MULTI_FILE_DIFF)
    const modified = files.find((f) => f.path === 'src/app.ts')!
    const lines = modified.hunks[0].lines
    // ' import x from "x"'  -> context, old 1 / new 1
    expect(lines[0]).toEqual({
      type: 'context',
      oldLineNumber: 1,
      newLineNumber: 1,
      content: 'import x from "x"'
    })
    // '-const a = 1' -> removed, only old line number advances
    expect(lines[1]).toEqual({ type: 'removed', oldLineNumber: 2, content: 'const a = 1' })
    // '+const a = 2' -> added, only new line number advances (new line 2)
    expect(lines[2]).toEqual({ type: 'added', newLineNumber: 2, content: 'const a = 2' })
    // '+const b = 3' -> added, new line 3
    expect(lines[3]).toEqual({ type: 'added', newLineNumber: 3, content: 'const b = 3' })
    // ' export default a' -> context, old 3 (after one removal) / new 4
    expect(lines[4]).toEqual({
      type: 'context',
      oldLineNumber: 3,
      newLineNumber: 4,
      content: 'export default a'
    })
  })

  it('handles renamed-only files (no content change) as renamed', () => {
    const renameOnly = [
      'diff --git a/old/name.ts b/new/name.ts',
      'similarity index 100%',
      'rename from old/name.ts',
      'rename to new/name.ts'
    ].join('\n')
    const files = parseUnifiedDiff(renameOnly)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('new/name.ts')
    expect(files[0].oldPath).toBe('old/name.ts')
    expect(files[0].status).toBe('renamed')
    expect(files[0].additions).toBe(0)
    expect(files[0].deletions).toBe(0)
  })
})

describe('parseGitHubPatch', () => {
  const basePatch = [
    '@@ -1,3 +1,4 @@',
    ' context line',
    '-removed line',
    '+added line one',
    '+added line two',
    ' trailing context'
  ].join('\n')

  it('builds a NormalizedDiffFile from a PullRequestFile-shaped object', () => {
    const file: PullRequestFile = {
      path: 'src/feature.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      changes: 3,
      patch: basePatch
    }
    const normalized = parseGitHubPatch(file)
    expect(normalized.path).toBe('src/feature.ts')
    expect(normalized.status).toBe('modified')
    expect(normalized.additions).toBe(2)
    expect(normalized.deletions).toBe(1)
    expect(normalized.language).toBe('typescript')
    expect(normalized.isGenerated).toBe(false)
    expect(normalized.patch).toBe(basePatch)
    expect(normalized.hunks).toHaveLength(1)
    const hunk = normalized.hunks[0]
    expect(hunk.oldStart).toBe(1)
    expect(hunk.newStart).toBe(1)
    // line-number tracking
    expect(hunk.lines[0]).toEqual({
      type: 'context',
      oldLineNumber: 1,
      newLineNumber: 1,
      content: 'context line'
    })
    expect(hunk.lines[1]).toEqual({ type: 'removed', oldLineNumber: 2, content: 'removed line' })
    expect(hunk.lines[2]).toEqual({ type: 'added', newLineNumber: 2, content: 'added line one' })
  })

  it('records oldPath only when different from path', () => {
    const file: PullRequestFile = {
      path: 'src/new.ts',
      oldPath: 'src/old.ts',
      status: 'renamed',
      additions: 0,
      deletions: 0,
      changes: 0,
      patch: basePatch
    }
    expect(parseGitHubPatch(file).oldPath).toBe('src/old.ts')

    const same: PullRequestFile = { ...file, oldPath: 'src/new.ts' }
    expect(parseGitHubPatch(same).oldPath).toBeUndefined()
  })

  it('treats a patch-less changed file as binary', () => {
    const file: PullRequestFile = {
      path: 'assets/logo.png',
      status: 'binary',
      additions: 0,
      deletions: 0,
      changes: 4,
      isBinary: true
    }
    const normalized = parseGitHubPatch(file)
    expect(normalized.isBinary).toBe(true)
    expect(normalized.status).toBe('binary')
    expect(normalized.hunks).toEqual([])
  })

  it('flags generated file paths', () => {
    const file: PullRequestFile = {
      path: 'yarn.lock',
      status: 'modified',
      additions: 100,
      deletions: 50,
      changes: 150,
      patch: basePatch
    }
    expect(parseGitHubPatch(file).isGenerated).toBe(true)

    const dist: PullRequestFile = { ...file, path: 'dist/bundle.js' }
    expect(parseGitHubPatch(dist).isGenerated).toBe(true)
  })

  it('flags oversized patches as isLarge using MAX_SINGLE_FILE_PATCH_CHARS', () => {
    const bigBody = Array.from({ length: 5000 }, (_, i) => `+line ${i} ${'x'.repeat(20)}`).join('\n')
    const bigPatch = `@@ -0,0 +1,5000 @@\n${bigBody}`
    expect(bigPatch.length).toBeGreaterThan(MAX_SINGLE_FILE_PATCH_CHARS)
    const file: PullRequestFile = {
      path: 'src/big.ts',
      status: 'added',
      additions: 5000,
      deletions: 0,
      changes: 5000,
      patch: bigPatch
    }
    expect(parseGitHubPatch(file).isLarge).toBe(true)

    // A small patch is not large.
    const small: PullRequestFile = {
      path: 'src/small.ts',
      status: 'modified',
      additions: 1,
      deletions: 1,
      changes: 2,
      patch: basePatch
    }
    expect(parseGitHubPatch(small).isLarge).toBeUndefined()
  })
})
