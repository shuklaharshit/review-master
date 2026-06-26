import type { GroupPriority, ReviewGroup } from '@shared/types'
import { cn } from '../ui/cn'
import { ChevronDownIcon, ChevronRightIcon } from '../ui/icons'
import { splitPath } from '../../lib/paths'
import { GroupExplanationContent } from './GroupExplanationPopover'

const priorityColor: Record<GroupPriority, string | null> = {
  critical: 'var(--danger)',
  high: 'var(--warning)',
  medium: null,
  low: null
}

const MAX_VISIBLE_FILES = 5

export function ReviewGroupCard({
  group,
  active,
  selectedFilePath,
  stale,
  expanded,
  viewedFiles,
  onSelectGroup,
  onSelectFile,
  onToggleExplanation
}: {
  group: ReviewGroup
  active: boolean
  selectedFilePath: string | null
  stale: boolean
  expanded: boolean
  viewedFiles: Record<string, boolean>
  onSelectGroup: () => void
  onSelectFile: (path: string) => void
  onToggleExplanation: () => void
}) {
  const marker = priorityColor[group.priority]
  const visible = group.files.slice(0, MAX_VISIBLE_FILES)
  const remaining = group.files.length - visible.length

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border bg-background-panel transition-colors',
        active ? 'border-accent bg-accent-soft/30' : 'border-border-subtle hover:border-border-strong'
      )}
    >
      {marker && <span className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: marker }} />}

      <button type="button" onClick={onSelectGroup} className="block w-full px-3 pt-2.5 text-left">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold',
              active ? 'bg-accent text-accent-foreground' : 'bg-background-elevated text-text-secondary'
            )}
          >
            {group.order}
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-text-primary">{group.title}</span>
          {stale && (
            <span className="shrink-0 rounded border border-warning/40 bg-warning/10 px-1 py-0.5 text-[9px] font-semibold uppercase text-warning">
              Stale
            </span>
          )}
        </div>
        <div className="ml-7 mt-1 flex items-center gap-2 text-[11px] text-text-muted">
          <span>
            {group.stats.fileCount} file{group.stats.fileCount === 1 ? '' : 's'}
          </span>
          <span className="text-success">+{group.stats.additions}</span>
          <span className="text-danger">-{group.stats.deletions}</span>
        </div>
      </button>

      <div className="mt-2 space-y-px px-1.5">
        {visible.map((file) => {
          const { dir, name } = splitPath(file.path)
          const selected = selectedFilePath === file.path
          const viewed = viewedFiles[file.path]
          return (
            <button
              key={file.path}
              type="button"
              onClick={() => onSelectFile(file.path)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors',
                selected ? 'bg-accent-soft' : 'hover:bg-background-panel-hover'
              )}
              title={file.path}
            >
              <span
                className={cn(
                  'mono truncate text-[11.5px]',
                  selected ? 'text-text-primary' : 'text-text-secondary',
                  viewed && 'line-through opacity-60'
                )}
              >
                {name}
              </span>
              {dir && <span className="mono ml-auto truncate text-[10px] text-text-muted">{dir}</span>}
            </button>
          )
        })}
        {remaining > 0 && (
          <div className="px-1.5 py-1 text-[11px] text-text-muted">+{remaining} more files</div>
        )}
      </div>

      <div className="px-3 pb-2.5 pt-1">
        <button
          type="button"
          onClick={onToggleExplanation}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-hover hover:underline"
        >
          Read explanation
          {expanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
        </button>
        {expanded && <GroupExplanationContent group={group} />}
      </div>
    </div>
  )
}
