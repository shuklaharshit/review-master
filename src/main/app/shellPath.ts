// ============================================================================
// Hydrates the main process PATH from the user's login shell.
//
// Why: a macOS/Linux app launched from Finder/Dock (not a terminal) inherits a
// minimal PATH (~ `/usr/bin:/bin:/usr/sbin:/sbin`). That omits version-manager
// bin dirs (nvm, asdf, fnm, volta) and Homebrew, so a globally-installed
// `codex` — and the `node` its launcher script needs — are invisible. We ask
// the user's login+interactive shell for its real PATH and merge it in, which
// fixes both codex *detection* (CodexBinaryLocator) and the `codex app-server`
// *spawn* (CodexProcessManager), without hardcoding install locations.
//
// Best-effort: never throws; a failure just leaves PATH as-is.
// ============================================================================

import { execa } from 'execa'

import { logger } from './Logger'

// Unlikely-to-collide markers so we can isolate PATH from any shell-init noise.
const DELIM = '_RM_PATH_DELIM_'
const SHELL_TIMEOUT_MS = 5_000

/**
 * Merge shell-resolved PATH entries ahead of the current ones, de-duplicated
 * and order-preserving. Pure so it can be unit-tested without a shell.
 */
export function mergePaths(resolved: string, existing: string): string {
  const parts = [
    ...resolved.split(':').filter(Boolean),
    ...existing.split(':').filter(Boolean)
  ]
  return Array.from(new Set(parts)).join(':')
}

/** Extract the PATH value printed between our delimiters. */
export function extractDelimitedPath(stdout: string): string | null {
  const between = stdout.split(DELIM)[1]
  const trimmed = between?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

/**
 * Query the login+interactive shell for its PATH and merge it into
 * `process.env.PATH`. No-op on Windows. Safe to call unconditionally.
 */
export async function hydrateShellPath(): Promise<void> {
  if (process.platform === 'win32') return

  const shell = process.env.SHELL || '/bin/zsh'
  try {
    // `-ilc` = interactive login shell running a command, so it sources the
    // user's rc files (where nvm/asdf hooks live). Delimiters fence the value
    // off from any banner output. DISABLE_AUTO_UPDATE silences oh-my-zsh.
    const { stdout } = await execa(
      shell,
      ['-ilc', `echo -n "${DELIM}"; printenv PATH; echo -n "${DELIM}"`],
      {
        timeout: SHELL_TIMEOUT_MS,
        env: { ...process.env, DISABLE_AUTO_UPDATE: 'true' }
      }
    )

    const resolved = extractDelimitedPath(String(stdout ?? ''))
    if (!resolved) {
      logger.warn('[path] login shell returned no PATH; leaving as-is')
      return
    }

    process.env.PATH = mergePaths(resolved, process.env.PATH ?? '')
    logger.info('[path] hydrated PATH from login shell', { shell })
  } catch (error) {
    logger.warn('[path] failed to hydrate PATH from shell', String(error))
  }
}
