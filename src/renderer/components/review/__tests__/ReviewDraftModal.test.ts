// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PullRequestRef, ReviewDraft } from '@shared/types'

// The draft query hooks import `api` from src/renderer/lib/api.ts, which reads
// window.reviewMaster (undefined in jsdom). Mock it with vi.fn()s.
const saveDraft = vi.fn().mockResolvedValue(undefined)
const submitDraft = vi.fn().mockResolvedValue({ githubReviewId: 'rev-1', submittedAt: 'now' })
const getDraft = vi.fn().mockResolvedValue(null)

vi.mock('../../../lib/api', () => ({
  api: {
    review: {
      saveDraft: (...args: unknown[]) => saveDraft(...args),
      submitDraft: (...args: unknown[]) => submitDraft(...args),
      getDraft: (...args: unknown[]) => getDraft(...args)
    }
  }
}))

import { ReviewDraftModal } from '../ReviewDraftModal'
import { useTaskStore } from '../../../stores/taskStore'
import { changeValue, click, render } from './renderHelper'

const cleanups: Array<() => void> = []

beforeEach(() => {
  saveDraft.mockClear()
  submitDraft.mockClear()
  useTaskStore.setState({ tasks: {} })
})

afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.useRealTimers()
})

const prRef: PullRequestRef = {
  accountId: 'acc-1',
  repoId: 'repo-1',
  owner: 'acme',
  repo: 'widgets',
  number: 7
}

function makeDraft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    id: 'draft-1',
    pullRequestId: 'pr-1',
    snapshotId: 'snap-1',
    model: 'gpt',
    reasoningEffort: 'medium',
    markdown: '# Review Summary\n\nThis is a **MARKDOWN_FIXTURE_BODY**.',
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  } as ReviewDraft
}

function withProviders(el: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, el)
}

function renderModal(props: Partial<Parameters<typeof ReviewDraftModal>[0]> = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn()
  const result = render(
    withProviders(
      createElement(ReviewDraftModal, {
        open: true,
        onOpenChange,
        draft: makeDraft(),
        prRef,
        ...props
      })
    )
  )
  cleanups.push(result.unmount)
  return { ...result, onOpenChange, body: document.body }
}

describe('ReviewDraftModal', () => {
  it('shows the raw markdown in the textarea', () => {
    const { body } = renderModal()
    const textarea = body.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    expect(textarea.value).toContain('MARKDOWN_FIXTURE_BODY')
    expect(textarea.value).toContain('# Review Summary')
  })

  it('renders a markdown preview (headings/bold parsed, not raw)', () => {
    const { body } = renderModal()
    // ReactMarkdown should produce an <h1> and <strong> rather than literal '#'.
    expect(body.querySelector('h1')).toBeTruthy()
    const strong = body.querySelector('strong')
    expect(strong?.textContent).toContain('MARKDOWN_FIXTURE_BODY')
  })

  it('editing the textarea triggers debounced autosave via api.review.saveDraft', async () => {
    // NOTE: real timers (not fake) are used here. The autosave runs through a
    // react-query mutation whose scheduling relies on microtasks that vitest
    // fake timers do not advance reliably, so we wait on the real debounce
    // (DRAFT_AUTOSAVE_INTERVAL_MS = 3000ms) via vi.waitFor instead.
    const { body } = renderModal()
    const textarea = body.querySelector('textarea') as HTMLTextAreaElement
    changeValue(textarea, '# Edited content')
    expect(textarea.value).toBe('# Edited content')
    expect(saveDraft).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1), {
      timeout: 5000,
      interval: 100
    })
    expect(saveDraft).toHaveBeenCalledWith({ draftId: 'draft-1', markdown: '# Edited content' })
  })

  it('Submit calls api.review.submitDraft with the COMMENT event', async () => {
    const onOpenChange = vi.fn()
    const { body } = renderModal({ onOpenChange })
    const submitBtn = Array.from(body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Review')
    ) as HTMLButtonElement
    expect(submitBtn).toBeTruthy()
    expect(submitBtn.disabled).toBe(false)
    click(submitBtn)
    // Let the async submit() microtasks/mutations settle.
    await vi.waitFor(() => expect(submitDraft).toHaveBeenCalledTimes(1))
    expect(submitDraft).toHaveBeenCalledWith({ draftId: 'draft-1', ref: prRef, event: 'COMMENT' })
  })

  it('Copy Markdown writes the current markdown to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const { body } = renderModal()
    const copyBtn = Array.from(body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Copy Markdown')
    ) as HTMLButtonElement
    click(copyBtn)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('MARKDOWN_FIXTURE_BODY')
  })

  it('disables submit while a linked task is still running (streaming)', () => {
    useTaskStore.setState({
      tasks: {
        't-stream': {
          taskId: 't-stream',
          kind: 'review',
          status: 'running',
          phase: '',
          phaseIndex: 0,
          phaseCount: 0,
          logs: [],
          content: 'partial'
        }
      }
    })
    const { body } = renderModal({ taskId: 't-stream' })
    const submitBtn = Array.from(body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Review')
    ) as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
    // Streaming content is mirrored into the textarea and it is read-only.
    const textarea = body.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('partial')
    expect(textarea.readOnly).toBe(true)
  })
})
