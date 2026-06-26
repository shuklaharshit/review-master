import { useAppStore } from '../../stores/appStore'
import { DESIGN_THEMES, type DesignThemeMeta, type ThemePreviewPalette } from '../../lib/designThemes'
import { CheckIcon } from '../ui/icons'
import { cn } from '../ui/cn'

/**
 * A static mini-UI mock rendered in each theme's own palette, so the picker
 * shows what a theme looks like without switching the live app. Pure inline
 * styles (the colours come from the theme registry, not the live CSS vars).
 */
function ThemePreview({ p }: { p: ThemePreviewPalette }): JSX.Element {
  const line = (w: string, color: string, h = 3) => (
    <span style={{ display: 'block', width: w, height: h, borderRadius: 2, backgroundColor: color }} />
  )
  return (
    <div
      className="h-[78px] w-full overflow-hidden border"
      style={{ backgroundColor: p.bg, borderColor: p.border, borderRadius: Math.min(p.radius, 10) }}
      aria-hidden
    >
      {/* title bar */}
      <div
        className="flex items-center gap-1.5 px-2"
        style={{ height: 16, backgroundColor: p.panel, borderBottom: `1px solid ${p.border}` }}
      >
        <span style={{ width: 18, height: 5, borderRadius: 3, backgroundColor: p.accent }} />
        <span style={{ width: 5, height: 5, borderRadius: 9, backgroundColor: p.muted }} />
        <span style={{ width: 5, height: 5, borderRadius: 9, backgroundColor: p.muted, opacity: 0.6 }} />
      </div>
      {/* three-panel body */}
      <div className="flex gap-1.5 p-2" style={{ height: 62 }}>
        <div
          className="flex flex-col gap-1.5 p-1.5"
          style={{ width: '26%', backgroundColor: p.panel, borderRadius: Math.min(p.radius, 6) }}
        >
          {line('80%', p.muted)}
          {line('60%', p.muted)}
          {line('70%', p.muted)}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          {line('90%', p.text)}
          {line('70%', p.text)}
          <span
            className="block"
            style={{ width: '100%', height: 8, borderRadius: 2, backgroundColor: p.add + '33', borderLeft: `2px solid ${p.add}` }}
          />
          <span
            className="block"
            style={{ width: '85%', height: 8, borderRadius: 2, backgroundColor: p.del + '33', borderLeft: `2px solid ${p.del}` }}
          />
        </div>
      </div>
    </div>
  )
}

function ThemeCard({ theme }: { theme: DesignThemeMeta }): JSX.Element {
  const designTheme = useAppStore((s) => s.designTheme)
  const setDesignTheme = useAppStore((s) => s.setDesignTheme)
  const selected = theme.id === designTheme

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => setDesignTheme(theme.id)}
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border p-2.5 text-left transition-colors',
        selected
          ? 'border-accent ring-1 ring-accent'
          : 'border-border-subtle hover:border-border-strong hover:bg-background-panel'
      )}
    >
      <ThemePreview p={theme.preview} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-[12.5px] font-semibold text-text-primary">{theme.name}</span>
            <span className="rounded-full border border-border-subtle px-1.5 text-[9px] uppercase tracking-wide text-text-muted">
              {theme.scheme}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{theme.tagline}</p>
        </div>
        {selected && (
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <CheckIcon className="h-3 w-3" />
          </span>
        )}
      </div>
    </button>
  )
}

/**
 * Theme gallery used in Settings and Onboarding. Switches the system-wide skin
 * (persisted to localStorage, applied to <html> before paint) via the appStore.
 */
export function ThemePicker(): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {DESIGN_THEMES.map((theme) => (
        <ThemeCard key={theme.id} theme={theme} />
      ))}
    </div>
  )
}
