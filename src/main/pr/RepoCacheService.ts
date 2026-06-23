import { existsSync, mkdirSync } from 'node:fs'
import { execa } from 'execa'
import type { NormalizedDiff, NormalizedDiffFile } from '../../shared/types'
import type { SafePaths } from '../security/safePaths'
import type { AccountService } from '../auth/AccountService'
import { logger } from '../app/Logger'
import { parseUnifiedDiff } from './diffParser'
import type { RepoIdentity } from './prTypes'

interface CacheRef {
  providerId: string
  accountId: string
  owner: string
  repo: string
}

/**
 * Maintains a local bare-ish git cache per repo and produces deterministic
 * diffs via `git diff <base> <head>` (spec §13). Tokens are NEVER written to
 * `.git/config` — they are injected only via a per-invocation
 * `-c http.extraheader` argument and the value is never logged (spec §13.3).
 *
 * Git plumbing is intentionally defensive: any failure (git missing, fetch
 * rejected, fork PR, network) makes `buildDiff` resolve to `null` so the
 * caller falls back to the GitHub API patch model (spec §13.2 / §22.7).
 */
export class RepoCacheService {
  private readonly log = logger.scope('repo-cache')
  private gitAvailableCache: boolean | null = null

  constructor(
    private readonly safePaths: SafePaths,
    private readonly accounts: AccountService
  ) {}

  /** Detects whether `git` is on PATH (cached after first check). */
  async isGitAvailable(): Promise<boolean> {
    if (this.gitAvailableCache !== null) return this.gitAvailableCache
    try {
      await execa('git', ['--version'], { timeout: 5000 })
      this.gitAvailableCache = true
    } catch {
      this.gitAvailableCache = false
    }
    return this.gitAvailableCache
  }

  /**
   * Builds a normalised diff from a local git cache. Returns null on ANY
   * failure so the caller can fall back to the GitHub API.
   */
  async buildDiff(
    ref: CacheRef,
    repo: RepoIdentity,
    baseSha: string,
    headSha: string
  ): Promise<NormalizedDiff | null> {
    try {
      if (!(await this.isGitAvailable())) return null
      if (!baseSha || !headSha) return null

      const cacheDir = this.safePaths.repoCachePath(ref.providerId, ref.accountId, ref.owner, ref.repo)
      await this.ensureCacheRepo(cacheDir, repo.cloneUrl)

      const authArgs = await this.buildAuthArgs(ref.accountId)

      // Fetch base + head SHAs (and head ref as a fallback for fork PRs) without
      // persisting any credentials. Fetch by SHA where the server allows it.
      const fetched = await this.fetchShas(cacheDir, authArgs, [baseSha, headSha])
      if (!fetched) return null

      const { stdout } = await execa(
        'git',
        ['-C', cacheDir, 'diff', '--no-color', `${baseSha}..${headSha}`],
        { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 }
      )

      const files = parseUnifiedDiff(stdout)
      return this.toNormalizedDiff(files)
    } catch (error) {
      this.log.warn('local git diff failed, falling back to GitHub API', {
        owner: ref.owner,
        repo: ref.repo,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async ensureCacheRepo(cacheDir: string, cloneUrl: string): Promise<void> {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }
    const initialised = existsSync(`${cacheDir}/.git`) || existsSync(`${cacheDir}/HEAD`)
    if (!initialised) {
      // Initialise an empty repo and point a remote at the clone URL. The URL
      // itself contains no credentials — auth is injected per fetch.
      await execa('git', ['-C', cacheDir, 'init', '--quiet'], { timeout: 15_000 })
      await execa('git', ['-C', cacheDir, 'remote', 'add', 'origin', cloneUrl], { timeout: 15_000 })
    } else {
      // Keep the remote URL current (no credentials embedded).
      try {
        await execa('git', ['-C', cacheDir, 'remote', 'set-url', 'origin', cloneUrl], {
          timeout: 15_000
        })
      } catch {
        // Remote may not exist yet; add it.
        await execa('git', ['-C', cacheDir, 'remote', 'add', 'origin', cloneUrl], { timeout: 15_000 })
      }
    }
  }

  /**
   * Builds the per-invocation auth args. The token is base64-encoded into an
   * Authorization header passed via `-c http.extraheader`. This NEVER lands in
   * `.git/config`. Returns [] when no token is available (public repos work).
   */
  private async buildAuthArgs(accountId: string): Promise<string[]> {
    const token = await this.accounts.getToken(accountId)
    if (!token) return []
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
    // The value here is a credential — it must never be logged.
    return ['-c', `http.extraheader=AUTHORIZATION: basic ${basic}`]
  }

  private async fetchShas(cacheDir: string, authArgs: string[], shas: string[]): Promise<boolean> {
    const uniqueShas = [...new Set(shas.filter(Boolean))]
    // Attempt a direct fetch of the specific SHAs first (works when the server
    // allows fetching arbitrary objects). Fall back to fetching all refs.
    try {
      await execa(
        'git',
        [...authArgs, '-C', cacheDir, 'fetch', '--quiet', '--no-tags', 'origin', ...uniqueShas],
        { timeout: 120_000 }
      )
      return true
    } catch {
      this.log.debug('direct SHA fetch failed, retrying with full ref fetch')
    }
    try {
      await execa(
        'git',
        [
          ...authArgs,
          '-C',
          cacheDir,
          'fetch',
          '--quiet',
          '--no-tags',
          'origin',
          '+refs/heads/*:refs/remotes/origin/*',
          '+refs/pull/*/head:refs/remotes/origin/pr/*'
        ],
        { timeout: 180_000 }
      )
      // Verify both SHAs are now present locally.
      for (const sha of uniqueShas) {
        await execa('git', ['-C', cacheDir, 'cat-file', '-e', `${sha}^{commit}`], { timeout: 10_000 })
      }
      return true
    } catch {
      return false
    }
  }

  private toNormalizedDiff(files: NormalizedDiffFile[]): NormalizedDiff {
    const totalAdditions = files.reduce((s, f) => s + f.additions, 0)
    const totalDeletions = files.reduce((s, f) => s + f.deletions, 0)
    return {
      files,
      source: 'git',
      totalAdditions,
      totalDeletions
    }
  }
}
