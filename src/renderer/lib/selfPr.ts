import { useAppStore } from '../stores/appStore'
import type { PullRequestRef } from '@shared/types'

/** Login of the account that owns the given PR view (the authenticated viewer). */
export function useViewerLogin(ref: PullRequestRef | null): string | undefined {
  const bootstrap = useAppStore((s) => s.bootstrap)
  if (!ref) return undefined
  return bootstrap?.accounts.find((a) => a.id === ref.accountId)?.login
}

/**
 * True when the authenticated viewer is the PR's author. GitHub forbids
 * approving or requesting changes on your own PR, so the UI mirrors that.
 */
export function useIsOwnPr(ref: PullRequestRef | null, authorLogin?: string): boolean {
  const viewer = useViewerLogin(ref)
  if (!viewer || !authorLogin) return false
  return viewer.toLowerCase() === authorLogin.toLowerCase()
}
