// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskState } from '../../../stores/taskStore'
import { ProgressModal } from '../ProgressModal'
import { click, render } from './renderHelper'

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
})

function task(overrides: Partial<TaskState> = {}): TaskState {
  return {
    taskId: 't1',
    kind: 'preflight',
    status: 'running',
    phase: 'Analyzing diff',
    phaseIndex: 1,
    phaseCount: 4,
    logs: ['reading files', 'thinking', 'writing groups'],
    content: '',
    ...overrides
  }
}

function renderModal(props: Partial<Parameters<typeof ProgressModal>[0]> = {}) {
  const onCancel = props.onCancel ?? vi.fn()
  const onOpenChange = props.onOpenChange ?? vi.fn()
  const result = render(
    createElement(ProgressModal, {
      open: true,
      onOpenChange,
      task: task(),
      title: 'Running preflight',
      phases: ['Starting', 'Analyzing', 'Grouping', 'Done'],
      onCancel,
      ...props
    })
  )
  cleanups.push(result.unmount)
  // Radix portals content into document.body.
  return { ...result, onCancel, onOpenChange, body: document.body }
}

describe('ProgressModal', () => {
  it('renders the title and current step text', () => {
    const { body } = renderModal()
    expect(body.textContent).toContain('Running preflight')
    expect(body.textContent).toContain('Current step:')
    expect(body.textContent).toContain('Analyzing diff')
  })

  it('shows the phase count as (index+1/count)', () => {
    const { body } = renderModal()
    // phaseIndex 1 of phaseCount 4 -> (2/4)
    expect(body.textContent).toContain('(2/4)')
  })

  it('renders the live activity log lines', () => {
    const { body } = renderModal()
    expect(body.textContent).toContain('reading files')
    expect(body.textContent).toContain('thinking')
    expect(body.textContent).toContain('writing groups')
  })

  it('shows only the last 12 activity lines', () => {
    const logs = Array.from({ length: 20 }, (_, i) => `log-${i}`)
    const { body } = renderModal({ task: task({ logs }) })
    // The newest line is shown.
    expect(body.textContent).toContain('log-19')
    // Lines older than the last 12 are dropped (log-7 is the 13th-from-end).
    expect(body.textContent).not.toContain('log-7')
    // The 12th-from-end (log-8) is shown.
    expect(body.textContent).toContain('log-8')
  })

  it('shows a waiting placeholder when there are no logs', () => {
    const { body } = renderModal({ task: task({ logs: [] }) })
    expect(body.textContent).toContain('Waiting for Codex…')
  })

  it('falls back to the first phase when task is null', () => {
    const { body } = renderModal({ task: null })
    expect(body.textContent).toContain('Starting')
  })

  it('Cancel triggers onCancel and onOpenChange(false)', () => {
    const onCancel = vi.fn()
    const onOpenChange = vi.fn()
    const { body } = renderModal({ onCancel, onOpenChange })
    const cancelBtn = Array.from(body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel')
    )
    expect(cancelBtn).toBeTruthy()
    click(cancelBtn!)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
