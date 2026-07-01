import { ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type {
  AppEvent,
  AppSettings,
  AuthFlowStartResult,
  BootstrapStatus,
  CodexModel,
  CodexStatus,
  ConnectedAccount,
  CreateCommentParams,
  EditCommentParams,
  FileContent,
  FinishReviewParams,
  GenerateReviewParams,
  GetFileContentParams,
  GitProviderId,
  ListPullRequestsParams,
  ListRepositoriesParams,
  MergePullRequestParams,
  MergeResult,
  PaginatedResult,
  PostedComment,
  PrConversation,
  PullRequest,
  PullRequestDetail,
  PullRequestRef,
  RemoveAccountOptions,
  ReplyReviewCommentParams,
  Repository,
  ReviewDraft,
  RunPreflightParams,
  SaveDraftParams,
  SearchRepositoriesParams,
  SubmitDraftParams,
  SubmittedReview,
  TaskHandle,
  UpdateStatus,
  WorkspaceState
} from '../shared/types'

// Result envelope returned by every handler.
type IpcResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; recoverable?: boolean } }

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, payload)) as IpcResult<T>
  if (!res || res.ok !== false) {
    return (res as { ok: true; value: T }).value
  }
  const error = res.error
  const e = new Error(error.message) as Error & { code?: string; recoverable?: boolean }
  e.code = error.code
  e.recoverable = error.recoverable
  throw e
}

export const reviewMasterApi = {
  app: {
    getBootstrapStatus: () => invoke<BootstrapStatus>(IPC.app.getBootstrapStatus),
    openExternal: (url: string) => invoke<void>(IPC.app.openExternal, { url }),
    openDataFolder: () => invoke<void>(IPC.app.openDataFolder),
    clearRepoCache: () => invoke<void>(IPC.app.clearRepoCache)
  },
  codex: {
    recheck: () => invoke<CodexStatus>(IPC.codex.recheck),
    listModels: () => invoke<CodexModel[]>(IPC.codex.listModels)
  },
  accounts: {
    list: () => invoke<ConnectedAccount[]>(IPC.accounts.list),
    startAddAccount: (providerId: GitProviderId) =>
      invoke<AuthFlowStartResult>(IPC.accounts.startAddAccount, { providerId }),
    cancelAddAccount: (flowId: string) => invoke<void>(IPC.accounts.cancelAddAccount, { flowId }),
    remove: (accountId: string, options?: RemoveAccountOptions) =>
      invoke<void>(IPC.accounts.remove, { accountId, options }),
    setActive: (accountId: string) => invoke<void>(IPC.accounts.setActive, { accountId }),
    hasInstallations: (accountId: string) =>
      invoke<boolean>(IPC.accounts.hasInstallations, { accountId })
  },
  repos: {
    list: (params: ListRepositoriesParams) => invoke<PaginatedResult<Repository>>(IPC.repos.list, params),
    search: (params: SearchRepositoriesParams) => invoke<PaginatedResult<Repository>>(IPC.repos.search, params)
  },
  prs: {
    list: (params: ListPullRequestsParams) => invoke<PaginatedResult<PullRequest>>(IPC.prs.list, params),
    get: (params: PullRequestRef) => invoke<PullRequestDetail>(IPC.prs.get, params),
    openWorkspace: (params: PullRequestRef) => invoke<WorkspaceState>(IPC.prs.openWorkspace, params),
    getFileContent: (params: GetFileContentParams) => invoke<FileContent>(IPC.prs.getFileContent, params),
    getConversation: (params: PullRequestRef) => invoke<PrConversation>(IPC.prs.getConversation, params),
    createComment: (params: CreateCommentParams) => invoke<PostedComment>(IPC.prs.createComment, params),
    replyReviewComment: (params: ReplyReviewCommentParams) =>
      invoke<PostedComment>(IPC.prs.replyReviewComment, params),
    editComment: (params: EditCommentParams) => invoke<PostedComment>(IPC.prs.editComment, params),
    merge: (params: MergePullRequestParams) => invoke<MergeResult>(IPC.prs.merge, params)
  },
  review: {
    runPreflight: (params: RunPreflightParams) => invoke<TaskHandle>(IPC.review.runPreflight, params),
    generateAiReview: (params: GenerateReviewParams) => invoke<TaskHandle>(IPC.review.generateAiReview, params),
    getDraft: (params: PullRequestRef) => invoke<ReviewDraft | null>(IPC.review.getDraft, params),
    saveDraft: (params: SaveDraftParams) => invoke<void>(IPC.review.saveDraft, params),
    submitDraft: (params: SubmitDraftParams) => invoke<SubmittedReview>(IPC.review.submitDraft, params),
    finishReview: (params: FinishReviewParams) => invoke<SubmittedReview>(IPC.review.finishReview, params),
    cancelTask: (taskId: string) => invoke<void>(IPC.review.cancelTask, { taskId }),
    markReviewed: (params: PullRequestRef) => invoke<void>(IPC.review.markReviewed, params)
  },
  settings: {
    get: () => invoke<AppSettings>(IPC.settings.get),
    update: (patch: Partial<AppSettings>) => invoke<AppSettings>(IPC.settings.update, patch)
  },
  updates: {
    check: () => invoke<UpdateStatus>(IPC.updates.check),
    download: () => invoke<void>(IPC.updates.download),
    install: () => invoke<void>(IPC.updates.install)
  },
  events: {
    onAppEvent(callback: (event: AppEvent) => void): () => void {
      const listener = (_e: unknown, event: AppEvent): void => callback(event)
      ipcRenderer.on(IPC.events.appEvent, listener)
      return () => ipcRenderer.removeListener(IPC.events.appEvent, listener)
    }
  }
}

export type ReviewMasterApi = typeof reviewMasterApi
