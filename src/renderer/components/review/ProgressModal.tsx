import type { TaskState } from '../../stores/taskStore'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogHeader } from '../ui/Dialog'
import { ProgressBar } from '../ui/misc'

export function ProgressModal({
  open,
  onOpenChange,
  task,
  title,
  phases,
  onCancel
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: TaskState | null
  title: string
  phases: string[]
  onCancel: () => void
}): JSX.Element {
  const count = task?.phaseCount || phases.length
  const index = task?.phaseIndex ?? 0
  const value = count > 0 ? Math.round(((index + 1) / count) * 100) : 8
  const currentStep = task?.phase || phases[0] || 'Starting…'
  const logs = task?.logs ?? []

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent className="max-w-md">
        <DialogHeader title={title} />
        <div className="space-y-4 px-5 py-4">
          <ProgressBar value={value} tone="accent" />
          <div className="text-[13px] text-text-secondary">
            Current step: <span className="font-medium text-text-primary">{currentStep}</span>
            {count > 0 && <span className="ml-2 text-[11px] text-text-muted">({Math.min(index + 1, count)}/{count})</span>}
          </div>

          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Live activity</div>
            <div className="h-28 overflow-auto rounded-md border border-border-subtle bg-background-panel px-2.5 py-2">
              {logs.length === 0 ? (
                <p className="mono text-[11px] text-text-muted">Waiting for Codex…</p>
              ) : (
                logs.slice(-12).map((line, i) => (
                  <div key={i} className="mono text-[11px] leading-relaxed text-text-secondary">
                    <span className="text-text-muted">&gt; </span>
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <Button
            variant="ghost"
            onClick={() => {
              onCancel()
              onOpenChange(false)
            }}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
