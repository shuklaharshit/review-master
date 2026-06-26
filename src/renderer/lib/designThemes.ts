// Design-iteration registry + persistence for the system-wide theme switcher.
//
// Each theme is a pure re-skin of the entire app: it swaps only design tokens
// (colour, typography, radius, density) defined under the matching
// `:root[data-rm-theme='…']` block in `styles/globals.css`. Because every
// component styles via those tokens, switching re-skins the whole UI at once;
// the DOM and layout are identical across themes, so nothing re-mounts.
//
// This module is deliberately framework-free (no React) so it can be applied
// synchronously at boot (before first paint, avoiding a flash) and unit-tested
// in isolation. The store in `appStore` mirrors the selection for the UI.

export type DesignThemeId = 'graphite' | 'paper' | 'nocturne' | 'carbon' | 'sandstone'

/**
 * Representative colours mirrored from the theme's CSS block, used to render a
 * faithful mini-UI preview in the picker WITHOUT switching the live theme.
 * These duplicate a handful of values from globals.css — keep them in sync.
 */
export interface ThemePreviewPalette {
  bg: string
  panel: string
  border: string
  accent: string
  text: string
  muted: string
  add: string
  del: string
  /** Corner radius (px) the theme uses, so the preview reflects its geometry. */
  radius: number
}

export interface DesignThemeMeta {
  id: DesignThemeId
  name: string
  /** One-line aesthetic description shown in the picker. */
  tagline: string
  /** Whether the skin is light or dark — drives the scheme tag. */
  scheme: 'light' | 'dark'
  preview: ThemePreviewPalette
}

/** Ordered list rendered by the picker / switcher. `graphite` is the default. */
export const DESIGN_THEMES: DesignThemeMeta[] = [
  {
    id: 'graphite',
    name: 'Graphite',
    tagline: 'Refined neutral dark — the precise baseline',
    scheme: 'dark',
    preview: {
      bg: '#0f121a', panel: '#131722', border: '#242a38', accent: '#7c5cff',
      text: '#f4f7fb', muted: '#8b94a8', add: '#3ddc97', del: '#ff5c7a', radius: 6
    }
  },
  {
    id: 'paper',
    name: 'Paper',
    tagline: 'Light editorial — ivory & ink, serif throughout',
    scheme: 'light',
    preview: {
      bg: '#f3efe6', panel: '#ffffff', border: '#e3dccc', accent: '#9a3420',
      text: '#211c15', muted: '#897e69', add: '#2f7d4f', del: '#b23d2c', radius: 4
    }
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    tagline: 'Soft deep-indigo — rounded, airy, periwinkle',
    scheme: 'dark',
    preview: {
      bg: '#11132a', panel: '#1e2245', border: '#2d325e', accent: '#a5b4ff',
      text: '#eef0ff', muted: '#888ec7', add: '#6ee0b0', del: '#ff8fa8', radius: 12
    }
  },
  {
    id: 'carbon',
    name: 'Carbon',
    tagline: 'Brutalist high-contrast — black, lime, hard edges',
    scheme: 'dark',
    preview: {
      bg: '#000000', panel: '#0b0b0b', border: '#6a6a6a', accent: '#d6ff3f',
      text: '#ffffff', muted: '#949494', add: '#00e676', del: '#ff3b3b', radius: 0
    }
  },
  {
    id: 'sandstone',
    name: 'Sandstone',
    tagline: 'Warm terminal — espresso & amber, typewriter',
    scheme: 'dark',
    preview: {
      bg: '#1c1714', panel: '#2a221c', border: '#5b4837', accent: '#e08a3c',
      text: '#f3e9db', muted: '#a08c74', add: '#9ccc65', del: '#e3705c', radius: 6
    }
  }
]

const DEFAULT_THEME: DesignThemeId = 'graphite'
const STORAGE_KEY = 'rm.designTheme'
const VALID_IDS = new Set<string>(DESIGN_THEMES.map((t) => t.id))

export function isDesignThemeId(value: unknown): value is DesignThemeId {
  return typeof value === 'string' && VALID_IDS.has(value)
}

/** Reads the persisted theme, falling back to the default if unset/invalid. */
export function loadStoredTheme(): DesignThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (isDesignThemeId(raw)) return raw
  } catch {
    // localStorage may be unavailable (SSR/tests) — fall through to default.
  }
  return DEFAULT_THEME
}

/**
 * Applies a theme to the document by setting `data-rm-theme` on <html> and
 * persists the choice. Safe to call before React mounts. `graphite` (the
 * default) is written explicitly too so its readability-tuned overrides apply.
 */
export function applyDesignTheme(id: DesignThemeId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.rmTheme = id
  }
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Persistence is best-effort; ignore quota/availability errors.
  }
}
