import { useAccounts, useSetActiveAccount } from '../../queries/useAccounts'
import { useAppStore } from '../../stores/appStore'
import { Avatar } from '../ui/misc'
import { Button } from '../ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/DropdownMenu'
import { CheckIcon, ChevronDownIcon, PlusIcon } from '../ui/icons'

export function AccountDropdown() {
  const { data: accounts } = useAccounts()
  const activeAccountId = useAppStore((s) => s.activeAccountId)
  const setRoute = useAppStore((s) => s.setRoute)
  const switchAccount = useAppStore((s) => s.switchAccount)
  const setActive = useSetActiveAccount()

  const active = accounts?.find((a) => a.id === activeAccountId) ?? accounts?.[0]

  if (!accounts || accounts.length === 0) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setRoute('accounts')}>
        <PlusIcon className="h-3.5 w-3.5" /> Add account
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 items-center gap-2 rounded-md border border-border-subtle bg-background-panel px-2 text-[13px] text-text-secondary transition-colors hover:bg-background-panel-hover hover:text-text-primary">
          <Avatar src={active?.avatarUrl} alt={active?.login} size={18} />
          <span className="max-w-[140px] truncate">{active?.login ?? 'Account'}</span>
          <ChevronDownIcon className="h-3.5 w-3.5 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Accounts</DropdownMenuLabel>
        {accounts.map((acc) => (
          <DropdownMenuItem
            key={acc.id}
            onSelect={() => {
              switchAccount(acc.id)
              setActive.mutate(acc.id)
            }}
          >
            <Avatar src={acc.avatarUrl} alt={acc.login} size={18} />
            <span className="flex-1 truncate">{acc.login}</span>
            {acc.id === (active?.id ?? activeAccountId) && <CheckIcon className="h-3.5 w-3.5 text-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setRoute('accounts')}>
          <PlusIcon className="h-3.5 w-3.5" /> Add account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
