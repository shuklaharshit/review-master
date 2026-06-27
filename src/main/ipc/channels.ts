// Centralised IPC channel names. Keep in sync with preload/api.ts.

export const IPC = {
  app: {
    getBootstrapStatus: 'app:getBootstrapStatus',
    openExternal: 'app:openExternal',
    openDataFolder: 'app:openDataFolder',
    clearRepoCache: 'app:clearRepoCache'
  },
  codex: {
    recheck: 'codex:recheck',
    listModels: 'codex:listModels'
  },
  accounts: {
    list: 'accounts:list',
    startAddAccount: 'accounts:startAddAccount',
    cancelAddAccount: 'accounts:cancelAddAccount',
    remove: 'accounts:remove',
    setActive: 'accounts:setActive',
    hasInstallations: 'accounts:hasInstallations'
  },
  repos: {
    list: 'repos:list',
    search: 'repos:search'
  },
  prs: {
    list: 'prs:list',
    get: 'prs:get',
    openWorkspace: 'prs:openWorkspace',
    getFileContent: 'prs:getFileContent',
    getConversation: 'prs:getConversation',
    createComment: 'prs:createComment',
    replyReviewComment: 'prs:replyReviewComment'
  },
  review: {
    runPreflight: 'review:runPreflight',
    generateAiReview: 'review:generateAiReview',
    getDraft: 'review:getDraft',
    saveDraft: 'review:saveDraft',
    submitDraft: 'review:submitDraft',
    finishReview: 'review:finishReview',
    cancelTask: 'review:cancelTask',
    markReviewed: 'review:markReviewed'
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update'
  },
  updates: {
    check: 'updates:check',
    download: 'updates:download',
    install: 'updates:install'
  },
  events: {
    appEvent: 'events:appEvent'
  }
} as const
