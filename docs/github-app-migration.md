# Plan: Migrate auth from classic OAuth App → GitHub App

> **Status:** Implemented (Parts B–E) and live-verified (real device-flow login + install + repo search confirmed working). Tracked by [ADR-0007](./adr/0007-github-app-over-oauth-app.md), which supersedes [ADR-0002](./adr/0002-github-device-flow.md).
> **App registered** with decisions F-1=ON (refresh tokens) and F-3="Any account". No private key generated (not needed — device flow / user-to-server only). The Client ID and slug are **public, not secrets**, so they're **baked into `src/shared/constants.ts`** as the canonical `review-master-ai` App (a clone works out of the box). A fork can override them via `REVIEW_MASTER_GITHUB_CLIENT_ID` / `REVIEW_MASTER_GITHUB_APP_SLUG` (a local `.env` in dev, or the real environment).

## Why

We currently use a **classic OAuth App** with device flow. That subjects us to two problems seen in the wild:

- **Org OAuth-app access restrictions.** When an org enables them, every classic OAuth App needs explicit **org-owner** approval before it can access that org's repos — regardless of the user's repo permissions. A repo admin who isn't an org owner can only **Request** approval (observed for the `circleup-app` org), while an org owner sees **Grant**. This is GitHub policy, but using an OAuth App is what triggers the gate.
- **Over-broad scope.** Classic OAuth has no read-only private scope; the minimum for our use is `repo` = "Full control of all private repositories", which is alarming and excessive.

**GitHub Apps** fix both: fine-grained permissions and **per-repository installation** (the user/org installs the app and picks repos). This is the model Netlify/Vercel use.

## Goal & key constraint

Authenticate via a GitHub App's **device-flow user-to-server token** — **no client secret, no private key on the client** — so we stay backend-free (ADR-0001). We deliberately do **not** use installation access tokens (those require the app private key → a backend, and would attribute reviews to a bot). A user-to-server token acts as the human, limited to the app's permissions and the repos it's installed on — which also gives correct review attribution.

---

## Part A — Create the GitHub App (manual, by the maintainer)

1. **https://github.com/settings/apps → New GitHub App.** (Register under a personal account; can still be installed on orgs and transferred later.)
2. **Name:** `Review Master` (globally unique; add a suffix if taken).
3. **Homepage URL:** any valid URL (repo URL is fine).
4. **Callback URL:** required field; reuse the homepage URL. **✅ Enable Device Flow** (critical).
5. **Webhook:** **uncheck "Active"**.
6. **Repository permissions** (least privilege for the MVP + two roadmap grants — see ADR-0007 rationale):
   - Contents: **Read and write** (read = diff/file context; write = merge a PR / "accept changes")
   - Pull requests: **Read and write** (write = submit the review, manage reviewers/assignees/labels)
   - Issues: **Read and write** (repo-wide label catalog + label creation + PR conversation comments)
   - Metadata: **Read-only** (mandatory; auto-selected)
   - Checks: **Read-only**
   - Commit statuses: **Read-only**
   - *(Everything else — Actions, Administration, Workflows, Secrets, Webhooks, etc. — **No access**. No account/organization permissions: we drop the old `read:org` usage. Add **Actions: Read and write** only if/when a "re-run CI checks" button is built, accepting the per-installation re-consent cost.)*
7. **Where can this app be installed?** "Any account" (product) or "Only on this account" (private MVP). → *decision F-3*
8. **Expire user authorization tokens:** **✅ check this** — decision **F-1 = ON** (secure by default). The app issues a short-lived `access_token` plus a `refresh_token`; we build refresh handling in Part B (see B-2, B-6). → *decision F-1*
9. **Create GitHub App.** From the settings page, record:
   - **Client ID** (e.g. `Iv23...`) → becomes `REVIEW_MASTER_GITHUB_CLIENT_ID`. *(No client secret or private key needed.)*
   - **App slug / install URL:** `https://github.com/apps/<slug>`.
10. Hand the **Client ID** + **slug** to the implementer.

---

## Part B — Code changes (contained to `providers/github/` + small UI)

1. **`shared/constants.ts`** — point `GITHUB_CLIENT_ID` at the GitHub App's client id; **remove `GITHUB_OAUTH_SCOPES`** (Apps use permissions, not scopes); add `GITHUB_APP_SLUG` + an install-URL helper.
2. **`providers/github/GitHubAuthService.ts`** — device flow nearly identical; **stop sending `scope`** in the device-code request. (If token expiration is enabled later, handle `refresh_token`/`expires_in`.) `getAuthenticatedUser` (`GET /user`) unchanged.
3. **`providers/github/GitHubApiClient.ts`** — repo listing moves to installation-scoped:
   - `apps.listInstallationsForAuthenticatedUser` → installations the user can access.
   - `apps.listInstallationReposForAuthenticatedUser({ installation_id })` → repos per installation; aggregate + paginate.
   - add `hasInstallations()` for the UI.
   - PR / files / commits / checks / reviews / labels and **`createReview`** calls unchanged (Octokit + user token).
   - **Repo search:** verify `search.repos` behavior under the App token (scoped to installed repos); fall back to client-side filtering of the installation repo list if needed.
4. **`providers/github/GitHubProvider.ts`** — `awaitAuthFlow` shape unchanged; `listRepositories` delegates to the installation path; everything else stays.
5. **Renderer (`AddAccountModal` + Settings):** after connect, if `hasInstallations()` is false, show a **"Choose repositories"** step with an **Open GitHub to install / configure** button → `https://github.com/apps/<slug>/installations/new`. Add a persistent **"Manage repository access"** link in Settings (the Netlify "Configure" affordance). Refresh the repo list on return.

## Part C — Migrate existing accounts
Existing accounts hold OAuth-App tokens that won't behave under the GitHub App. On launch after the switch, detect the mismatch and mark them **needs re-auth** (state + UI already exist), prompting reconnect. No local data lost (drafts/snapshots are keyed locally, not to the token).

## Part D — Tests
- Unit-test installation aggregation + pagination in `GitHubApiClient` with mocked Octokit (extends the mocked-provider pattern in `ReviewSubmissionService.test.ts`).
- Mapper test if installation-repo shapes differ from current repo shapes.

## Part E — Docs
- ADR-0007 (this change) supersedes ADR-0002.
- Update `AGENTS.md` / `ARCHITECTURE.md` auth sections and `.env.example`.

---

## Open decisions
- **F-1 — Token expiration: DECIDED → ON.** Secure-by-default from day one. Register the app with "Expire user authorization tokens" checked; Part B stores the `refresh_token` in keychain and transparently renews on 401/expiry (~+½ day).
- **F-2 — App ownership:** personal account vs a product/`circleup` org (cosmetic/ownership; doesn't block code).
- **F-3 — Installability: DECIDED → "Any account".** The app is registered under the personal @shuklaharshit account; "Only this account" would block installing it on the **circleup-app org**, which is the original motivation (ADR-0007). "Any account" only controls who *may* install — each install still requires explicit consent + repo selection, and grants access to the installer's own repos only.

## Effort
Core migration (expiration OFF): ~½–1 day, contained to `providers/github/` + a small onboarding/settings UI addition. +½ day if refresh tokens are added in the same pass.
