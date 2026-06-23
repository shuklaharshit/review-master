# 0001 — No custom backend; main process is the local-first control plane

**Status:** Accepted

## Context
Review Master needs to call GitHub, run Codex, run git, and store data. We could route these through a hosted backend, or keep everything on the user's machine.

## Decision
No custom/SaaS backend. The Electron **main process is the trusted control plane**; all credentials, I/O, and persistence are local. Data lives in SQLite + the OS keychain under the app data dir.

## Consequences
- Simpler, private, offline-friendly; no server to run or secure.
- The renderer must be treated as untrusted and reach everything through typed IPC (see `AGENTS.md` invariants).
- No cloud sync, team history, or telemetry in MVP — these would require revisiting this decision.
