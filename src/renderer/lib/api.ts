import type { ReviewMasterApi } from '../../preload/api'

/**
 * Centralised access to the typed backend bridge exposed by the preload script.
 * The renderer has NO Node access; everything goes through this object.
 */
export const api: ReviewMasterApi = window.reviewMaster
