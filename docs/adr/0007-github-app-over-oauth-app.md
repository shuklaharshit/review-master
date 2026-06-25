# 0007 — GitHub App over classic OAuth App

**Status:** Accepted — implemented & live-verified (supersedes [0002](./0002-github-device-flow.md))

## Context
The classic OAuth App (ADR-0002) has two real-world problems:
- **Org OAuth-app access restrictions:** orgs that enable them require explicit **org-owner** approval for any OAuth App before it can access their repos, regardless of the user's repo permissions. A repo admin who isn't an org owner can only *request* approval (observed on the `circleup-app` org); an owner sees *grant*.
- **Over-broad scope:** classic OAuth has no read-only private scope, so the minimum is `repo` ("full control of all private repositories") — excessive and alarming.

GitHub Apps solve both with fine-grained permissions and **per-repository installation** (the Netlify/Vercel model).

## Decision
Authenticate with a **GitHub App** using the **device-flow user-to-server token** — no client secret and **no private key on the client**, so we remain backend-free (ADR-0001). We do **not** use installation access tokens (those need the app private key → a backend, and attribute actions to a bot). The user-to-server token acts as the human, limited to the app's fine-grained permissions and the repos the app is installed on; this also gives correct review attribution.

Repository permissions: Contents (**read/write**), Pull requests (read/write), Issues (**read/write**), Metadata (read), Checks (read), Commit statuses (read). Repo access is governed by app installation + repo selection rather than org-wide OAuth approval.

The MVP only *reads* Contents and only *reads* PR labels, so a stricter minimum would be Contents-read + PR-write + Metadata/Checks/Statuses-read. We deliberately provision two grants wider than the MVP needs, because changing a GitHub App's permissions later forces **every installation to re-consent**, and these features are firmly on the roadmap:
- **Contents: read → read/write** — enables merging a PR ("accept changes") from inside the app; merge requires Contents-write + PR-write.
- **Issues: read/write** — the repo-wide label catalog (`GET /repos/{o}/{r}/labels`) and label creation live under the *Issues* permission, not *Pull requests*; also covers commenting on the PR conversation timeline. (PR-scoped label add/remove is already covered by PR-write, but listing the catalog to choose from is not.)

Still excluded (add only when a feature demands it, accepting the re-consent cost): **Actions: read/write** (re-run CI checks), and all Organization/Account permissions — we dropped the old `read:org` usage entirely; user identity comes from `GET /user`, which needs no Account permission.

## Consequences
- Removes the org OAuth-restriction friction; drops the "full control of private repositories" scope.
- Repo listing changes to **installation-scoped** endpoints (`apps.listInstallationsForAuthenticatedUser` + `apps.listInstallationReposForAuthenticatedUser`); the app needs an onboarding/settings step to **install / configure repository access**.
- Existing OAuth-App accounts must **re-auth** after the switch (no local data lost).
- User-token expiration is initially **off** for simplicity; refresh-token handling is a hardening follow-up. See the full plan in [`docs/github-app-migration.md`](../github-app-migration.md).
