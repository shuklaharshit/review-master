# Review Master — MVP Requirements & Full Implementation Plan v2

> Build target: **Electron desktop app** using **Codex App Server** as the AI runtime.  
> Intended consumer: **Claude Opus 4.8 / Claude Code**.  
> Product name: **Review Master**.  
> Subtitle: **AI-assisted PR reviews, powered by Codex**.
> v2 update: Review Workspace UI and preflight output are aligned with the provided three-column PR review screenshot: left AI review map, centre GitHub-style PR/diff view, right PR intelligence panel.

---

## 0. How to Use This Document

Implement the application from scratch using this document as the source of truth.

Prioritise:

1. clean architecture,
2. local-first storage,
3. safe authentication handling,
4. stable Codex integration,
5. GitHub MVP support,
6. provider extensibility for GitLab/Bitbucket later,
7. strong developer-focused dark UI.

Do **not** build a custom backend.  
Do **not** submit inline GitHub review comments in MVP.  
Do **submit the generated markdown as one GitHub PR review body**.

---

## 1. Product Summary

Review Master is an open-source desktop app for developers who review pull requests.

The app connects to GitHub, lists repositories and PRs, analyses a selected PR using Codex App Server, organises the changed files into a better human review order, flags high-level risks, generates an editable markdown AI review draft, and lets the user submit that markdown as a GitHub PR review.

The app should feel like a polished developer tool: a mix of GitHub PR review, VS Code/Cursor density, Linear-style UI polish, and Codex/Claude Code-style task progress.

The Review Workspace UI should specifically follow the attached three-column screenshot direction: a compact left review map, a GitHub-like centre PR/diff area, and a right PR intelligence sidebar. The app should feel more like an AI-guided PR review workspace than a simple AI review generator.

---

## 2. MVP Scope

### 2.1 Must Have

- Electron desktop app.
- React + TypeScript renderer.
- Dark developer-focused design system.
- Codex CLI detection.
- Codex authentication detection.
- Codex App Server integration through Electron main process.
- GitHub account connection inside the app.
- Multiple GitHub account support.
- GitHub repository listing.
- Repository search.
- Pull request listing.
- Open PRs by default.
- Option to show closed/merged/all PRs.
- Local PR snapshot detection using base SHA, head SHA, commit IDs, and files hash.
- Preflight analysis generation using Codex.
- Preflight analysis persistence.
- Preflight refresh when PR commits change.
- AI-generated review map made of ordered review groups.
- Grouped file review plan with explanation per group and ordered files inside each group.
- High-level risk findings.
- Three-column review workspace inspired by a GitHub/Codex review UI:
  - left: AI review map / preflight groups, file stats, and “Read explanation” actions,
  - centre: GitHub-style PR header, tabs, group heading, and selected file diff,
  - right: PR intelligence panel with AI risks, flags, checks, reviewers, assignees, and labels.
- Floating **Generate AI Review** button.
- User confirmation and optional user notes before AI review generation.
- Markdown AI review generation using Codex.
- Continuous local saving of generated markdown.
- Large markdown editor/preview modal.
- Live markdown preview.
- Editable raw markdown.
- Submit markdown as one GitHub PR review body.
- Mark PR snapshot as reviewed locally.
- Mark reviewed PR as needing re-review when new commits arrive.
- Settings screen:
  - Codex status,
  - Codex usage/status if available,
  - GitHub account add/remove,
  - preflight model,
  - AI review model,
  - update settings,
  - local data controls.
- GitHub Releases based update strategy.
- Version policy support for forced updates.

### 2.2 Not in MVP

- Inline GitHub review comments.
- GitLab/Bitbucket real implementation.
- Cloud sync.
- Team accounts.
- SaaS backend.
- Telemetry.
- Billing.
- Full provider-neutral UI for every future provider.
- Advanced queue workers unless needed.
- Pull request creation.
- Automatic merge.

### 2.3 Future-Friendly Decisions

Even though MVP only supports GitHub, structure the code so these can be added later:

- GitLab provider.
- Bitbucket provider.
- Azure DevOps provider.
- Inline review comments.
- Team review history.
- Project-level review rules.
- Custom prompt templates.
- MCP/tooling integrations.

---

## 3. Core Product Flow

```text
Launch app
  -> onboarding checks
  -> pick GitHub account
  -> list repositories
  -> pick repository
  -> list PRs
  -> pick PR
  -> check local preflight snapshot
  -> generate or load preflight
  -> open review workspace
  -> user reviews AI review map groups, ordered files, and risks
  -> user clicks Generate AI Review
  -> user adds optional notes
  -> Codex generates markdown review
  -> app saves markdown locally
  -> app opens markdown editor/preview modal
  -> user edits markdown
  -> user submits review to GitHub
  -> app marks local PR snapshot as reviewed
```

---

## 4. Main Architecture

Use Electron main process as the trusted backend/control plane.

Renderer must never:

- access GitHub tokens,
- spawn Codex,
- run git commands,
- access the filesystem directly,
- call GitHub APIs directly,
- call Codex App Server directly.

High-level architecture:

```text
Renderer React UI
  |
  | typed IPC through preload
  v
Electron Main Process
  |
  |-- App services
  |-- Git provider services
  |-- GitHub implementation
  |-- Codex runtime services
  |-- Local persistence
  |-- Secure token storage
  |-- Update service
```

Codex architecture:

```text
Renderer UI
  -> IPC
  -> CodexProviderService
  -> CodexAdapter
  -> CodexProcessManager
  -> spawned `codex app-server`
  -> Codex/OpenAI runtime
```

GitHub architecture:

```text
Renderer UI
  -> IPC
  -> GitProviderRegistry
  -> GitHubProvider
  -> Octokit/GitHub API
```

Diff architecture:

```text
GitHub PR metadata
  -> local repo cache if git available
  -> deterministic git diff
  -> normalised diff model
  -> preflight prompt / diff viewer / AI review prompt
```

---

## 5. Recommended Tech Stack

### 5.1 App Shell

- Electron
- electron-vite
- TypeScript
- React
- Vite

### 5.2 UI

- Tailwind CSS
- Radix UI primitives
- shadcn/ui-style local components
- TanStack Query
- Zustand
- React Hook Form
- Zod
- Monaco Editor for markdown editing and optional code/diff display
- react-markdown
- remark-gfm
- rehype-sanitize

### 5.3 Main Process

- TypeScript
- better-sqlite3
- Drizzle ORM
- keytar for secure token storage
- Octokit for GitHub API
- node child_process or execa for Codex and git
- electron-log
- electron-updater
- zod

### 5.4 Tests

- Vitest
- Playwright Electron tests
- mocked GitProvider implementations
- mocked Codex process tests
- Zod schema tests

### 5.5 Package Manager

Use **Yarn** stricty

---

## 6. Suggested Folder Structure

