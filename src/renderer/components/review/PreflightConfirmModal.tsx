import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '../ui/Dialog'

export function PreflightConfirmModal({
  open,
  onOpenChange,
  mode,
  loading,
  onRun,
  onUseOld
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'first' | 'newCommits'
  loading?: boolean
  onRun: () => void
  onUseOld?: () => void
}): JSX.Element {
  const isFirst = mode === 'first'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader title={isFirst ? 'Run preflight analysis?' : 'PR has new commits'} />
        <div className="px-5 py-4 text-[13px] leading-relaxed text-text-secondary">
          {isFirst ? (
            <>
              <p>
                Review Master will analyse this PR with Codex to build a guided review map, group related changes, sort
                files into a better reading order, and flag high-level risks before you start reviewing.
              </p>
              <p className="mt-3">
                This may use your Codex quota. The result will be saved locally so you do not need to generate it again
                unless the PR changes.
              </p>
            </>
          ) : (
            <>
              <p>
                This PR has changed since the last preflight analysis. Review Master can regenerate the analysis for the
                latest head commit so the review map, file order, explanations, and risk flags stay accurate.
              </p>
              <p className="mt-3">This may use your Codex quota.</p>
            </>
          )}
        </div>
        <DialogFooter>
          {isFirst ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={loading} onClick={onRun}>
                Run Preflight
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onUseOld}>
                Use Old Analysis
              </Button>
              <Button variant="primary" loading={loading} onClick={onRun}>
                Regenerate
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
