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
import { AlertTriangleIcon, CheckIcon, CopyIcon, ExternalLinkIcon, GitHubIcon, SpinnerIcon } from '../ui/icons'
import { cn } from '../ui/cn'

type Provider = { id: GitProviderId; label: string; available: boolean }

const PROVIDERS: Provider[] = [
  { id: 'github', label: 'GitHub', available: true },
  { id: 'gitlab', label: 'GitLab', available: false },
  { id: 'bitbucket', label: 'Bitbucket', available: false }
]

type Step = 'provider' | 'device'
type Status = 'waiting' | 'connected' | 'error'

export function AddAccountModal({
  open,
  onOpenChange,
  onConnected
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once the account is connected (after the brief success flash). */
  onConnected?: (accountId: string, login: string) => void
}): JSX.Element {
  const [step, setStep] = useState<Step>('provider')
  const [provider, setProvider] = useState<GitProviderId>('github')
  const [flow, setFlow] = useState<AuthFlowStartResult | null>(null)
  const [status, setStatus] = useState<Status>('waiting')
  const [opened, setOpened] = useState(false)
  const [connectedLogin, setConnectedLogin] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const pushToast = useAppStore((s) => s.pushToast)
  const startAdd = useStartAddAccount()
  const qc = useQueryClient()

  // Reset all state whenever the modal closes.
  useEffect(() => {
    if (!open) {
      setStep('provider')
      setFlow(null)
      setStatus('waiting')
      setOpened(false)
      setConnectedLogin('')
      setErrorMessage('')
      setCopied(false)
    }
  }, [open])

  // (A) Event-driven completion: react the instant the main process reports
  // success or failure, instead of polling the account list.
  useEffect(() => {
    if (step !== 'device' || !flow) return
    const unsubscribe = api.events.onAppEvent((event) => {
      if (event.type === 'account.added') {
        setStatus('connected')
        setConnectedLogin(event.login)
        void qc.invalidateQueries({ queryKey: queryKeys.accounts })
        void qc.invalidateQueries({ queryKey: queryKeys.bootstrap })
        // Brief success flash, then close + advance.
        window.setTimeout(() => {
          onConnected?.(event.accountId, event.login)
          onOpenChange(false)
        }, 900)
      } else if (event.type === 'auth.failed' && event.flowId === flow.flowId) {
        setStatus('error')
        setErrorMessage(event.message)
      }
    })
    return unsubscribe
  }, [step, flow, qc, onConnected, onOpenChange])

  async function startFlow(): Promise<void> {
    try {
      const result = await startAdd.mutateAsync(provider)
      setFlow(result)
      setStatus('waiting')
      setOpened(false)
      setStep('device')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to start authorization.')
    }
  }

  function copyCode(): void {
    if (!flow) return
    void navigator.clipboard.writeText(flow.userCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  function openGitHub(): void {
    if (!flow) return
    setOpened(true)
    void api.app.openExternal(flow.verificationUri)
  }

  function handleClose(next: boolean): void {
    if (!next && step === 'device' && flow && status !== 'connected') {
      void api.accounts.cancelAddAccount(flow.flowId).catch(() => undefined)
    }
    onOpenChange(next)
  }

  function retry(): void {
    setStep('provider')
    setFlow(null)
    setStatus('waiting')
    setOpened(false)
    setErrorMessage('')
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
                <Button variant="secondary" size="sm" onClick={copyCode} disabled={status === 'connected'}>
                  {copied ? <CheckIcon className="h-3.5 w-3.5 text-success" /> : <CopyIcon className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy code'}
                </Button>
              </Card>
              <Button variant="primary" className="w-full" onClick={openGitHub} disabled={status === 'connected'}>
                <ExternalLinkIcon className="h-4 w-4" /> Open GitHub
              </Button>

              {/* (B) Honest, stateful status line */}
              {status === 'connected' ? (
                <div className="flex items-center gap-2 text-[13px] font-medium text-success">
                  <CheckIcon className="h-4 w-4" />
                  Connected{connectedLogin ? ` as ${connectedLogin}` : ''}
                </div>
              ) : status === 'error' ? (
                <div className="flex items-start gap-2 text-[13px] text-danger">
                  <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage || 'GitHub authorization failed.'}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[13px] text-text-muted">
                  <SpinnerIcon className="h-3.5 w-3.5" />
                  {opened ? 'Waiting for you to authorize in GitHub…' : 'Waiting for authorization…'}
                </div>
              )}
            </div>
            <DialogFooter>
              {status === 'error' ? (
                <>
                  <Button variant="ghost" onClick={() => handleClose(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={retry}>
                    Try again
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => handleClose(false)} disabled={status === 'connected'}>
                  Cancel
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
