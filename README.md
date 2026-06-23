# Review Master

**AI-assisted PR reviews, powered by Codex.**

Review Master is an open-source Electron desktop app for developers who review pull requests. It connects to GitHub, lists repositories and PRs, analyses a selected PR with the **Codex App Server**, organises changed files into a guided review order, surfaces high-level risks, generates an editable markdown review draft, and submits it as a single GitHub PR review.

> Review Master turns a chaotic PR diff into a guided review workflow: context first, files in the right order, risks surfaced early, and a final editable markdown review only after the human has reviewed the change.

## Architecture

A trusted Electron **main process** is the control plane. The **renderer** never touches tokens, Codex, git, the filesystem, or the GitHub/Codex APIs directly — it talks only to a typed IPC bridge.

```
Renderer (React) ── typed IPC (preload) ──▶ Main process
                                              ├── App services (bootstrap, settings, updates)
                                              ├── Git provider registry → GitHubProvider (Octokit, device-flow auth)
                                              ├── Codex runtime (CodexProcessManager → `codex app-server`)
                                              ├── PR services (context, diff, preflight, AI review, submission)
                                              ├── SQLite (better-sqlite3) local persistence
                                              └── Secure token storage (keytar / OS keychain)
```

- **Codex** is integrated via a long-lived `codex app-server` child process speaking JSON-RPC over stdio. The renderer only ever sees canonical app events.
- **GitHub auth** is self-contained (OAuth device flow, no embedded secret, no dependency on `gh`). Tokens live in the OS keychain, never in SQLite, logs, or the renderer.
- **Diff** uses a local git repo cache when available, falling back to GitHub's API patches.

## Prerequisites

- Node.js 20+
- [Yarn](https://classic.yarnpkg.com/) (this project uses Yarn strictly)
- [Codex CLI](https://github.com/openai/codex): `npm install -g @openai/codex`, then `codex login`
- `git` on PATH (recommended; otherwise GitHub API patch fallback is used)

## Development

```bash
yarn install
yarn dev          # launch the app with hot reload
yarn typecheck    # tsc for main + renderer
yarn test         # vitest unit tests
yarn build        # production build (electron-vite)
```

To package installers locally: `yarn build && yarn electron-builder`.

## Configuration

Set `REVIEW_MASTER_GITHUB_CLIENT_ID` to your registered GitHub OAuth app client id (device flow enabled). The default in `src/shared/constants.ts` is a placeholder.

## MVP scope

GitHub only; GitLab/Bitbucket are stubbed as "Coming soon". The review is submitted as one PR review body (event `COMMENT`) — inline comments are intentionally out of scope. See `mvp-requirements.md` for the full specification.

## License

MIT
