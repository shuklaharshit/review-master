# Architecture

How Review Master is put together and why. Pairs with [`AGENTS.md`](./AGENTS.md) (orientation) and [`CONTRIBUTING.md`](./CONTRIBUTING.md) (workflows). Decision records live in [`docs/adr/`](./docs/adr/).

## Process model

Electron gives us three execution contexts. We treat the **main process as the only trusted boundary** — it owns every credential and every external I/O. The renderer is treated as hostile.

```
┌─────────────────────────────┐     typed IPC      ┌──────────────────────────────────────────┐
│ Renderer (React, sandboxed) │  ───────────────▶  │ Preload (contextBridge)                    │
│  routes / components        │  window.reviewMaster│  exposes window.reviewMaster (api.ts)      │
│  stores (zustand)           │  ◀───────────────  └───────────────────┬────────────────────────┘
│  queries (TanStack Query)   │   AppEvent stream                       │ ipcRenderer.invoke / .on
└─────────────────────────────┘                                        ▼
                                            ┌───────────────────────────────────────────────────┐
                                            │ Main process (Node, trusted)                        │
                                            │  ipc/handlers.ts  ── Zod validate ──▶ services      │
                                            │  Services.ts (DI container wires everything)        │
                                            │   ├─ app/    Settings, Bootstrap, Update, Tasks     │
                                            │   ├─ auth/   SecureTokenService(keytar), Accounts   │
                                            │   ├─ codex/  ProcessManager→Adapter→ProviderService │
                                            │   ├─ providers/github/  device auth, Octokit        │
                                            │   ├─ pr/     context, diff, preflight, review, submit│
                                            │   ├─ db/     better-sqlite3 + repositories          │
                                            │   └─ security/ safePaths, redaction, sanitizer      │
                                            └───────────────────────────────────────────────────┘
                                              OS keychain · SQLite · git · GitHub API · codex app-server
```

### Why this shape
- **No custom backend** (ADR-0001). Everything is local-first; the main process is the control plane.
- The renderer↔main contract is a single typed object (`window.reviewMaster`) generated from `src/preload/api.ts`, validated server-side with Zod. This is what makes the boundary auditable.
- Services are plain classes with constructor-injected dependencies, instantiated exactly once in `src/main/Services.ts`. That file is the canonical "what depends on what" map.

## The contract layer

Five files define the entire inter-layer surface. Most changes start here:

| File | Defines |
|------|---------|
| `src/shared/types.ts` | All domain DTOs + the `AppEvent` union the renderer consumes |
| `src/shared/schemas.ts` | Zod: the preflight analysis schema + every IPC input validator |
| `src/main/contracts.ts` | `EventBus`, `SecureTokenStore`, `CodexRuntime`, `TaskManager` |
| `src/main/db/types.ts` | `Database` + every repository interface |
| `src/main/providers/GitProvider.ts` | The provider abstraction (GitHub implements it) |

This contract-first layout is deliberate: an agent can understand the whole system by reading these five files, and the layers were originally built in parallel against them.

## Key data flows

### Connect GitHub (GitHub App device flow)
`handlers.startAddAccount` → `GitHubProvider.startAuthFlow` returns a user code immediately, then `awaitAuthFlow` polls GitHub's token endpoint in the background. We authenticate with a **GitHub App** user-to-server token via device flow — public Client ID, **no client secret and no private key** (ADR-0007, supersedes ADR-0002). The device-code request sends **no `scope`** (Apps use fine-grained permissions). On success it fetches the user and `AccountService.saveAuthenticatedAccount` stores the full credential — access token, **refresh token**, and expiry timestamps — as a JSON blob in the keychain, with metadata in SQLite, then emits an `account.added` AppEvent. The modal is event-driven; if the App isn't installed on any repos yet (`hasInstallations` is false) it shows a "Choose repositories" step linking to `github.com/apps/<slug>/installations/new`.

**Token refresh (F-1=ON):** access tokens are short-lived. `AccountService.getToken` transparently refreshes within 60s of expiry via `GitHubAuthService.refresh` (a `TokenRefresher` injected at construction); `GitHubApiClient.call` also force-refreshes and retries once on a 401. If the refresh token itself is dead, the account is flagged `needsReauth`.

