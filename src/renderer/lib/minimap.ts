/**
 * Pure geometry for the VSCode-style diff minimap (see `DiffMinimap.tsx`).
 *
 * The minimap renders every line at a fixed pixel height (`mmLineH`). When the
 * whole file is taller than the minimap column it *scrolls with the code*, just
 * like VSCode: the slider (the box marking the code's visible region) moves
 * linearly through the column while the minimap content scrolls underneath it.
 *
 * All maths here is O(1) and free of DOM/canvas access so it can be unit
 * tested; the component feeds it live scroll/size numbers each frame.
 */

/** Minimum slider height so it stays grabbable on huge files. */
export const MIN_SLIDER_PX = 20

export interface MinimapInputs {
  /** Total lines in the file. */
  lineCount: number
  /** Fixed pixel height of one line in the minimap. */
  mmLineH: number
  /** Visible pixel height of the minimap column. */
  viewportH: number
  /** Live scroll metrics of the code scroll container. */
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export interface MinimapLayout {
  /** Total minimap content height (all lines). */
  contentH: number
  /** How far the minimap content is scrolled (0 when the file fits). */
  minimapScrollTop: number
  /** Slider top within the minimap column (viewport coords). */
  sliderTop: number
  /** Slider height within the minimap column. */
  sliderHeight: number
  /** Vertical travel available to the slider; used to map drags back to scroll. */
  sliderTrack: number
  /** Max scrollTop the code container can reach (scrollHeight - clientHeight). */
  maxEditorScroll: number
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Computes the minimap layout for the current scroll state.
 *
 * Key identity (derived, keeps drag math trivial): the slider top is always a
 * linear function of the editor scroll ratio `r` — `sliderTop = r * sliderTrack`
 * — whether or not the minimap itself is scrolling. `pointerToScrollTop` is the
 * exact inverse.
 */
export function computeMinimapLayout(input: MinimapInputs): MinimapLayout {
  const { lineCount, mmLineH, viewportH, scrollTop, scrollHeight, clientHeight } = input
  const contentH = lineCount * mmLineH
  const maxEditorScroll = Math.max(0, scrollHeight - clientHeight)
  const r = maxEditorScroll > 0 ? clamp(scrollTop / maxEditorScroll, 0, 1) : 0

  // Slider height reflects the visible fraction of the file, expressed in
  // minimap pixels (this equals visibleLines * mmLineH).
  const visibleFraction = scrollHeight > 0 ? clientHeight / scrollHeight : 1
  const sliderHeight = clamp(visibleFraction * contentH, MIN_SLIDER_PX, viewportH)

  let minimapScrollTop: number
  let sliderTrack: number
  if (contentH <= viewportH) {
    // Whole file fits: the minimap doesn't scroll; the slider travels the full
    // content height.
    minimapScrollTop = 0
    sliderTrack = Math.max(0, contentH - sliderHeight)
  } else {
    // Overflow: scroll the minimap content proportionally and let the slider
    // travel the column height.
    minimapScrollTop = r * (contentH - viewportH)
    sliderTrack = Math.max(0, viewportH - sliderHeight)
  }

  return {
    contentH,
    minimapScrollTop,
    sliderTop: r * sliderTrack,
    sliderHeight,
    sliderTrack,
    maxEditorScroll
  }
}

/**
 * Inverse of the slider mapping: given the desired slider top (from a click or
 * drag, in minimap column coords), returns the code `scrollTop` that puts the
 * slider there.
 */
export function sliderTopToScrollTop(
  desiredSliderTop: number,
  sliderTrack: number,
  maxEditorScroll: number
): number {
  if (sliderTrack <= 0) return 0
  const r = clamp(desiredSliderTop / sliderTrack, 0, 1)
  return r * maxEditorScroll
}

/** Inclusive range of line indices visible in the minimap column right now. */
export function visibleLineRange(
  minimapScrollTop: number,
  viewportH: number,
  mmLineH: number,
  lineCount: number
): { first: number; last: number } {
  const first = Math.max(0, Math.floor(minimapScrollTop / mmLineH))
  const last = Math.min(lineCount - 1, Math.ceil((minimapScrollTop + viewportH) / mmLineH))
  return { first, last }
}
