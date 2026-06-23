import type { WebContents } from 'electron'
import type { EventBus } from '../contracts'
import type { AppEvent } from '../../shared/types'
import { IPC } from '../ipc/channels'

/** Concrete EventBus that forwards canonical app events to the renderer. */
export class EventBusImpl implements EventBus {
  private sender: WebContents | null = null
  private buffer: AppEvent[] = []

  setSender(sender: WebContents | null): void {
    this.sender = sender
    if (sender) {
      const pending = this.buffer
      this.buffer = []
      for (const e of pending) this.send(e)
    }
  }

  emit(event: AppEvent): void {
    if (this.sender && !this.sender.isDestroyed()) {
      this.send(event)
    } else {
      // Buffer until a window is available (avoid losing early events).
      if (this.buffer.length < 200) this.buffer.push(event)
    }
  }

  private send(event: AppEvent): void {
    try {
      this.sender?.send(IPC.events.appEvent, event)
    } catch {
      /* renderer gone */
    }
  }
}
