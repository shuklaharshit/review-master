import type BetterSqlite3 from 'better-sqlite3'
import type { SettingsRepository as ISettingsRepository } from '../types'
import { nowIso } from '../../../shared/dates'

interface SettingsRow {
  key: string
  value_json: string
  updated_at: string
}

export class SettingsRepository implements ISettingsRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  get<T>(key: string): T | null {
    const row = this.db
      .prepare('SELECT value_json FROM app_settings WHERE key = ?')
      .get(key) as Pick<SettingsRow, 'value_json'> | undefined
    if (!row) return null
    return JSON.parse(row.value_json) as T
  }

  set<T>(key: string, value: T): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(key, JSON.stringify(value ?? null), nowIso())
  }

  getAll(): Record<string, unknown> {
    const rows = this.db
      .prepare('SELECT key, value_json FROM app_settings')
      .all() as Pick<SettingsRow, 'key' | 'value_json'>[]
    const result: Record<string, unknown> = {}
    for (const row of rows) {
      result[row.key] = JSON.parse(row.value_json)
    }
    return result
  }
}
