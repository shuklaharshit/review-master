import { useEffect } from 'react'
import { api } from '../lib/api'
import { useAppStore } from '../stores/appStore'
import { useTaskStore } from '../stores/taskStore'
import type { AppEvent } from '@shared/types'

/**
 * Subscribe once to the global app event stream and fan events out into the
 * relevant stores (toasts, codex session state, update status, task progress).
 */
export function useAppEvents(): void {
  useEffect(() => {
    const app = useAppStore.getState()
    const tasks = useTaskStore.getState()

    const unsubscribe = api.events.onAppEvent((event: AppEvent) => {
      switch (event.type) {
        case 'toast':
          app.pushToast(event.level, event.message)
          break
        case 'codex.session.state.changed':
          useAppStore.getState().setCodexState(event.state)
          break
        case 'update.status':
          useAppStore.getState().setUpdateStatus(event.status)
          break
        case 'account.needsReauth':
          app.pushToast('warning', 'A connected account needs to be re-authenticated.')
          break
        case 'task.phase':
          tasks.setPhase(event.taskId, event.phase, event.phaseIndex, event.phaseCount)
          break
        case 'task.log':
          tasks.appendLog(event.taskId, event.message)
          break
        case 'task.content.delta':
          tasks.appendContent(event.taskId, event.text)
          break
        case 'task.completed':
          tasks.completeTask(event.taskId, event.resultId)
          break
        case 'task.failed':
          tasks.failTask(event.taskId, event.message, event.recoverable)
          break
        case 'task.interrupted':
          tasks.interruptTask(event.taskId)
          break
        case 'draft.saved':
          // handled inline by the draft modal autosave UI; no global action needed.
          break
        default:
          break
      }
    })

    return unsubscribe
  }, [])
}
