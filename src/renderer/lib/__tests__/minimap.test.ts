import { describe, it, expect } from 'vitest'
import {
  computeMinimapLayout,
  sliderTopToScrollTop,
  visibleLineRange,
  MIN_SLIDER_PX
} from '../minimap'

describe('computeMinimapLayout — file fits in the column (no minimap scroll)', () => {
  // 50 lines * 4px = 200px content, column is 600px tall → everything fits.
  const base = { lineCount: 50, mmLineH: 4, viewportH: 600, scrollHeight: 1000, clientHeight: 600 }

  it('does not scroll the minimap and pins the slider at the top when at top', () => {
    const l = computeMinimapLayout({ ...base, scrollTop: 0 })
    expect(l.contentH).toBe(200)
    expect(l.minimapScrollTop).toBe(0)
    expect(l.sliderTop).toBe(0)
  })

  it('moves the slider linearly with the editor scroll ratio', () => {
    const max = base.scrollHeight - base.clientHeight // 400
    const l = computeMinimapLayout({ ...base, scrollTop: max }) // r = 1
    expect(l.sliderTop).toBeCloseTo(l.sliderTrack)
  })
})

describe('computeMinimapLayout — file overflows the column (minimap scrolls)', () => {
  // 1000 lines * 4px = 4000px content vs 600px column → must scroll.
  const base = { lineCount: 1000, mmLineH: 4, viewportH: 600, scrollHeight: 18000, clientHeight: 600 }

  it('keeps the slider at the top and unscrolled at scrollTop 0', () => {
    const l = computeMinimapLayout({ ...base, scrollTop: 0 })
    expect(l.minimapScrollTop).toBe(0)
    expect(l.sliderTop).toBe(0)
  })

  it('scrolls the minimap content to the end and slider to the bottom at max scroll', () => {
    const max = base.scrollHeight - base.clientHeight
    const l = computeMinimapLayout({ ...base, scrollTop: max })
    expect(l.minimapScrollTop).toBeCloseTo(l.contentH - base.viewportH) // 4000 - 600
    expect(l.sliderTop).toBeCloseTo(l.sliderTrack)
  })

  it('places the minimap scroll and slider proportionally at the midpoint', () => {
    const max = base.scrollHeight - base.clientHeight
    const l = computeMinimapLayout({ ...base, scrollTop: max / 2 })
    expect(l.minimapScrollTop).toBeCloseTo((l.contentH - base.viewportH) / 2)
    expect(l.sliderTop).toBeCloseTo(l.sliderTrack / 2)
  })

  it('never lets the slider shrink below the grabbable minimum', () => {
    const l = computeMinimapLayout({
      lineCount: 100000,
      mmLineH: 4,
      viewportH: 600,
      scrollTop: 0,
      scrollHeight: 1_800_000,
      clientHeight: 600
    })
    expect(l.sliderHeight).toBeGreaterThanOrEqual(MIN_SLIDER_PX)
  })
})

describe('sliderTopToScrollTop — inverse of the slider mapping', () => {
  it('round-trips a layout back to the originating scrollTop', () => {
    const base = { lineCount: 1000, mmLineH: 4, viewportH: 600, scrollHeight: 18000, clientHeight: 600 }
    const max = base.scrollHeight - base.clientHeight
    for (const scrollTop of [0, max / 4, max / 2, max]) {
      const l = computeMinimapLayout({ ...base, scrollTop })
      expect(sliderTopToScrollTop(l.sliderTop, l.sliderTrack, l.maxEditorScroll)).toBeCloseTo(scrollTop)
    }
  })

  it('clamps out-of-range slider positions', () => {
    expect(sliderTopToScrollTop(-50, 400, 1000)).toBe(0)
    expect(sliderTopToScrollTop(9999, 400, 1000)).toBe(1000)
  })

  it('returns 0 when there is no track (nothing to scroll)', () => {
    expect(sliderTopToScrollTop(100, 0, 0)).toBe(0)
  })
})

describe('visibleLineRange — only paints the on-screen window', () => {
  it('returns the inclusive line band intersecting the column', () => {
    // minimapScrollTop 400px, 600px column, 4px lines → lines 100..250.
    const { first, last } = visibleLineRange(400, 600, 4, 1000)
    expect(first).toBe(100)
    expect(last).toBe(250)
  })

  it('clamps to the file bounds', () => {
    const { first, last } = visibleLineRange(0, 600, 4, 50)
    expect(first).toBe(0)
    expect(last).toBe(49)
  })
})