```text
review-master/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc/
│   │   │   ├── channels.ts
│   │   │   ├── handlers.ts
│   │   │   └── validators.ts
│   │   ├── app/
│   │   │   ├── AppBootstrapService.ts
│   │   │   ├── SettingsService.ts
│   │   │   ├── UpdateService.ts
│   │   │   └── Logger.ts
│   │   ├── auth/
│   │   │   ├── SecureTokenService.ts
│   │   │   └── AccountService.ts
│   │   ├── codex/
│   │   │   ├── CodexProcessManager.ts
│   │   │   ├── CodexAdapter.ts
│   │   │   ├── CodexProviderService.ts
│   │   │   ├── codexTypes.ts
│   │   │   ├── codexEvents.ts
│   │   │   └── prompts/
│   │   │       ├── preflightPrompt.ts
│   │   │       ├── reviewPrompt.ts
│   │   │       └── jsonRepairPrompt.ts
│   │   ├── providers/
│   │   │   ├── GitProvider.ts
│   │   │   ├── GitProviderRegistry.ts
│   │   │   └── github/
│   │   │       ├── GitHubProvider.ts
│   │   │       ├── GitHubAuthService.ts
│   │   │       ├── GitHubApiClient.ts
│   │   │       ├── GitHubMapper.ts
│   │   │       └── GitHubTypes.ts
│   │   ├── pr/
│   │   │   ├── PullRequestContextService.ts
│   │   │   ├── RepoCacheService.ts
│   │   │   ├── DiffService.ts
│   │   │   ├── PreflightAnalysisService.ts
│   │   │   ├── AiReviewService.ts
│   │   │   ├── ReviewSubmissionService.ts
│   │   │   └── prTypes.ts
│   │   ├── db/
│   │   │   ├── db.ts
│   │   │   ├── schema.ts
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   │       ├── AccountRepository.ts
│   │   │       ├── RepoRepository.ts
│   │   │       ├── PullRequestRepository.ts
│   │   │       ├── PreflightRepository.ts
│   │   │       ├── ReviewDraftRepository.ts
│   │   │       └── SettingsRepository.ts
│   │   └── security/
│   │       ├── safePaths.ts
│   │       ├── redaction.ts
│   │       └── markdownSanitizer.ts
│   ├── preload/
│   │   ├── index.ts
│   │   └── api.ts
│   ├── renderer/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/
│   │   │   ├── Onboarding.tsx
│   │   │   ├── AccountPicker.tsx
│   │   │   ├── Repositories.tsx
│   │   │   ├── PullRequests.tsx
│   │   │   ├── ReviewWorkspace.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── onboarding/
│   │   │   ├── accounts/
│   │   │   ├── repos/
│   │   │   ├── prs/
│   │   │   ├── review/
│   │   │   ├── settings/
│   │   │   └── ui/
│   │   ├── stores/
│   │   │   ├── appStore.ts
│   │   │   ├── accountStore.ts
│   │   │   └── reviewWorkspaceStore.ts
│   │   ├── queries/
│   │   ├── styles/
│   │   │   └── globals.css
│   │   └── types/
│   └── shared/
│       ├── constants.ts
│       ├── ids.ts
│       ├── dates.ts
│       ├── result.ts
│       └── schemas.ts
└── .github/
    └── workflows/
        ├── test.yml
        └── release.yml
```

---

## 7. Electron Security Requirements

Use safe Electron defaults.

```ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload: path.join(__dirname, "../preload/index.js")
  }
});
```

Rules:

- Do not expose `ipcRenderer` directly.
- Expose only typed methods through preload.
- Validate all IPC inputs with Zod in main.
- Never send GitHub tokens to renderer.
- Never allow renderer to pass arbitrary shell commands.
- Never allow renderer to pass arbitrary filesystem paths without validation.
- Sanitize markdown preview.
- Disable raw HTML in markdown preview by default.
- Redact secrets in logs.

---

## 8. Typed Preload API

Expose a typed API like this:

```ts
window.reviewMaster = {
  app: {
    getBootstrapStatus(): Promise<BootstrapStatus>;
    openExternal(url: string): Promise<void>;
    openDataFolder(): Promise<void>;
  },
  codex: {
    recheck(): Promise<CodexStatus>;
    listModels(): Promise<CodexModel[]>;
  },
  accounts: {
    list(): Promise<ConnectedAccount[]>;
    startAddAccount(providerId: GitProviderId): Promise<AuthFlowStartResult>;
    cancelAddAccount(flowId: string): Promise<void>;
    remove(accountId: string, options?: RemoveAccountOptions): Promise<void>;
    setActive(accountId: string): Promise<void>;
  },
  repos: {
    list(params: ListRepositoriesParams): Promise<PaginatedResult<Repository>>;
    search(params: SearchRepositoriesParams): Promise<PaginatedResult<Repository>>;
  },
  prs: {
    list(params: ListPullRequestsParams): Promise<PaginatedResult<PullRequest>>;
    get(params: PullRequestRef): Promise<PullRequestDetail>;
    openWorkspace(params: PullRequestRef): Promise<WorkspaceState>;
  },
  review: {
    runPreflight(params: RunPreflightParams): Promise<TaskHandle>;
    generateAiReview(params: GenerateReviewParams): Promise<TaskHandle>;
    getDraft(params: PullRequestRef): Promise<ReviewDraft | null>;
    saveDraft(params: SaveDraftParams): Promise<void>;
    submitDraft(params: SubmitDraftParams): Promise<SubmittedReview>;
    cancelTask(taskId: string): Promise<void>;
  },
  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
  },
  updates: {
    check(): Promise<UpdateStatus>;
    download(): Promise<void>;
    install(): Promise<void>;
  },
  events: {
    onAppEvent(callback: (event: AppEvent) => void): () => void;
  }
};
```

---

## 9. Codex App Server Integration

The app must integrate with Codex through a long-lived local child process:

```text
codex app-server
```

Renderer must not touch this process.

### 9.1 Codex CLI Detection

On onboarding and app launch, run:

```text
codex --version
```

If not found, show installation instructions:

```text
npm install -g @openai/codex
```

Buttons:

- Copy install command
- Open Codex docs
- Recheck

Also detect if `codex` is installed but not visible in Electron PATH. On macOS, Electron launched from Finder can have a different PATH from Terminal.

Implement fallback search paths:

```text
/usr/local/bin/codex
/opt/homebrew/bin/codex
~/.npm-global/bin/codex
~/.yarn/bin/codex
```

Add advanced setting:

```text
Codex binary path: Auto / Custom
```

### 9.2 Codex Auth Detection

After CLI is detected:

1. spawn `codex app-server`,
2. send `initialize`,
3. send `initialized`,
4. call `account/read`,
5. call `model/list`.

If unauthenticated, show:

```text
Codex is installed, but it does not look authenticated.

Please run this command in your terminal:

codex login

After login, return here and click Recheck.
```

Do not ask the user for OpenAI API keys in MVP.

### 9.3 CodexProcessManager

Responsibilities:

- spawn `codex app-server`,
- keep it long-lived,
- send JSON-RPC/JSONL messages over stdio,
- parse stdout line-by-line,
- parse stderr into logs,
- track request IDs,
- resolve/reject pending requests,
- route notifications to adapter,
- graceful stop,
- restart on unexpected crash.

Implement methods:

```ts
class CodexProcessManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  initialize(): Promise<CodexInitializeResult>;
  accountRead(): Promise<CodexAccount>;
  modelList(): Promise<CodexModel[]>;
  threadStart(params: ThreadStartParams): Promise<ThreadStartResult>;
  threadResume(params: ThreadResumeParams): Promise<ThreadStartResult>;
  turnStart(params: TurnStartParams): Promise<TurnStartResult>;
  interruptTurn(params: InterruptTurnParams): Promise<void>;
}
```

Defensive parsing:

```ts
const threadId = result?.threadId ?? result?.thread?.id ?? result?.id;
const turnId = result?.turnId ?? result?.turn?.id ?? result?.id;
```

Every `turn/start` must include `threadId`.

### 9.4 Raw Codex Notifications to Support

Support:

```text
thread/started
turn/started
turn/completed
item/agentMessage/delta
item/agent_message/delta
item/agentMessage/completed
item/agent_message/completed
item/updated
item/completed
thread/status/changed
```

Ignore as informational/noisy:

```text
remoteControl/status/changed
mcpServer/startupStatus/updated
session/configChanged
account/rateLimits/updated
thread/tokenUsage/updated
item/started
```

System errors may arrive as:

```json
{
  "method": "thread/status/changed",
  "params": {
    "status": {
      "type": "systemError",
      "message": "..."
    }
  }
}
```

When that happens:

- emit `codex.runtime.error`,
- flush any open turn buffer,
- mark task failed or interrupted,
- do not leave UI stuck in streaming state.

### 9.5 Canonical Codex Events

Renderer consumes app-level events only:

```ts
type AppCodexEvent =
  | { type: "codex.session.state.changed"; state: "starting" | "ready" | "error" | "stopped"; message?: string }
  | { type: "codex.thread.started"; taskId: string; threadId: string; resumeCursor?: string }
  | { type: "codex.turn.started"; taskId: string; turnId: string }
  | { type: "codex.content.delta"; taskId: string; turnId: string; text: string }
  | { type: "codex.content.completed"; taskId: string; turnId: string; text: string }
  | { type: "codex.turn.completed"; taskId: string; turnId: string }
  | { type: "codex.runtime.error"; taskId?: string; message: string; recoverable: boolean };
```

