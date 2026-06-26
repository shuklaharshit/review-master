import { describe, it, expect } from 'vitest'
import { diffLinePair, enrichWithWordDiff } from '../diffWords'
import type { DiffLine } from '@shared/types'

describe('diffLinePair', () => {
  it('marks only the changed tokens, leaving shared spans unchanged', () => {
    const res = diffLinePair('const a = 1', 'const a = 2')
    expect(res).not.toBeNull()
    // Reassembling each side must reproduce the original line.
    expect(res!.removed.map((s) => s.text).join('')).toBe('const a = 1')
    expect(res!.added.map((s) => s.text).join('')).toBe('const a = 2')
    // Only "1" / "2" flip.
    expect(res!.removed.filter((s) => s.changed).map((s) => s.text)).toEqual(['1'])
    expect(res!.added.filter((s) => s.changed).map((s) => s.text)).toEqual(['2'])
  })

  it('returns null for unrelated lines (full rewrite, not an edit)', () => {
    expect(diffLinePair('import { foo } from "a"', 'export default class Widget {}')).toBeNull()
  })

  it('handles a pure addition within a line', () => {
    const res = diffLinePair('foo(a)', 'foo(a, b)')
    expect(res).not.toBeNull()
    expect(res!.added.filter((s) => s.changed).map((s) => s.text).join('')).toContain('b')
    // The unchanged prefix "foo(a" is preserved as an unchanged segment.
    expect(res!.added.some((s) => !s.changed && s.text.includes('foo'))).toBe(true)
  })
})

describe('enrichWithWordDiff', () => {
  const line = (type: DiffLine['type'], content: string, n: number): DiffLine => ({
    type,
    content,
    oldLineNumber: type === 'added' ? undefined : n,
    newLineNumber: type === 'removed' ? undefined : n
  })

  it('pairs consecutive removed/added lines and attaches segments', () => {
    const enriched = enrichWithWordDiff([
      line('context', 'a', 1),
      line('removed', 'const x = 1', 2),
      line('added', 'const x = 2', 2),
      line('context', 'b', 3)
    ])
    // Context lines never get segments.
    expect(enriched[0].segments).toBeUndefined()
    expect(enriched[3].segments).toBeUndefined()
    // The edit pair does.
    expect(enriched[1].segments).toBeDefined()
    expect(enriched[2].segments).toBeDefined()
  })

  it('does not mutate the input lines', () => {
    const input = [line('removed', 'x', 1), line('added', 'y', 1)]
    enrichWithWordDiff(input)
    expect(input[0]).not.toHaveProperty('segments')
  })

  it('leaves an unpaired added line (pure insertion) without segments', () => {
    const enriched = enrichWithWordDiff([line('added', 'brand new', 1)])
    expect(enriched[0].segments).toBeUndefined()
  })
})
