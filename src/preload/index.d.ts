import type { ReviewMasterApi } from './api'

declare global {
  interface Window {
    reviewMaster: ReviewMasterApi
  }
}

export {}
