import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_TASK_LOGS, useTaskStore } from '../taskStore'

function reset(): void {
  useTaskStore.setState({ tasks: {} })
}

describe('taskStore', () => {
  beforeEach(reset)

  it('startTask creates a running task with empty defaults', () => {
    useTaskStore.getState().startTask('t1', 'preflight')
    const t = useTaskStore.getState().tasks['t1']
    expect(t).toMatchObject({
      taskId: 't1',
      kind: 'preflight',
      status: 'running',
      phase: '',
      phaseIndex: 0,
      phaseCount: 0,
      logs: [],
      content: ''
    })
  })

  it('startTask resets a previously existing task', () => {
    const store = useTaskStore.getState()
    store.startTask('t1', 'review')
    store.appendLog('t1', 'old line')
    store.appendContent('t1', 'old content')
    store.startTask('t1', 'preflight')
    const t = useTaskStore.getState().tasks['t1']
    expect(t.kind).toBe('preflight')
    expect(t.logs).toEqual([])
    expect(t.content).toBe('')
    expect(t.status).toBe('running')
  })

  it('setPhase updates phase fields and keeps status running', () => {
    const store = useTaskStore.getState()
    store.startTask('t1', 'preflight')
    store.setPhase('t1', 'Analyzing diff', 2, 5)
    const t = useTaskStore.getState().tasks['t1']
    expect(t.phase).toBe('Analyzing diff')
    expect(t.phaseIndex).toBe(2)
    expect(t.phaseCount).toBe(5)
    expect(t.status).toBe('running')
  })

  it('setPhase on an unknown task creates it via ensure (default preflight)', () => {
    useTaskStore.getState().setPhase('ghost', 'Phase', 1, 3)
    const t = useTaskStore.getState().tasks['ghost']
    expect(t).toBeDefined()
    expect(t.kind).toBe('preflight')
    expect(t.phase).toBe('Phase')
    expect(t.phaseCount).toBe(3)
  })

  it('appendLog accumulates messages in order', () => {
    const store = useTaskStore.getState()
    store.startTask('t1', 'preflight')
    store.appendLog('t1', 'a')
    store.appendLog('t1', 'b')
    store.appendLog('t1', 'c')
    expect(useTaskStore.getState().tasks['t1'].logs).toEqual(['a', 'b', 'c'])
  })

  it('appendLog caps logs at MAX_TASK_LOGS, keeping the newest', () => {
    const store = useTaskStore.getState()
    store.startTask('t1', 'preflight')
    const total = MAX_TASK_LOGS + 25
    for (let i = 0; i < total; i++) store.appendLog('t1', `line-${i}`)
    const logs = useTaskStore.getState().tasks['t1'].logs
    expect(logs).toHaveLength(MAX_TASK_LOGS)
    // Newest message retained at the tail.
    expect(logs[logs.length - 1]).toBe(`line-${total - 1}`)
    // Oldest retained line is exactly (total - MAX_TASK_LOGS).
    expect(logs[0]).toBe(`line-${total - MAX_TASK_LOGS}`)
  })

  it('appendContent accumulates streamed text', () => {
    const store = useTaskStore.getState()
    store.startTask('t1', 'review')
    store.appendContent('t1', 'Hello ')
    store.appendContent('t1', 'world')
    expect(useTaskStore.getState().tasks['t1'].content).toBe('Hello world')
  })

  it('completeTask sets status completed and resultId', () => {
    const store = useTaskStore.getState()
    store.startTask('t1', 'review')
    store.completeTask('t1', 'result-99')
    const t = useTaskStore.getState().tasks['t1']
    expect(t.status).toBe('completed')
    expect(t.resultId).toBe('result-99')
  })

  it('completeTask works without a resultId', () => {
    const store = useTaskStore.getState()
    store.startTask('t1', 'review')
    store.completeTask('t1')
    const t = useTaskStore.getState().tasks['t1']
    expect(t.status).toBe('completed')
    expect(t.resultId).toBeUndefined()
  })

  it('failTask sets status failed with error message and recoverable flag', () => {
    const store = useTaskStore.getState()
    store.startTask('t1', 'preflight')
    store.failTask('t1', 'boom', true)
    const t = useTaskStore.getState().tasks['t1']
    expect(t.status).toBe('failed')
    expect(t.errorMessage).toBe('boom')
    expect(t.recoverable).toBe(true)
  })

  it('interruptTask sets status interrupted', () => {
    const store = useTaskStore.getState()
    store.startTask('t1', 'review')
    store.interruptTask('t1')
    expect(useTaskStore.getState().tasks['t1'].status).toBe('interrupted')
  })

  it('clearTask removes only the targeted entry', () => {
    const store = useTaskStore.getState()
    store.startTask('t1', 'preflight')
    store.startTask('t2', 'review')
    store.clearTask('t1')
    const tasks = useTaskStore.getState().tasks
    expect(tasks['t1']).toBeUndefined()
    expect(tasks['t2']).toBeDefined()
  })
})
