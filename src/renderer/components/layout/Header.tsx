import type { ReactNode } from 'react'
import { APP_NAME, APP_SUBTITLE } from '@shared/constants'
import { useAppStore } from '../../stores/appStore'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { GearIcon } from '../ui/icons'
import { AccountDropdown } from './AccountDropdown'

export function Header({ centerSlot }: { centerSlot?: ReactNode }) {
  const setRoute = useAppStore((s) => s.setRoute)
  const route = useAppStore((s) => s.route)
  const showAccountControls = route !== 'onboarding'

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border-subtle bg-background-elevated px-4">
      <button
        type="button"
        onClick={() => showAccountControls && setRoute('accounts')}
        className="flex items-center gap-2.5 text-left"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent-hover">
          <span className="text-[13px] font-bold">R</span>
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-text-primary">{APP_NAME}</div>
          <div className="-mt-0.5 hidden text-[10px] text-text-muted sm:block">{APP_SUBTITLE}</div>
        </div>
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center px-4">{centerSlot}</div>

      <div className="flex items-center gap-1.5">
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
