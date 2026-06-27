import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from './keys'
import type {
  FinishReviewParams,
  PullRequestRef,
  ReviewDraft,
  SaveDraftParams,
  SubmitDraftParams
} from '@shared/types'

export function useDraft(ref: PullRequestRef | null) {
  return useQuery<ReviewDraft | null>({
    queryKey: ref ? queryKeys.draft(ref) : ['draft', 'none'],
    enabled: !!ref,
    queryFn: () => api.review.getDraft(ref as PullRequestRef),
    staleTime: 5_000
  })
}

export function useSaveDraft() {
  return useMutation({
    mutationFn: (params: SaveDraftParams) => api.review.saveDraft(params)
  })
}

export function useSubmitDraft() {
  return useMutation({
    mutationFn: (params: SubmitDraftParams) => api.review.submitDraft(params)
  })
}

/** Submit a hand-authored review (no AI draft) with optional inline comments. */
export function useFinishReview() {
  return useMutation({
    mutationFn: (params: FinishReviewParams) => api.review.finishReview(params)
  })
}
