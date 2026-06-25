import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubApiClient } from '../GitHubApiClient'
import type { AccountService } from '../../../auth/AccountService'

// Mock Octokit so every `new Octokit()` exposes the installation endpoints we
// drive from the test. Hoisted so the vi.mock factory can close over them
// (vitest hoists vi.mock above the imports, so the static import is mocked).
const { mockListInstallations, mockListRepos } = vi.hoisted(() => ({
  mockListInstallations: vi.fn(),
  mockListRepos: vi.fn()
}))

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    rest: {
      apps: {
        listInstallationsForAuthenticatedUser: mockListInstallations,
        listInstallationReposForAuthenticatedUser: mockListRepos
      }
    }
  }))
}))

function makeRepo(id: number) {
  return { id, name: `repo${id}`, full_name: `acme/repo${id}`, private: false }
}

function installationsPage(ids: number[]) {
  return { data: { total_count: ids.length, installations: ids.map((id) => ({ id })) } }
}
function reposPage(repos: ReturnType<typeof makeRepo>[]) {
  return { data: { total_count: repos.length, repositories: repos } }
}

function makeClient(): GitHubApiClient {
  const accounts = {
    getToken: vi.fn(async () => 'tok'),
    forceRefresh: vi.fn(async () => null),
    setNeedsReauth: vi.fn()
  } as unknown as AccountService
  return new GitHubApiClient(accounts)
}

describe('GitHubApiClient — installation-scoped repos (ADR-0007)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aggregates repositories across installations and dedupes by id', async () => {
    mockListInstallations.mockResolvedValueOnce(installationsPage([1, 2]))
    mockListRepos
      .mockResolvedValueOnce(reposPage([makeRepo(10), makeRepo(11)])) // installation 1
      .mockResolvedValueOnce(reposPage([makeRepo(11), makeRepo(12)])) // installation 2 (11 dup)

    const repos = await makeClient().listAllRepos('acct1')

    expect(repos.map((r) => r.id).sort()).toEqual([10, 11, 12])
    expect(mockListRepos).toHaveBeenCalledWith(
      expect.objectContaining({ installation_id: 1, page: 1 })
    )
    expect(mockListRepos).toHaveBeenCalledWith(
      expect.objectContaining({ installation_id: 2, page: 1 })
    )
  })

  it('paginates within an installation until a short page', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => makeRepo(i + 1))
    mockListInstallations.mockResolvedValueOnce(installationsPage([1]))
    mockListRepos
      .mockResolvedValueOnce(reposPage(fullPage)) // page 1: full → keep paging
      .mockResolvedValueOnce(reposPage([makeRepo(101), makeRepo(102)])) // page 2: short → stop

    const repos = await makeClient().listAllRepos('acct1')

    expect(repos).toHaveLength(102)
    expect(mockListRepos).toHaveBeenCalledTimes(2)
    expect(mockListRepos).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('hasInstallations reflects the installation count', async () => {
    const client = makeClient()
    mockListInstallations.mockResolvedValueOnce({ data: { total_count: 3, installations: [{ id: 1 }] } })
    expect(await client.hasInstallations('acct1')).toBe(true)

    mockListInstallations.mockResolvedValueOnce({ data: { total_count: 0, installations: [] } })
    expect(await client.hasInstallations('acct1')).toBe(false)
  })

  it('returns no repos when there are no installations', async () => {
    mockListInstallations.mockResolvedValueOnce(installationsPage([]))
    const repos = await makeClient().listAllRepos('acct1')
    expect(repos).toEqual([])
    expect(mockListRepos).not.toHaveBeenCalled()
  })
})
