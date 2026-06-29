// Minimal, dependency-free .env loader for development.
//
// Imported FIRST in src/main/index.ts so that env vars are populated into
// process.env before any module that reads them (e.g. shared/constants.ts'
// GITHUB_CLIENT_ID) is evaluated. ESM evaluates imports depth-first in source
// order, so this side effect runs before the rest of the import graph.
//
// The canonical GitHub App identity is baked into shared/constants.ts (it's
// public, not a secret). A local .env is OPTIONAL here and only OVERRIDES that
// default — e.g. a fork pointing the device flow at its own GitHub App.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) out[key] = value
  }
  return out
}

try {
  const path = resolve(process.cwd(), '.env')
  if (existsSync(path)) {
    const parsed = parseEnv(readFileSync(path, 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      // Real shell environment always takes precedence over the .env file.
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
} catch {
  // Never let env loading break startup.
}
