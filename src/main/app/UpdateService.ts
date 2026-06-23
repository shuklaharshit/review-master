import electronUpdater from 'electron-updater'
import type { UpdateState, UpdateStatus, VersionPolicy } from '../../shared/types'
import type { EventBus } from '../contracts'
import { logger } from './Logger'

const { autoUpdater } = electronUpdater

/**
 * Compares two semver-ish version strings (numeric core only; pre-release tags
 * are ignored). Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((p) => Number.parseInt(p, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da < db) return -1
    if (da > db) return 1
  }
  return 0
}

/**
 * Wraps electron-updater for auto-update and a hosted version policy for forced
 * updates. All autoUpdater calls are guarded so they don't throw in dev (where
 * the app is unpackaged and update metadata is unavailable). Status changes are
 * emitted to the renderer as `update.status` events (spec §23).
 */
export class UpdateService {
  private readonly log = logger.scope('update')
  private wired = false

  constructor(
    private readonly eventBus: EventBus,
    private readonly getAppVersion: () => string
  ) {
    autoUpdater.autoDownload = false
    autoUpdater.logger = null
    this.wireEvents()
  }

  async check(): Promise<UpdateStatus> {
    try {
      this.emit('checking')
      const result = await autoUpdater.checkForUpdates()
      const newVersion = result?.updateInfo?.version
      if (newVersion && compareSemver(this.getAppVersion(), newVersion) < 0) {
        return this.emit('available', { newVersion })
      }
      return this.emit('not-available')
    } catch (error) {
      return this.emitError(error)
    }
  }

  async download(): Promise<void> {
    try {
      this.emit('downloading', { progressPercent: 0 })
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.emitError(error)
    }
  }

  async install(): Promise<void> {
    try {
      autoUpdater.quitAndInstall()
    } catch (error) {
      this.emitError(error)
    }
  }

  /**
   * Fetches a hosted VersionPolicy JSON and compares minimumSupportedVersion
   * against the current version. If current < minimum and the policy is
   * critical, returns forced:true with an 'unsupported' status. Defensive: any
   * fetch/parse failure or missing url returns forced:false.
   */
  async checkVersionPolicy(
    policyUrl?: string
  ): Promise<{ forced: boolean; status: UpdateStatus }> {
    const current = this.getAppVersion()
    if (!policyUrl) {
      return { forced: false, status: { state: 'idle', currentVersion: current } }
    }
    try {
      const res = await fetch(policyUrl, { method: 'GET' })
      if (!res.ok) {
        throw new Error(`policy fetch failed: ${res.status}`)
      }
      const policy = (await res.json()) as VersionPolicy
      const below = compareSemver(current, policy.minimumSupportedVersion) < 0
      if (below && policy.critical) {
        const status: UpdateStatus = {
          state: 'unsupported',
          currentVersion: current,
          newVersion: policy.minimumSupportedVersion,
          message: policy.message,
          forced: true
        }
        this.eventBus.emit({ type: 'update.status', status })
        return { forced: true, status }
      }
      return { forced: false, status: { state: 'idle', currentVersion: current } }
    } catch (error) {
      this.log.warn('version policy check failed; allowing usage', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { forced: false, status: { state: 'idle', currentVersion: current } }
    }
  }

  private wireEvents(): void {
    if (this.wired) return
    this.wired = true

    autoUpdater.on('checking-for-update', () => this.emit('checking'))
    autoUpdater.on('update-available', (info) => this.emit('available', { newVersion: info?.version }))
    autoUpdater.on('update-not-available', () => this.emit('not-available'))
    autoUpdater.on('download-progress', (progress) =>
      this.emit('downloading', { progressPercent: Math.round(progress?.percent ?? 0) })
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.emit('downloaded', { newVersion: info?.version })
    )
    autoUpdater.on('error', (error) => this.emitError(error))
  }

  private emit(state: UpdateState, extra?: Partial<UpdateStatus>): UpdateStatus {
    const status: UpdateStatus = {
      state,
      currentVersion: this.getAppVersion(),
      ...extra
    }
    this.eventBus.emit({ type: 'update.status', status })
    return status
  }

  private emitError(error: unknown): UpdateStatus {
    const message = error instanceof Error ? error.message : String(error)
    this.log.error('update error', { error: message })
    return this.emit('error', { message })
  }
}
