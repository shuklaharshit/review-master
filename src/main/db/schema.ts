// SQL DDL for Review Master local persistence (spec §12.2).
// All strings/json/timestamps are TEXT; numbers/booleans are INTEGER (0/1).
//
// NOTE: The runtime persistence layer is implemented with better-sqlite3
// prepared statements directly (see ./db.ts and ./repositories/*). This file
// is the single source of truth for the schema. A drizzle schema may also be
// provided for documentation, but it is NOT used at runtime.

/** Bump when the schema changes; persisted via `PRAGMA user_version`. */
export const SCHEMA_VERSION = 1

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connected_accounts (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  login TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  token_key TEXT NOT NULL,
  scopes_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  needs_reauth INTEGER NOT NULL DEFAULT 0,
  UNIQUE(provider_id, provider_account_id)
);

CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  provider_repo_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  private INTEGER NOT NULL DEFAULT 0,
  default_branch TEXT,
  html_url TEXT,
  clone_url TEXT,
  ssh_url TEXT,
  description TEXT,
  language TEXT,
  updated_at TEXT,
  last_synced_at TEXT,
  UNIQUE(provider_id, account_id, provider_repo_id)
);

CREATE INDEX IF NOT EXISTS idx_repositories_account_id ON repositories(account_id);

CREATE TABLE IF NOT EXISTS pull_requests (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  provider_pr_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  state TEXT,
  draft INTEGER,
  author_login TEXT,
  base_branch TEXT NOT NULL,
  head_branch TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  html_url TEXT,
  created_at TEXT,
  updated_at TEXT,
  last_synced_at TEXT,
  UNIQUE(provider_id, account_id, repo_id, number)
);

CREATE INDEX IF NOT EXISTS idx_pull_requests_repo_id ON pull_requests(repo_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_account_id ON pull_requests(account_id);

CREATE TABLE IF NOT EXISTS pr_commit_snapshots (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  commit_ids_json TEXT NOT NULL,
  files_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(pull_request_id, base_sha, head_sha, files_hash)
);

CREATE INDEX IF NOT EXISTS idx_pr_commit_snapshots_pull_request_id ON pr_commit_snapshots(pull_request_id);

CREATE TABLE IF NOT EXISTS preflight_analyses (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning_effort TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_json TEXT,
  parsed_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_preflight_analyses_pull_request_id ON preflight_analyses(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_preflight_analyses_snapshot_id ON preflight_analyses(snapshot_id);

CREATE TABLE IF NOT EXISTS review_drafts (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  preflight_analysis_id TEXT,
  model TEXT NOT NULL,
  reasoning_effort TEXT NOT NULL,
  user_notes TEXT,
  markdown TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  github_review_id TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_drafts_pull_request_id ON review_drafts(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_review_drafts_snapshot_id ON review_drafts(snapshot_id);

CREATE TABLE IF NOT EXISTS review_statuses (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  review_draft_id TEXT,
  status TEXT NOT NULL,
  reviewed_head_sha TEXT,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(pull_request_id, snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_review_statuses_pull_request_id ON review_statuses(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_review_statuses_snapshot_id ON review_statuses(snapshot_id);
`
