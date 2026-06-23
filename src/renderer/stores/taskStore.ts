import { create } from 'zustand'
import type { TaskKind } from '@shared/types'

export type TaskStatus = 'running' | 'completed' | 'failed' | 'interrupted'

export interface TaskState {
  taskId: string
  kind: TaskKind
  status: TaskStatus
  phase: string
  phaseIndex: number
  phaseCount: number
  logs: string[]
  /** Accumulated streamed content (review markdown). */
  content: string
  resultId?: string
  errorMessage?: string
  recoverable?: boolean
}

interface TaskStoreState {
  tasks: Record<string, TaskState>
  startTask: (taskId: string, kind: TaskKind) => void
  setPhase: (taskId: string, phase: string, phaseIndex: number, phaseCount: number) => void
  appendLog: (taskId: string, message: string) => void
  appendContent: (taskId: string, text: string) => void
  completeTask: (taskId: string, resultId?: string) => void
  failTask: (taskId: string, message: string, recoverable: boolean) => void
  interruptTask: (taskId: string) => void
  clearTask: (taskId: string) => void
}

function ensure(tasks: Record<string, TaskState>, taskId: string, kind?: TaskKind): TaskState {
  return (
    tasks[taskId] ?? {
      taskId,
      kind: kind ?? 'preflight',
      status: 'running',
      phase: '',
      phaseIndex: 0,
      phaseCount: 0,
      logs: [],
      content: ''
    }
  )
}

export const useTaskStore = create<TaskStoreState>((set) => ({
  tasks: {},

  startTask: (taskId, kind) =>
    set((s) => ({
      tasks: {
        ...s.tasks,
        [taskId]: { taskId, kind, status: 'running', phase: '', phaseIndex: 0, phaseCount: 0, logs: [], content: '' }
      }
    })),

  setPhase: (taskId, phase, phaseIndex, phaseCount) =>
    set((s) => {
      const t = ensure(s.tasks, taskId)
      return { tasks: { ...s.tasks, [taskId]: { ...t, phase, phaseIndex, phaseCount, status: 'running' } } }
    }),

  appendLog: (taskId, message) =>
    set((s) => {
      const t = ensure(s.tasks, taskId)
      return { tasks: { ...s.tasks, [taskId]: { ...t, logs: [...t.logs, message] } } }
    }),

  appendContent: (taskId, text) =>
    set((s) => {
      const t = ensure(s.tasks, taskId)
      return { tasks: { ...s.tasks, [taskId]: { ...t, content: t.content + text } } }
    }),

  completeTask: (taskId, resultId) =>
    set((s) => {
      const t = ensure(s.tasks, taskId)
      return { tasks: { ...s.tasks, [taskId]: { ...t, status: 'completed', resultId } } }
    }),

  failTask: (taskId, message, recoverable) =>
    set((s) => {
      const t = ensure(s.tasks, taskId)
      return { tasks: { ...s.tasks, [taskId]: { ...t, status: 'failed', errorMessage: message, recoverable } } }
    }),

  interruptTask: (taskId) =>
    set((s) => {
      const t = ensure(s.tasks, taskId)
      return { tasks: { ...s.tasks, [taskId]: { ...t, status: 'interrupted' } } }
    }),

  clearTask: (taskId) =>
    set((s) => {
      const next = { ...s.tasks }
      delete next[taskId]
      return { tasks: next }
    })
}))
