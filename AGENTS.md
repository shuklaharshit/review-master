# AGENTS.md

Orientation for AI agents (and humans) working in **Review Master** — an Electron desktop app for AI-assisted GitHub PR reviews, powered by the Codex App Server. Read this first. For the deeper "why", see [`ARCHITECTURE.md`](./ARCHITECTURE.md); for workflows, see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

> **Source of truth:** the **code is truth**. `mvp-requirements.md` is the original product/spec intent and may lag the code (e.g. auth UX, the Codex live-activity feed already evolved past it). When they disagree, trust the code and update the docs.

---

## What this app is

A three-process Electron app: a React renderer (UI), a typed preload bridge, and a trusted Node main process that owns all I/O (GitHub, Codex, git, SQLite, the OS keychain). The user connects GitHub, picks a PR, Codex generates a "preflight" review map + risks, then an editable markdown review that is submitted as one GitHub PR review body. GitHub only in MVP; GitLab/Bitbucket are stubbed.

## Commands

```bash
yarn install          # deps (native modules: better-sqlite3, keytar — rebuilt for Electron via postinstall)
yarn dev              # run the app with hot reload
yarn typecheck        # tsc for BOTH main (node) and renderer (web) — run this before committing
yarn test             # vitest unit tests
yarn test:watch       # vitest watch
yarn build            # production build (electron-vite): out/main, out/preload, out/renderer
```

Always run `yarn typecheck && yarn test` before committing. There are two TS projects: `tsconfig.node.json` (main + preload + shared) and `tsconfig.web.json` (renderer + shared).

## Repository map

```
src/
  shared/            # cross-process contracts — types.ts, schemas.ts (Zod), constants.ts, result.ts, ids.ts, dates.ts
  preload/           # typed bridge: api.ts (window.reviewMaster), index.ts (contextBridge), index.d.ts
  main/              # trusted Node control plane
    index.ts         #   app entry + BrowserWindow (loads ./loadEnv FIRST)
    Services.ts      #   the DI container — where every service is constructed & wired
    contracts.ts     #   EventBus, SecureTokenStore, CodexRuntime, TaskManager interfaces
    ipc/             #   channels.ts (channel names) + handlers.ts (Zod-validated handler registration)
    app/             #   Logger, SettingsService, AppBootstrapService, UpdateService, TaskRegistry, EventBusImpl
    auth/            #   SecureTokenService (keytar), AccountService
    codex/           #   CodexProcessManager → CodexAdapter → CodexProviderService; codexActivity, prompts/
    providers/       #   GitProvider.ts (interface) + GitProviderRegistry + github/ (provider, auth, api, mapper)
    pr/              #   PullRequestContextService, DiffService/diffParser, Preflight/AiReview/ReviewSubmission services
    db/              #   db.ts (better-sqlite3), schema.ts, types.ts (repository interfaces), repositories/
    security/        #   safePaths, redaction, markdownSanitizer
  renderer/          # React UI — routes/, components/{ui,layout,review,account}/, stores/ (zustand), queries/ (TanStack)
```

Folder `src/main/codex/__tests__`, `src/main/pr/__tests__`, etc. hold colocated Vitest specs.

## Non-negotiable invariants

These are the boundaries that keep the app secure and maintainable. Do not cross them.

1. **The renderer is untrusted.** It must NEVER access GitHub tokens, spawn Codex, run git, touch the filesystem, or call the GitHub/Codex APIs directly. It talks ONLY to `window.reviewMaster` (see `src/preload/api.ts`).
2. **Tokens live only in the OS keychain** (keytar), keyed `review-master.github.account.<id>`. Never store a token in SQLite, logs, the renderer, or a git URL. Logs are redacted (`src/main/security/redaction.ts`).
3. **Contracts are load-bearing and shared.** `src/shared/types.ts`, `src/shared/schemas.ts`, `src/main/contracts.ts`, `src/main/db/types.ts`, and `src/main/providers/GitProvider.ts` define the surface every layer implements against. Change them deliberately and update all implementors.
4. **All IPC inputs are validated with Zod in `handlers.ts`** before reaching a service. Every handler returns the envelope `{ ok: true, value } | { ok: false, error }`; the preload unwraps it.
5. **GitHub-specific logic stays in `providers/github/`. Codex raw protocol stays in `codex/`.** UI consumes only canonical `AppEvent`s (see `shared/types.ts`), never raw Codex notifications.
6. **All generated AI content is saved locally and is recoverable after restart** (drafts stream to SQLite + disk; stuck `running` tasks are reaped on launch in `Services.ts`).
7. **Markdown preview is sanitized** (`rehype-sanitize`, raw HTML disabled).

## Build/runtime gotchas (these have bitten us)

- **Preload must be CommonJS.** `package.json` is `"type": "module"`, so `electron.vite.config.ts` forces the preload to emit `out/preload/index.js` as CJS — a sandboxed (`sandbox: true`) preload cannot be ESM. Don't "simplify" this.
- **GitHub Client ID is required and public.** Device-flow login uses `REVIEW_MASTER_GITHUB_CLIENT_ID` (a public OAuth Client ID — not a secret). Set it in `.env` (loaded by `src/main/loadEnv.ts`, which is imported FIRST in `index.ts` so it populates `process.env` before `shared/constants.ts` reads it) or paste it into `constants.ts`. The default is a placeholder; login won't complete without a real one.
- **Codex device-flow detection has a ~3-5s floor** — that's GitHub's polling interval, not a bug.
- **Codex protocol is real and verified.** The `codex app-server` JSON-RPC protocol is authoritative; regenerate it any time with `codex app-server generate-ts -o <dir>` or `generate-json-schema`. Our method names (`initialize`, `thread/start`, `turn/start`, `model/list`, `account/read`) and notifications (`thread/started`, `turn/started`, `item/agentMessage/delta`, `turn/completed`) match 0.140.x. `CodexProcessManager.routeNotification` forwards ALL notifications to the adapter; the SUPPORTED/IGNORED lists only quiet the debug log (`shouldLogUnhandled`).
- **A Codex preflight/review turn takes 30s–2min.** That is normal, not a hang. Progress is surfaced via the live-activity feed (`codexActivity.ts` → `task.log` events → ProgressModal).

## Conventions

- TypeScript strict; no `any` in renderer component props. Raw Codex protocol parsing may use loose casts (`as Record<string, unknown>`) — it's untyped JSON.
- Services take dependencies via the constructor (DI); they are constructed once in `Services.ts`. Don't `new` a service ad hoc.
- Repositories are synchronous (better-sqlite3). Return `null` (not `undefined`) where the interface says `| null`.
- Renderer: state in `stores/` (zustand), server calls in `queries/` (TanStack Query) via `lib/api.ts`. Components stay presentational.
- Styling: Tailwind + the "Midnight Graphite" CSS variables in `styles/globals.css`. Borders over shadows; colour for state/severity only.

## Common recipes

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for step-by-step recipes: adding an IPC channel end-to-end, adding a git provider, and debugging a Codex turn.

## Testing expectations

Tests are Vitest, colocated in `__tests__/`, node environment. Pure logic (diff parsing, hashing, mappers, the activity translator, Zod schemas) is unit-tested directly. Services are tested with small `vi.fn()` fakes for `Database`/`GitProvider`/`CodexRuntime` — see `src/main/pr/__tests__/ReviewSubmissionService.test.ts` for the reference pattern. Do not write tests that touch the network, the real Codex process, or real git.