Use `taskId` for every preflight/review task.

Never key output by “last message”.

### 9.6 Thread Strategy

Use one Codex process, but create separate threads for separate tasks.

Recommended:

- one thread for a preflight generation,
- one thread for an AI review generation,
- no long-lived cross-PR shared thread.

This avoids context pollution.

### 9.7 Model Settings

Default settings:

```json
{
  "defaultPreflightModel": "gpt-5.4",
  "defaultPreflightReasoningEffort": "medium",
  "defaultReviewModel": "gpt-5.4",
  "defaultReviewReasoningEffort": "medium"
}
```

Before running a task:

1. call `model/list`,
2. verify configured model is available,
3. if unavailable, show error and ask user to pick another model,
4. do not silently switch model unless user confirms.

Supported reasoning effort options in UI:

```text
low
medium
high
xhigh
```

If the selected model does not support an effort, disable it.

---

## 10. Git Provider Architecture

Create a provider abstraction.

```ts
type GitProviderId = "github" | "gitlab" | "bitbucket";

interface GitProvider {
  id: GitProviderId;
  displayName: string;

  startAuthFlow(): Promise<AuthFlowStartResult>;
  cancelAuthFlow(flowId: string): Promise<void>;

  listRepositories(params: ListRepositoriesParams): Promise<PaginatedResult<Repository>>;
  searchRepositories(params: SearchRepositoriesParams): Promise<PaginatedResult<Repository>>;

  listPullRequests(params: ListPullRequestsParams): Promise<PaginatedResult<PullRequest>>;
  getPullRequest(params: PullRequestRef): Promise<PullRequestDetail>;

  getPullRequestCommits(params: PullRequestRef): Promise<CommitSummary[]>;
  getPullRequestFiles(params: PullRequestRef): Promise<PullRequestFile[]>;
  getPullRequestChecks(params: PullRequestRef): Promise<CheckSummary[]>;
  getPullRequestReviews(params: PullRequestRef): Promise<ReviewSummary[]>;
  getPullRequestLabels(params: PullRequestRef): Promise<LabelSummary[]>;
  getPullRequestAssignees(params: PullRequestRef): Promise<UserSummary[]>;

  fetchReviewContext(params: PullRequestRef): Promise<ReviewContext>;
  submitPullRequestReview(params: SubmitReviewParams): Promise<SubmittedReview>;
}
```

MVP implementation:

```ts
class GitHubProvider implements GitProvider {}
```

UI should show disabled providers:

- GitLab — Coming soon
- Bitbucket — Coming soon

---

## 11. GitHub Authentication

### 11.1 Requirement

GitHub auth must be self-contained inside Review Master.

If the user authenticates GitHub inside Review Master, it should not mean:

- user is authenticated in GitHub CLI,
- user is authenticated system-wide,
- app depends on `gh auth`.

Do not use GitHub CLI for auth.

### 11.2 Recommended MVP Auth

Use GitHub OAuth device flow or GitHub App user-to-server device flow.

For MVP, OAuth device flow is acceptable because it is simpler.

Do not embed a client secret in the app.

Flow:

1. User clicks Add Account.
2. User picks GitHub.
3. App starts device flow.
4. App shows user code.
5. User clicks Open GitHub.
6. User authorises in browser.
7. App polls token endpoint.
8. App fetches authenticated user.
9. App stores token in OS keychain.
10. App stores account metadata in SQLite.

### 11.3 Multiple Accounts

Allow multiple GitHub accounts.

Account identity:

```ts
interface ConnectedAccount {
  id: string;
  providerId: "github";
  providerAccountId: string;
  login: string;
  displayName?: string;
  avatarUrl?: string;
  tokenKey: string;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}
```

If same GitHub account is added twice:

- update token,
- update scopes,
- update metadata,
- do not duplicate account row.

### 11.4 Secure Token Storage

Use `keytar`.

SQLite stores:

```text
token_key = review-master.github.account.<accountId>
```

OS keychain stores actual token.

Never send token to renderer.

Never log token.

Never store token in clone URL.

### 11.5 Token Removal

When removing account:

Options:

1. Remove account only.
2. Remove account and all cached review data.

Always delete token from keychain.

---

## 12. Local Persistence

### 12.1 Data Location

Use Electron app data path.

Conceptual structure:

```text
ReviewMaster/
├── review-master.sqlite
├── repos/
│   └── github/
│       └── <accountId>/
│           └── <owner>__<repo>/
├── generated/
│   └── reviews/
├── logs/
│   └── main.log
└── temp/
```

Tokens must not be stored here.

### 12.2 Tables

#### app_settings

```ts
app_settings {
  key: string primary key;
  value_json: string not null;
  updated_at: string not null;
}
```

#### connected_accounts

```ts
connected_accounts {
  id: string primary key;
  provider_id: string not null;
  provider_account_id: string not null;
  login: string not null;
  display_name: string;
  avatar_url: string;
  token_key: string not null;
  scopes_json: string;
  created_at: string not null;
  updated_at: string not null;
  last_used_at: string;
  unique(provider_id, provider_account_id);
}
```

#### repositories

```ts
repositories {
  id: string primary key;
  provider_id: string not null;
  account_id: string not null;
  provider_repo_id: string not null;
  owner: string not null;
  name: string not null;
  full_name: string not null;
  private: boolean not null;
  default_branch: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  last_synced_at: string;
  unique(provider_id, account_id, provider_repo_id);
}
```

#### pull_requests

```ts
pull_requests {
  id: string primary key;
  provider_id: string not null;
  account_id: string not null;
  repo_id: string not null;
  provider_pr_id: string not null;
  number: number not null;
  title: string not null;
  body: string;
  state: "open" | "closed" | "merged";
  author_login: string;
  base_branch: string not null;
  head_branch: string not null;
  base_sha: string not null;
  head_sha: string not null;
  html_url: string;
  last_synced_at: string;
  unique(provider_id, account_id, repo_id, number);
}
```

#### pr_commit_snapshots

```ts
pr_commit_snapshots {
  id: string primary key;
  pull_request_id: string not null;
  base_sha: string not null;
  head_sha: string not null;
  commit_ids_json: string not null;
  files_hash: string not null;
  created_at: string not null;
  unique(pull_request_id, base_sha, head_sha, files_hash);
}
```

#### preflight_analyses

```ts
preflight_analyses {
  id: string primary key;
  pull_request_id: string not null;
  snapshot_id: string not null;
  model: string not null;
  reasoning_effort: string not null;
  status: "running" | "completed" | "failed" | "stale" | "interrupted";
  raw_json: string;
  parsed_json: string;
  error_message: string;
  created_at: string not null;
  completed_at: string;
}
```

#### review_drafts

```ts
review_drafts {
  id: string primary key;
  pull_request_id: string not null;
  snapshot_id: string not null;
  preflight_analysis_id: string;
  model: string not null;
  reasoning_effort: string not null;
  user_notes: string;
  markdown: string not null default "";
  status: "running" | "draft" | "submitted" | "failed" | "stale" | "interrupted";
  github_review_id: string;
  submitted_at: string;
  created_at: string not null;
  updated_at: string not null;
}
```

#### review_statuses

```ts
review_statuses {
  id: string primary key;
  pull_request_id: string not null;
  snapshot_id: string not null;
  review_draft_id: string;
  status: "reviewed" | "needs_rereview" | "draft_available";
  reviewed_head_sha: string;
  reviewed_at: string;
  updated_at: string not null;
}
```

---

## 13. Repo Cache and Diff Strategy

### 13.1 Preferred Strategy

Use a local repo cache when `git` is available.

This gives better, deterministic diff data than relying only on GitHub’s PR file patch strings.

### 13.2 Git Detection

On onboarding or first PR open:

```text
git --version
```

If unavailable:

- show warning,
- still allow browsing GitHub,
- use GitHub API patch fallback.

### 13.3 Local Fetch Rules

Do not persist token in `.git/config`.

When fetching private repos, inject token only into the command environment or temporary URL and redact logs.

