import type { DiffLine } from '@shared/types'

/**
 * Intra-line ("word level") diffing for the diff viewer.
 *
 * GitHub highlights not just which lines changed but which *spans within* a
 * changed line changed, by pairing each removed line with the corresponding
 * added line and diffing their tokens. This module is pure so it can be unit
 * tested in isolation; the renderer consumes the `segments` it produces.
 */

export interface WordSegment {
  text: string
  /** True when this span differs from the paired line (gets a stronger tint). */
  changed: boolean
}

/** A diff line enriched with optional intra-line word segments. */
export interface RenderableDiffLine extends DiffLine {
  segments?: WordSegment[]
}

// A pair of removed/added lines is only worth word-highlighting when they're an
// *edit* of each other, not two unrelated lines that happen to be adjacent. If
// less than this fraction of characters survives unchanged, we treat it as a
// full rewrite and skip the noisy span highlighting (whole-line tint only).
const MIN_SIMILARITY = 0.25

/**
 * Splits a line into tokens for word-level diffing: runs of identifier
 * characters, runs of whitespace, and individual punctuation characters. This
 * granularity matches how GitHub highlights — whole words flip, punctuation
 * flips on its own.
 */
function tokenize(line: string): string[] {
  return line.match(/[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_]/g) ?? []
}

/** Coalesces adjacent tokens with the same `changed` flag into render segments. */
function coalesce(tokens: string[], changed: boolean[]): WordSegment[] {
  const segments: WordSegment[] = []
  for (let i = 0; i < tokens.length; i++) {
    const last = segments[segments.length - 1]
    if (last && last.changed === changed[i]) {
      last.text += tokens[i]
    } else {
      segments.push({ text: tokens[i], changed: changed[i] })
    }
  }
  return segments
}

/**
 * Token-level diff of two lines via a longest-common-subsequence table.
 * Returns segments for each side: tokens not part of the LCS are `changed`.
 * Returns null when the two lines are too dissimilar to be a meaningful edit.
 */
export function diffLinePair(
  oldLine: string,
  newLine: string
): { removed: WordSegment[]; added: WordSegment[] } | null {
  const a = tokenize(oldLine)
  const b = tokenize(newLine)

  // Classic LCS DP table over tokens.
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const oldChanged = new Array<boolean>(m).fill(true)
  const newChanged = new Array<boolean>(n).fill(true)
  let commonChars = 0
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      oldChanged[i] = false
      newChanged[j] = false
      commonChars += a[i].length
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }

  const longest = Math.max(oldLine.length, newLine.length)
  if (longest > 0 && commonChars / longest < MIN_SIMILARITY) return null

  return { removed: coalesce(a, oldChanged), added: coalesce(b, newChanged) }
}

/**
 * Walks a hunk's lines and attaches word-diff `segments` to removed/added
 * lines that form an edit pair. Within each maximal block of consecutive
 * removed lines followed by consecutive added lines, the i-th removed line is
 * paired with the i-th added line (mirroring GitHub's pairing). Context lines
 * and unpaired remainders are returned unchanged.
 */
export function enrichWithWordDiff(lines: DiffLine[]): RenderableDiffLine[] {
  const out: RenderableDiffLine[] = lines.map((l) => ({ ...l }))
  let blockStart = 0
  while (blockStart < out.length) {
    if (out[blockStart].type !== 'removed') {
      blockStart++
      continue
    }
    // Collect the run of removed lines, then the run of added lines after it.
    let r = blockStart
    while (r < out.length && out[r].type === 'removed') r++
    let a = r
    while (a < out.length && out[a].type === 'added') a++

    const removedCount = r - blockStart
    const addedCount = a - r
    const pairs = Math.min(removedCount, addedCount)
    for (let k = 0; k < pairs; k++) {
      const rem = out[blockStart + k]
      const add = out[r + k]
      const diff = diffLinePair(rem.content, add.content)
      if (diff) {
        rem.segments = diff.removed
        add.segments = diff.added
      }
    }
    blockStart = a > blockStart ? a : blockStart + 1
  }
  return out
}
