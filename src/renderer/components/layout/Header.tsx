import type { ReactNode } from 'react'
import { APP_NAME, APP_SUBTITLE } from '@shared/constants'
import { useAppStore } from '../../stores/appStore'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { ChevronLeftIcon, ChevronRightIcon, GearIcon } from '../ui/icons'
import { AccountDropdown } from './AccountDropdown'
import { ThemeSwitcher } from './ThemeSwitcher'
import { Logo } from './Logo'

// On macOS the window uses a hidden-inset title bar, so the traffic-light
// buttons overlay the top-left of the header. Reserve space for them.
const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)
const MOD = isMac ? '⌘' : 'Ctrl+'

export function Header({ centerSlot }: { centerSlot?: ReactNode }) {
  const setRoute = useAppStore((s) => s.setRoute)
  const route = useAppStore((s) => s.route)
  const goBack = useAppStore((s) => s.goBack)
  const goForward = useAppStore((s) => s.goForward)
  const canGoBack = useAppStore((s) => s.canGoBack)
  const canGoForward = useAppStore((s) => s.canGoForward)
  const showAccountControls = route !== 'onboarding'

  return (
    <header
      className="app-drag flex h-12 shrink-0 items-center gap-4 border-b border-border-subtle bg-background-elevated pr-4"
      style={{ paddingLeft: isMac ? 84 : 16 }}
    >
      <div className="app-no-drag flex items-center gap-2">
        {showAccountControls && (
          <>
            <div className="flex items-center gap-0.5">
              <Tooltip content={`Back (${MOD}[)`}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Back"
                  disabled={!canGoBack}
                  onClick={goBack}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Tooltip content={`Forward (${MOD}])`}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Forward"
                  disabled={!canGoForward}
                  onClick={goForward}
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </Tooltip>
            </div>
            <div className="mx-1 h-5 w-px bg-border-subtle" aria-hidden />
          </>
        )}

        <button
          type="button"
          onClick={() => showAccountControls && setRoute('accounts')}
          className="flex items-center gap-2.5 text-left"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-background-elevated text-accent ring-1 ring-inset ring-border-strong">
            <Logo className="h-[15px] w-[15px]" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-[13px] font-semibold text-text-primary">{APP_NAME}</div>
            <div className="-mt-0.5 hidden text-[10px] text-text-muted sm:block">{APP_SUBTITLE}</div>
          </div>
        </button>
      </div>

      <div className="app-no-drag flex min-w-0 flex-1 items-center justify-center px-4">{centerSlot}</div>

      <div className="app-no-drag flex items-center gap-1.5">
        {showAccountControls && <ThemeSwitcher />}
        {showAccountControls && <AccountDropdown />}
        {showAccountControls && (
          <Tooltip content="Settings">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              onClick={() => setRoute('settings')}
            >
              <GearIcon className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