Suggested conceptual flow:

```text
ensure repo cache exists
fetch base SHA
fetch PR head ref
run git diff between base SHA and head SHA
parse diff into normalised diff model
```

Do not blindly run arbitrary user commands.

### 13.4 Normalised Diff Types

```ts
interface NormalizedDiffFile {
  path: string;
  oldPath?: string;
  status: "added" | "modified" | "removed" | "renamed" | "copied" | "binary";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  patch?: string;
  isLarge?: boolean;
  isGenerated?: boolean;
  language?: string;
}

interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: "context" | "added" | "removed";
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}
```

### 13.5 Files Hash

Compute deterministic hash using:

- file paths,
- statuses,
- additions/deletions,
- patch content hash,
- base SHA,
- head SHA.

Snapshot freshness:

```ts
stored.baseSha === current.baseSha &&
stored.headSha === current.headSha &&
stored.filesHash === current.filesHash
```

---

## 14. Preflight Analysis

### 14.1 Purpose

Preflight analysis gives initial context before review and powers the left and right panels of the Review Workspace.

The provided UI reference shows the ideal experience: the reviewer should not see a flat alphabetical list of changed files. They should see a guided review map grouped by feature/concern, with short explanations and a sensible reading order.

Preflight has two layers:

1. **Review map groups**
   - Each group represents a logical review chunk, feature, subsystem, or concern.
   - Each group has a title, explanation, file stats, and ordered files.
   - The left panel renders these groups as numbered cards.
   - Each group has a **Read explanation** action.

2. **High-level risk findings**
   - Bugs, security issues, regressions, performance risks, maintainability risks, test gaps, deployment/configuration risks, etc.
   - These power the right sidebar’s AI issue/risk cards.
   - Keep them high-level. Do not include small nits.

### 14.2 Trigger Rules

When user selects a PR:

1. fetch latest PR metadata,
2. fetch commits,
3. fetch changed files/diff,
4. build snapshot,
5. check existing completed preflight for same snapshot,
6. if exists, load it,
7. if not, ask for confirmation,
8. if old analysis exists but PR has new commits, mark old one stale and ask whether to regenerate.

### 14.3 First-Time Confirmation Copy

Title:

```text
Run preflight analysis?
```

Body:

```text
Review Master will analyse this PR with Codex to build a guided review map, group related changes, sort files into a better reading order, and flag high-level risks before you start reviewing.

This may use your Codex quota. The result will be saved locally so you do not need to generate it again unless the PR changes.
```

Buttons:

```text
Cancel
Run Preflight
```

### 14.4 New Commits Copy

Title:

```text
PR has new commits
```

Body:

```text
This PR has changed since the last preflight analysis. Review Master can regenerate the analysis for the latest head commit so the review map, file order, explanations, and risk flags stay accurate.

This may use your Codex quota.
```

Buttons:

```text
Use Old Analysis
Regenerate
```

If user uses old analysis, show a stale badge.

### 14.5 Preflight Zod Schema

Preflight must return grouped review sections, not just a flat ordered file list.

The left panel is powered by `reviewGroups`.

The right panel is powered mainly by `riskFindings`.

```ts
const PreflightAnalysisSchema = z.object({
  schemaVersion: z.literal("2.0"),
  pr: z.object({
    provider: z.literal("github"),
    repoFullName: z.string(),
    pullRequestNumber: z.number(),
    title: z.string(),
    baseBranch: z.string(),
    headBranch: z.string(),
    baseSha: z.string(),
    headSha: z.string(),
    analysedCommitIds: z.array(z.string())
  }),
  summary: z.object({
    shortTitle: z.string(),
    overview: z.string(),
    estimatedReviewComplexity: z.enum(["low", "medium", "high", "very_high"]),
    suggestedReviewStrategy: z.string(),
    totalFiles: z.number(),
    totalAdditions: z.number(),
    totalDeletions: z.number()
  }),
  reviewGroups: z.array(z.object({
    order: z.number(),
    title: z.string(),
    shortLabel: z.string().optional(),
    explanation: z.string(),
    readExplanation: z.string(),
    priority: z.enum(["low", "medium", "high", "critical"]),
    category: z.enum([
      "entry_point",
      "api_contract",
      "business_logic",
      "data_model",
      "database_migration",
      "ui",
      "state_management",
      "integration",
      "configuration",
      "test",
      "documentation",
      "build_tooling",
      "security",
      "performance",
      "workflow",
      "other"
    ]),
    stats: z.object({
      fileCount: z.number(),
      additions: z.number(),
      deletions: z.number()
    }),
    files: z.array(z.object({
      order: z.number(),
      fileReference: z.string(),
      path: z.string(),
      oldPath: z.string().optional(),
      title: z.string(),
      details: z.string(),
      reasonForPosition: z.string(),
      priority: z.enum(["low", "medium", "high", "critical"]),
      status: z.enum(["added", "modified", "removed", "renamed", "copied", "binary"]),
      additions: z.number().optional(),
      deletions: z.number().optional(),
      relatedFiles: z.array(z.string()).optional()
    }))
  })),
  riskFindings: z.array(z.object({
    title: z.string(),
    type: z.enum([
      "bug",
      "security",
      "regression",
      "performance",
      "maintainability",
      "test_gap",
      "data_loss",
      "api_contract",
      "accessibility",
      "configuration",
      "deployment",
      "concurrency",
      "compatibility",
      "migration",
      "dependency",
      "other"
    ]),
    severity: z.enum(["low", "medium", "high", "critical"]),
    details: z.string(),
    fileReferences: z.array(z.string()).optional(),
    confidence: z.enum(["low", "medium", "high"]),
    relatedGroupOrders: z.array(z.number()).optional()
  })),
  assumptions: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional()
});
```

### 14.6 Review Group UI Mapping

Each `reviewGroups[]` item should render in the left panel like this:

```text
┌─────────────────────────────────────────────┐
│ 1  New DeveloperInstructions Builder        │
│    10 files  +237  -28                      │
│                                             │
│    user_instructions.rs    codex-rs/core/src│
│    BUILD.bazel             codex-rs/protocol│
│    models.rs               codex-rs/protocol│
│    +5 more files                            │
│                                             │
│    Read explanation  ›                      │
└─────────────────────────────────────────────┘
```

Rules:

- The number comes from `reviewGroups.order`.
- The title comes from `reviewGroups.title`.
- The file count/additions/deletions come from `reviewGroups.stats`.
- Show the first 3–5 files only, then `+N more files`.
- `Read explanation` opens a popover, side sheet, or inline expansion using `reviewGroups.readExplanation`.
- Clicking the group selects the first file in that group and scrolls the centre diff to that group heading.
- Clicking an individual file selects that file in the centre diff viewer.

### 14.7 Preflight Prompt

Implement:

```ts
function buildPreflightPrompt(input: PreflightPromptInput): string
```

Prompt:

