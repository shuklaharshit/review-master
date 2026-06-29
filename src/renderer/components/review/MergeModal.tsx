import { useEffect, useState } from 'react'
import type { MergeMethod, PullRequestRef } from '@shared/types'
import { Dialog, DialogContent } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { AlertTriangleIcon, XIcon, GitMergeIcon } from '../ui/icons'
import { cn } from '../ui/cn'
import { useMergePr } from '../../queries/useWorkspace'
import { useAppStore } from '../../stores/appStore'

const METHODS: { value: MergeMethod; label: string; hint: string; usesMessage: boolean }[] = [
  { value: 'squash', label: 'Squash and merge', hint: 'Combine all commits into one.', usesMessage: true },
  { value: 'merge', label: 'Create a merge commit', hint: 'Keep all commits, add a merge commit.', usesMessage: true },
  { value: 'rebase', label: 'Rebase and merge', hint: 'Replay commits onto the base, no merge commit.', usesMessage: false }
]

export function MergeModal({
  open,
  onOpenChange,
  prRef,
  prTitle,
  prNumber
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prRef: PullRequestRef
  prTitle: string
  prNumber: number
}): JSX.Element {
  const [method, setMethod] = useState<MergeMethod>('squash')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Mounted unconditionally — reset local state on open / PR change so stale
  // merge metadata or an old error never carries into a different PR.
  useEffect(() => {
    if (!open) return
    setMethod('squash')
    setTitle('')
    setMessage('')
    setError(null)
  }, [open, prRef.accountId, prRef.repoId, prRef.number])

  const merge = useMergePr(prRef)
  const pushToast = useAppStore((s) => s.pushToast)
  const usesMessage = METHODS.find((m) => m.value === method)?.usesMessage ?? false

  async function submit(): Promise<void> {
    setError(null)
    try {
      const res = await merge.mutateAsync({
        ref: prRef,
        method,
        commitTitle: usesMessage && title.trim() ? title.trim() : undefined,
        commitMessage: usesMessage && message.trim() ? message.trim() : undefined
      })
      if (res.merged) {
        pushToast('success', 'Pull request merged.')
        onOpenChange(false)
      } else {
        setError(res.message || 'GitHub did not merge the pull request.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to merge the pull request.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] max-w-[92vw] p-0">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Merge pull request</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-text-muted hover:bg-background-panel-hover hover:text-text-primary"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-[12px] text-text-secondary">
            Merge <span className="font-medium text-text-primary">#{prNumber}</span> — {prTitle}
          </p>

          <div className="space-y-1.5" role="radiogroup" aria-label="Merge method">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={method === m.value}
                onClick={() => setMethod(m.value)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors',
                  method === m.value
                    ? 'border-accent/60 bg-accent-soft'
                    : 'border-border-strong hover:bg-background-panel-hover'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                    method === m.value ? 'border-accent' : 'border-border-strong'
                  )}
                >
                  {method === m.value && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-text-primary">{m.label}</span>
                  <span className="block text-[11px] text-text-muted">{m.hint}</span>
                </span>
              </button>
            ))}
          </div>

          {usesMessage && (
            <div className="space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Commit title (default: ${prTitle})`}
                className="w-full rounded-md border border-border-strong bg-background px-3 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Extended commit message (optional)…"
                rows={3}
                className="w-full resize-y rounded-md border border-border-strong bg-background px-3 py-2 text-[12.5px] leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
          <div className="min-w-0 text-[11px]">
            {error ? (
              <span className="flex items-center gap-1.5 text-danger">
                <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" /> {error}
              </span>
            ) : (
              <span className="text-text-muted">This will merge the branch on GitHub.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={merge.isPending} onClick={() => void submit()}>
              <GitMergeIcon className="h-3.5 w-3.5" /> Confirm merge
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
