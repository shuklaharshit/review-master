import keytar from 'keytar'
import type { SecureTokenStore } from '../contracts'
import { appError } from '../../shared/result'
import { logger } from '../app/Logger'
import { KEYCHAIN_SERVICE } from './tokenKeys'

// Key helpers live in the keytar-free `./tokenKeys` module so non-keychain code
// can use them without loading this native module. Re-exported here for
// backward compatibility, but new code should import them from `./tokenKeys`.
export { KEYCHAIN_SERVICE, tokenKeyForAccount } from './tokenKeys'

/**
 * OS-keychain backed secret store using keytar.
 * Maps a tokenKey to a keytar `account` under the single KEYCHAIN_SERVICE.
 * Tokens never reach the renderer and are never logged.
 */
export class SecureTokenService implements SecureTokenStore {
  private readonly log = logger.scope('tokens')

  async get(tokenKey: string): Promise<string | null> {
    try {
      return await keytar.getPassword(KEYCHAIN_SERVICE, tokenKey)
    } catch (error) {
      this.log.error('keychain get failed', { tokenKey, error: errorMessage(error) })
      throw appError('keychain_error', 'Failed to read token from keychain', true, error)
    }
  }

  async set(tokenKey: string, token: string): Promise<void> {
    try {
      await keytar.setPassword(KEYCHAIN_SERVICE, tokenKey, token)
    } catch (error) {
      this.log.error('keychain set failed', { tokenKey, error: errorMessage(error) })
      throw appError('keychain_error', 'Failed to store token in keychain', true, error)
    }
  }

  async delete(tokenKey: string): Promise<void> {
    try {
      await keytar.deletePassword(KEYCHAIN_SERVICE, tokenKey)
    } catch (error) {
      this.log.error('keychain delete failed', { tokenKey, error: errorMessage(error) })
      throw appError('keychain_error', 'Failed to delete token from keychain', true, error)
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