```text
You are Review Master, an expert senior software engineer helping a human reviewer prepare for a pull request review.

You are not writing the final PR review yet.

Your task is to produce a compact preflight analysis that helps the reviewer understand the PR quickly.

The UI is a three-column PR review workspace:
- left panel: grouped review map with titles, stats, file references, and a "Read explanation" action,
- centre panel: GitHub-style PR header and selected file diff,
- right panel: high-level AI risk findings plus GitHub metadata.

Return ONLY valid JSON matching the requested schema.
Do not return markdown.
Do not wrap JSON in backticks.
Do not include comments in JSON.

PR metadata:
- Provider: {{provider}}
- Repository: {{repoFullName}}
- PR number: {{pullRequestNumber}}
- PR title: {{title}}
- PR body: {{body}}
- Author: {{author}}
- Base branch: {{baseBranch}}
- Head branch: {{headBranch}}
- Base SHA: {{baseSha}}
- Head SHA: {{headSha}}
- Commit IDs analysed: {{commitIds}}

Previous preflight analysis:
{{previousPreflightOrNull}}

If previous preflight analysis is provided, use it only as historical context.
The latest source of truth is the current PR metadata, commits, and diff.

Changed files and diff context:
{{diffContext}}

Required output schema:

{
  "schemaVersion": "2.0",
  "pr": {
    "provider": "github",
    "repoFullName": "owner/repo",
    "pullRequestNumber": 123,
    "title": "...",
    "baseBranch": "...",
    "headBranch": "...",
    "baseSha": "...",
    "headSha": "...",
    "analysedCommitIds": ["..."]
  },
  "summary": {
    "shortTitle": "...",
    "overview": "...",
    "estimatedReviewComplexity": "low | medium | high | very_high",
    "suggestedReviewStrategy": "...",
    "totalFiles": 10,
    "totalAdditions": 237,
    "totalDeletions": 28
  },
  "reviewGroups": [
    {
      "order": 1,
      "title": "New DeveloperInstructions Builder",
      "shortLabel": "DeveloperInstructions",
      "explanation": "Compact explanation of what this group changes and why it matters.",
      "readExplanation": "A slightly fuller explanation shown when the user clicks Read explanation.",
      "priority": "low | medium | high | critical",
      "category": "entry_point | api_contract | business_logic | data_model | database_migration | ui | state_management | integration | configuration | test | documentation | build_tooling | security | performance | workflow | other",
      "stats": {
        "fileCount": 3,
        "additions": 120,
        "deletions": 20
      },
      "files": [
        {
          "order": 1,
          "fileReference": "src/example.ts:42",
          "path": "src/example.ts",
          "oldPath": "src/old-example.ts",
          "title": "Short file-level title",
          "details": "Brief context explaining what changed and why it matters.",
          "reasonForPosition": "Why this file should be reviewed at this point inside the group.",
          "priority": "low | medium | high | critical",
          "status": "added | modified | removed | renamed | copied | binary",
          "additions": 20,
          "deletions": 4,
          "relatedFiles": ["optional/related/file.ts"]
        }
      ]
    }
  ],
  "riskFindings": [
    {
      "title": "Short risk title",
      "type": "bug | security | regression | performance | maintainability | test_gap | data_loss | api_contract | accessibility | configuration | deployment | concurrency | compatibility | migration | dependency | other",
      "severity": "low | medium | high | critical",
      "details": "High-level explanation. Avoid tiny style nits.",
      "fileReferences": ["src/example.ts:42"],
      "confidence": "low | medium | high",
      "relatedGroupOrders": [1]
    }
  ],
  "assumptions": [],
  "warnings": []
}

Rules:
1. reviewGroups must cover every changed non-binary file exactly once unless the file is clearly generated or impossible to analyse.
2. A group can contain one file or many files. Group by feature, workflow, subsystem, risk area, or review story.
3. Use a review order that helps humans understand the PR layer by layer.
4. Prefer this sequence where applicable:
   - public API/contracts/types
   - database/schema/migration changes
   - core business logic
   - service/integration layer
   - state management
   - UI/rendering
   - tests
   - documentation/config/build changes
5. Group titles should feel like review sections, not generic file names.
6. Good group title examples:
   - "New Refund Calculation Path"
   - "Permissions Message Injection in Session"
   - "Simplified EnvironmentContext"
   - "Checkout Error Handling Tests"
7. Keep group explanations concise and useful.
8. readExplanation should explain what changed, why it matters, and how the reviewer should approach the group.
9. riskFindings must focus on high-level issues only.
10. Do not invent line numbers. Only include line numbers when they are clear from diff context.
11. If line numbers are uncertain, omit them or use file-only references.
12. If the PR is too large and confidence is limited, say so in warnings.
13. Return strict JSON only.
```

### 14.8 Invalid JSON Handling

After Codex output:

1. Try JSON.parse.
2. Validate with Zod.
3. If invalid, run JSON repair prompt.
4. If still invalid, store raw output, mark failed, allow retry.

Do not discard raw output.

---

## 15. AI Review Generation

### 15.1 Important MVP Decision

The generated markdown review will be submitted as **one GitHub PR review body**.

Do not create inline GitHub comments in MVP.

The markdown itself should still include exact file references and line numbers where possible.

### 15.2 Generate Button

Show elegant floating button in Review Workspace:

```text
Generate AI Review
```

Placement:

- bottom-right of centre diff area or between centre/right panels,
- visible but not intrusive,
- disabled if Codex unavailable,
- show tooltip if disabled.

### 15.3 Confirmation Modal

Title:

```text
Generate AI review?
```

Body:

```text
Before generating, please go through the changes once. You can also add any extra context, concerns, or instructions you want the AI reviewer to consider.

This may use your Codex quota. The generated markdown will be saved locally as a draft.
```

Textarea label:

```text
Additional context / reviewer notes
```

Placeholder:

```text
Example: Focus on database safety and backwards compatibility. Ignore formatting-only issues.
```

Buttons:

```text
Cancel
Generate Review
```

### 15.4 AI Review Prompt

Implement:

```ts
function buildAiReviewPrompt(input: AiReviewPromptInput): string
```

Prompt:

````text
You are Review Master, an expert senior software engineer preparing a pull request review for a human reviewer.

You are writing a review draft that the user will edit before submitting to GitHub.

Review goals:
- correctness
- bugs
- regressions
- security
- performance
- maintainability
- architecture
- API contracts
- data safety
- test coverage
- edge cases
- best practices

Avoid:
- tiny formatting nits
- generic praise
- repeating the PR description
- overconfident claims not supported by the diff
- suggesting large rewrites unless clearly justified

Output format:
Return markdown only.

PR metadata:
- Provider: {{provider}}
- Repository: {{repoFullName}}
- PR number: {{pullRequestNumber}}
- PR title: {{title}}
- PR body: {{body}}
- Author: {{author}}
- Base branch: {{baseBranch}}
- Head branch: {{headBranch}}
- Base SHA: {{baseSha}}
- Head SHA: {{headSha}}
- Commit IDs analysed: {{commitIds}}

User reviewer notes:
{{userNotesOrNone}}

Preflight summary:
{{preflightSummary}}

Preflight review map groups:
{{reviewGroups}}

High-level risk findings:
{{riskFindings}}

Changed files and diff context:
{{diffContext}}

Instructions:
1. Write a useful GitHub PR review in markdown.
2. Start with a short summary of the review.
3. If there are important findings, list them by severity.
4. For each issue, include:
   - severity
   - exact file reference
   - exact line number or best available line reference when possible
   - issue explanation
   - why it matters
   - recommended fix
   - code block or suggested patch when helpful
5. If line numbers are uncertain, clearly say "around" or "near" the relevant area.
6. Do not invent file paths.
7. Do not invent line numbers.
8. Prefer actionable comments over vague feedback.
9. If no serious issues are found, say that clearly and mention what areas were checked.
10. End with a short final recommendation:
    - "Looks good after minor changes"
    - "Needs changes before merge"
    - "Looks safe to merge"
    - or another suitable recommendation.

Markdown structure:

# Review Summary

...

# Findings

## 1. [severity] Title

**File:** `path/to/file.ts:123`

**Issue**

...

**Why it matters**

...

**Recommended fix**

```ts
// example when useful
```

# Final Recommendation

...
````

### 15.5 Streaming and Saving

While generating:

- stream Codex output,
- save markdown deltas locally every few seconds or every N characters,
- mark draft status as `running`,
- on completion mark as `draft`,
- if failure, keep partial markdown and mark `failed` or `interrupted`.

### 15.6 Draft Modal

After generation, open a large modal:

```text
┌────────────────────────────────────────────────────────────────────┐
│ AI Review Draft                                             [ X ]  │
├──────────────────────────────────┬─────────────────────────────────┤
│ Raw Markdown                     │ Live Preview                    │
│                                  │                                 │
│ # Review Summary                 │ Rendered markdown               │
│ ...                              │                                 │
│                                  │                                 │
├──────────────────────────────────┴─────────────────────────────────┤
│ Saved locally • Last edited 12:30 PM        [Cancel] [Submit Review]│
└────────────────────────────────────────────────────────────────────┘
```

Size:

- width: 85vw,
- height: 85vh.

Left:

- raw markdown editor.

Right:

- live preview.

Actions:

- Cancel/Close,
- Copy Markdown,
- Submit Review.

