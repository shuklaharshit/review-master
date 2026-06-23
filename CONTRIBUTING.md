# Contributing

Workflows for working in Review Master. Read [`AGENTS.md`](./AGENTS.md) and [`ARCHITECTURE.md`](./ARCHITECTURE.md) first.

## Setup

```bash
yarn install            # builds native modules (better-sqlite3, keytar) for Electron
cp .env.example .env     # set REVIEW_MASTER_GITHUB_CLIENT_ID (public OAuth Client ID)
# Install + log in to Codex once, in a terminal:
npm install -g @openai/codex && codex login
yarn dev
```

A real GitHub OAuth **Client ID** is required for login (see `.env.example` for how to register one — tick "Enable Device Flow"). It is public, not a secret.

## Before every commit

```bash
yarn typecheck && yarn test
```

Both must pass. `typecheck` covers main (node) and renderer (web) projects.

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

- Vitest, colocated under `__tests__/`, node environment. Run `yarn test` / `yarn test:watch`.
- Unit-test pure logic directly (diff parsing, hashing, mappers, the activity translator, Zod schemas).
- Test services with small `vi.fn()` fakes for `Database` / `GitProvider` / `CodexRuntime`. The reference example is `src/main/pr/__tests__/ReviewSubmissionService.test.ts`.
- Do not write tests that hit the network, the real `codex` process, or real git.

## Commit messages

Write messages that give full context to a future reader: a clear subject line, then a body explaining the problem, the cause, and the per-area changes (and the "why", not just the "what"). One logical change per commit.

## Code style

TypeScript strict. DI via constructors (wired in `Services.ts`); don't `new` services ad hoc. Renderer state in `stores/`, server access in `queries/`, presentational components. Respect the invariants in `AGENTS.md` — especially: the renderer never touches tokens/Codex/git/fs/APIs directly.
