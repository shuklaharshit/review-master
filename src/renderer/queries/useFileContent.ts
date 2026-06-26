import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from './keys'
import type { FileContent, PullRequestRef } from '@shared/types'

/**
 * Fetches the full text of a single file at a commit (for the "view entire
 * file" modal). Only runs when both a PR ref and a {path, sha} target are
 * provided — the modal passes `null` while closed so the query stays idle.
 * File contents at a fixed SHA are immutable, so we cache them generously.
 */
export function useFileContent(
  ref: PullRequestRef | null,
  target: { path: string; sha: string } | null
) {
  return useQuery<FileContent>({
    queryKey:
      ref && target
        ? queryKeys.fileContent(ref, target.path, target.sha)
        : ['fileContent', 'none'],
    enabled: !!ref && !!target,
    queryFn: () =>
      api.prs.getFileContent({ ref: ref as PullRequestRef, path: target!.path, sha: target!.sha }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}