Autosave all edits.

### 15.7 Reopening Drafts

If user generated a draft but did not submit:

- show banner on PR workspace:

```text
You have a saved AI review draft for this PR.
```

Buttons:

```text
Open Draft
Regenerate
Dismiss
```

If user navigated away immediately after generation and returns to the same PR, automatically open the draft modal once.

---

## 16. GitHub Review Submission

### 16.1 MVP Submission

Submit one review body.

Event:

```text
COMMENT
```

If user wants stricter workflow later, add UI choices:

- Comment
- Request Changes
- Approve

For MVP default to Comment.

### 16.2 After Successful Submit

- Store GitHub review ID.
- Mark draft as `submitted`.
- Mark PR snapshot as `reviewed`.
- Store `reviewed_head_sha`.
- Show toast:

```text
Review submitted successfully.
```

### 16.3 On Submit Failure

Keep draft.

Show error:

- permission issue,
- PR closed,
- network issue,
- GitHub API error,
- rate limit.

Always offer:

```text
Copy Markdown
Retry
```

---

## 17. Review State Machine

```ts
type LocalPrReviewState =
  | "new"
  | "preflight_running"
  | "preflight_ready"
  | "preflight_failed"
  | "preflight_stale"
  | "review_generating"
  | "draft_available"
  | "review_submitted"
  | "needs_rereview";
```

Transitions:

```text
new
  -> preflight_running
  -> preflight_ready
  -> review_generating
  -> draft_available
  -> review_submitted

preflight_ready + new commits
  -> preflight_stale

review_submitted + new commits
  -> needs_rereview

draft_available + new commits
  -> stale draft warning
```

---

## 18. Main Screens and Wireframes

### 18.1 Onboarding

```text
┌────────────────────────────────────────────────────────────┐
│ Review Master                                              │
│ AI-assisted PR reviews, powered by Codex                   │
│                                                            │
│ Setup checklist                                            │
│                                                            │
│ [✓] Codex CLI installed                                    │
│     codex 0.x.x detected                                   │
│                                                            │
│ [!] Codex authenticated                                    │
│     Run `codex login` in your terminal, then click Recheck │
│     [Copy command] [Recheck]                               │
│                                                            │
│ [ ] GitHub account connected                               │
│     [Add GitHub Account]                                   │
│                                                            │
│                                          [Continue]         │
└────────────────────────────────────────────────────────────┘
```

### 18.2 Add Account

```text
┌───────────────────────────────────────────────┐
│ Add git provider                              │
├───────────────────────────────────────────────┤
│ [ GitHub      ] Available                     │
│ [ GitLab      ] Coming soon                   │
│ [ Bitbucket   ] Coming soon                   │
│                                               │
│                         [Cancel] [Continue]   │
└───────────────────────────────────────────────┘
```

GitHub device modal:

```text
┌───────────────────────────────────────────────┐
│ Connect GitHub                                │
├───────────────────────────────────────────────┤
│ 1. Open GitHub authorization page             │
│ 2. Enter this code:                           │
│                                               │
│        AB12-CD34                              │
│                                               │
│ [Copy Code] [Open GitHub]                     │
│                                               │
│ Waiting for authorization...                  │
│                                               │
│                         [Cancel]              │
└───────────────────────────────────────────────┘
```

### 18.3 Account Picker

Always open this screen after setup.

```text
┌────────────────────────────────────────────────────────────┐
│ Review Master                                      [⚙]     │
├────────────────────────────────────────────────────────────┤
│ Pick a GitHub account                                      │
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ avatar  harshit-shukla                     GitHub      │ │
│ └────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ avatar  work-account                       GitHub      │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ + Add account                                              │
└────────────────────────────────────────────────────────────┘
```

### 18.4 Repository List

```text
┌────────────────────────────────────────────────────────────────────┐
│ Review Master   [Search repositories...]    [harshit ▼]     [⚙]   │
├────────────────────────────────────────────────────────────────────┤
│ Repositories                                                        │
│                                                                    │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ owner/repo-name                            Private • TypeScript │ │
│ │ Last updated 2h ago                                             │ │
│ └────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ owner/another-repo                        Public • JavaScript   │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ [Load more]                                                        │
└────────────────────────────────────────────────────────────────────┘
```

Account dropdown:

```text
harshit-shukla
work-account
────────────
+ Add account
```

### 18.5 Pull Request List

```text
┌────────────────────────────────────────────────────────────────────┐
│ Review Master   owner/repo     [Search PRs...] [Open ▼] [account] │
├────────────────────────────────────────────────────────────────────┤
│ Pull Requests                                                     │
│                                                                    │
│ #124 Add refund workflow                                           │
│ by alice • open • head: refund-flow                                │
│ Status: New                                                        │
│                                                                    │
│ #123 Improve auth middleware                                       │
│ by bob • open • Status: Reviewed                                   │
│                                                                    │
│ #120 Fix invoice tax rounding                                      │
│ by charlie • closed • Status: Needs re-review                      │
└────────────────────────────────────────────────────────────────────┘
```

Filter options:

```text
Open
Closed
Merged
All
```

### 18.6 Review Workspace

The Review Workspace should follow the provided three-column UI reference closely.

It should feel like a polished GitHub/Codex PR review screen:

- left: AI-generated review map grouped by logical change areas,
- centre: PR header, tabs, current group heading, selected file diff,
- right: PR intelligence with AI issues, flags, checks, reviewers, assignees, and labels.

#### 18.6.1 Overall Layout

```text
┌───────────────────────┬──────────────────────────────────────────────────────┬───────────────────────┐
│ AI Review Map         │ PR Header + Diff                                      │ PR Intelligence       │
│ width: 280–340px      │ flexible / primary                                    │ width: 300–360px      │
├───────────────────────┼──────────────────────────────────────────────────────┼───────────────────────┤
│ PR #8961              │ [Merged/Open/Closed badge]                            │ [Info tab]            │
│                       │ owner/repo #8961                                      │                       │
│ 1 Group Title         │ PR title                                              │ 1 Bug                 │
│   10 files +237 -28   │ author • base ← head • 30 files +1089 -655            │ Permission message... │
│   file1.rs path       │                                                       │                       │
│   file2.rs path       │ Discussion  Commits  Files                            │ 0 Flags               │
│   +5 more files       │ ────────────────────────────────────────────────────  │                       │
│   Read explanation ›  │                                                       │ Checks 32/32          │
│                       │ 1 New DeveloperInstructions Builder                   │ ▬▬▬▬▬▬▬▬▬▬▬▬▬         │
│ 2 Group Title         │ user_instructions.rs                                  │                       │
│   1 file +51 -7       │ ┌──────────────────────────────────────────────────┐  │ Reviewers 3          │
│   Read explanation ›  │ │ diff card                                         │  │ user ✓                │
│                       │ │ line numbers + highlighted additions/removals     │  │ user comment          │
│ 3 Group Title         │ └──────────────────────────────────────────────────┘  │                       │
│                       │                                                       │ Assignees             │
│                       │                         [Generate AI Review]          │ Labels                │
└───────────────────────┴──────────────────────────────────────────────────────┴───────────────────────┘
```

#### 18.6.2 Left Panel — AI Review Map

Name this panel internally:

```ts
ReviewMapPanel
```

It renders `preflight.reviewGroups`.

Each group card should show:

- group order number,
- group title,
- file count,
- additions/deletions,
- top 3–5 files,
- `+N more files` if needed,
- `Read explanation` action,
- selected/active state,
- stale indicator if preflight is stale.

Card example:

```text
1  New DeveloperInstructions Builder

10 files  +237  -28
user_instructions.rs      codex-rs/core/src
BUILD.bazel               codex-rs/protocol
models.rs                 codex-rs/protocol/src
+5 more files

Read explanation ›
```

Interaction rules:

- Clicking a group selects that group.
- Selecting a group selects its first file by default.
- Clicking a file selects that file in the centre diff.
- `Read explanation` opens an inline expansion or side popover with:
  - what changed,
  - why this group matters,
  - suggested review approach,
  - related risks.
- Active group should have stronger border/accent.
- High/critical priority groups should show a subtle severity marker.

