import type { AppSettings, ReasoningEffort } from './types'

export const APP_NAME = 'Review Master'
export const APP_SUBTITLE = 'AI-assisted PR reviews, powered by Codex'

export const DEFAULT_SETTINGS: AppSettings = {
  defaultPreflightModel: 'gpt-5.4',
  defaultPreflightReasoningEffort: 'medium',
  defaultReviewModel: 'gpt-5.4',
  defaultReviewReasoningEffort: 'medium',
  codexBinaryMode: 'auto',
  autoCheckUpdates: true
}

export const REASONING_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']

// Large PR handling thresholds
export const MAX_DIRECT_REVIEW_FILES = 60
export const MAX_DIRECT_REVIEW_PATCH_CHARS = 250_000
export const MAX_SINGLE_FILE_PATCH_CHARS = 60_000

export const GENERATED_FILE_PATTERNS: RegExp[] = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
  /(^|\/)generated\//,
  /\.min\.js$/,
  /\.snap$/
]

// GitHub OAuth — PUBLIC client id for device flow (no client secret embedded).
// A Client ID is not a secret, so you may also paste yours directly as the
// fallback below. In the main process it is read from the environment
// (REVIEW_MASTER_GITHUB_CLIENT_ID), populated from .env in dev (see loadEnv.ts).
// The `typeof process` guard keeps this module safe to import in the renderer,
// which has no `process` global.
const envClientId =
  typeof process !== 'undefined' && process.env ? process.env.REVIEW_MASTER_GITHUB_CLIENT_ID : undefined
export const GITHUB_CLIENT_ID = envClientId || 'PASTE_YOUR_GITHUB_OAUTH_CLIENT_ID'
export const GITHUB_OAUTH_SCOPES = ['repo', 'read:org', 'read:user']

// Codex binary fallback search paths (macOS Finder PATH differs from Terminal)
export const CODEX_FALLBACK_PATHS = [
  '/usr/local/bin/codex',
  '/opt/homebrew/bin/codex',
  '~/.npm-global/bin/codex',
  '~/.yarn/bin/codex'
]

export const CODEX_INSTALL_COMMAND = 'npm install -g @openai/codex'
export const CODEX_DOCS_URL = 'https://github.com/openai/codex'

export const TASK_STALE_TIMEOUT_MS = 10 * 60 * 1000

export const DRAFT_AUTOSAVE_INTERVAL_MS = 3000
export const DRAFT_AUTOSAVE_CHAR_THRESHOLD = 400

export const PREFLIGHT_PHASES = [
  'Syncing PR metadata',
  'Fetching commits',
  'Building diff context',
  'Preparing Codex prompt',
  'Running preflight analysis',
  'Validating JSON output',
  'Saving locally'
]

export const REVIEW_PHASES = [
  'Loading PR context',
  'Loading preflight analysis',
  'Preparing review prompt',
  'Generating review with Codex',
  'Saving draft locally',
  'Opening editor'
]
