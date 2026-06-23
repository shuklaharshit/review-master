import type {
  DiffFileStatus,
  DiffHunk,
  DiffLine,
  NormalizedDiffFile,
  PullRequestFile
} from '../../shared/types'
import { GENERATED_FILE_PATTERNS, MAX_SINGLE_FILE_PATCH_CHARS } from '../../shared/constants'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Small extension -> language map for syntax hints. */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  sql: 'sql',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  vue: 'vue',
  svelte: 'svelte',
  proto: 'protobuf',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  bazel: 'starlark',
  bzl: 'starlark'
}

export function detectLanguage(path: string): string | undefined {
  const base = path.split('/').pop() ?? path
  const lower = base.toLowerCase()
  if (lower === 'dockerfile') return 'dockerfile'
  if (lower === 'build.bazel' || lower === 'workspace.bazel') return 'starlark'
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return undefined
  const ext = lower.slice(dot + 1)
  return LANGUAGE_BY_EXTENSION[ext]
}

export function isGeneratedPath(path: string): boolean {
  return GENERATED_FILE_PATTERNS.some((re) => re.test(path))
}

/** Maps a GitHub file status to the normalised diff file status. */
function mapGitHubStatus(status: PullRequestFile['status']): DiffFileStatus {
  return status
}

/** Parses a single `@@ -a,b +c,d @@` hunk header. */
function parseHunkHeader(line: string): {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
} | null {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
  if (!match) return null
  return {
    oldStart: Number(match[1]),
    oldLines: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newLines: match[4] === undefined ? 1 : Number(match[4])
  }
}

/**
 * Parses the body of a unified-diff hunk (the lines following an `@@` header,
 * up to the next header/file boundary) into DiffLine[], tracking old/new line
 * numbers and classifying context/added/removed. Returns additions/deletions.
 */
function parseHunkLines(
  bodyLines: string[],
  oldStart: number,
  newStart: number
): { lines: DiffLine[]; additions: number; deletions: number } {
  const lines: DiffLine[] = []
  let oldLine = oldStart
  let newLine = newStart
  let additions = 0
  let deletions = 0

  for (const raw of bodyLines) {
    // A lone "\" line is the "\ No newline at end of file" marker — attach as context.
    if (raw.startsWith('\\')) {
      lines.push({ type: 'context', content: raw.slice(1).trimStart() })
      continue
    }
    const marker = raw.charAt(0)
    const content = raw.slice(1)
    if (marker === '+') {
      lines.push({ type: 'added', newLineNumber: newLine, content })
      newLine += 1
      additions += 1
    } else if (marker === '-') {
      lines.push({ type: 'removed', oldLineNumber: oldLine, content })
      oldLine += 1
      deletions += 1
    } else {
      // Context line (leading space) or any other line treated as context.
      lines.push({ type: 'context', oldLineNumber: oldLine, newLineNumber: newLine, content })
      oldLine += 1
      newLine += 1
    }
  }

  return { lines, additions, deletions }
}

// ---------------------------------------------------------------------------
// Unified `git diff` parser
// ---------------------------------------------------------------------------

interface ParsedHeader {
  path: string
  oldPath?: string
  status: DiffFileStatus
  isBinary: boolean
}

/**
 * Extracts the file path from a `diff --git a/<old> b/<new>` line. Paths may be
 * quoted and prefixed; we strip the a/ and b/ prefixes.
 */
function stripPrefix(p: string): string {
  if (p.startsWith('a/') || p.startsWith('b/')) return p.slice(2)
  return p
}

function parseDiffGitLine(line: string): { oldPath: string; newPath: string } | null {
  // diff --git a/foo b/bar  (handles unquoted paths; quoted paths fall back to the b/ token)
  const rest = line.slice('diff --git '.length)
  // Find " b/" split point. Use the last occurrence of ' b/' to be safe with spaces in a-path.
  const bIdx = rest.lastIndexOf(' b/')
  if (bIdx >= 0) {
    const aPart = rest.slice(0, bIdx)
    const bPart = rest.slice(bIdx + 1)
    return { oldPath: stripPrefix(aPart.trim()), newPath: stripPrefix(bPart.trim()) }
  }
  return null
}

/**
 * Pure parser: turns a unified `git diff` string into NormalizedDiffFile[].
 * Handles new/deleted/renamed/copied files and binary markers.
 */
