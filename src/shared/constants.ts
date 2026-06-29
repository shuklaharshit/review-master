import type { AppSettings, ReasoningEffort } from './types'

export const APP_NAME = 'Review Master'
export const APP_SUBTITLE = 'AI-assisted PR reviews, powered by Codex'

/**
 * Public GitHub repo for the app — used in the attribution footer on submitted
 * reviews and the Settings → About link.
 *
 * Canonical source of truth is `package.json` (`repository`/`homepage`/`bugs`),
 * which is where tooling and other agents look first. This constant mirrors it
 * for runtime use without importing package.json into the renderer bundle; if
 * the repo ever moves, update both here and package.json.
 */
export const APP_REPO_URL = 'https://github.com/shuklaharshit/review-master'

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

// GitHub App — PUBLIC identity for the device-flow login (ADR-0007). NEITHER
// value is a secret: the device flow uses a public client id with NO client
// secret and NO private key, and the slug is just the public install URL
// (github.com/apps/<slug>). We bake in the canonical "Review Master" App so a
// clone works out of the box and everyone shares one installation. A fork can
// still point at its own App by setting REVIEW_MASTER_GITHUB_CLIENT_ID /
// REVIEW_MASTER_GITHUB_APP_SLUG (loaded from a local .env in dev, see loadEnv.ts).
// The `typeof process` guard keeps this module safe to import in the renderer,
// which has no `process` global.
// NOTE: GitHub Apps use fine-grained *permissions*, not OAuth *scopes* — the
// device-code request intentionally sends no `scope`. Repo access is governed by
// where the App is installed + repo selection.
const env = typeof process !== 'undefined' && process.env ? process.env : undefined
export const GITHUB_CLIENT_ID = env?.REVIEW_MASTER_GITHUB_CLIENT_ID || 'Iv23liIQq5nPYKr4BIqW'

// GitHub App slug — the `<slug>` in https://github.com/apps/<slug>. Used to send
// the user to GitHub to install the App / choose which repositories it can see.
export const GITHUB_APP_SLUG = env?.REVIEW_MASTER_GITHUB_APP_SLUG || 'review-master-ai'

/** True when a GitHub App identity is set (always true with the baked-in default). */
export function isGitHubAppConfigured(): boolean {
  return GITHUB_CLIENT_ID.length > 0 && GITHUB_APP_SLUG.length > 0
}

/** URL to install the App / add repositories to an existing installation. */
export function githubAppInstallUrl(): string {
  return `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`
}

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
