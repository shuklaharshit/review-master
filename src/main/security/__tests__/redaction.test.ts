import { describe, it, expect } from 'vitest'
import { redactSecrets } from '../redaction'

describe('redactSecrets', () => {
  it('redacts GitHub personal access tokens (ghp_)', () => {
    const out = redactSecrets('token is ghp_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(out).toBe('token is [REDACTED]')
  })

  it('redacts GitHub OAuth tokens (gho_)', () => {
    expect(redactSecrets('gho_abcdefghijklmnopqrstuvwxyz0123456789')).toBe('[REDACTED]')
  })

  it('redacts GitHub server-to-server tokens (ghs_)', () => {
    expect(redactSecrets('ghs_abcdefghijklmnopqrstuvwxyz0123456789')).toBe('[REDACTED]')
  })

  it('redacts fine-grained GitHub PATs (github_pat_)', () => {
    const out = redactSecrets('github_pat_11ABCDEFG0123456789_abcdefghijklmnop')
    expect(out).toBe('[REDACTED]')
  })

  it('redacts Bearer auth headers (case-insensitive)', () => {
    expect(redactSecrets('Authorization: Bearer abc.def-ghi_123')).toBe('Authorization: [REDACTED]')
    expect(redactSecrets('authorization: bearer abc.def-ghi_123')).toBe('authorization: [REDACTED]')
  })

  it('redacts "token":"..." JSON values', () => {
    const out = redactSecrets('{"token": "supersecretvalue", "user": "alice"}')
    expect(out).toContain('[REDACTED]')
    expect(out).not.toContain('supersecretvalue')
    // The username, which is not a secret, is preserved.
    expect(out).toContain('"user": "alice"')
  })

  it('redacts access_token=... query params', () => {
    expect(redactSecrets('https://x?access_token=abcdef123&foo=bar')).toBe('https://x?[REDACTED]&foo=bar')
  })

  it('redacts OpenAI-style sk- keys', () => {
    expect(redactSecrets('sk-abcdefghijklmnopqrstuvwxyz0123')).toBe('[REDACTED]')
  })

  it('leaves ordinary text untouched', () => {
    const text = 'This is a normal log line about reviewing PR #42 with no secrets.'
    expect(redactSecrets(text)).toBe(text)
  })

  it('does not redact short sk- prefixes below the length threshold', () => {
    // sk- requires 20+ trailing chars; a short value is left alone.
    const text = 'sk-short'
    expect(redactSecrets(text)).toBe(text)
  })

  it('redacts multiple secrets in one string', () => {
    const input =
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789 and Bearer tok123 and access_token=zzz999'
    const out = redactSecrets(input)
    expect(out).toBe('[REDACTED] and [REDACTED] and [REDACTED]')
    expect(out).not.toContain('ghp_')
    expect(out).not.toContain('tok123')
    expect(out).not.toContain('zzz999')
  })

  it('redacts repeated occurrences of the same pattern (global flag)', () => {
    const input = 'gho_aaaaaaaaaaaaaaaaaaaaaaaa gho_bbbbbbbbbbbbbbbbbbbbbbbb'
    expect(redactSecrets(input)).toBe('[REDACTED] [REDACTED]')
  })

  it('returns empty string unchanged', () => {
    expect(redactSecrets('')).toBe('')
  })
})
