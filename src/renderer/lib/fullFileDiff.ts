import type { DiffLine, NormalizedDiffFile } from '@shared/types'

/**
 * Reconstructs a *whole-file* diff for the "view entire file" modal.
 *
 * The PR diff only carries the changed hunks; to show a file in full with its
 * changes highlighted in place (GitHub's "expand all context" view) we splice
 * the hunks back into the complete file text:
 *   - lines inside a hunk are rendered with their real type (added/removed/
 *     context) and line numbers, straight from the patch;
 *   - the unchanged gaps between hunks are filled with context lines pulled
 *     from the fetched full file content.
 *
 * Pure and deterministic so it can be unit tested without a real file.
 */
function splitLines(text: string): string[] {
  // Normalise CRLF and drop a single trailing newline so we don't emit a
  // phantom empty last line for the (normal) "file ends with \n" case.
  const normalised = text.replace(/\r\n/g, '\n')
  const lines = normalised.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * Builds the full-file diff line list for an added/modified/renamed file, given
 * the file's complete text at the head commit. The head text supplies the
 * unchanged context that the patch omits.
 */
export function buildFullFileDiff(file: NormalizedDiffFile, headText: string): DiffLine[] {
  const headLines = splitLines(headText)
  const out: DiffLine[] = []

  // Cursors track the next 1-based line number to emit on each side. Unchanged
  // gaps advance both in lockstep; a hunk jumps them to just past its range.
  let newCursor = 1
  let oldCursor = 1

  for (const hunk of file.hunks) {
    // Fill the unchanged gap before this hunk from the real file content.
    for (let n = newCursor; n < hunk.newStart; n++) {
      out.push({
        type: 'context',
        oldLineNumber: oldCursor + (n - newCursor),
        newLineNumber: n,
        content: headLines[n - 1] ?? ''
      })
    }
    for (const line of hunk.lines) out.push(line)
    newCursor = hunk.newStart + hunk.newLines
    oldCursor = hunk.oldStart + hunk.oldLines
  }

  // Trailing unchanged context after the last hunk (or the whole file when the
  // patch had no hunks but we still want to show the content).
  for (let n = newCursor; n <= headLines.length; n++) {
    out.push({
      type: 'context',
      oldLineNumber: oldCursor + (n - newCursor),
      newLineNumber: n,
      content: headLines[n - 1] ?? ''
    })
  }

  return out
}

/**
 * Renders a fully-removed file (its content only exists at the base commit) as
 * an all-removed diff so the modal can still show "the entire file" with the
 * deletion made obvious.
 */
export function buildRemovedFileDiff(baseText: string): DiffLine[] {
  return splitLines(baseText).map((content, i) => ({
    type: 'removed' as const,
    oldLineNumber: i + 1,
    content
  }))
}
