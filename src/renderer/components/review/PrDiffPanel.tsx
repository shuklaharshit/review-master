import { useMemo, useState } from 'react'
import type { PullRequestRef, WorkspaceState } from '@shared/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs'
import { PrStateBadge } from '../ui/StatusBadge'
import { Avatar } from '../ui/misc'
import { ExternalLinkIcon, GitBranchIcon } from '../ui/icons'
import { api } from '../../lib/api'
import { useReviewWorkspaceStore } from '../../stores/reviewWorkspaceStore'
import { DiffViewer } from './DiffViewer'
import { FileViewerModal } from './FileViewerModal'
import { EmptyState } from '../ui/misc'

export function PrDiffPanel({
  workspace,
  prRef
}: {
  workspace: WorkspaceState
  prRef: PullRequestRef
}): JSX.Element {
  const { pr, diff, preflight } = workspace
  const selectedGroupOrder = useReviewWorkspaceStore((s) => s.selectedGroupOrder)
  const selectedFilePath = useReviewWorkspaceStore((s) => s.selectedFilePath)
  const viewedFiles = useReviewWorkspaceStore((s) => s.viewedFiles)
  const toggleViewed = useReviewWorkspaceStore((s) => s.toggleViewed)

  const [fileViewerOpen, setFileViewerOpen] = useState(false)

  const groups = preflight?.analysis?.reviewGroups ?? []
  const activeGroup = groups.find((g) => g.order === selectedGroupOrder) ?? null

  const selectedFile = useMemo(
    () => diff.files.find((f) => f.path === selectedFilePath) ?? null,
    [diff.files, selectedFilePath]
  )

  const groupProgress = useMemo(() => {
    if (!activeGroup) return null
    const total = activeGroup.files.length
    const viewed = activeGroup.files.filter((f) => viewedFiles[f.path]).length
    return { viewed, total }
  }, [activeGroup, viewedFiles])

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background-elevated">
      {/* PR header */}
      <div className="shrink-0 border-b border-border-subtle px-5 py-3">
        <div className="flex items-center gap-2">
          <PrStateBadge state={pr.state} draft={pr.draft} />
          <span className="mono text-[12px] text-text-muted">
            {preflight?.analysis?.pr.repoFullName ?? ''} #{pr.number}
          </span>
          <button
            type="button"
            onClick={() => pr.htmlUrl && void api.app.openExternal(pr.htmlUrl)}
            className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-muted hover:bg-background-panel-hover hover:text-text-primary"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" /> Open on GitHub
          </button>
        </div>
        <h1 className="mt-1.5 text-[16px] font-semibold leading-snug text-text-primary">{pr.title}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
          {pr.author && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar src={pr.author.avatarUrl} alt={pr.author.login} size={16} />
              {pr.author.login}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <GitBranchIcon className="h-3.5 w-3.5" />
            <span className="mono">{pr.baseBranch}</span> ← <span className="mono">{pr.headBranch}</span>
          </span>
          <span>{pr.filesChanged ?? diff.files.length} files</span>
          <span>
            <span className="text-success">+{pr.additions ?? diff.totalAdditions}</span>{' '}
            <span className="text-danger">-{pr.deletions ?? diff.totalDeletions}</span>
          </span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="files" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="shrink-0 border-b border-border-subtle px-5">
          <TabsTrigger value="discussion" disabled>
            Discussion
          </TabsTrigger>
          <TabsTrigger value="commits" disabled>
            Commits
          </TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {activeGroup && (
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent text-[11px] font-semibold text-accent-foreground">
                {activeGroup.order}
              </span>
              <h2 className="text-[14px] font-medium text-text-primary">{activeGroup.title}</h2>
              {groupProgress && (
                <span className="ml-auto text-[11px] text-text-muted">
                  {groupProgress.viewed} / {groupProgress.total} viewed
                </span>
              )}
            </div>
          )}

          {selectedFile ? (
            <DiffViewer
              file={selectedFile}
              viewed={!!viewedFiles[selectedFile.path]}
              onToggleViewed={() => toggleViewed(selectedFile.path)}
              onViewFullFile={() => setFileViewerOpen(true)}
            />
          ) : (
            <EmptyState
              title="Select a file"
              description="Pick a file from the review map on the left to view its diff."
            />
          )}
        </TabsContent>

        <TabsContent value="discussion" className="p-6 text-center text-[12px] text-text-muted">
          Discussion view is not available in this MVP.
        </TabsContent>
        <TabsContent value="commits" className="p-6 text-center text-[12px] text-text-muted">
          Commits view is not available in this MVP.
        </TabsContent>
      </Tabs>

      {selectedFile && (
        <FileViewerModal
          open={fileViewerOpen}
          onOpenChange={setFileViewerOpen}
          file={selectedFile}
          pr={pr}
          prRef={prRef}
        />
      )}
    </section>
  )
}
