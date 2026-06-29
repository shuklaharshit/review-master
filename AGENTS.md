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
- **GitHub auth is a GitHub App, not an OAuth App** (ADR-0007, supersedes ADR-0002). Device-flow login uses a public GitHub App **Client ID** (`Iv23…` — not a secret; **no client secret, no private key**) and an App **slug** (for the install URL). Both are **public, not secrets**, so the canonical "Review Master" App (`review-master-ai`) is **hardcoded in `shared/constants.ts`** (`GITHUB_CLIENT_ID` / `GITHUB_APP_SLUG`) — a clone works out of the box and everyone shares one installation. A fork points at its own App by editing those two constants (there's no env indirection — `loadEnv` was removed). The device-code request sends **no `scope`** — Apps use fine-grained permissions, and repo access is **installation-scoped** (the App is installed per-repo). User tokens **expire and are refreshed** transparently by `AccountService` (refresh token + expiries live in the keychain alongside the access token). See `docs/github-app-migration.md`.
- **Codex device-flow detection has a ~3-5s floor** — that's GitHub's polling interval, not a bug.
- **Codex protocol is real and verified.** The `codex app-server` JSON-RPC protocol is authoritative; regenerate it any time with `codex app-server generate-ts -o <dir>` or `generate-json-schema`. Our method names (`initialize`, `thread/start`, `turn/start`, `model/list`, `account/read`) and notifications (`thread/started`, `turn/started`, `item/agentMessage/delta`, `turn/completed`) match 0.140.x. `CodexProcessManager.routeNotification` forwards ALL notifications to the adapter; the SUPPORTED/IGNORED lists only quiet the debug log (`shouldLogUnhandled`).
- **A Codex preflight/review turn takes 30s–2min.** That is normal, not a hang. Progress is surfaced via the live-activity feed (`codexActivity.ts` → `task.log` events → ProgressModal).
- **`requestAnimationFrame` is suspended while the Electron window is `hidden`/occluded** (on macOS an occluded `BrowserWindow` reports `document.visibilityState === 'hidden'`). Anything driven by rAF can silently stall — both first paint AND ongoing updates. The full-file minimap (`DiffMinimap.tsx`) hit this twice (blank canvas, then frozen-on-scroll). Two defenses, both in place: (1) the minimap draws **synchronously** (no rAF) on mount/scroll/resize — the draw is cheap (only the visible line window) and scroll events are already frame-coalesced; (2) the BrowserWindow sets `webPreferences.backgroundThrottling: false` (`src/main/index.ts`) so rAF/timers aren't throttled when occluded. Prefer synchronous draws (not rAF) for any future canvas/animation work.

## Conventions

- TypeScript strict; no `any` in renderer component props. Raw Codex protocol parsing may use loose casts (`as Record<string, unknown>`) — it's untyped JSON.
- Services take dependencies via the constructor (DI); they are constructed once in `Services.ts`. Don't `new` a service ad hoc.
- Repositories are synchronous (better-sqlite3). Return `null` (not `undefined`) where the interface says `| null`.
- Renderer: state in `stores/` (zustand), server calls in `queries/` (TanStack Query) via `lib/api.ts`. Components stay presentational.
- Styling: Tailwind + CSS variables in `styles/globals.css`. Borders over shadows; colour for state/severity only.
- **Branding.** The app mark is "Review Note" — a review bubble over a +/- diff. The header renders it via `components/layout/Logo.tsx` (`DEFAULT_LOGO` selects the concept; three alternates ship in the same file). App icons live in `build/` (`icon.icns` / `icon.ico` / `icon.png`), auto-detected by electron-builder, and are regenerated by `build/make-icons.sh` — the source of truth for the artwork. That script draws with ImageMagick *primitives*, not by rasterising an SVG: the macOS ImageMagick has no librsvg delegate, so SVG gradients render black. To change the icon, edit the draw pipeline in that script and re-run it.
- **Design themes are CSS-variable swaps, never layout changes.** Five skins (`graphite` default, `paper`, `nocturne`, `carbon`, `sandstone`) live as `:root[data-rm-theme='…']` blocks that override only design tokens (colour, `--font-sans`/`--font-mono`/`--font-display`, `--radius-*`, `--app-font-size`). Tailwind's `colors`, `fontFamily`, and `borderRadius` all resolve to these vars, so the whole app re-skins from one attribute. Fonts are macOS system faces (CSP forbids remote fonts). Keep every component styled via tokens (`bg-background`, `text-text-primary`, `rounded-md`, `font-mono`) — a hardcoded hex won't follow the theme. For anything sitting ON an `--accent` fill (primary buttons, number chips) use `text-accent-foreground`, never `text-white`: light accents (carbon lime, nocturne periwinkle, sandstone amber) set a dark foreground so the label stays readable.
- **The review workspace is a self-contained PR hub.** The centre panel (`PrDiffPanel`) has three live tabs: **Files** (diff), **Commits** (`CommitsTab`, from `workspace.context.commits`), and **Discussion** (`ConversationTab`). The Discussion data comes from `api.prs.getConversation` → `GitHubProvider.getPullRequestConversation` (issue comments + reviews-with-bodies + inline `ReviewCommentThread`s, grouped by `buildReviewThreads`); it's a separate TanStack query (`useConversation`, key `queryKeys.conversation`), fetched live (not cached in SQLite) and reused for both the tab and the inline threads/count badge on the diff.
- **Inline review comments use GitHub's "pending review" model.** Drafting comments on diff lines live ONLY in the renderer (`pendingReviewStore`, keyed by snapshot id, reset on snapshot change) until the review is submitted; they're then batched into the GitHub review as line-based `comments[]`. `DiffRows`/`DiffViewer` render the "+" affordance + composer (gated on `onViewFullFile` so the full-file modal stays read-only). Anchor mapping: additions/context → `RIGHT`/newLine, deletions → `LEFT`/oldLine (`lineAnchor`). Two submit surfaces share `ReviewEventSelector` + `PendingCommentsList`: `ReviewDraftModal` (AI draft + comments) and `SubmitReviewModal` (hand-authored, via `api.review.finishReview` → `ReviewSubmissionService.finishReview`, no draft needed). Both inject branding via the existing `performSubmit` path.
- **Self-PR guard mirrors GitHub.** `useIsOwnPr` compares the PR author login to the viewer's login (`bootstrap.accounts` keyed by `ref.accountId`); when true (or the PR is closed/merged) the selector disables Approve / Request changes and only allows Comment. GitHub also enforces this server-side (mapped to `no_permission`), so it's defence-in-depth, not the only check.
- **A bare Approve carries no comment.** The empty-review guard is event-aware: APPROVE may be submitted with no body and no inline comments; COMMENT / REQUEST_CHANGES still require a body or at least one inline comment. `performSubmit` only injects the attribution footer when the body is non-empty, so "approve, no comment" posts a genuinely empty body (not a footer-only comment). The always-visible **Review changes** button in the PR header (open PRs) opens the review modal regardless of whether an AI draft or pending comments exist.
- **Merge is in-app** (`prs:merge` → `GitHubProvider.mergePullRequest` → `octokit.pulls.merge`). The header **Merge** button (open PRs only; disabled with a tooltip for draft PRs or `mergeable === false`) opens `MergeModal` — a method picker (squash default / merge / rebase) with optional commit title+message for squash/merge. Not-mergeable / conflict errors (405/409) are mapped to a recoverable `merge_failed`; success invalidates the workspace so the merged state refreshes. Merging your own PR is allowed (no self guard, unlike reviews).
- **Theme persistence is renderer-local (localStorage), deliberately NOT a backend setting.** It must apply *before first paint* (`main.tsx` calls `applyDesignTheme(loadStoredTheme())`) to avoid a flash; backend settings arrive async over IPC and can't meet that. `lib/designThemes.ts` is the framework-free registry + persistence (also holds each theme's `preview` palette — a few values mirrored from globals.css, keep in sync). `appStore.setDesignTheme` writes `data-rm-theme` and mirrors the choice for the UI. Surfaces: `ThemeSwitcher` (header quick-toggle, hidden on onboarding) and the shared `ThemePicker` gallery used in **Settings → Appearance** and **Onboarding**.