**Repo access is installation-scoped:** `GitHubApiClient.listAllRepos` aggregates repos across the user's App installations (`apps.listInstallations*`), and `GitHubProvider` sorts/paginates/filters them client-side (we don't use `search.repos`, which is unreliable under an App token). Legacy classic-OAuth accounts (detectable by their stored `scopes`) are flagged `needsReauth` on launch (ADR-0007 Part C).

### Open a PR workspace
`PullRequestContextService.openWorkspace` fetches the PR context via the provider, builds a **normalized diff** (local git cache preferred via `RepoCacheService`, GitHub API patch fallback — ADR-0003), computes a deterministic `filesHash`, then `findOrCreate`s a **snapshot** (baseSha + headSha + filesHash). Preflight/draft/review-status rows are looked up against that snapshot to derive the `LocalPrReviewState` and staleness flags. The snapshot is how we detect "the PR changed since you reviewed it".

### Preflight & AI review (Codex)
A PR service calls `CodexRuntime.runTask({ taskId, model, reasoningEffort, prompt, onDelta, onActivity, signal })`. Under the hood: `CodexProviderService` → `CodexAdapter.runTurn` starts a **fresh thread per task** and a turn, then streams. `onDelta` carries answer text; `onActivity` carries human-readable progress lines (produced by the pure `ActivityTranslator` in `codexActivity.ts`). PR services map both onto `AppEvent`s (`task.content.delta`, `task.log`, phase/completed/failed) that the renderer's task store consumes. Preflight output is JSON, validated against `PreflightAnalysisSchema`, with one repair pass before failing (raw output is always kept). Review output is markdown, streamed and continuously persisted to SQLite + disk so it survives a crash.

### Submit
`ReviewSubmissionService.submit` posts the (edited) markdown as one GitHub review (event `COMMENT` by default — ADR-0004, no inline comments in MVP), marks the draft `submitted`, and sets the snapshot's review status to `reviewed` with the head SHA. On failure the draft is preserved for retry.

## The Codex integration (the subtle part)

`codex app-server` speaks JSON-RPC 2.0 over newline-delimited stdio. The protocol is **real and authoritative** — regenerate the bindings any time with `codex app-server generate-ts -o <dir>` (or `generate-json-schema`). We verified our usage against 0.140.x: methods (`initialize`, `thread/start`, `turn/start`, `model/list`, `account/read`) and notifications (`thread/started`, `turn/started`, `item/agentMessage/delta`, `turn/completed`) all match.

Layering inside `codex/`:
- **`CodexProcessManager`** — owns the long-lived child process, request/response correlation by id, and notification routing. `routeNotification` forwards *every* notification to the active handler; `shouldLogUnhandled` only governs debug-log noise (so high-frequency reasoning deltas don't spam).
- **`CodexAdapter.runTurn`** — orchestrates one thread+turn, accumulates answer text, handles `systemError` and abort/interrupt, and runs each notification through the pure `ActivityTranslator` for the live-activity feed.
- **`CodexProviderService`** — implements the `CodexRuntime` contract; binary detection, auth/model status, and `runTask`.

Caveat: the manager's `onNotification` is single-handler (last wins), so turns are assumed sequential. The detection latency on a turn (30s–2min) is inherent to the model; the activity feed exists so it doesn't *look* stuck.

## Persistence

`better-sqlite3` (synchronous) at `<userData>/review-master.sqlite`, with repositories implementing `db/types.ts`. We use better-sqlite3 directly rather than Drizzle at runtime (ADR-0005) for simplicity. Generated review markdown is also written under the app data dir. On launch, `Services.ts` reaps `running` preflight/review rows older than a timeout and marks them `interrupted` (crash recovery).

## Security summary

contextIsolation + `sandbox: true` + no nodeIntegration; tokens only in keytar; Zod on every IPC input; path access constrained by `SafePaths`; secret redaction in logs; sanitized markdown render. See the invariants list in `AGENTS.md`.
