import { Octokit } from '@octokit/rest'
import type { AuthFlowStartResult } from '../../../shared/types'
import { appError } from '../../../shared/result'
import { newId } from '../../../shared/ids'
import { GITHUB_CLIENT_ID, GITHUB_OAUTH_SCOPES } from '../../../shared/constants'
import { logger } from '../../app/Logger'
import type {
  AuthenticatedUser,
  AuthFlowResult,
  AuthFlowState,
  DeviceCodeResponse,
  DeviceTokenResponse
} from './GitHubTypes'

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

/**
 * GitHub OAuth Device Flow (spec §11.2). No client secret is embedded. Uses
 * the public client id and the global fetch for the (un-Octokit'd) device
 * endpoints, then Octokit for the authenticated-user lookup.
 */
export class GitHubAuthService {
  private readonly log = logger.scope('github-auth')
  private readonly flows = new Map<string, AuthFlowState>()

  /** Step 3-4: start device flow, return user code + verification uri. */
  async startAuthFlow(): Promise<AuthFlowStartResult> {
    const res = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: GITHUB_OAUTH_SCOPES.join(' ')
      })
    })

    if (!res.ok) {
      throw appError('auth_start_failed', `Failed to start GitHub login (${res.status}).`)
    }

    const data = (await res.json()) as DeviceCodeResponse
    if (!data.device_code || !data.user_code) {
      throw appError('auth_start_failed', 'GitHub returned an invalid device-code response.')
    }

    const flowId = newId('flow')
    const intervalSeconds = data.interval && data.interval > 0 ? data.interval : 5
    this.flows.set(flowId, {
      flowId,
      deviceCode: data.device_code,
      intervalSeconds,
      baseIntervalSeconds: intervalSeconds,
      expiresAt: Date.now() + data.expires_in * 1000,
      cancelled: false
    })

    this.log.info('device flow started', { flowId, expiresIn: data.expires_in })

    return {
      flowId,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresInSeconds: data.expires_in,
      intervalSeconds
    }
  }

  /** Step 7: poll the token endpoint until authorised, expired, or cancelled. */
  async awaitAuthFlow(flowId: string): Promise<AuthFlowResult> {
    const state = this.flows.get(flowId)
    if (!state) {
      throw appError('auth_flow_unknown', 'Unknown or expired login flow.', false)
    }

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (state.cancelled) {
          throw appError('auth_cancelled', 'Login was cancelled.', false)
        }
        if (Date.now() > state.expiresAt) {
          throw appError('auth_expired', 'The login code expired. Please try again.')
        }

        await this.delay(state.intervalSeconds * 1000, state)

        if (state.cancelled) {
          throw appError('auth_cancelled', 'Login was cancelled.', false)
        }

        const data = await this.pollToken(state.deviceCode)

        if (data.access_token) {
          const scopes = (data.scope ?? '').split(/[, ]+/).filter(Boolean)
          this.log.info('device flow authorised', { flowId, scopeCount: scopes.length })
          return { token: data.access_token, scopes }
        }

        switch (data.error) {
          case 'authorization_pending':
            // Healthy poll: relax back to GitHub's base interval so a single
            // earlier slow_down doesn't keep us at the inflated cadence (which
            // was causing the ~10s detection lag).
            state.intervalSeconds = state.baseIntervalSeconds
            break
          case 'slow_down':
            // GitHub asks us to back off; honour interval if provided, else +5s.
            state.intervalSeconds = data.interval && data.interval > 0
              ? data.interval
              : state.intervalSeconds + 5
            break
          case 'expired_token':
            throw appError('auth_expired', 'The login code expired. Please try again.')
          case 'access_denied':
            throw appError('auth_denied', 'GitHub authorisation was denied.', false)
          default:
            throw appError(
              'auth_failed',
              data.error_description || `GitHub login failed (${data.error ?? 'unknown'}).`
            )
        }
      }
    } finally {
      this.flows.delete(flowId)
    }
  }

  /** Sets the cancelled flag; the poll loop rejects with auth_cancelled. */
  async cancelAuthFlow(flowId: string): Promise<void> {
    const state = this.flows.get(flowId)
    if (state) {
      state.cancelled = true
      this.log.info('device flow cancelled', { flowId })
    }
  }

  /** Step 8: resolve the authenticated user for the freshly issued token. */
  async getAuthenticatedUser(token: string): Promise<AuthenticatedUser> {
    const octokit = new Octokit({ auth: token })
    try {
      const res = await octokit.rest.users.getAuthenticated()
      const user = res.data
      return {
        id: user.id,
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url
      }
    } catch {
      throw appError('auth_user_failed', 'Could not load your GitHub profile.')
    }
  }

  private async pollToken(deviceCode: string): Promise<DeviceTokenResponse> {
    const res = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: DEVICE_GRANT_TYPE
      })
    })

    if (!res.ok) {
      throw appError('auth_poll_failed', `GitHub login polling failed (${res.status}).`)
    }
    return (await res.json()) as DeviceTokenResponse
  }

  /** Cancellable delay: resolves early if the flow is cancelled. */
  private delay(ms: number, state: AuthFlowState): Promise<void> {
    return new Promise((resolve) => {
      const started = Date.now()
      const tick = (): void => {
        if (state.cancelled || Date.now() - started >= ms) {
          resolve()
          return
        }
        setTimeout(tick, Math.min(250, ms))
      }
      tick()
    })
  }
}
