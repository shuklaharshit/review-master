// Pure keychain key helpers — deliberately free of any `keytar` import.
//
// `keytar` is a native module that dynamically links `libsecret-1.so.0` on
// Linux at load time. Keeping these trivial string helpers in their own module
// (rather than in `SecureTokenService`, which loads keytar) lets non-keychain
// code — notably `AccountService` and its unit tests — reference them without
// dragging the native binding into the default `yarn test` suite, which has no
// keychain and runs on CI Linux runners without libsecret.

/** Keychain service name for all Review Master secrets. */
export const KEYCHAIN_SERVICE = 'review-master'

/** Builds the canonical token key for a connected account (spec §11.4). */
export function tokenKeyForAccount(accountId: string): string {
  return `review-master.github.account.${accountId}`
}
