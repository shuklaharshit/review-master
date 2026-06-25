# Architecture Decision Records

Short records of load-bearing decisions and *why* they were made, so they aren't re-litigated or accidentally undone. Newest decisions get the next number. A decision that reverses an old one supersedes it (note it in both).

| # | Decision | Status |
|---|----------|--------|
| [0001](./0001-no-custom-backend.md) | No custom backend; main process is the local-first control plane | Accepted |
| [0002](./0002-github-device-flow.md) | GitHub auth via OAuth device flow, no client secret | Superseded by [0007](./0007-github-app-over-oauth-app.md) |
| [0003](./0003-diff-strategy.md) | Normalized diff: local git cache, GitHub API patch fallback | Accepted |
| [0004](./0004-single-review-body.md) | Submit review as one PR review body, no inline comments (MVP) | Accepted |
| [0005](./0005-better-sqlite3-direct.md) | Persist with better-sqlite3 directly, not Drizzle at runtime | Accepted |
| [0006](./0006-cjs-preload.md) | Preload bundled as CommonJS for the sandboxed renderer | Accepted |
| [0007](./0007-github-app-over-oauth-app.md) | GitHub App over classic OAuth App (per-repo install, least privilege) | Accepted (implemented) |
