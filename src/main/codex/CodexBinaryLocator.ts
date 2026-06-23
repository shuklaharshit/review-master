// ============================================================================
// Locates the `codex` CLI binary (spec §9.1).
//
// Strategy:
//   1. If a custom path is provided and works, use it.
//   2. Try `codex --version` on PATH (covers Terminal-launched Electron).
//   3. Try each CODEX_FALLBACK_PATHS entry (Finder-launched Electron has a
//      different PATH on macOS), expanding `~` to the home directory.
// Returns null if no working binary is found.
// ============================================================================

import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { execa } from 'execa'

import { CODEX_FALLBACK_PATHS } from '../../shared/constants'
import { logger } from '../app/Logger'

export interface LocatedCodexBinary {
  path: string
  version?: string
}

const VERSION_TIMEOUT_MS = 10_000

/** Expand a leading `~` to the user's home directory. */
function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return `${homedir()}/${p.slice(2)}`
  return p
}

/** Parse a semver-ish version out of `codex --version` stdout. */
function parseVersion(stdout: string): string | undefined {
  // e.g. "codex-cli 0.140.0" or "codex 0.140.0" or just "0.140.0".
  const match = stdout.match(/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/)
  return match ? match[1] : undefined
}

/** Run `<bin> --version`; resolve the parsed version or null on failure. */
async function tryVersion(bin: string): Promise<{ ok: boolean; version?: string }> {
  try {
    const { stdout } = await execa(bin, ['--version'], {
      timeout: VERSION_TIMEOUT_MS,
      reject: true
    })
    return { ok: true, version: parseVersion(String(stdout ?? '')) }
  } catch (error) {
    logger.debug('[codex] version probe failed for', bin, String(error))
    return { ok: false }
  }
}

/** True if the file at `path` exists and is executable. */
async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export async function locateCodexBinary(customPath?: string): Promise<LocatedCodexBinary | null> {
  // 1. Explicit custom path takes precedence.
  if (customPath && customPath.trim().length > 0) {
    const expanded = expandHome(customPath.trim())
    if (await isExecutable(expanded)) {
      const probe = await tryVersion(expanded)
      if (probe.ok) return { path: expanded, version: probe.version }
    } else {
      // Path may still be resolvable via PATH semantics — try running it directly.
      const probe = await tryVersion(expanded)
      if (probe.ok) return { path: expanded, version: probe.version }
    }
    logger.warn('[codex] custom binary path did not work:', expanded)
    return null
  }

  // 2. `codex` on PATH.
  const onPath = await tryVersion('codex')
  if (onPath.ok) return { path: 'codex', version: onPath.version }

  // 3. Fallback search paths.
  for (const raw of CODEX_FALLBACK_PATHS) {
    const expanded = expandHome(raw)
    if (!(await isExecutable(expanded))) continue
    const probe = await tryVersion(expanded)
    if (probe.ok) return { path: expanded, version: probe.version }
  }

  logger.warn('[codex] no working codex binary found')
  return null
}
