// Minimal local types for the GitHub responses we consume. We deliberately
// model only the fields the mapper reads rather than importing Octokit's
// sprawling response types, so the mapper stays narrow and `any`-free.

/** GitHub device-flow: response of POST /login/device/code. */
export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

/**
 * GitHub device-flow / refresh: response of POST /login/oauth/access_token.
 * With "Expire user authorization tokens" enabled (ADR-0007, F-1=ON) the App
 * returns a short-lived `access_token` plus a `refresh_token`, with lifetimes in
 * `expires_in` / `refresh_token_expires_in` (seconds).
 */
export interface DeviceTokenResponse {
  access_token?: string
  token_type?: string
  scope?: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
  error?: string
  error_description?: string
  interval?: number
}

/**
 * Result of awaiting a completed device flow (or a refresh). Mirrors
 * StoredCredential; expiry fields are absolute ISO timestamps computed from the
 * `*_expires_in` seconds at issue time.
 */
export interface AuthFlowResult {
  accessToken: string
  refreshToken?: string
  accessTokenExpiresAt?: string
  refreshTokenExpiresAt?: string
}


/** Authenticated GitHub user (subset of rest.users.getAuthenticated). */
export interface AuthenticatedUser {
  id: number
  login: string
  name?: string | null
  avatar_url?: string
}

/** Internal device-flow state tracked per flowId. */
export interface AuthFlowState {
  flowId: string
  deviceCode: string
  intervalSeconds: number
  /** GitHub's originally requested interval; we relax back to this after a transient slow_down. */
  baseIntervalSeconds: number
  expiresAt: number
  cancelled: boolean
}

// --- Narrow shapes for Octokit response data we map. Each is a structural
// subset; Octokit's actual data is assignable to these for our reads. ---

export interface GhUser {
  login?: string | null
  avatar_url?: string
  html_url?: string
}

export interface GhRepo {
  id: number
  name: string
  full_name: string
  private: boolean
  owner?: { login?: string | null } | null
  default_branch?: string
  html_url?: string
  clone_url?: string
  ssh_url?: string
  description?: string | null
  language?: string | null
  updated_at?: string | null
}

export interface GhPullRequestRef {
  ref: string
  sha: string
}

export interface GhPullRequest {
  id: number
  number: number
  title: string
  body?: string | null
  state: string
  draft?: boolean
  merged_at?: string | null
  merged?: boolean
  user?: GhUser | null
  base: GhPullRequestRef
  head: GhPullRequestRef
  html_url?: string
  created_at?: string | null
  updated_at?: string | null
  mergeable?: boolean | null
  additions?: number
  deletions?: number
  changed_files?: number
  labels?: Array<{ name: string; color?: string } | string>
  assignees?: GhUser[] | null
  requested_reviewers?: GhUser[] | null
}

export interface GhCommit {
  sha: string
  commit: {
    message: string
    author?: { name?: string; date?: string } | null
  }
  author?: GhUser | null
}

export interface GhFile {
  filename: string
  previous_filename?: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

export interface GhCheckRun {
  name: string
  status: string
  conclusion?: string | null
  details_url?: string | null
  html_url?: string | null
}

export interface GhCommitStatus {
  context: string
  state: string
  target_url?: string | null
}

export interface GhReview {
  id: number
  user?: GhUser | null
  state: string
  body?: string | null
  html_url?: string
  submitted_at?: string | null
}

/** A top-level PR comment (issues API). */
export interface GhIssueComment {
  id: number
  user?: GhUser | null
  body?: string | null
  html_url?: string
  created_at?: string | null
  updated_at?: string | null
}

/** An inline review comment (pulls comments API). */
export interface GhReviewComment {
  id: number
  user?: GhUser | null
  body?: string | null
  path: string
  line?: number | null
  original_line?: number | null
  start_line?: number | null
  side?: string | null
  diff_hunk?: string | null
  in_reply_to_id?: number | null
  html_url?: string
  created_at?: string | null
}

/** Result of creating a comment / reply. */
export interface GhCreatedComment {
  id: number
  html_url?: string
  created_at?: string | null
}

export interface GhLabel {
  name: string
  color?: string
}

export interface GhCreatedReview {
  id: number
  html_url?: string
  submitted_at?: string | null
}

/** Classic branch protection (admin-only endpoint) — only the fields we evaluate. */
export interface GhBranchProtection {
  required_pull_request_reviews?: {
    required_approving_review_count?: number
  } | null
  enforce_admins?: { enabled?: boolean } | null
}

/** One active rule from the rulesets "rules for a branch" endpoint. */
export interface GhBranchRule {
  type: string
  parameters?: {
    required_approving_review_count?: number
  }
}

/** The viewer's effective permissions on a repository (from repos.get). */
export interface GhRepoPermissions {
  admin: boolean
  maintain: boolean
  push: boolean
}
