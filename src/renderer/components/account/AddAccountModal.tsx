import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AuthFlowStartResult, GitProviderId } from '@shared/types'
import { api } from '../../lib/api'
import { queryKeys } from '../../queries/keys'
import { useStartAddAccount } from '../../queries/useAccounts'
import { useAppStore } from '../../stores/appStore'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '../ui/Dialog'
import { Card } from '../ui/misc'
import { CheckIcon, CopyIcon, ExternalLinkIcon, GitHubIcon, SpinnerIcon } from '../ui/icons'
import { cn } from '../ui/cn'

type Provider = { id: GitProviderId; label: string; available: boolean }

const PROVIDERS: Provider[] = [
  { id: 'github', label: 'GitHub', available: true },
  { id: 'gitlab', label: 'GitLab', available: false },
  { id: 'bitbucket', label: 'Bitbucket', available: false }
]

type Step = 'provider' | 'device'

export function AddAccountModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState<Step>('provider')
  const [provider, setProvider] = useState<GitProviderId>('github')
  const [flow, setFlow] = useState<AuthFlowStartResult | null>(null)
  const [copied, setCopied] = useState(false)
  const pushToast = useAppStore((s) => s.pushToast)
  const startAdd = useStartAddAccount()
  const qc = useQueryClient()

  // reset on close
  useEffect(() => {
    if (!open) {
      setStep('provider')
      setFlow(null)
      setCopied(false)
    }
  }, [open])

  async function startFlow() {
    try {
      const result = await startAdd.mutateAsync(provider)
      setFlow(result)
      setStep('device')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to start authorization.')
    }
  }

  // Poll for completion by refreshing accounts; the backend completes the flow.
  useEffect(() => {
    if (step !== 'device' || !flow) return
    const interval = window.setInterval(async () => {
      const accounts = await api.accounts.list()
      qc.setQueryData(queryKeys.accounts, accounts)
      // crude success detection: account count grew while the device modal is open.
    }, Math.max(2, flow.intervalSeconds) * 1000)

    const checkLoop = window.setInterval(async () => {
      try {
        const accounts = await api.accounts.list()
        qc.setQueryData(queryKeys.accounts, accounts)
      } catch {
        /* ignore transient */
      }
    }, 2500)

    return () => {
      window.clearInterval(interval)
      window.clearInterval(checkLoop)
    }
  }, [step, flow, qc])

  function copyCode() {
    if (!flow) return
    void navigator.clipboard.writeText(flow.userCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  function handleClose(next: boolean) {
    if (!next && step === 'device' && flow) {
      void api.accounts.cancelAddAccount(flow.flowId).catch(() => undefined)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {step === 'provider' ? (
          <>
            <DialogHeader title="Add git provider" />
            <div className="space-y-2 px-5 py-4">
              {PROVIDERS.map((p) => {
                const selected = provider === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!p.available}
                    onClick={() => p.available && setProvider(p.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors',
                      selected
                        ? 'border-accent bg-accent-soft'
                        : 'border-border-subtle bg-background-panel hover:bg-background-panel-hover',
                      !p.available && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <span className="flex items-center gap-2.5 text-[13px] font-medium text-text-primary">
                      <GitHubIcon className="h-4 w-4" />
                      {p.label}
                    </span>
                    <span className="text-[11px] text-text-muted">{p.available ? 'Available' : 'Coming soon'}</span>
                  </button>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={startAdd.isPending} onClick={startFlow}>
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader title="Connect GitHub" />
            <div className="space-y-4 px-5 py-4">
              <ol className="space-y-1.5 text-[13px] text-text-secondary">
                <li>1. Open the GitHub authorization page.</li>
                <li>2. Enter this device code:</li>
              </ol>
              <Card className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="mono text-2xl font-semibold tracking-[0.2em] text-text-primary">
                  {flow?.userCode ?? '········'}
                </span>
                <Button variant="secondary" size="sm" onClick={copyCode}>
                  {copied ? <CheckIcon className="h-3.5 w-3.5 text-success" /> : <CopyIcon className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy code'}
                </Button>
              </Card>
              <Button
                variant="primary"
                className="w-full"
                onClick={() => flow && api.app.openExternal(flow.verificationUri)}
              >
                <ExternalLinkIcon className="h-4 w-4" /> Open GitHub
              </Button>
              <div className="flex items-center gap-2 text-[13px] text-text-muted">
                <SpinnerIcon className="h-3.5 w-3.5" />
                Waiting for authorization…
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
