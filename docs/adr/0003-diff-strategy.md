# 0003 — Normalized diff: local git cache, GitHub API patch fallback

**Status:** Accepted

## Context
The review map, diff viewer, and Codex prompts all need a reliable, structured diff. GitHub's API patch strings are convenient but lossy/limited; a local `git diff` is more deterministic but requires git and a repo clone.

## Decision
Produce a single **`NormalizedDiff`** model. Prefer a local git repo cache (`RepoCacheService`) when git is available; **fall back to GitHub API file patches** otherwise. Tokens are never persisted in `.git/config` and are redacted from logs.

## Consequences
- Better, deterministic diffs when git is present; still works without git (and for fork PRs) via the API fallback.
- A deterministic `filesHash` over the normalized files (+ base/head SHA) powers snapshot/staleness detection.
- `RepoCacheService.buildDiff` returns `null` on any failure so the caller transparently falls back — keep that contract.