## Definition of Done (binding — read before finishing any task)

A change in this repo is "done" only when ALL of the following hold. Future agents: treat this as binding, not advisory.

**Code & comments — write for the next agent who has zero context**
- Match the surrounding style, naming, and comment density. Comment the *why*, not the *what* — explain non-obvious decisions, invariants, and cross-layer wiring so the next reader doesn't have to reverse-engineer intent.
- Give every new module/service and every non-trivial function a short header or JSDoc stating its purpose and where it sits in the layering (the existing files set the bar).
- Keep the contract-first discipline: changes usually start in the shared contracts (`shared/types.ts`, `shared/schemas.ts`, `main/contracts.ts`, `db/types.ts`, `providers/GitProvider.ts`); when you touch one, update every implementor.
- Respect the non-negotiable invariants above. Never cross the renderer/main boundary.

**Docs — the code is truth; keep docs in sync in the SAME change**
- If you change behavior these docs describe, update them as part of the change: `AGENTS.md`, `ARCHITECTURE.md`, and add (or supersede) an ADR in `docs/adr/` for load-bearing decisions. A stale doc is a bug.

**Tests — required, not optional**
- After any change, run `yarn typecheck && yarn test` and get them green before considering the task done. If you touched the DB layer (`src/main/db`), also run `yarn test:db` (see Testing expectations for the Node/ABI note).
- Add or update tests for what you changed: new logic → new tests; changed behavior → updated tests; bug fix → a regression test that fails before the fix and passes after. Follow the established patterns (pure unit; mocked-deps services per `ReviewSubmissionService.test.ts`; jsdom components).
- Never delete or weaken a test just to make it pass — fix the code, or change the expectation deliberately and explain why.

