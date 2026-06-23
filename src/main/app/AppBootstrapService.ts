import { execa } from 'execa'
import type { BootstrapStatus, CodexStatus, GitStatus } from '../../shared/types'
import type { CodexRuntime } from '../contracts'
import type { AccountService } from '../auth/AccountService'
import { logger } from './Logger'

/**
 * Aggregates the readiness signals shown on the onboarding/bootstrap screen:
 * git availability, Codex CLI/auth status and connected accounts.
 */
export class AppBootstrapService {
  private readonly log = logger.scope('bootstrap')

  constructor(
    private readonly codex: CodexRuntime,
    private readonly accounts: AccountService,
    private readonly getAppVersion: () => string
  ) {}

  async getBootstrapStatus(): Promise<BootstrapStatus> {
    const [git, codex] = await Promise.all([this.detectGit(), this.getCodexStatus()])
    const accounts = this.accounts.list()

    // `ready` means the user can proceed: Codex must be authenticated.
    // Connecting an account is part of onboarding but not required to be ready.
    const ready = codex.authenticated

    return {
      appVersion: this.getAppVersion(),
      codex,
      git,
      hasAccounts: accounts.length > 0,
      accounts,
      ready
    }
  }

  private async detectGit(): Promise<GitStatus> {
    try {
      const { stdout } = await execa('git', ['--version'])
      const match = stdout.match(/\d+\.\d+(\.\d+)?/)
      return { available: true, version: match ? match[0] : undefined }
    } catch (error) {
      this.log.warn('git not detected', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { available: false }
    }
  }

  private async getCodexStatus(): Promise<CodexStatus> {
    try {
      return await this.codex.getStatus()
    } catch (error) {
      this.log.error('codex status check failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        cliInstalled: false,
        authenticated: false,
        serverState: 'error',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