export function parseUnifiedDiff(diffText: string): NormalizedDiffFile[] {
  if (!diffText) return []
  const lines = diffText.split('\n')
  const files: NormalizedDiffFile[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.startsWith('diff --git ')) {
      i += 1
      continue
    }

    const header: ParsedHeader = {
      path: '',
      status: 'modified',
      isBinary: false
    }
    const gitPaths = parseDiffGitLine(line)
    if (gitPaths) {
      header.path = gitPaths.newPath
      header.oldPath = gitPaths.oldPath
    }
    let renamed = false
    let copied = false
    let newFile = false
    let deletedFile = false
    let patchStartIndex = -1

    i += 1
    // Consume the extended header lines until the first hunk (@@) or next diff --git.
    while (i < lines.length) {
      const h = lines[i]
      if (h.startsWith('diff --git ')) break
      if (h.startsWith('@@')) {
        patchStartIndex = i
        break
      }
      if (h.startsWith('new file mode')) newFile = true
      else if (h.startsWith('deleted file mode')) deletedFile = true
      else if (h.startsWith('rename from ')) {
        renamed = true
        header.oldPath = h.slice('rename from '.length).trim()
      } else if (h.startsWith('rename to ')) {
        renamed = true
        header.path = h.slice('rename to '.length).trim()
      } else if (h.startsWith('copy from ')) {
        copied = true
        header.oldPath = h.slice('copy from '.length).trim()
      } else if (h.startsWith('copy to ')) {
        copied = true
        header.path = h.slice('copy to '.length).trim()
      } else if (h.startsWith('Binary files') || h.startsWith('GIT binary patch')) {
        header.isBinary = true
      } else if (h.startsWith('--- ')) {
        const p = h.slice(4).trim()
        if (p !== '/dev/null') header.oldPath = stripPrefix(p)
      } else if (h.startsWith('+++ ')) {
        const p = h.slice(4).trim()
        if (p !== '/dev/null') header.path = stripPrefix(p)
      }
      i += 1
    }

    // Determine status.
    if (newFile) header.status = 'added'
    else if (deletedFile) header.status = 'removed'
    else if (renamed) header.status = 'renamed'
    else if (copied) header.status = 'copied'
    else if (header.isBinary) header.status = 'binary'
    else header.status = 'modified'

    if (header.isBinary) header.status = header.status === 'modified' ? 'binary' : header.status

    // Collect hunks until the next file boundary.
    const hunks: DiffHunk[] = []
    let additions = 0
    let deletions = 0
    const patchLines: string[] = []

    if (patchStartIndex >= 0) {
      let j = patchStartIndex
      while (j < lines.length && !lines[j].startsWith('diff --git ')) {
        const hl = lines[j]
        if (hl.startsWith('@@')) {
          const parsed = parseHunkHeader(hl)
          patchLines.push(hl)
          if (parsed) {
            // Gather this hunk's body.
            const body: string[] = []
            let k = j + 1
            while (
              k < lines.length &&
              !lines[k].startsWith('@@') &&
              !lines[k].startsWith('diff --git ')
            ) {
              body.push(lines[k])
              patchLines.push(lines[k])
              k += 1
            }
            const { lines: hunkLines, additions: a, deletions: d } = parseHunkLines(
              body,
              parsed.oldStart,
              parsed.newStart
            )
            hunks.push({
              header: hl,
              oldStart: parsed.oldStart,
              oldLines: parsed.oldLines,
              newStart: parsed.newStart,
              newLines: parsed.newLines,
              lines: hunkLines
            })
            additions += a
            deletions += d
            j = k
            continue
          }
        }
        j += 1
      }
      i = j
    }

    if (!header.path) {
      // Could not determine a path; skip this malformed entry.
      continue
    }

    const patch = patchLines.length > 0 ? patchLines.join('\n') : undefined
    const file: NormalizedDiffFile = {
      path: header.path,
      status: header.status,
      additions,
      deletions,
      hunks,
      patch,
      isGenerated: isGeneratedPath(header.path),
      language: detectLanguage(header.path)
    }
    if (header.oldPath && header.oldPath !== header.path) file.oldPath = header.oldPath
    if (header.isBinary) file.isBinary = true
    if (patch && patch.length > MAX_SINGLE_FILE_PATCH_CHARS) file.isLarge = true

    files.push(file)
  }

  return files
}

// ---------------------------------------------------------------------------
// GitHub API patch -> normalised file
// ---------------------------------------------------------------------------

/**
 * Converts a single GitHub `PullRequestFile` (whose `patch` is a unified-diff
 * hunk fragment without the `diff --git`/`@@` file header) into a
 * NormalizedDiffFile.
 */
export function parseGitHubPatch(file: PullRequestFile): NormalizedDiffFile {
  const status = mapGitHubStatus(file.status)
  const path = file.path
  const isBinary = file.isBinary === true || status === 'binary'

  const hunks: DiffHunk[] = []
  if (file.patch && !isBinary) {
    const patchLines = file.patch.split('\n')
    let j = 0
    while (j < patchLines.length) {
      const hl = patchLines[j]
      if (hl.startsWith('@@')) {
        const parsed = parseHunkHeader(hl)
        if (parsed) {
          const body: string[] = []
          let k = j + 1
          while (k < patchLines.length && !patchLines[k].startsWith('@@')) {
            body.push(patchLines[k])
            k += 1
          }
          const { lines: hunkLines } = parseHunkLines(body, parsed.oldStart, parsed.newStart)
          hunks.push({
            header: hl,
            oldStart: parsed.oldStart,
            oldLines: parsed.oldLines,
            newStart: parsed.newStart,
            newLines: parsed.newLines,
            lines: hunkLines
          })
          j = k
          continue
        }
      }
      j += 1
    }
  }

  const normalized: NormalizedDiffFile = {
    path,
    status,
    additions: file.additions,
    deletions: file.deletions,
    hunks,
    patch: file.patch,
    isGenerated: isGeneratedPath(path),
    language: detectLanguage(path)
  }
  if (file.oldPath && file.oldPath !== path) normalized.oldPath = file.oldPath
  if (isBinary) normalized.isBinary = true
  if (file.patch && file.patch.length > MAX_SINGLE_FILE_PATCH_CHARS) normalized.isLarge = true

  return normalized
}
