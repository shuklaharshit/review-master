import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from './keys'
import type {
  GenerateReviewParams,
  MergePullRequestParams,
  MergeRequirements,
  PullRequestRef,
  RunPreflightParams,
  WorkspaceState
} from '@shared/types'

/** Loads the full workspace for a PR (PR detail, context, diff, snapshot, preflight, draft). */
export function useWorkspace(ref: PullRequestRef | null) {
  return useQuery<WorkspaceState>({
    queryKey: ref ? queryKeys.workspace(ref) : ['workspace', 'none'],
    enabled: !!ref,
    queryFn: () => api.prs.openWorkspace(ref as PullRequestRef),
    staleTime: 0,
    refetchOnWindowFocus: false
  })
}

export function useRunPreflight() {
  return useMutation({
    mutationFn: (params: RunPreflightParams) => api.review.runPreflight(params)
  })
}

export function useGenerateReview() {
  return useMutation({
    mutationFn: (params: GenerateReviewParams) => api.review.generateAiReview(params)
  })
}

/** Invalidate the workspace query (after preflight / review completes). */
export function useInvalidateWorkspace() {
  const qc = useQueryClient()
  return (ref: PullRequestRef) => qc.invalidateQueries({ queryKey: queryKeys.workspace(ref) })
}

/** Branch-rule merge requirements (required approvals, bypass) for the merge modal. */
export function useMergeRequirements(ref: PullRequestRef | null, enabled: boolean) {
  return useQuery<MergeRequirements>({
    queryKey: ref ? queryKeys.mergeRequirements(ref) : ['mergeRequirements', 'none'],
    enabled: !!ref && enabled,
    queryFn: () => api.prs.mergeRequirements(ref as PullRequestRef),
    staleTime: 15_000,
    refetchOnWindowFocus: false
  })
}

/** Merge the PR, then refresh the workspace so the new (merged) state shows. */
export function useMergePr(ref: PullRequestRef | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: MergePullRequestParams) => api.prs.merge(params),
    onSuccess: () => {
      if (ref) void qc.invalidateQueries({ queryKey: queryKeys.workspace(ref) })
    }
  })
}
