import { useAppStore } from '../../stores/appStore'
import { DESIGN_THEMES, type DesignThemeMeta } from '../../lib/designThemes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/DropdownMenu'
import { CheckIcon, ChevronDownIcon, PaletteIcon } from '../ui/icons'

/** Small three-stop gradient chip previewing a theme's bg / accent / text. */
function Swatch({ theme, size = 16 }: { theme: DesignThemeMeta; size?: number }): JSX.Element {
  const { bg, accent, text } = theme.preview
  return (
    <span
      className="inline-block shrink-0 rounded-full border border-border-strong"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${bg} 0deg 150deg, ${accent} 150deg 250deg, ${text} 250deg 360deg)`
      }}
      aria-hidden
    />
  )
}

/**
 * Header control that switches the app's visual design iteration live. Five
 * fully distinct skins are defined in styles/globals.css; selecting one writes
 * `data-rm-theme` on <html> (via the appStore) and persists it. Layout is
 * unchanged across themes — this only re-skins colour, type, radius, density.
 */
export function ThemeSwitcher(): JSX.Element {
  const designTheme = useAppStore((s) => s.designTheme)
  const setDesignTheme = useAppStore((s) => s.setDesignTheme)
  const active = DESIGN_THEMES.find((t) => t.id === designTheme) ?? DESIGN_THEMES[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-8 items-center gap-2 rounded-md border border-border-subtle bg-background-panel px-2 text-[13px] text-text-secondary transition-colors hover:bg-background-panel-hover hover:text-text-primary"
          aria-label={`Theme: ${active.name}`}
        >
          <PaletteIcon className="h-4 w-4 text-text-muted" />
          <span className="hidden max-w-[110px] truncate sm:inline">{active.name}</span>
          <Swatch theme={active} size={14} />
          <ChevronDownIcon className="h-3.5 w-3.5 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[268px]">
        <DropdownMenuLabel>Design iteration</DropdownMenuLabel>
        {DESIGN_THEMES.map((theme) => {
          const isActive = theme.id === designTheme
          return (
            <DropdownMenuItem
              key={theme.id}
              className="items-start gap-2.5 py-2"
              onSelect={() => setDesignTheme(theme.id)}
            >
              <Swatch theme={theme} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-display text-[13px] font-semibold text-text-primary">{theme.name}</span>
                  <span className="rounded-full border border-border-subtle px-1.5 text-[9px] uppercase tracking-wide text-text-muted">
                    {theme.scheme}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-text-muted">{theme.tagline}</span>
              </span>
              {isActive && <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-[10.5px] leading-snug text-text-muted">
          Same layout, five looks. Your choice is remembered.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
