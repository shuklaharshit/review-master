import { beforeEach, describe, expect, it } from 'vitest'
import type { PullRequestRef, Repository } from '@shared/types'
import { useAppStore } from '../appStore'

function makeRepo(id: string): Repository {
  return {
    id,
    providerId: 'github',
    accountId: 'acc-1',
    providerRepoId: id,
    owner: 'octo',
    name: `repo-${id}`,
    fullName: `octo/repo-${id}`,
    private: false
  }
}

function makeRef(number: number): PullRequestRef {
  return { accountId: 'acc-1', repoId: 'r1', owner: 'octo', repo: 'repo-r1', number }
}

const store = () => useAppStore.getState()

/** Reset to a single-entry history seeded at the accounts screen. */
function reset(): void {
  const seed = { route: 'accounts' as const, activeAccountId: 'acc-1', selectedRepo: null, selectedPrRef: null }
  useAppStore.setState({
    ...seed,
    history: [seed],
    historyIndex: 0,
    canGoBack: false,
    canGoForward: false
  })
}

describe('appStore navigation history', () => {
  beforeEach(reset)

  it('seeds a single entry with no back/forward available', () => {
    expect(store().historyIndex).toBe(0)
    expect(store().history).toHaveLength(1)
    expect(store().canGoBack).toBe(false)
    expect(store().canGoForward).toBe(false)
  })

  it('pushes a new entry on each distinct navigation', () => {
    store().selectRepo(makeRepo('r1')) // → prs
    store().openWorkspaceFor(makeRef(7)) // → workspace

    expect(store().history).toHaveLength(3)
    expect(store().historyIndex).toBe(2)
    expect(store().route).toBe('workspace')
    expect(store().canGoBack).toBe(true)
    expect(store().canGoForward).toBe(false)
  })

  it('restores the full location (route + selection) on goBack/goForward', () => {
    store().selectRepo(makeRepo('r1'))
    store().openWorkspaceFor(makeRef(7))

    store().goBack()
    expect(store().route).toBe('prs')
    expect(store().selectedRepo?.id).toBe('r1')
    expect(store().selectedPrRef).toBeNull()

    store().goBack()
    expect(store().route).toBe('accounts')
    expect(store().selectedRepo).toBeNull()

    store().goForward()
    expect(store().route).toBe('prs')
    expect(store().selectedRepo?.id).toBe('r1')
  })

  it('does not push a dead entry when navigating to the current location', () => {
    store().selectRepo(makeRepo('r1'))
    const before = store().history.length
    store().selectRepo(makeRepo('r1')) // same repo + route → no-op
    expect(store().history).toHaveLength(before)
    expect(store().historyIndex).toBe(before - 1)
  })

  it('truncates the forward stack when navigating somewhere new after going back', () => {
    store().selectRepo(makeRepo('r1'))
    store().openWorkspaceFor(makeRef(7))
    store().goBack() // now at prs, with workspace ahead
    expect(store().canGoForward).toBe(true)

    store().setRoute('settings') // new branch — forward entry is discarded
    expect(store().canGoForward).toBe(false)
    expect(store().route).toBe('settings')
    expect(store().history.map((h) => h.route)).toEqual(['accounts', 'prs', 'settings'])
  })

  it('is a no-op at the ends of the stack', () => {
    store().goBack() // already at index 0
    expect(store().historyIndex).toBe(0)

    store().selectRepo(makeRepo('r1'))
    store().goForward() // already at the newest entry
    expect(store().historyIndex).toBe(1)
  })

  it('replace overwrites the current entry instead of pushing', () => {
    store().selectRepo(makeRepo('r1'))
    const len = store().history.length
    store().navigate({ route: 'settings' }, { replace: true })
    expect(store().history).toHaveLength(len)
    expect(store().route).toBe('settings')
    expect(store().history[store().historyIndex].route).toBe('settings')
  })

  it('records an account switch as a single history entry', () => {
    store().selectRepo(makeRepo('r1'))
    store().openWorkspaceFor(makeRef(7))
    const before = store().history.length

    store().switchAccount('acc-2')
    expect(store().history).toHaveLength(before + 1)
    expect(store().route).toBe('repos')
    expect(store().activeAccountId).toBe('acc-2')
    expect(store().selectedRepo).toBeNull()
    expect(store().selectedPrRef).toBeNull()

    // Back crosses the account boundary, restoring the previous account context.
    store().goBack()
    expect(store().route).toBe('workspace')
    expect(store().activeAccountId).toBe('acc-1')
  })

  it('updates the current entry in place when the active account is seeded', () => {
    store().selectRepo(makeRepo('r1'))
    const idx = store().historyIndex
    store().setActiveAccountId('seeded')
    expect(store().activeAccountId).toBe('seeded')
    expect(store().historyIndex).toBe(idx) // no new entry
    expect(store().history[idx].activeAccountId).toBe('seeded')
  })
})
