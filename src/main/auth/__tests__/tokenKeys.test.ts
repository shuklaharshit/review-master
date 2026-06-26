import { describe, it, expect } from 'vitest'
import { KEYCHAIN_SERVICE, tokenKeyForAccount } from '../tokenKeys'

// These helpers were split out of SecureTokenService specifically so they (and
// AccountService, which uses them) don't transitively import the native
// `keytar` module — which fails to load on the CI Linux runner (no libsecret).
// This suite must NOT pull in keytar; if it ever starts failing to load on
// Linux CI, something re-coupled the key helpers to the keychain module.
describe('tokenKeys', () => {
  it('builds the canonical per-account keychain key (spec §11.4)', () => {
    expect(tokenKeyForAccount('acct1')).toBe('review-master.github.account.acct1')
  })

  it('namespaces keys by account id', () => {
    expect(tokenKeyForAccount('a')).not.toBe(tokenKeyForAccount('b'))
  })

  it('uses the shared keychain service name', () => {
    expect(KEYCHAIN_SERVICE).toBe('review-master')
  })
})
