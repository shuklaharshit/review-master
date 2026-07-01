import { useState } from 'react'
import { useAccounts, useSetActiveAccount } from '../queries/useAccounts'
import { useAppStore } from '../stores/appStore'
import { AddAccountModal } from '../components/account/AddAccountModal'
import { Avatar, Card, EmptyState, Skeleton } from '../components/ui/misc'
import { Button } from '../components/ui/Button'
import { ChevronRightIcon, GitHubIcon, PlusIcon } from '../components/ui/icons'

export function AccountPicker() {
  const { data: accounts, isLoading } = useAccounts()
  const switchAccount = useAppStore((s) => s.switchAccount)
  const setActive = useSetActiveAccount()
  const [addOpen, setAddOpen] = useState(false)

  function pick(accountId: string) {
    switchAccount(accountId) // one history entry: lands on 'repos' for this account
    setActive.mutate(accountId)
  }

  return (
    <div className="flex flex-1 justify-center overflow-auto p-6">
      <div className="w-full max-w-xl">
        <h1 className="text-lg font-semibold text-text-primary">Pick a GitHub account</h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          Choose which connected account to browse repositories and pull requests with.
        </p>

        <div className="mt-5 space-y-2">
          {isLoading &&
            [0, 1].map((i) => <Skeleton key={i} className="h-14 w-full" />)}

          {!isLoading && (accounts?.length ?? 0) === 0 && (
            <EmptyState
              icon={<GitHubIcon className="h-6 w-6" />}
              title="No accounts connected"
              description="Connect a GitHub account to get started."
              action={
                <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                  <PlusIcon className="h-3.5 w-3.5" /> Add account
                </Button>
              }
            />
          )}

          {accounts?.map((acc) => (
            <button key={acc.id} type="button" onClick={() => pick(acc.id)} className="block w-full text-left">
              <Card className="flex items-center gap-3 px-4 py-3 transition-colors hover:border-border-strong hover:bg-background-panel-hover">
                <Avatar src={acc.avatarUrl} alt={acc.login} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-text-primary">{acc.login}</div>
                  {acc.displayName && <div className="truncate text-[11px] text-text-muted">{acc.displayName}</div>}
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                  <GitHubIcon className="h-3.5 w-3.5" /> GitHub
                </span>
                <ChevronRightIcon className="h-4 w-4 text-text-muted" />
              </Card>
            </button>
          ))}
        </div>

        {(accounts?.length ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-accent-hover hover:underline"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add account
          </button>
        )}
      </div>

      <AddAccountModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onConnected={(accountId) => pick(accountId)}
      />
    </div>
  )
}
