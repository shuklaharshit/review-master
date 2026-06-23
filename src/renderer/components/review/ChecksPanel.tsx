import type { CheckSummary } from '@shared/types'
import { ProgressBar } from '../ui/misc'

export function ChecksPanel({ checks }: { checks: CheckSummary[] }): JSX.Element {
  if (checks.length === 0) {
    return <p className="px-3 text-[12px] text-text-muted">No checks reported.</p>
  }

  const passed = checks.filter((c) => c.conclusion === 'success' || c.conclusion === 'skipped').length
  const failed = checks.filter(
    (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out' || c.conclusion === 'action_required'
  ).length
  const pending = checks.filter((c) => c.status !== 'completed').length
  const total = checks.length

  const tone = failed > 0 ? 'danger' : pending > 0 ? 'warning' : 'success'
  const value = (passed / total) * 100

  return (
    <div className="space-y-2 px-3">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-text-secondary">Checks</span>
        <span className="mono text-text-muted">
          {passed}/{total}
          {failed > 0 ? ` • ${failed} failing` : pending > 0 ? ` • ${pending} pending` : ''}
        </span>
      </div>
      <ProgressBar value={value} tone={tone} />
    </div>
  )
}
