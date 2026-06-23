// Markdown is sanitised at render time with rehype-sanitize. At storage time we
// only strip null bytes and clamp length to keep the DB and prompts sane.

export const MARKDOWN_MAX_CHARS = 200_000

/**
 * Storage-time normalisation: strip null bytes and trim trailing whitespace.
 * NOT a security sanitiser — rendering must still go through rehype-sanitize.
 */
export function sanitizeMarkdownForStorage(md: string): string {
  // Strip null bytes; trim trailing whitespace.
  return md.replace(/\u0000/g, '').replace(/\s+$/u, '')
}

/** Clamp markdown to MARKDOWN_MAX_CHARS, after storage normalisation. */
export function clampMarkdown(md: string): string {
  const normalised = sanitizeMarkdownForStorage(md)
  if (normalised.length <= MARKDOWN_MAX_CHARS) return normalised
  return normalised.slice(0, MARKDOWN_MAX_CHARS)
}
