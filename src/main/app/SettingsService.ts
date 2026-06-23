import type { AppSettings } from '../../shared/types'
import type { Database } from '../db/types'
import { DEFAULT_SETTINGS } from '../../shared/constants'

const SETTINGS_KEY = 'app_settings'

/**
 * Loads and persists AppSettings. Stored as a single 'app_settings' object in
 * the settings repo and always merged over DEFAULT_SETTINGS on read so new
 * default keys appear for existing installs. Validation happens at the IPC layer.
 */
export class SettingsService {
  constructor(private readonly db: Database) {}

  get(): AppSettings {
    const stored = this.db.settings.get<Partial<AppSettings>>(SETTINGS_KEY)
    return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next: AppSettings = { ...this.get(), ...patch }
    this.db.settings.set<AppSettings>(SETTINGS_KEY, next)
    return next
  }

  // --- Convenience getters used by CodexProviderService ---------------------

  getCodexBinaryMode(): 'auto' | 'custom' {
    return this.get().codexBinaryMode
  }

  getCodexBinaryPath(): string | undefined {
    const settings = this.get()
    return settings.codexBinaryMode === 'custom' ? settings.codexBinaryPath : undefined
  }
}
