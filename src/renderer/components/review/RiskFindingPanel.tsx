import type { RiskFinding } from '@shared/types'
import { cn } from '../ui/cn'
import { SeverityBadge, RiskTypeIcon, riskTypeColor, riskTypeLabel } from '../ui/SeverityBadge'
import { parseFileReference } from '../../lib/paths'
import { useReviewWorkspaceStore } from '../../stores/reviewWorkspaceStore'

export function RiskFindingPanel({ findings }: { findings: RiskFinding[] }): JSX.Element {
  const selectFile = useReviewWorkspaceStore((s) => s.selectFile)
  const diffFiles = useReviewWorkspaceStore((s) => s.workspace?.diff.files ?? [])

  // Count by type for the section header.
  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.type] = (acc[f.type] ?? 0) + 1
    return acc
  }, {})
  const summary = Object.entries(counts)
    .map(([type, n]) => `${n} ${riskTypeLabel[type as RiskFinding['type']]}${n === 1 ? '' : 's'}`)
    .join(' • ')

  function navigate(finding: RiskFinding): void {
    const ref = finding.fileReferences?.[0]
    if (!ref) return
    const { path } = parseFileReference(ref)
    if (diffFiles.some((f) => f.path === path)) selectFile(path)
  }

  if (findings.length === 0) {
    return <p className="px-3 py-2 text-[12px] text-text-muted">No high-level risks flagged.</p>
  }

  return (
    <div>
      {summary && <div className="px-3 pb-1.5 text-[11px] text-text-muted">{summary}</div>}
      {findings.map((finding, i) => {
        const ref = finding.fileReferences?.[0]
        const color = riskTypeColor(finding.type)
        return (
          <button
            key={i}
            type="button"
            onClick={() => navigate(finding)}
            className={cn(
              'block w-full px-3 py-2 text-left transition-colors',
              i > 0 && 'border-t border-border-subtle',
              ref ? 'hover:bg-background-panel-hover' : 'cursor-default'
            )}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0" style={{ color }}>
                <RiskTypeIcon type={finding.type} className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-text-primary">
                {finding.title}
              </span>
              <SeverityBadge severity={finding.severity} />
            </div>
            {/* Meta row, indented to align under the title (icon 14px + gap 8px). */}
            <div className="mt-1 flex items-baseline gap-1.5 pl-[22px] text-[11px]">
              <span className="shrink-0 whitespace-nowrap font-medium" style={{ color }}>
                {riskTypeLabel[finding.type]}
              </span>
              {ref && <span className="mono min-w-0 truncate text-text-muted">{ref}</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
