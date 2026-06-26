import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { RenderableDiffLine } from '../../lib/diffWords'
import {
  computeMinimapLayout,
  sliderTopToScrollTop,
  visibleLineRange,
  type MinimapLayout
} from '../../lib/minimap'

/**
 * VSCode-style minimap for the full-file viewer.
 *
 * Renders the whole file onto a canvas at a fixed per-line height: faint
 * word-run bars for the code shape, green/red bands where the PR added/removed
 * lines. A slider marks the code's visible region; click or drag it to scroll.
 *
 * Efficiency: layout is one O(1) calc (`lib/minimap.ts`), and each frame we
 * draw ONLY the lines currently visible in the column (`visibleLineRange`), so
 * a 10k-line file still paints a few hundred rects. Scroll/resize updates are
 * coalesced through a single requestAnimationFrame.
 */

const MM_LINE_H = 4 // logical px per line in the minimap
const CHAR_W = 1 // logical px per character for the faint-text bars

/** Column width in px. Exported so the viewer can inset the code pane to match. */
export const MINIMAP_WIDTH = 110

interface Rgb {
  r: number
  g: number
  b: number
}

function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  }
}

function rgba({ r, g, b }: Rgb, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Resolves the diff palette from CSS variables so the minimap matches the theme. */
function readPalette(): { add: Rgb; del: Rgb; text: Rgb } {
  const cs = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string): Rgb =>
    hexToRgb(cs.getPropertyValue(name) || fallback)
  return {
    add: get('--success', '#3ddc97'),
    del: get('--danger', '#ff5c7a'),
    text: get('--text-muted', '#6f788d')
  }
}

/** Draws one line's faint word-run bars (token shape), indentation preserved. */
function drawLineText(
  ctx: CanvasRenderingContext2D,
  content: string,
  y: number,
  width: number,
  color: string
): void {
  ctx.fillStyle = color
  let col = 0
  let i = 0
  const n = content.length
  while (i < n) {
    // Skip whitespace (advances the column so indentation is reflected).
    if (content[i] === ' ' || content[i] === '\t') {
      col += content[i] === '\t' ? 2 : 1
      i++
      continue
    }
    const runStart = col
    while (i < n && content[i] !== ' ' && content[i] !== '\t') {
      col++
      i++
    }
    const x = runStart * CHAR_W
    if (x > width) break
    const w = Math.min((col - runStart) * CHAR_W, width - x)
    ctx.fillRect(x, y + 1, w, MM_LINE_H - 2)
  }
}

export function DiffMinimap({
  scrollRef,
  lines,
  width = MINIMAP_WIDTH
}: {
  scrollRef: RefObject<HTMLDivElement | null>
  lines: RenderableDiffLine[]
  width?: number
}): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [layout, setLayout] = useState<MinimapLayout | null>(null)
  const drag = useRef<{ grabOffset: number } | null>(null)

  // The draw logic captures the latest props every render; `updateRef` lets the
  // stable `redraw` callback below always run the current version without
  // rebinding listeners. Reads live scroll/size each time it runs.
  const updateRef = useRef<() => void>(() => {})
  updateRef.current = () => {
    const scroller = scrollRef.current
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    if (!scroller || !wrapper || !canvas) return

    const viewportH = wrapper.clientHeight
    const next = computeMinimapLayout({
      lineCount: lines.length,
      mmLineH: MM_LINE_H,
      viewportH,
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight
    })
    setLayout(next)

    const ctx = canvas.getContext('2d')
    if (!ctx) return // jsdom / unsupported — geometry still drives the slider.

    const dpr = window.devicePixelRatio || 1
    const cssW = width
    const cssH = viewportH
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const palette = readPalette()
    const { first, last } = visibleLineRange(next.minimapScrollTop, viewportH, MM_LINE_H, lines.length)
    for (let idx = first; idx <= last; idx++) {
      const line = lines[idx]
      const y = idx * MM_LINE_H - next.minimapScrollTop
      if (line.type === 'added') {
        ctx.fillStyle = rgba(palette.add, 0.22)
        ctx.fillRect(0, y, cssW, MM_LINE_H)
      } else if (line.type === 'removed') {
        ctx.fillStyle = rgba(palette.del, 0.22)
        ctx.fillRect(0, y, cssW, MM_LINE_H)
      }
      const textColor =
        line.type === 'added'
          ? rgba(palette.add, 0.85)
          : line.type === 'removed'
            ? rgba(palette.del, 0.85)
            : rgba(palette.text, 0.7)
      drawLineText(ctx, line.content, y, cssW, textColor)
    }
  }

  // Stable redraw bound once so it can be added/removed as a listener reliably;
  // always runs the freshest `updateRef`. We draw SYNCHRONOUSLY rather than via
  // requestAnimationFrame on purpose: Electron pauses rAF while the window is
  // hidden/occluded (macOS reports occluded windows as `hidden`), which would
  // otherwise freeze the minimap on its first frame so it never tracks scrolling.
  // The draw is cheap (only the on-screen line window is painted) and the
  // browser already coalesces scroll events to ~one per frame, so this is safe.
  const redraw = useRef(() => updateRef.current()).current

  // Wire up scroll + resize observers; redraw when the line set changes.
  useEffect(() => {
    const scroller = scrollRef.current
    const wrapper = wrapperRef.current
    if (!scroller || !wrapper) return

    scroller.addEventListener('scroll', redraw, { passive: true })
    const ro = new ResizeObserver(redraw)
    ro.observe(scroller)
    ro.observe(wrapper)
    redraw() // initial paint

    return () => {
      scroller.removeEventListener('scroll', redraw)
      ro.disconnect()
    }
  }, [scrollRef, redraw, lines])

  // Pointer interaction: drag the slider, or click anywhere to jump (centring
  // the slider on the click). Both go through the same scroll mapping.
  function moveTo(clientY: number): void {
    const scroller = scrollRef.current
    const wrapper = wrapperRef.current
    if (!scroller || !wrapper || !layout) return
    const localY = clientY - wrapper.getBoundingClientRect().top
    const grab = drag.current?.grabOffset ?? layout.sliderHeight / 2
    scroller.scrollTop = sliderTopToScrollTop(localY - grab, layout.sliderTrack, layout.maxEditorScroll)
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    const wrapper = wrapperRef.current
    if (!wrapper || !layout) return
    const localY = e.clientY - wrapper.getBoundingClientRect().top
    const onSlider = localY >= layout.sliderTop && localY <= layout.sliderTop + layout.sliderHeight
    drag.current = { grabOffset: onSlider ? localY - layout.sliderTop : layout.sliderHeight / 2 }
    wrapper.setPointerCapture(e.pointerId)
    moveTo(e.clientY)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
    if (!drag.current) return
    moveTo(e.clientY)
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>): void {
    drag.current = null
    wrapperRef.current?.releasePointerCapture(e.pointerId)
  }

  return (
    <div
      ref={wrapperRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="absolute inset-y-0 right-0 cursor-pointer select-none border-l border-border-subtle bg-background"
      style={{ width }}
      aria-hidden
    >
      <canvas ref={canvasRef} className="block" />
      {layout && (
        <div
          className="pointer-events-none absolute left-0 right-0 border border-border-strong bg-text-primary/10"
          style={{ top: layout.sliderTop, height: layout.sliderHeight }}
        />
      )}
    </div>
  )
}
