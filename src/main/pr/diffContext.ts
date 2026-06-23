import type { NormalizedDiff, NormalizedDiffFile } from '../../shared/types'
import {
  MAX_DIRECT_REVIEW_FILES,
  MAX_DIRECT_REVIEW_PATCH_CHARS,
  MAX_SINGLE_FILE_PATCH_CHARS
} from '../../shared/constants'

export interface DiffContextResult {
  text: string
  truncated: boolean
  warnings: string[]
}

const LARGE_PR_WARNING =
  'This PR is large. Review Master will focus the AI review on high-risk areas and may summarise generated or very large files.'

function statusLabel(file: NormalizedDiffFile): string {
  if (file.status === 'renamed' && file.oldPath) return `renamed ${file.oldPath} -> ${file.path}`
  if (file.status === 'copied' && file.oldPath) return `copied ${file.oldPath} -> ${file.path}`
  return file.status
}

function fileHeader(file: NormalizedDiffFile): string {
  return `### ${file.path} [${statusLabel(file)}] +${file.additions} -${file.deletions}`
}

/** Returns a priority score for ordering — higher means review first. */
function priorityScore(file: NormalizedDiffFile): number {
  let score = file.additions + file.deletions
  if (file.isGenerated) score -= 100_000
  if (file.isBinary) score -= 200_000
  if (file.isLarge) score -= 50_000
  return score
}

function patchLength(file: NormalizedDiffFile): number {
  return file.patch ? file.patch.length : 0
}

/**
 * Builds the textual diff context sent to Codex, applying large-PR handling
 * (spec §21). When the PR exceeds the direct-review thresholds, non-generated,
 * high-change files are prioritised; generated/oversized files are summarised
 * or omitted (and noted); binary files are listed but never have their content
 * sent. A warning is added and `truncated` is set.
 */
export function buildDiffContext(diff: NormalizedDiff): DiffContextResult {
  const warnings: string[] = []
  const files = diff.files

  const totalPatchChars = files.reduce((sum, f) => sum + patchLength(f), 0)
  const isLarge = files.length > MAX_DIRECT_REVIEW_FILES || totalPatchChars > MAX_DIRECT_REVIEW_PATCH_CHARS

  // Partition binary files — never send their content.
  const binaryFiles = files.filter((f) => f.isBinary || f.status === 'binary')
  const nonBinary = files.filter((f) => !(f.isBinary || f.status === 'binary'))

  const sections: string[] = []
  let truncated = false

  // Ordered processing: prioritise high-change, non-generated files in large PRs.
  const ordered = isLarge
    ? [...nonBinary].sort((a, b) => priorityScore(b) - priorityScore(a))
    : nonBinary

  let usedChars = 0
  const omittedGenerated: string[] = []
  const omittedOversized: string[] = []
  const omittedBudget: string[] = []

  for (const file of ordered) {
    const header = fileHeader(file)

    // Generated files in a large PR: summarise rather than include full patch.
    if (isLarge && file.isGenerated) {
      omittedGenerated.push(file.path)
      sections.push(
        `${header}\n_Generated/noisy file. Patch omitted from review context (+${file.additions} -${file.deletions}). Summarise dependency or build changes if relevant._`
      )
      truncated = true
      continue
    }

    // Oversized single file: summarise instead of inlining the whole patch.
    if (file.patch && (file.isLarge || file.patch.length > MAX_SINGLE_FILE_PATCH_CHARS)) {
      omittedOversized.push(file.path)
      sections.push(
        `${header}\n_File patch is very large (${file.patch.length} chars, +${file.additions} -${file.deletions}). Full patch omitted; review the most impactful hunks directly on GitHub if needed._`
      )
      truncated = true
      continue
    }

    const patch = file.patch ?? ''
    const block = patch ? `${header}\n\n\`\`\`diff\n${patch}\n\`\`\`` : `${header}\n_No textual diff available._`

    // In a large PR, respect the overall char budget.
    if (isLarge && usedChars + block.length > MAX_DIRECT_REVIEW_PATCH_CHARS) {
      omittedBudget.push(file.path)
      truncated = true
      continue
    }

    sections.push(block)
    usedChars += block.length
  }

  // Binary files: always listed, content never sent (spec §22.8).
  if (binaryFiles.length > 0) {
    const list = binaryFiles
      .map((f) => `- ${f.path} [${statusLabel(f)}] — Binary file changed — not analysed.`)
      .join('\n')
    sections.push(`### Binary files (not analysed)\n${list}`)
  }

  if (isLarge) {
    warnings.push(LARGE_PR_WARNING)
  }
  if (omittedGenerated.length > 0) {
    warnings.push(
      `Summarised ${omittedGenerated.length} generated/noisy file(s): ${omittedGenerated.join(', ')}`
    )
  }
  if (omittedOversized.length > 0) {
    warnings.push(
      `Summarised ${omittedOversized.length} oversized file(s): ${omittedOversized.join(', ')}`
    )
  }
  if (omittedBudget.length > 0) {
    warnings.push(
      `Omitted ${omittedBudget.length} file(s) from diff context due to size budget: ${omittedBudget.join(', ')}`
    )
  }
  if (diff.truncated) {
    truncated = true
  }

  const summaryLine = `Diff source: ${diff.source}. ${files.length} changed file(s), +${diff.totalAdditions} -${diff.totalDeletions}.`
  const text = [summaryLine, '', ...sections].join('\n\n')

  return { text, truncated, warnings }
}
