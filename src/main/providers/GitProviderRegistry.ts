import type { GitProviderId } from '../../shared/types'
import { appError } from '../../shared/result'
import type { GitProvider } from './GitProvider'

export interface ProviderAvailability {
  id: GitProviderId
  displayName: string
  available: boolean
}

const PROVIDER_CATALOG: Array<{ id: GitProviderId; displayName: string }> = [
  { id: 'github', displayName: 'GitHub' },
  { id: 'gitlab', displayName: 'GitLab' },
  { id: 'bitbucket', displayName: 'Bitbucket' }
]

/**
 * Holds the registered GitProvider implementations. MVP registers GitHub only;
 * GitLab/Bitbucket are surfaced to the UI as "coming soon".
 */
export class GitProviderRegistry {
  private readonly providers = new Map<GitProviderId, GitProvider>()

  constructor(github?: GitProvider) {
    if (github) this.register(github)
  }

  register(provider: GitProvider): void {
    this.providers.set(provider.id, provider)
  }

  /** Returns a registered provider, or throws (coming_soon for known-but-unbuilt). */
  get(id: GitProviderId): GitProvider {
    const provider = this.providers.get(id)
    if (provider) return provider

    if (id === 'gitlab' || id === 'bitbucket') {
      throw appError('provider_coming_soon', `${labelFor(id)} support is coming soon.`, false, { id })
    }
    throw appError('provider_not_registered', `No provider registered for "${id}".`, false, { id })
  }

  has(id: GitProviderId): boolean {
    return this.providers.has(id)
  }

  /** Catalog for the UI: github available, others coming soon. */
  available(): ProviderAvailability[] {
    return PROVIDER_CATALOG.map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
      available: this.providers.has(entry.id)
    }))
  }
}

function labelFor(id: GitProviderId): string {
  return PROVIDER_CATALOG.find((p) => p.id === id)?.displayName ?? id
}
