import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReasoningEffort } from '@shared/types'
import { APP_NAME, APP_SUBTITLE, REASONING_EFFORTS, githubAppInstallUrl } from '@shared/constants'
import { useSettings, useUpdateSettings, useModels } from '../queries/useSettings'
import { useAccounts, useRemoveAccount } from '../queries/useAccounts'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/api'
import { queryKeys } from '../queries/keys'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { Switch } from '../components/ui/Switch'
import { Avatar, Badge } from '../components/ui/misc'
import { AddAccountModal } from '../components/account/AddAccountModal'
import { ThemePicker } from '../components/layout/ThemePicker'
import { Logo } from '../components/layout/Logo'
import { ExternalLinkIcon, GitHubIcon, RefreshIcon } from '../components/ui/icons'

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="border-b border-border-subtle py-5">
      <h2 className="mb-3 text-[13px] font-semibold text-text-primary">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function Settings(): JSX.Element {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const { data: models } = useModels()
  const { data: accounts } = useAccounts()
  const removeAccount = useRemoveAccount()
  const bootstrap = useAppStore((s) => s.bootstrap)
  const pushToast = useAppStore((s) => s.pushToast)
  const setRoute = useAppStore((s) => s.setRoute)
  const qc = useQueryClient()

  const [addOpen, setAddOpen] = useState(false)
  const [recheckingCodex, setRecheckingCodex] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  const effortOptions = REASONING_EFFORTS.map((e) => ({ value: e, label: e }))
  const modelOptions = (models ?? []).map((m) => ({ value: m.id, label: m.displayName ?? m.id }))
  // Ensure currently-configured models are selectable even if listModels failed.
  function ensureOption(list: { value: string; label: string }[], value?: string): { value: string; label: string }[] {
    if (value && !list.some((o) => o.value === value)) return [{ value, label: value }, ...list]
    return list
  }

  async function recheckCodex(): Promise<void> {
    setRecheckingCodex(true)
    try {
      const status = await api.codex.recheck()
      void qc.invalidateQueries({ queryKey: queryKeys.bootstrap })
      void qc.invalidateQueries({ queryKey: queryKeys.models })
      pushToast(status.authenticated ? 'success' : 'warning', status.authenticated ? 'Codex is authenticated.' : 'Codex is installed but not authenticated.')
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Codex recheck failed.')
    } finally {
      setRecheckingCodex(false)
    }
  }

  async function checkUpdates(): Promise<void> {
    setCheckingUpdates(true)
    try {
      const status = await api.updates.check()
      pushToast('info', status.state === 'available' ? `Update available: ${status.newVersion}` : 'You are up to date.')
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Update check failed.')
    } finally {
      setCheckingUpdates(false)
    }
  }

  function patch(p: Parameters<typeof updateSettings.mutate>[0]): void {
    updateSettings.mutate(p)
  }

  const codex = bootstrap?.codex

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col overflow-auto px-6 py-5">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-text-primary">Settings</h1>
        <Button variant="ghost" size="sm" onClick={() => setRoute('accounts')}>
          Done
        </Button>
      </div>

      {/* Appearance */}
      <Section title="Appearance">
        <p className="-mt-1 text-[12px] text-text-muted">
          Pick a system-wide look. Same layout, five distinct skins — your choice is remembered across the app.
        </p>
        <ThemePicker />
      </Section>

      {/* Codex */}
      <Section title="Codex">
        <Row label="Status">
          {codex?.authenticated ? (
            <Badge tone="success">Authenticated</Badge>
          ) : codex?.cliInstalled ? (
            <Badge tone="warning">Not authenticated</Badge>
          ) : (
            <Badge tone="danger">Not installed</Badge>
          )}
        </Row>
        {codex?.version && (
          <Row label="Version">
            <span className="mono text-[12px] text-text-muted">codex {codex.version}</span>
          </Row>
        )}
        {codex?.account?.email && (
          <Row label="Account">
            <span className="text-[12px] text-text-muted">{codex.account.email}</span>
          </Row>
        )}
        <div>
          <Button variant="secondary" size="sm" loading={recheckingCodex} onClick={() => void recheckCodex()}>
            <RefreshIcon className="h-3.5 w-3.5" /> Recheck CLI
          </Button>
        </div>
      </Section>

      {/* Git Accounts */}
      <Section title="Git Accounts">
        {accounts && accounts.length > 0 ? (
          accounts.map((acc) => (
            <div key={acc.id} className="flex items-center gap-2.5">
              <Avatar src={acc.avatarUrl} alt={acc.login} size={22} />
              <GitHubIcon className="h-3.5 w-3.5 text-text-muted" />
              <span className="flex-1 text-[13px] text-text-primary">{acc.login}</span>
              {acc.needsReauth && <Badge tone="warning">Needs re-auth</Badge>}
              <Button
                variant="ghost"
                size="sm"
                title="Choose which repositories this app can access on GitHub"
                onClick={() => void api.app.openExternal(githubAppInstallUrl())}
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" /> Manage repositories
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={removeAccount.isPending}
                onClick={() => removeAccount.mutate({ accountId: acc.id })}
              >
                Remove
              </Button>
            </div>
          ))
        ) : (
          <p className="text-[12px] text-text-muted">No accounts connected.</p>
        )}
        <div>
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
            Add account
          </Button>
        </div>
      </Section>

      {/* Models */}
      {settings && (
        <Section title="Models">
          <Row label="Preflight model">
            <Select
              ariaLabel="Preflight model"
              value={settings.defaultPreflightModel}
              onValueChange={(v) => patch({ defaultPreflightModel: v })}
              options={ensureOption(modelOptions, settings.defaultPreflightModel)}
            />
            <Select
              ariaLabel="Preflight reasoning"
              value={settings.defaultPreflightReasoningEffort}
              onValueChange={(v) => patch({ defaultPreflightReasoningEffort: v as ReasoningEffort })}
              options={effortOptions}
            />
          </Row>
          <Row label="AI review model">
            <Select
              ariaLabel="Review model"
              value={settings.defaultReviewModel}
              onValueChange={(v) => patch({ defaultReviewModel: v })}
              options={ensureOption(modelOptions, settings.defaultReviewModel)}
            />
            <Select
              ariaLabel="Review reasoning"
              value={settings.defaultReviewReasoningEffort}
              onValueChange={(v) => patch({ defaultReviewReasoningEffort: v as ReasoningEffort })}
              options={effortOptions}
            />
          </Row>
        </Section>
      )}

      {/* Updates */}
      {settings && (
        <Section title="Updates">
          <Row label="Automatically check for updates">
            <Switch
              checked={settings.autoCheckUpdates}
              onCheckedChange={(checked) => patch({ autoCheckUpdates: checked })}
            />
          </Row>
          <Row label="Current version">
            <span className="mono text-[12px] text-text-muted">{bootstrap?.appVersion ?? '0.1.0'}</span>
          </Row>
          <div>
            <Button variant="secondary" size="sm" loading={checkingUpdates} onClick={() => void checkUpdates()}>
              Check for updates
            </Button>
          </div>
        </Section>
      )}

      {/* Local Data */}
      <Section title="Local Data">
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void api.app.openDataFolder()}>
            Open data folder
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void api.app.clearRepoCache().then(() => pushToast('success', 'Repo cache cleared.'))
            }}
          >
            Clear repo cache
          </Button>
        </div>
      </Section>

      {/* About */}
      <section className="py-5">
        <h2 className="mb-3 font-display text-[13px] font-semibold text-text-primary">About</h2>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background-elevated text-accent ring-1 ring-inset ring-border-strong">
            <Logo className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-[14px] font-semibold text-text-primary">{APP_NAME}</div>
            <div className="text-[12px] text-text-muted">
              {APP_SUBTITLE} · v{bootstrap?.appVersion ?? '0.1.0'}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-text-muted">Open source.</p>
      </section>

      <AddAccountModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}

export default Settings
