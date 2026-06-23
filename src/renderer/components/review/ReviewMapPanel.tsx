import type { PreflightAnalysis } from '@shared/types'
import { useReviewWorkspaceStore } from '../../stores/reviewWorkspaceStore'
import { ReviewGroupCard } from './ReviewGroupCard'

export function ReviewMapPanel({
  analysis,
  stale
}: {
  analysis: PreflightAnalysis
  stale: boolean
}) {
  const selectedGroupOrder = useReviewWorkspaceStore((s) => s.selectedGroupOrder)
  const selectedFilePath = useReviewWorkspaceStore((s) => s.selectedFilePath)
  const expandedExplanations = useReviewWorkspaceStore((s) => s.expandedExplanations)
  const viewedFiles = useReviewWorkspaceStore((s) => s.viewedFiles)
  const selectGroup = useReviewWorkspaceStore((s) => s.selectGroup)
  const selectFile = useReviewWorkspaceStore((s) => s.selectFile)
  const toggleExplanation = useReviewWorkspaceStore((s) => s.toggleExplanation)

  const groups = [...analysis.reviewGroups].sort((a, b) => a.order - b.order)

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-border-subtle bg-background">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-text-muted">AI Review Map</span>
        <span className="text-[11px] text-text-muted">{groups.length} groups</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {analysis.summary?.overview && (
          <p className="rounded-md border border-border-subtle bg-background-panel/60 px-2.5 py-2 text-[11.5px] leading-relaxed text-text-secondary">
            {analysis.summary.overview}
          </p>
        )}
        {groups.map((group) => (
          <ReviewGroupCard
            key={group.order}
            group={group}
            active={selectedGroupOrder === group.order}
            selectedFilePath={selectedFilePath}
            stale={stale}
            expanded={!!expandedExplanations[group.order]}
            viewedFiles={viewedFiles}
            onSelectGroup={() => selectGroup(group)}
            onSelectFile={(path) => selectFile(path)}
            onToggleExplanation={() => toggleExplanation(group.order)}
          />
        ))}
      </div>
    </aside>
  )
}
