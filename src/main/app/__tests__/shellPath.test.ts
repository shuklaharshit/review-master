import { describe, it, expect } from 'vitest'

import { mergePaths, extractDelimitedPath } from '../shellPath'

describe('mergePaths', () => {
  it('prepends resolved entries ahead of existing ones', () => {
    const merged = mergePaths('/opt/homebrew/bin:/usr/local/bin', '/usr/bin:/bin')
    expect(merged).toBe('/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin')
  })

  it('de-duplicates while preserving first-seen order', () => {
    const merged = mergePaths('/usr/local/bin:/usr/bin', '/usr/bin:/bin')
    expect(merged).toBe('/usr/local/bin:/usr/bin:/bin')
  })

  it('ignores empty segments from trailing/double colons', () => {
    const merged = mergePaths('/a::/b:', ':/c:')
    expect(merged).toBe('/a:/b:/c')
  })

  it('handles an empty existing PATH', () => {
    expect(mergePaths('/nvm/bin', '')).toBe('/nvm/bin')
  })
})

describe('extractDelimitedPath', () => {
  const D = '_RM_PATH_DELIM_'

  it('pulls the PATH out from between the delimiters, ignoring banner noise', () => {
    const stdout = `Welcome to your shell!\n${D}/nvm/bin:/usr/bin${D}\n`
    expect(extractDelimitedPath(stdout)).toBe('/nvm/bin:/usr/bin')
  })

  it('returns null when the delimiters are absent', () => {
    expect(extractDelimitedPath('some unrelated output')).toBeNull()
  })

  it('returns null when the fenced value is blank', () => {
    expect(extractDelimitedPath(`${D}   ${D}`)).toBeNull()
  })
})
