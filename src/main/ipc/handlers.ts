import { ipcMain, shell } from 'electron'
import { ZodError, type ZodTypeAny, type z } from 'zod'
import { IPC } from './channels'
import type { Services } from '../Services'
import { logger } from '../app/Logger'
import {
  AppSettingsPatchSchema,
  CancelFlowSchema,
  CancelTaskSchema,
  CreateCommentParamsSchema,
  EditCommentParamsSchema,
  FinishReviewParamsSchema,
  GenerateReviewParamsSchema,
  GetFileContentParamsSchema,
  HasInstallationsSchema,
  MergePullRequestParamsSchema,
  ReplyReviewCommentParamsSchema,
  ListPullRequestsParamsSchema,
  ListRepositoriesParamsSchema,
  OpenExternalSchema,
  PullRequestRefSchema,
  RemoveAccountSchema,
  RunPreflightParamsSchema,
  SaveDraftParamsSchema,
  SearchRepositoriesParamsSchema,
  SetActiveAccountSchema,
  StartAddAccountSchema,
  SubmitDraftParamsSchema
} from '../../shared/schemas'

type IpcResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; recoverable?: boolean } }

function toAppError(error: unknown): { code: string; message: string; recoverable?: boolean } {
  if (error instanceof ZodError) {
    return {
      code: 'invalid_input',
      message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      recoverable: true
    }
  }
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const e = error as { code: string; message: string; recoverable?: boolean }
    return { code: String(e.code), message: String(e.message), recoverable: e.recoverable ?? true }
  }
  if (error instanceof Error) return { code: 'internal_error', message: error.message, recoverable: true }
  return { code: 'internal_error', message: 'Unknown error', recoverable: true }
}

