import { contextBridge } from 'electron'
import { reviewMasterApi } from './api'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('reviewMaster', reviewMasterApi)
  } catch (error) {
    console.error('Failed to expose reviewMaster API', error)
  }
} else {
  // Fallback for non-isolated contexts (should not happen with secure defaults).
  ;(globalThis as unknown as { reviewMaster: typeof reviewMasterApi }).reviewMaster = reviewMasterApi
}
