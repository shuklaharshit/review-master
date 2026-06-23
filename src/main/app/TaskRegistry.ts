import type { TaskManager } from '../contracts'

/**
 * Tracks in-flight cancellable tasks by id, each backed by an AbortController.
 */
export class TaskRegistry implements TaskManager {
  private readonly controllers = new Map<string, AbortController>()

  create(taskId: string): AbortController {
    // Abort any prior controller registered under the same id before replacing.
    const prior = this.controllers.get(taskId)
    if (prior) prior.abort()
    const controller = new AbortController()
    this.controllers.set(taskId, controller)
    return controller
  }

  get(taskId: string): AbortController | undefined {
    return this.controllers.get(taskId)
  }

  cancel(taskId: string): void {
    const controller = this.controllers.get(taskId)
    if (!controller) return
    controller.abort()
    this.controllers.delete(taskId)
  }

  done(taskId: string): void {
    this.controllers.delete(taskId)
  }
}