#### 18.6.3 Centre Panel — PR Header and Diff

Name this panel internally:

```ts
PrDiffPanel
```

Top PR header should include:

- PR state badge: Open / Merged / Closed / Draft,
- repo full name and PR number,
- PR title,
- author avatar/login,
- base branch ← head branch,
- file count,
- total additions/deletions,
- link/copy icon to open PR on GitHub.

Tabs:

```text
Discussion  Commits  Files
```

For MVP, only the Files/diff experience must be functional. Discussion and Commits can be present but disabled or simple placeholders if not implemented yet.

Below header:

- selected group heading,
- group progress indicator, for example `0 / 10`,
- “lines left” approximation if easy,
- selected file diff card.

Diff card should include:

- file path,
- copy file path button,
- additions/deletions for file,
- “Mark as viewed” local-only toggle,
- more menu placeholder,
- hunk controls if possible:
  - expand 5 lines,
  - expand all lines,
- GitHub-like line numbers,
- highlighted additions/removals.

MVP diff viewer can be custom CSS over parsed diff. Monaco is optional.

#### 18.6.4 Right Panel — PR Intelligence

Name this panel internally:

```ts
PrIntelligencePanel
```

Sections in order:

1. **Info tab header**
2. **AI Issues / Risks**
3. **Flags**
4. **Checks**
5. **Reviewers**
6. **Assignees**
7. **Labels**

##### AI Issues / Risks

Render `preflight.riskFindings`.

Group/count by type.

Example:

```text
1 Bug
Permissions message not updated when cwd changes...
Bug  codex.rs:1017
```

Each item should show:

- severity/type icon,
- title,
- type label,
- primary file reference if available,
- click action to navigate centre diff to matching file/line if possible.

##### Flags

MVP can show local user flags only if implemented quickly. Otherwise show:

```text
0 Flags
```

Add placeholder architecture for future flags:

```ts
interface ReviewFlag {
  id: string;
  pullRequestId: string;
  snapshotId: string;
  title: string;
  details?: string;
  fileReference?: string;
  createdAt: string;
}
```

##### Checks

Show check summary:

```text
Checks 32/32
```

Use GitHub checks/status APIs when available.

Show green progress bar if all pass, warning/danger if pending/failing.

##### Reviewers

Show existing GitHub reviewers/reviews:

- avatar,
- login,
- state icon:
  - approved,
  - changes requested,
  - commented,
  - pending/no review.

##### Assignees and Labels

Show standard GitHub metadata.

If empty, show muted text:

```text
No assignees
No labels assigned
```

#### 18.6.5 Floating AI Review Button

Show a large but elegant floating button in the centre/right area:

```text
Generate AI Review
```

Placement:

- bottom-right of centre panel, or
- overlapping centre/right boundary, similar to IDE assistant actions.

States:

- enabled when preflight is ready and Codex available,
- disabled when Codex unavailable,
- disabled when preflight is running,
- warning state if preflight is stale,
- if draft exists, change label to `Open AI Draft` with secondary `Regenerate` option.

#### 18.6.6 Workspace Local State

Track:

```ts
interface ReviewWorkspaceUiState {
  selectedGroupOrder: number | null;
  selectedFilePath: string | null;
  viewedFiles: Record<string, boolean>;
  expandedExplanations: Record<number, boolean>;
  rightPanelTab: "info";
  showOnlyUnviewed: boolean;
}
```

Persist `viewedFiles` locally per PR snapshot.

### 18.7 Settings

```text
┌──────────────────────────────────────────────────────────┐
│ Settings                                                 │
├──────────────────────────────────────────────────────────┤
│ Codex                                                    │
│ Status: Authenticated                                   │
│ [Check Codex Usage] [Recheck CLI]                        │
│                                                          │
│ Git Accounts                                             │
│ GitHub: harshit-shukla                         [Remove]  │
│ GitHub: work-account                           [Remove]  │
│ [Add Account]                                            │
│                                                          │
│ Models                                                   │
│ Preflight model: [gpt-5.4 ▼] Reasoning: [medium ▼]       │
│ AI review model: [gpt-5.4 ▼] Reasoning: [medium ▼]       │
│                                                          │
│ Updates                                                  │
│ [✓] Automatically check for updates                      │
│ Current version: 0.1.0                                   │
│ [Check for updates]                                      │
│                                                          │
│ Local Data                                               │
│ [Open data folder] [Clear repo cache]                    │
│                                                          │
│ About                                                    │
│ Review Master — open source, powered by Codex            │
└──────────────────────────────────────────────────────────┘
```

---

## 19. Design System

### 19.1 Theme Name

```text
Midnight Graphite
```

### 19.2 CSS Variables

```css
:root {
  --background: #090B10;
  --background-elevated: #0F121A;
  --background-panel: #131722;
  --background-panel-hover: #191E2B;

  --border-subtle: #242A38;
  --border-strong: #343D52;

  --text-primary: #F4F7FB;
  --text-secondary: #A8B0C2;
  --text-muted: #6F788D;

  --accent: #7C5CFF;
  --accent-hover: #9278FF;
  --accent-soft: rgba(124, 92, 255, 0.16);

  --success: #3DDC97;
  --warning: #F4B740;
  --danger: #FF5C7A;
  --info: #55C2FF;

  --bug: #FF5C7A;
  --security: #FF9F43;
  --performance: #55C2FF;
  --maintainability: #B8E986;
  --regression: #F4B740;
}
```

### 19.3 Fonts

Use system UI stack:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Code:

```css
font-family:
  "JetBrains Mono",
  "SFMono-Regular",
  Consolas,
  "Liberation Mono",
  monospace;
```

If bundling fonts is annoying for MVP, use system fonts only.

### 19.4 Layout Feel

- Dense but readable.
- Developer-first.
- Dark mode only for MVP.
- Use borders more than shadows.
- Use colour for state/severity only.
- Use command-palette style modals where useful.

### 19.5 Components

Build reusable components:

- AppShell
- Header
- AccountDropdown
- SearchInput
- RepoCard
- PullRequestRow
- StatusBadge
- SeverityBadge
- DiffViewer
- ReviewMapPanel
- ReviewGroupCard
- GroupExplanationPopover
- PrDiffPanel
- PrIntelligencePanel
- RiskFindingPanel
- ChecksPanel
- ReviewDraftModal
- ProgressModal
- SettingsSection

---

## 20. Progress UX

Codex tasks may not provide exact percentage.

Use phase-based progress.

### 20.1 Preflight Phases

```text
1. Syncing PR metadata
2. Fetching commits
3. Building diff context
4. Preparing Codex prompt
5. Running preflight analysis
6. Validating JSON output
7. Saving locally
```

### 20.2 AI Review Phases

```text
1. Loading PR context
2. Loading preflight analysis
3. Preparing review prompt
4. Generating review with Codex
5. Saving draft locally
6. Opening editor
```

### 20.3 Progress Modal

```text
┌─────────────────────────────────────────────┐
│ Generating AI Review                         │
│                                             │
│ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░                       │
│                                             │
│ Current step: Generating review with Codex   │
│                                             │
│ Live activity                               │
│ > Started Codex turn                         │
│ > Reading diff context                       │
│ > Drafting findings                          │
│                                             │
│ [Cancel]                                    │
└─────────────────────────────────────────────┘
```

For review generation, do not show full raw markdown stream in the progress modal by default. Show it after generation in editor modal.

Add “Show raw stream” in dev/debug mode only.

---

## 21. Large PR Handling

Define thresholds:

```ts
const MAX_DIRECT_REVIEW_FILES = 60;
const MAX_DIRECT_REVIEW_PATCH_CHARS = 250_000;
const MAX_SINGLE_FILE_PATCH_CHARS = 60_000;
```

If PR is small enough:

- send full diff context.

If PR is large:

- summarise or chunk,
- prioritise high-risk files,
- include warning in UI,
- ask user if they want to focus on selected files.

Warning copy:

```text
This PR is large. Review Master will focus the AI review on high-risk areas and may summarise generated or very large files.
```

Generated/noisy files to detect:

