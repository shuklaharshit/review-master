import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../db'
import type { Database } from '../types'

describe('SettingsRepository', () => {
  let db: Database

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('get returns null for an unknown key', () => {
    expect(db.settings.get('missing')).toBeNull()
  })

  it('set/get round-trips primitive and object values via JSON', () => {
    db.settings.set('aString', 'hello')
    db.settings.set('aNumber', 42)
    db.settings.set('aBool', true)
    db.settings.set('anObject', { a: 1, b: ['x', 'y'] })
    db.settings.set('anArray', [1, 2, 3])

    expect(db.settings.get<string>('aString')).toBe('hello')
    expect(db.settings.get<number>('aNumber')).toBe(42)
    expect(db.settings.get<boolean>('aBool')).toBe(true)
    expect(db.settings.get<{ a: number; b: string[] }>('anObject')).toEqual({
      a: 1,
      b: ['x', 'y']
    })
    expect(db.settings.get<number[]>('anArray')).toEqual([1, 2, 3])
  })

  it('set overwrites an existing key (upsert on key)', () => {
    db.settings.set('k', 'first')
    db.settings.set('k', 'second')
    expect(db.settings.get<string>('k')).toBe('second')
    // Only one row.
    expect(Object.keys(db.settings.getAll())).toEqual(['k'])
  })

  it('set(undefined) stores JSON null and reads back null', () => {
    db.settings.set('k', undefined as unknown as string)
    expect(db.settings.get('k')).toBeNull()
  })

  it('getAll returns all settings parsed', () => {
    db.settings.set('a', 1)
    db.settings.set('b', { nested: true })
    expect(db.settings.getAll()).toEqual({ a: 1, b: { nested: true } })
  })

  it('getAll returns an empty object when no settings', () => {
    expect(db.settings.getAll()).toEqual({})
  })
})
