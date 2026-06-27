import { createHash } from 'node:crypto'
import type {
  CheckSummary,
  CommitSummary,
  DiffSide,
  IssueComment,
  LabelSummary,
  PullRequest,
  PullRequestDetail,
  PullRequestFile,
  PullRequestState,
  Repository,
  ReviewComment,
  ReviewCommentThread,
  ReviewSummary,
  UserSummary
} from '../../../shared/types'
import type {
  GhCheckRun,
  GhCommit,
  GhCommitStatus,
  GhFile,
  GhIssueComment,
  GhLabel,
  GhPullRequest,
  GhRepo,
  GhReview,
  GhReviewComment,
  GhUser
} from './GitHubTypes'

// ---------------------------------------------------------------------------
// Stable id helpers (do NOT use shared/ids — that only mints random ids).
// ---------------------------------------------------------------------------

export function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}

export function providerRepoId(repo: Pick<GhRepo, 'id'>): string {
  return String(repo.id)
}

export function repositoryId(accountId: string, providerRepoId: string): string {
  return sha1(`github:${accountId}:${providerRepoId}`)
}

export function pullRequestId(repoId: string, number: number): string {
  return sha1(`${repoId}:pr:${number}`)
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export function mapUser(user: GhUser | null | undefined): UserSummary | undefined {
  if (!user || !user.login) return undefined
  return {
    login: user.login,
    avatarUrl: user.avatar_url,
    htmlUrl: user.html_url
  }
}

export function mapUsers(users: GhUser[] | null | undefined): UserSummary[] {
  if (!users) return []
  const out: UserSummary[] = []
  for (const u of users) {
    const mapped = mapUser(u)
    if (mapped) out.push(mapped)
  }
  return out
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function mapRepository(accountId: string, repo: GhRepo): Repository {
  const provRepoId = providerRepoId(repo)
  return {
    id: repositoryId(accountId, provRepoId),
    providerId: 'github',
    accountId,
    providerRepoId: provRepoId,
    owner: repo.owner?.login ?? repo.full_name.split('/')[0] ?? '',
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    defaultBranch: repo.default_branch,
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    sshUrl: repo.ssh_url,
    description: repo.description ?? undefined,
    language: repo.language ?? undefined,
    updatedAt: repo.updated_at ?? undefined,
    lastSyncedAt: new Date().toISOString()
  }
}

// ---------------------------------------------------------------------------
// Pull request
// ---------------------------------------------------------------------------

function mapPrState(pr: GhPullRequest): PullRequestState {
  if (pr.merged_at || pr.merged) return 'merged'
  return pr.state === 'closed' ? 'closed' : 'open'
}

/** Maps a list/detail PR shape into our PullRequest DTO. */
export function mapPullRequest(
  accountId: string,
  repoId: string,
  pr: GhPullRequest
): PullRequest {
  return {
    id: pullRequestId(repoId, pr.number),
    providerId: 'github',
    accountId,
    repoId,
    providerPrId: String(pr.id),
    number: pr.number,
    title: pr.title,
    body: pr.body ?? undefined,
    state: mapPrState(pr),
    draft: pr.draft,
    author: mapUser(pr.user),
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    htmlUrl: pr.html_url,
    createdAt: pr.created_at ?? undefined,
    updatedAt: pr.updated_at ?? undefined,
    lastSyncedAt: new Date().toISOString()
  }
}

export function mapPullRequestDetail(
  accountId: string,
  repoId: string,
  pr: GhPullRequest
): PullRequestDetail {
  const labels = (pr.labels ?? []).map((l) =>
    typeof l === 'string' ? { name: l } : { name: l.name, color: l.color }
  )
  return {
    ...mapPullRequest(accountId, repoId, pr),
    filesChanged: pr.changed_files,
    additions: pr.additions,
    deletions: pr.deletions,
    mergeable: pr.mergeable ?? null,
    labels,
    assignees: mapUsers(pr.assignees),
    requestedReviewers: mapUsers(pr.requested_reviewers)
  }
}

// ---------------------------------------------------------------------------
// Commits
// ---------------------------------------------------------------------------

export function mapCommit(commit: GhCommit): CommitSummary {
  return {
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author?.name ?? commit.author?.login ?? undefined,
    authoredAt: commit.commit.author?.date ?? undefined
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function mapFileStatus(status: string): PullRequestFile['status'] {
  switch (status) {
    case 'added':
      return 'added'
    case 'removed':
      return 'removed'
    case 'renamed':
      return 'renamed'
    case 'copied':
      return 'copied'
    case 'modified':
    case 'changed':
    default:
      return 'modified'
  }
}

export function mapFile(file: GhFile): PullRequestFile {
  // Binary detection: GitHub omits `patch` for binary files (and very large
  // diffs). Treat "no patch but content changed" as binary.
  const isBinary = !file.patch && file.changes > 0
  const status = isBinary ? 'binary' : mapFileStatus(file.status)
  return {
    path: file.filename,
    oldPath: file.previous_filename,
    status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch,
    isBinary: isBinary || undefined
  }
}

// ---------------------------------------------------------------------------
// Checks (check-runs + legacy commit statuses)
// ---------------------------------------------------------------------------

function mapCheckRunStatus(status: string): CheckSummary['status'] {
  switch (status) {
    case 'queued':
      return 'queued'
    case 'in_progress':
      return 'in_progress'
    case 'completed':
      return 'completed'
    default:
      return 'unknown'
  }
}

function mapCheckRunConclusion(conclusion: string | null | undefined): CheckSummary['conclusion'] {
  if (!conclusion) return null
  switch (conclusion) {
    case 'success':
    case 'failure':
    case 'neutral':
    case 'cancelled':
    case 'skipped':
    case 'timed_out':
    case 'action_required':
      return conclusion
    case 'stale':
      return 'cancelled'
    default:
      return 'neutral'
  }
}

export function mapCheckRun(run: GhCheckRun): CheckSummary {
  return {
    name: run.name,
    status: mapCheckRunStatus(run.status),
    conclusion: mapCheckRunConclusion(run.conclusion),
    detailsUrl: run.details_url ?? run.html_url ?? undefined
  }
}

/** Legacy commit statuses don't have a check-run lifecycle; treat as completed. */
export function mapCommitStatus(status: GhCommitStatus): CheckSummary {
  let conclusion: CheckSummary['conclusion']
  switch (status.state) {
    case 'success':
      conclusion = 'success'
      break
    case 'failure':
    case 'error':
      conclusion = 'failure'
      break
    case 'pending':
      conclusion = null
      break
    default:
      conclusion = 'neutral'
  }
  return {
    name: status.context,
    status: status.state === 'pending' ? 'in_progress' : 'completed',
    conclusion,
    detailsUrl: status.target_url ?? undefined
  }
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

function mapReviewState(state: string): ReviewSummary['state'] {
  switch (state) {
    case 'APPROVED':
      return 'APPROVED'
    case 'CHANGES_REQUESTED':
      return 'CHANGES_REQUESTED'
    case 'PENDING':
      return 'PENDING'
    case 'DISMISSED':
      return 'DISMISSED'
    case 'COMMENTED':
    default:
      return 'COMMENTED'
  }
}

export function mapReview(review: GhReview): ReviewSummary {
  return {
    id: review.id !== undefined ? String(review.id) : undefined,
    login: review.user?.login ?? 'unknown',
    avatarUrl: review.user?.avatar_url,
    state: mapReviewState(review.state),
    submittedAt: review.submitted_at ?? undefined,
    body: review.body ?? undefined,
    htmlUrl: review.html_url
  }
}

// ---------------------------------------------------------------------------
// Comments (issue comments + inline review comments)
// ---------------------------------------------------------------------------

export function mapIssueComment(comment: GhIssueComment): IssueComment {
  return {
    id: String(comment.id),
    author: mapUser(comment.user),
    body: comment.body ?? '',
    createdAt: comment.created_at ?? undefined,
    updatedAt: comment.updated_at ?? undefined,
    htmlUrl: comment.html_url
  }
}

function mapDiffSide(side: string | null | undefined): DiffSide | undefined {
  if (side === 'LEFT' || side === 'RIGHT') return side
  return undefined
}

export function mapReviewComment(comment: GhReviewComment): ReviewComment {
  return {
    id: String(comment.id),
    author: mapUser(comment.user),
    body: comment.body ?? '',
    path: comment.path,
    line: comment.line ?? comment.original_line ?? undefined,
    side: mapDiffSide(comment.side),
    startLine: comment.start_line ?? undefined,
    diffHunk: comment.diff_hunk ?? undefined,
    inReplyToId: comment.in_reply_to_id !== undefined && comment.in_reply_to_id !== null
      ? String(comment.in_reply_to_id)
      : undefined,
    createdAt: comment.created_at ?? undefined,
    htmlUrl: comment.html_url
  }
}

/**
 * Groups inline review comments into threads. A thread's root is a comment with
 * no `inReplyToId`; replies carry the root's id. We key each comment by
 * `inReplyToId ?? id` so replies land under their root even if the root's own
 * entry is mapped later, and we sort threads + their comments by creation time.
 */
export function buildReviewThreads(comments: ReviewComment[]): ReviewCommentThread[] {
  const byThread = new Map<string, ReviewComment[]>()
  for (const c of comments) {
    const threadId = c.inReplyToId ?? c.id
    const bucket = byThread.get(threadId)
    if (bucket) bucket.push(c)
    else byThread.set(threadId, [c])
  }

  const threads: ReviewCommentThread[] = []
  for (const [id, list] of byThread) {
    const ordered = [...list].sort(byCreatedAt)
    const root = ordered.find((c) => !c.inReplyToId) ?? ordered[0]
    threads.push({
      id,
      path: root.path,
      line: root.line,
      side: root.side,
      diffHunk: root.diffHunk,
      comments: ordered
    })
  }
  return threads.sort((a, b) => byCreatedAt(a.comments[0], b.comments[0]))
}

function byCreatedAt(a: { createdAt?: string }, b: { createdAt?: string }): number {
  return (Date.parse(a.createdAt ?? '') || 0) - (Date.parse(b.createdAt ?? '') || 0)
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function mapLabel(label: GhLabel): LabelSummary {
  return { name: label.name, color: label.color }
}