```text
package-lock.json
yarn.lock
pnpm-lock.yaml
dist/
build/
coverage/
generated/
*.min.js
*.snap
```

Do not ignore lock files entirely. Summarise dependency changes when relevant.

---

## 22. Edge Cases

### 22.1 Codex Not Installed

- Show onboarding warning.
- Disable AI actions.
- Allow settings access.

### 22.2 Codex Installed but App Cannot Find It

- Search common paths.
- Allow manual Codex binary path.
- Show troubleshooting.

### 22.3 Codex Not Authenticated

- Show `codex login` instructions.
- Recheck button.

### 22.4 GitHub Token Revoked

- Mark account as needs re-auth.
- Do not delete local data.
- Show reconnect.

### 22.5 GitHub Rate Limit

- Show reset time if available.
- Use cached data when possible.

### 22.6 No Permission to Submit Review

- Keep draft.
- Show error.
- Offer Copy Markdown.

### 22.7 Fork PRs

- Use PR metadata carefully.
- Fetch from head repo if needed.
- Fallback to API patch mode if local fetch fails.

### 22.8 Binary Files

- List them.
- Do not send binary content to Codex.
- Show “Binary file changed — not analysed.”

### 22.9 Deleted Files

- Show deleted diff.
- AI can discuss impact but should not suggest edits inside deleted file unless relevant.

### 22.10 Renamed Files

Show old and new path:

```text
old/path.ts -> new/path.ts
```

### 22.11 Crash During Generation

Because content is saved continuously:

- on next launch, detect running tasks older than timeout,
- mark interrupted,
- allow opening partial draft,
- allow regeneration.

### 22.12 User Navigates Away During Generation

- Continue task in main process.
- Show active task badge.
- Allow cancellation.

### 22.13 User Cancels Generation

- Interrupt Codex turn if supported.
- Keep partial content.
- Mark task interrupted.

### 22.14 PR Closed During Review

Before submit, check latest PR state.

If closed/merged:

```text
This PR is no longer open. GitHub may reject new reviews.
```

### 22.15 New Commits After Draft

- Mark draft stale.
- Allow open old draft.
- Recommend regeneration.

### 22.16 Offline Mode

- Allow cached viewing.
- Disable fetch/submit/update.
- Allow draft editing.

---

## 23. Update and Release Strategy

### 23.1 Distribution

Use GitHub Releases.

Users download app from GitHub Releases for MVP.

Later a website download button can point to latest GitHub Release.

### 23.2 Auto Update

Use `electron-updater` and GitHub Releases.

States:

```text
Checking for updates
Update available
Downloading update
Ready to install
Update failed
Current version unsupported
```

### 23.3 Forced Update

Host a version policy JSON in the public GitHub repo or as release asset.

Example:

```json
{
  "minimumSupportedVersion": "0.2.0",
  "message": "This version is no longer supported because of a GitHub auth compatibility change.",
  "critical": true
}
```

If current version is lower:

- block normal usage,
- show force update screen,
- allow download/install,
- allow quit.

### 23.4 Signing Note

For smooth macOS auto-update, signing/notarisation may be required.

For MVP, support manual GitHub Release downloads as fallback.

---

## 24. Implementation Phases

### Phase 0 — Project Setup

- Create Electron + Vite + React + TypeScript app.
- Configure Yarn.
- Add Tailwind.
- Add Radix/shadcn-style UI components.
- Add SQLite + Drizzle.
- Add keytar.
- Add Octokit.
- Add electron-log.
- Add typed IPC.
- Add app shell.

### Phase 1 — Codex Runtime

- Detect Codex CLI.
- Detect Codex auth.
- Implement CodexProcessManager.
- Implement CodexAdapter.
- Implement CodexProviderService.
- Implement model listing.
- Add simple hidden/dev test to send prompt and stream response.

### Phase 2 — GitHub Auth

- Implement GitProvider interface.
- Implement GitHubProvider.
- Implement GitHub device auth.
- Store tokens in keychain.
- Support multiple accounts.
- Build account picker.

### Phase 3 — Repositories and PRs

- List first 20 repos.
- Search repos.
- Switch accounts from header dropdown.
- List open PRs.
- Add closed/merged/all filter.
- Persist metadata.

### Phase 4 — Diff Context

- Detect git.
- Build repo cache.
- Fetch PR refs.
- Generate normalised diff.
- Fallback to GitHub API patch.
- Build review workspace skeleton.

### Phase 5 — Preflight

- Snapshot detection.
- Confirmation modal.
- Preflight prompt.
- Codex generation.
- JSON validation/repair.
- Store result.
- Render review groups in the left review map.
- Render group explanations and ordered files inside each group.
- Render risk findings in the right intelligence panel.

### Phase 6 — Review Workspace

- Screenshot-aligned three-column layout.
- Left ReviewMapPanel with numbered preflight groups.
- Centre PrDiffPanel with PR header, tabs, group heading, and diff viewer.
- Right PrIntelligencePanel with AI risks, flags, checks, reviewers, assignees, and labels.
- Stale badges.
- Generate AI Review button.

### Phase 7 — AI Review

- Confirmation modal with user notes.
- Review prompt.
- Codex generation.
- Continuous saving.
- Draft modal.
- Live markdown preview.
- Autosave edits.

### Phase 8 — Submit Review

- Submit markdown as one PR review body.
- Store GitHub review ID.
- Mark reviewed.
- Handle failures.
- Copy Markdown fallback.

### Phase 9 — Settings and Updates

- Settings screen.
- Model settings.
- GitHub account management.
- Codex recheck.
- Local data controls.
- GitHub Releases update flow.
- Version policy.

### Phase 10 — Hardening

- Large PR chunking.
- Crash recovery.
- Tests.
- Error boundaries.
- Logging redaction.
- Release workflows.

---

## 25. Acceptance Criteria

### Onboarding

- User can detect Codex installation.
- User can detect Codex authentication.
- User can add GitHub account.
- User can add multiple GitHub accounts.

### Repos

- User can select GitHub account.
- User can list first 20 repos.
- User can search repos.
- User can switch accounts from dropdown.
- User can add account from dropdown.

### PRs

- User can list open PRs.
- User can show closed/merged/all PRs.
- User can select a PR.

### Preflight

- App detects existing preflight for current snapshot.
- App detects stale preflight after new commits.
- App generates JSON preflight.
- App validates preflight.
- App stores preflight locally.
- App renders grouped review map.
- App renders group explanations and ordered files inside each group.
- App renders risk findings.

### Workspace

- Left panel shows numbered review groups with titles, stats, top files, and Read explanation actions.
- Centre panel shows PR header, tabs, selected group heading, and selected file diff.
- Right panel shows AI risk findings, flags, checks, reviewers, assignees, labels, and GitHub metadata.
- Generate AI Review button works.

### AI Review

- User can add notes before generation.
- App generates markdown review.
- App saves markdown locally.
- App shows raw markdown and preview side-by-side.
- User can edit markdown.
- User can submit markdown as one GitHub PR review body.
- If user leaves and returns, draft is preserved.

### Re-review

- Reviewed PR becomes needs re-review when new commits arrive.
- User can regenerate preflight and review.

### Updates

- App checks GitHub Releases.
- App shows update badge/prompt.
- App can enforce minimum supported version.

---

## 26. Final Implementation Instructions to Claude

Build this as a production-quality MVP.

Do not over-engineer, but do not create architecture debt in the core boundaries.

Important boundaries:

- UI components should not contain business logic.
- Renderer should not access secrets.
- Renderer should not call GitHub directly.
- Renderer should not spawn Codex.
- GitHub-specific logic must stay inside GitHub provider.
- Codex raw protocol must stay inside Codex runtime layer.
- UI consumes only canonical app events.
- All generated AI content must be saved locally.
- All task outputs should be recoverable after app restart.

For MVP, submit the generated markdown as a single PR review body.

Do not implement inline comments yet.

Make the app visually polished but still shippable.

The product’s key differentiator is:

> Review Master turns a chaotic PR diff into a guided review workflow: context first, files in the right order, risks surfaced early, and a final editable markdown review only after the human has reviewed the change.

