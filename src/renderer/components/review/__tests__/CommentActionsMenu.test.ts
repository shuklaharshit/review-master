import { describe, expect, it } from 'vitest'
import { quoteMarkdown } from '../CommentActionsMenu'

describe('quoteMarkdown', () => {
  it('prefixes a single line and adds a trailing blank line', () => {
    expect(quoteMarkdown('hello')).toBe('> hello\n\n')
  })

  it('quotes every line of a multi-line body', () => {
    expect(quoteMarkdown('line one\nline two')).toBe('> line one\n> line two\n\n')
  })

  it('trims surrounding whitespace before quoting', () => {
    expect(quoteMarkdown('\n  spaced  \n')).toBe('> spaced\n\n')
  })

  it('preserves blank lines inside the body as empty quote lines', () => {
    expect(quoteMarkdown('a\n\nb')).toBe('> a\n> \n> b\n\n')
  })
})
