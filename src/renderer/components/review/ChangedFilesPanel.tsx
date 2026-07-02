import { useMemo, useState } from 'react'
import type { DiffFileStatus, NormalizedDiffFile } from '@shared/types'
import { cn } from '../ui/cn'
import { Tooltip } from '../ui/Tooltip'
import { ChevronDownIcon, ChevronRightIcon, FileIcon, FolderIcon } from '../ui/icons'
import { useReviewWorkspaceStore } from '../../stores/reviewWorkspaceStore'

// Modified is by far the most common status, so it gets no dot — a dot marks
// the files that deviate from a plain edit.
const statusColor: Record<DiffFileStatus, string | null> = {
  added: 'var(--success)',
  modified: null,
  removed: 'var(--danger)',
  renamed: 'var(--accent)',
  copied: 'var(--accent)',
  binary: 'var(--text-muted)'
}

interface TreeDir {
  /** Display name; single-child chains are compressed ("components/steps"). */
  name: string
  /** Full path prefix, used as collapse key. */
  path: string
  dirs: TreeDir[]
  files: NormalizedDiffFile[]
}

function buildTree(files: NormalizedDiffFile[]): TreeDir {
  const root: TreeDir = { name: '', path: '', dirs: [], files: [] }
  for (const file of files) {
    const segments = file.path.split('/')
    let node = root
    for (const segment of segments.slice(0, -1)) {
      let child = node.dirs.find((d) => d.name === segment)
      if (!child) {
        child = { name: segment, path: node.path ? `${node.path}/${segment}` : segment, dirs: [], files: [] }
        node.dirs.push(child)
      }
      node = child
    }
    node.files.push(file)
  }
  compress(root)
  sortTree(root)
  return root
}

/** Merge directories that contain a single subdirectory and no files (GitHub style). */
function compress(dir: TreeDir): void {
  for (const child of dir.dirs) {
    while (child.dirs.length === 1 && child.files.length === 0) {
      const only = child.dirs[0]
      child.name = `${child.name}/${only.name}`
      child.path = only.path
      child.dirs = only.dirs
      child.files = only.files
    }
    compress(child)
  }
}

function sortTree(dir: TreeDir): void {
  dir.dirs.sort((a, b) => a.name.localeCompare(b.name))
  dir.files.sort((a, b) => a.path.localeCompare(b.path))
  for (const child of dir.dirs) sortTree(child)
}

/** Changed files rendered as a collapsible folder tree, GitHub style. */
export function ChangedFilesPanel({ files }: { files: NormalizedDiffFile[] }) {
  const viewedFiles = useReviewWorkspaceStore((s) => s.viewedFiles)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const tree = useMemo(() => buildTree(files), [files])
  const viewedCount = files.filter((f) => viewedFiles[f.path]).length

  function toggleDir(path: string): void {
    setCollapsed((c) => ({ ...c, [path]: !c[path] }))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2.5">
        <span className="font-display text-[12px] font-semibold uppercase tracking-wide text-text-muted">
          Changed files
        </span>
        <span className="text-[11px] text-text-muted">
          {viewedCount}/{files.length} viewed
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-px overflow-auto p-2">
        <TreeLevel dir={tree} depth={0} collapsed={collapsed} onToggleDir={toggleDir} />
        {files.length === 0 && (
          <p className="px-2 py-3 text-center text-[12px] text-text-muted">No changed files.</p>
        )}
      </div>
    </div>
  )
}

function TreeLevel({
  dir,
  depth,
  collapsed,
  onToggleDir
}: {
  dir: TreeDir
  depth: number
  collapsed: Record<string, boolean>
  onToggleDir: (path: string) => void
}): JSX.Element {
  return (
    <>
      {dir.dirs.map((child) => (
        <DirRow key={child.path} dir={child} depth={depth} collapsed={collapsed} onToggleDir={onToggleDir} />
      ))}
      {dir.files.map((file) => (
        <FileRow key={file.path} file={file} depth={depth} />
      ))}
    </>
  )
}

function DirRow({
  dir,
  depth,
  collapsed,
  onToggleDir
}: {
  dir: TreeDir
  depth: number
  collapsed: Record<string, boolean>
  onToggleDir: (path: string) => void
}): JSX.Element {
  const isCollapsed = !!collapsed[dir.path]
  return (
    <>
      <Tooltip content={dir.path} side="right" className="mono max-w-[480px] break-all text-[11.5px]">
        <button
          type="button"
          onClick={() => onToggleDir(dir.path)}
          className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-background-panel-hover"
          style={{ paddingLeft: `${6 + depth * 14}px` }}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-3 w-3 shrink-0 text-text-muted" />
          ) : (
            <ChevronDownIcon className="h-3 w-3 shrink-0 text-text-muted" />
          )}
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <span className="mono truncate text-[11.5px] text-text-secondary">{dir.name}</span>
        </button>
      </Tooltip>
      {!isCollapsed && <TreeLevel dir={dir} depth={depth + 1} collapsed={collapsed} onToggleDir={onToggleDir} />}
    </>
  )
}

function FileRow({ file, depth }: { file: NormalizedDiffFile; depth: number }): JSX.Element {
  const selectedFilePath = useReviewWorkspaceStore((s) => s.selectedFilePath)
  const viewedFiles = useReviewWorkspaceStore((s) => s.viewedFiles)
  const selectFile = useReviewWorkspaceStore((s) => s.selectFile)

  const selected = selectedFilePath === file.path
  const viewed = viewedFiles[file.path]
  const name = file.path.slice(file.path.lastIndexOf('/') + 1)

  return (
    <Tooltip
      content={`${file.path} (${file.status})`}
      side="right"
      className="mono max-w-[480px] break-all text-[11.5px]"
    >
      <button
        type="button"
        onClick={() => selectFile(file.path)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors',
          selected ? 'bg-accent-soft' : 'hover:bg-background-panel-hover'
        )}
        style={{ paddingLeft: `${6 + depth * 14 + 14}px` }}
      >
        <FileIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <span
          className={cn(
            'mono truncate text-[11.5px]',
            selected ? 'text-text-primary' : 'text-text-secondary',
            viewed && 'line-through opacity-60'
          )}
        >
          {name}
        </span>
        {statusColor[file.status] && (
          <span
            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: statusColor[file.status]! }}
          />
        )}
      </button>
    </Tooltip>
  )
}
