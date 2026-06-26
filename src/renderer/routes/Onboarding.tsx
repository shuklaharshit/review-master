import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CODEX_INSTALL_COMMAND } from '@shared/constants'
import { api } from '../lib/api'
import { queryKeys } from '../queries/keys'
import { useAccounts } from '../queries/useAccounts'
import { useBootstrap } from '../queries/useBootstrap'
import { useAppStore } from '../stores/appStore'
import { AddAccountModal } from '../components/account/AddAccountModal'
import { ThemePicker } from '../components/layout/ThemePicker'
import { Button } from '../components/ui/Button'
import { Card, Spinner } from '../components/ui/misc'
import { AlertTriangleIcon, CheckIcon, CopyIcon, GitHubIcon, PlusIcon } from '../components/ui/icons'
import { cn } from '../components/ui/cn'

function ChecklistRow({
  state,
  title,
  children
}: {
  state: 'done' | 'warn' | 'todo'
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex gap-3 border-b border-border-subtle py-4 last:border-b-0">
      <div
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          state === 'done' && 'border-success/50 bg-success/10 text-success',
          state === 'warn' && 'border-warning/50 bg-warning/10 text-warning',
          state === 'todo' && 'border-border-strong text-text-muted'
        )}
      >
        {state === 'done' && <CheckIcon className="h-3 w-3" />}
        {state === 'warn' && <AlertTriangleIcon className="h-3 w-3" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-text-primary">{title}</div>
        {children && <div className="mt-1.5 space-y-2 text-[13px] text-text-secondary">{children}</div>}
      </div>
    </div>
  )
}

export function Onboarding() {
  const { data: bootstrap, isLoading } = useBootstrap()
  const { data: accounts } = useAccounts()
  const setRoute = useAppStore((s) => s.setRoute)
  const pushToast = useAppStore((s) => s.pushToast)
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [copied, setCopied] = useState(false)

  const codex = bootstrap?.codex
  const cliInstalled = !!codex?.cliInstalled
  const authed = !!codex?.authenticated
  const hasAccounts = (accounts?.length ?? 0) > 0

  async function recheck() {
    setRechecking(true)
    try {
      await api.codex.recheck()
      const fresh = await api.app.getBootstrapStatus()
      qc.setQueryData(queryKeys.bootstrap, fresh)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Recheck failed.')
    } finally {
      setRechecking(false)
    }
  }

  function copyLogin() {
    void navigator.clipboard.writeText('codex login')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-auto p-6">
      <div className="w-full max-w-xl">
        <h1 className="text-xl font-semibold text-text-primary">Welcome to Review Master</h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          Let&apos;s get you set up. Review Master uses the Codex CLI for AI analysis and your GitHub account to fetch
          pull requests.
        </p>

        <Card className="mt-6 px-5 py-1">
          <ChecklistRow
            state={cliInstalled ? 'done' : 'warn'}
            title="Codex CLI installed"
          >
            {cliInstalled ? (
              <span className="text-text-muted">
                {codex?.version ? `codex ${codex.version} detected` : 'Codex detected'}
                {codex?.binaryPath ? ` · ${codex.binaryPath}` : ''}
              </span>
            ) : (
              <div className="space-y-2">
                <span className="text-text-muted">Codex CLI was not found on your PATH. Install it, then recheck:</span>
                <code className="mono block rounded-md border border-border-subtle bg-background-elevated px-2.5 py-1.5 text-[12px] text-text-primary">
                  {CODEX_INSTALL_COMMAND}
                </code>
              </div>
            )}
          </ChecklistRow>

          <ChecklistRow
            state={authed ? 'done' : 'warn'}
            title="Codex authenticated"
          >
            {authed ? (
              <span className="text-text-muted">
                Authenticated{codex?.account?.email ? ` as ${codex.account.email}` : ''}
                {codex?.account?.plan ? ` · ${codex.account.plan}` : ''}
              </span>
            ) : (
              <div className="space-y-2">
                <span className="text-text-muted">
                  Run <code className="mono text-text-primary">codex login</code> in your terminal, then click Recheck.
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={copyLogin}>
                    {copied ? <CheckIcon className="h-3.5 w-3.5 text-success" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy command'}
                  </Button>
                  <Button variant="secondary" size="sm" loading={rechecking} onClick={recheck}>
                    Recheck
                  </Button>
                </div>
              </div>
            )}
          </ChecklistRow>

          <ChecklistRow
            state={hasAccounts ? 'done' : 'todo'}
            title="GitHub account connected"
          >
            {hasAccounts ? (
              <span className="text-text-muted">
                {accounts?.length} account{(accounts?.length ?? 0) > 1 ? 's' : ''} connected
              </span>
            ) : (
              <div className="space-y-2">
                <span className="text-text-muted">Connect a GitHub account to browse repositories and PRs.</span>
                <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
                  <GitHubIcon className="h-3.5 w-3.5" /> Add GitHub Account
                </Button>
              </div>
            )}
          </ChecklistRow>
        </Card>

        <div className="mt-7">
          <h2 className="font-display text-[13px] font-semibold text-text-primary">Pick your look</h2>
          <p className="mt-1 text-[12px] text-text-muted">
            Optional — choose a theme now or change it any time from Settings.
          </p>
          <div className="mt-3">
            <ThemePicker />
          </div>
        </div>

        <div className="mt-7 flex items-center justify-between">
          <button
            type="button"
            className="text-[12px] text-text-muted hover:text-text-secondary"
            onClick={() => setAddOpen(true)}
          >
            <span className="inline-flex items-center gap-1">
              <PlusIcon className="h-3 w-3" /> Add another account
            </span>
          </button>
          <Button
            variant="primary"
            disabled={!authed}
            onClick={() => setRoute(hasAccounts ? 'accounts' : 'accounts')}
          >
            Continue
          </Button>
        </div>
        {!authed && (
          <p className="mt-2 text-right text-[11px] text-text-muted">Codex must be authenticated to continue.</p>
        )}
      </div>

      <AddAccountModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
