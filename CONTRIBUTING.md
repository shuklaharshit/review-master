# Contributing

Workflows for working in Review Master. Read [`AGENTS.md`](./AGENTS.md) and [`ARCHITECTURE.md`](./ARCHITECTURE.md) first.

## Setup

```bash
nvm use                  # uses the Node version pinned in .nvmrc (Node 22)
yarn install            # builds native modules (better-sqlite3, keytar) for Electron
# Install + log in to Codex once, in a terminal:
npm install -g @openai/codex && codex login
yarn dev
```

No GitHub config needed: the app's public GitHub App identity (client id + slug) is baked into `src/shared/constants.ts` — neither is a secret (device flow, no client secret/private key). To target your **own** GitHub App instead, set `REVIEW_MASTER_GITHUB_CLIENT_ID` / `REVIEW_MASTER_GITHUB_APP_SLUG` in a local `.env` (git-ignored, loaded by `src/main/loadEnv.ts`); they override the baked-in defaults.

## Before every commit

```bash
yarn typecheck && yarn test
```

Both must pass. `typecheck` covers main (node) and renderer (web) projects.

## Git hooks (husky)

`yarn install` sets up local hooks (via the `prepare` script) that enforce the policy in `AGENTS.md`:
- **`pre-push`** runs `yarn typecheck && yarn test` — a push with failing typecheck/tests is blocked.
- **`commit-msg`** rejects any commit message containing a `Co-Authored-By:` trailer (and empty messages).

These are a local backstop; CI is the authoritative gate. In a genuine emergency you can bypass with `git commit --no-verify` / `git push --no-verify`, but don't make a habit of it.

## Spec vs. code

`mvp-requirements.md` is the original product intent and is allowed to be behind the code. **The code is the source of truth.** If you change behavior that the spec describes, prefer updating `AGENTS.md`/`ARCHITECTURE.md` over editing the spec; treat the spec as a historical design doc.

## Recipe: add an IPC method end-to-end

The renderer↔main contract is explicit, so a new call touches a predictable set of files:

1. **Type it** in `src/shared/types.ts` (params + result DTOs) and add a Zod input validator in `src/shared/schemas.ts`.
2. **Name the channel** in `src/main/ipc/channels.ts` under the right group.
3. **Expose it** on `window.reviewMaster` in `src/preload/api.ts` (use `invoke<Result>(IPC.group.name, params)`).
4. **Handle it** in `src/main/ipc/handlers.ts` with `on(channel, Schema, (input) => service.method(input))` (or `onPlain` for no-input). The envelope + error wrapping is automatic.
5. **Implement** the logic in the relevant service (constructed in `src/main/Services.ts`).
6. **Consume it** in the renderer via a hook in `src/renderer/queries/` using `lib/api.ts`.

Never call a service or external API from the renderer directly.

## Recipe: add a git provider (e.g. GitLab)

1. Implement the `GitProvider` interface (`src/main/providers/GitProvider.ts`) under `src/main/providers/gitlab/` (mirror the `github/` layout: auth, api client, mapper, provider).
2. Register it in `GitProviderRegistry` and construct it in `Services.ts`.
3. Flip its `available` flag in the registry's `available()` list so the UI stops showing "Coming soon".
4. Keep all provider-specific quirks inside that folder — the rest of the app only knows the interface.

## Recipe: debug a Codex turn

- Logs: `electron-log` writes to the app data `logs/` dir; console is at `debug` in dev. Secrets are redacted.
- The protocol is authoritative — regenerate bindings to check shapes:
  ```bash
  codex app-server generate-ts -o /tmp/codex-proto       # TypeScript types
  codex app-server generate-json-schema                  # JSON Schema
  ```
  `ClientRequest.ts` lists every request method; `ServerNotification.ts` every notification.
- If the progress modal looks stuck: a turn legitimately takes 30s–2min. Confirm the live-activity feed is moving (reasoning/token lines). If notifications aren't reaching the UI, check `CodexProcessManager.routeNotification` (it should forward everything) and the `ActivityTranslator` (`codex/codexActivity.ts`).
- One thread per task; turns are assumed sequential (single notification handler).

## Testing

- Vitest, colocated under `__tests__/`. Run `yarn test` / `yarn test:watch` (default suite; DB tests excluded).
- Unit-test pure logic directly (diff parsing, hashing, mappers, the activity translator, Zod schemas).
- Test services with small `vi.fn()` fakes for `Database` / `GitProvider` / `CodexRuntime`. The reference example is `src/main/pr/__tests__/ReviewSubmissionService.test.ts`.
- Renderer component tests use jsdom via a `// @vitest-environment jsdom` first-line docblock.
- **DB repository tests** run against real in-memory SQLite and load native `better-sqlite3`. Because `yarn install` builds it for Electron's ABI, run them under Node like this:
  ```bash
  npm rebuild better-sqlite3 --update-binary   # fetch the Node-ABI prebuilt
  yarn test:db
  yarn rebuild:electron                          # restore the Electron build so `yarn dev` works
  ```
  CI runs them in a separate `test-db` job. Never add native-module-loading tests to the default suite.
  - **Node version matters for this step.** `--update-binary` fetches a prebuilt `better-sqlite3` for your Node ABI. **Node 20 and 22 have prebuilts and work out of the box** (use the pinned Node 22 via `nvm use`). **Node 24 has no prebuilt yet** for our `better-sqlite3` version, so it falls back to a source compile that fails on Python 3.12 unless you `pip install setuptools` first — easiest is to just run the DB tests on Node 22.
- Do not write tests that hit the network, the real `codex` process, or real git.

## Commit messages

Write messages that give full context to a future reader: a clear subject line, then a body explaining the problem, the cause, and the per-area changes (and the "why", not just the "what"). One logical change per commit.

## Code style

TypeScript strict. DI via constructors (wired in `Services.ts`); don't `new` services ad hoc. Renderer state in `stores/`, server access in `queries/`, presentational components. Respect the invariants in `AGENTS.md` — especially: the renderer never touches tokens/Codex/git/fs/APIs directly.