**Commits — only when asked, with real context**
- Commit ONLY when the user explicitly asks.
- Write a message a future human or agent can learn from: a concise imperative subject line, then a body covering the problem/why, the approach, the per-area changes, and how it was verified (typecheck/tests). Reference the relevant ADR or finding. One logical change per commit.
- Do NOT add `Co-Authored-By` or any extra co-author trailers to commits.

## Common recipes

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for step-by-step recipes: adding an IPC channel end-to-end, adding a git provider, and debugging a Codex turn.

## Testing expectations

Tests are Vitest, colocated in `__tests__/`. Pure logic (diff parsing, hashing, mappers, the activity translator, Zod schemas) is unit-tested directly. Services are tested with small `vi.fn()` fakes for `Database`/`GitProvider`/`CodexRuntime` — see `src/main/pr/__tests__/ReviewSubmissionService.test.ts` for the reference pattern. Renderer component tests opt into jsdom with a `// @vitest-environment jsdom` docblock as the file's first line (see `src/renderer/components/review/__tests__/`). Do not write tests that touch the network, the real Codex process, or real git.

- `yarn test` runs the default suite (services with fakes, pure logic, renderer). It **excludes** the DB tests.
- `yarn test:db` runs the `src/main/db/__tests__` repository tests against real in-memory SQLite — these load native `better-sqlite3`, which `yarn install` builds for **Electron's** ABI, so running them under plain-Node Vitest needs a Node-ABI rebuild first: `npm rebuild better-sqlite3 --update-binary && yarn test:db`, then `yarn rebuild:electron` to restore the app's build. CI runs them in a dedicated `test-db` job. **Don't add native-module-loading tests to the default suite** — it would break `yarn test`/CI and the Electron app's build.
- **Keep native modules out of the default suite's *import graph*, not just its tests.** `keytar` links `libsecret-1.so.0` on Linux and crashes the CI runner at load time. That's why the keychain key helpers live in the keytar-free `src/main/auth/tokenKeys.ts` — so `AccountService` (and its tests) can use them without importing `SecureTokenService` (the only keytar importer). If a default-suite test starts failing to load with a `libsecret`/`.node` error, something re-coupled a pure module to a native one — fix the import, don't install the lib in CI.
