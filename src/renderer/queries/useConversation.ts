import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from './keys'
import type {
  CreateCommentParams,
  EditCommentParams,
  PrConversation,
  PullRequestRef,
  ReplyReviewCommentParams
} from '@shared/types'

/** Loads the PR discussion (issue comments, reviews with bodies, inline threads). */
export function useConversation(ref: PullRequestRef | null, enabled = true) {
  return useQuery<PrConversation>({
    queryKey: ref ? queryKeys.conversation(ref) : ['conversation', 'none'],
    enabled: !!ref && enabled,
    queryFn: () => api.prs.getConversation(ref as PullRequestRef),
    staleTime: 15_000,
    refetchOnWindowFocus: false
  })
}

export function useCreateComment(ref: PullRequestRef | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: CreateCommentParams) => api.prs.createComment(params),
    onSuccess: () => {
      if (ref) void qc.invalidateQueries({ queryKey: queryKeys.conversation(ref) })
    }
  })
}

export function useReplyReviewComment(ref: PullRequestRef | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: ReplyReviewCommentParams) => api.prs.replyReviewComment(params),
    onSuccess: () => {
      if (ref) void qc.invalidateQueries({ queryKey: queryKeys.conversation(ref) })
    }
  })
}

export function useEditComment(ref: PullRequestRef | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: EditCommentParams) => api.prs.editComment(params),
    onSuccess: () => {
      if (ref) void qc.invalidateQueries({ queryKey: queryKeys.conversation(ref) })
    }
  })
}