export function registerIpcHandlers(services: Services): void {
  const {
    accounts,
    settings,
    codex,
    bootstrap,
    updates,
    registry,
    github,
    prContext,
    preflight,
    aiReview,
    submission,
    paths,
    tasks,
    eventBus
  } = services

  /** Register a handler whose validated input type is inferred from the Zod schema. */
  function on<S extends ZodTypeAny, T>(channel: string, schema: S, fn: (input: z.infer<S>) => Promise<T> | T): void {
    ipcMain.handle(channel, async (_e, raw): Promise<IpcResult<T>> => {
      try {
        const input = schema.parse(raw) as z.infer<S>
        return { ok: true, value: await fn(input) }
      } catch (error) {
        logger.error(`IPC ${channel} failed`, error)
        return { ok: false, error: toAppError(error) }
      }
    })
  }

  /** Register a handler that takes no input payload. */
  function onPlain<T>(channel: string, fn: () => Promise<T> | T): void {
    ipcMain.handle(channel, async (): Promise<IpcResult<T>> => {
      try {
        return { ok: true, value: await fn() }
      } catch (error) {
        logger.error(`IPC ${channel} failed`, error)
        return { ok: false, error: toAppError(error) }
      }
    })
  }

  // ---- app ----
  onPlain(IPC.app.getBootstrapStatus, () => bootstrap.getBootstrapStatus())
  on(IPC.app.openExternal, OpenExternalSchema, async ({ url }) => {
    await shell.openExternal(url)
  })
  onPlain(IPC.app.openDataFolder, async () => {
    await shell.openPath(paths.dataRoot())
  })
  onPlain(IPC.app.clearRepoCache, async () => {
    const fs = await import('node:fs/promises')
    await fs.rm(paths.reposDir(), { recursive: true, force: true })
    paths.ensureDirsSync()
  })

  // ---- codex ----
  onPlain(IPC.codex.recheck, () => codex.recheck())
  onPlain(IPC.codex.listModels, () => codex.listModels())

  // ---- accounts ----
  onPlain(IPC.accounts.list, () => accounts.list())
  on(IPC.accounts.startAddAccount, StartAddAccountSchema, async ({ providerId }) => {
    const provider = registry.get(providerId)
    const flow = await provider.startAuthFlow()
    // Poll for authorization in the background; notify renderer on completion.
    provider
      .awaitAuthFlow(flow.flowId)
      .then((accountId) => {
        const acct = accounts.get(accountId)
        eventBus.emit({ type: 'account.added', accountId, login: acct?.login ?? '' })
        eventBus.emit({ type: 'toast', level: 'success', message: `Connected GitHub account ${acct?.login ?? ''}`.trim() })
      })
      .catch((error) => {
        const e = toAppError(error)
        if (e.code !== 'auth_cancelled') {
          eventBus.emit({ type: 'auth.failed', flowId: flow.flowId, message: e.message })
          eventBus.emit({ type: 'toast', level: 'error', message: `GitHub authorization failed: ${e.message}` })
        }
      })
    return flow
  })
  on(IPC.accounts.cancelAddAccount, CancelFlowSchema, async ({ flowId }) => {
    await github.cancelAuthFlow(flowId)
  })
  on(IPC.accounts.remove, RemoveAccountSchema, async ({ accountId, options }) => {
    await accounts.remove(accountId, options)
    const s = settings.get()
    if (s.activeAccountId === accountId) settings.update({ activeAccountId: undefined })
  })
  on(IPC.accounts.setActive, SetActiveAccountSchema, ({ accountId }) => {
    settings.update({ activeAccountId: accountId })
  })
  on(IPC.accounts.hasInstallations, HasInstallationsSchema, ({ accountId }) =>
    github.hasInstallations(accountId)
  )

  // ---- repos ----
  on(IPC.repos.list, ListRepositoriesParamsSchema, (params) => github.listRepositories(params))
  on(IPC.repos.search, SearchRepositoriesParamsSchema, (params) => github.searchRepositories(params))

  // ---- prs ----
  on(IPC.prs.list, ListPullRequestsParamsSchema, (params) => github.listPullRequests(params))
  on(IPC.prs.get, PullRequestRefSchema, (params) => github.getPullRequest(params))
  on(IPC.prs.openWorkspace, PullRequestRefSchema, (params) => prContext.openWorkspace(params))
  on(IPC.prs.getFileContent, GetFileContentParamsSchema, (params) => github.getFileContent(params))
  on(IPC.prs.getConversation, PullRequestRefSchema, (params) => github.getPullRequestConversation(params))
  on(IPC.prs.createComment, CreateCommentParamsSchema, (params) => github.createComment(params))
  on(IPC.prs.replyReviewComment, ReplyReviewCommentParamsSchema, (params) =>
    github.replyToReviewComment(params)
  )
  on(IPC.prs.editComment, EditCommentParamsSchema, (params) => github.editComment(params))
  on(IPC.prs.mergeRequirements, PullRequestRefSchema, (params) => github.getMergeRequirements(params))
  on(IPC.prs.merge, MergePullRequestParamsSchema, (params) => github.mergePullRequest(params))

  // ---- review ----
  on(IPC.review.runPreflight, RunPreflightParamsSchema, (params) => preflight.run(params))
  on(IPC.review.generateAiReview, GenerateReviewParamsSchema, (params) => aiReview.run(params))
  on(IPC.review.getDraft, PullRequestRefSchema, (params) => aiReview.getDraft(params))
  on(IPC.review.saveDraft, SaveDraftParamsSchema, (params) => aiReview.saveDraft(params))
  on(IPC.review.submitDraft, SubmitDraftParamsSchema, (params) => submission.submit(params))
  on(IPC.review.finishReview, FinishReviewParamsSchema, (params) => submission.finishReview(params))
  on(IPC.review.cancelTask, CancelTaskSchema, async ({ taskId }) => {
    tasks.cancel(taskId)
    await codex.interrupt(taskId)
  })
  on(IPC.review.markReviewed, PullRequestRefSchema, (params) => submission.markReviewed(params))

  // ---- settings ----
  onPlain(IPC.settings.get, () => settings.get())
  on(IPC.settings.update, AppSettingsPatchSchema, (patch) => settings.update(patch))

  // ---- updates ----
  onPlain(IPC.updates.check, () => updates.check())
  onPlain(IPC.updates.download, () => updates.download())
  onPlain(IPC.updates.install, () => updates.install())
}
