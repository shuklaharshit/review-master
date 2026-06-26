// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DESIGN_THEMES,
  applyDesignTheme,
  isDesignThemeId,
  loadStoredTheme
} from '../designThemes'

describe('DESIGN_THEMES registry', () => {
  it('exposes five themes with unique ids, graphite first (the default)', () => {
    expect(DESIGN_THEMES).toHaveLength(5)
    expect(DESIGN_THEMES[0].id).toBe('graphite')
    const ids = DESIGN_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every theme a name, tagline, scheme, and a full preview palette', () => {
    for (const theme of DESIGN_THEMES) {
      expect(theme.name).toBeTruthy()
      expect(theme.tagline).toBeTruthy()
      expect(['light', 'dark']).toContain(theme.scheme)
      const p = theme.preview
      for (const swatch of [p.bg, p.panel, p.border, p.accent, p.text, p.muted, p.add, p.del]) {
        expect(swatch).toMatch(/^#[0-9a-f]{6}$/i)
      }
      expect(p.radius).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('isDesignThemeId', () => {
  it('accepts known ids and rejects anything else', () => {
    expect(isDesignThemeId('nocturne')).toBe(true)
    expect(isDesignThemeId('paper')).toBe(true)
    expect(isDesignThemeId('neon')).toBe(false)
    expect(isDesignThemeId(42)).toBe(false)
    expect(isDesignThemeId(null)).toBe(false)
  })
})

describe('theme persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.rmTheme
  })

  it('falls back to graphite when nothing is stored', () => {
    expect(loadStoredTheme()).toBe('graphite')
  })

  it('ignores an invalid stored value', () => {
    localStorage.setItem('rm.designTheme', 'bogus')
    expect(loadStoredTheme()).toBe('graphite')
  })

  it('applyDesignTheme sets the html attribute and round-trips through storage', () => {
    applyDesignTheme('carbon')
    expect(document.documentElement.dataset.rmTheme).toBe('carbon')
    expect(loadStoredTheme()).toBe('carbon')
  })
})
