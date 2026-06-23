/** Split a file path into directory + basename for compact display. */
export function splitPath(path: string): { dir: string; name: string } {
  const idx = path.lastIndexOf('/')
  if (idx === -1) return { dir: '', name: path }
  return { dir: path.slice(0, idx), name: path.slice(idx + 1) }
}

/** Parse "path/to/file.ts:123" into { path, line }. */
export function parseFileReference(ref: string): { path: string; line?: number } {
  const match = ref.match(/^(.*?):(\d+)(?:-\d+)?$/)
  if (match) return { path: match[1], line: Number(match[2]) }
  return { path: ref }
}
