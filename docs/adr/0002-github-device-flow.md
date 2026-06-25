# 0002 — GitHub auth via OAuth device flow, no client secret

**Status:** Superseded by [0007](./0007-github-app-over-oauth-app.md) — we keep device flow but move from a classic OAuth App to a GitHub App. The "no client secret / device flow / token in keychain" decisions below still hold.

## Context
A desktop app can't safely embed a client secret, and we don't want to depend on the `gh` CLI or the user's system-wide GitHub auth. Auth must be self-contained in the app.

## Decision
Use the GitHub **OAuth device flow**. Only the public **Client ID** is shipped (via `REVIEW_MASTER_GITHUB_CLIENT_ID`); there is **no client secret**. The main process polls the token endpoint and stores the resulting token in the OS keychain.

## Consequences
- Safe to distribute — the Client ID is not sensitive.
- Detection has an inherent ~3–5s polling floor (GitHub's `interval`); a single `slow_down` is honored then relaxed back to base so it doesn't compound. The connect modal is event-driven so it closes the instant the backend reports success.
- A loopback-redirect flow (sub-second, no polling) is the future option if the device-flow latency becomes a problem; it would supersede this.
