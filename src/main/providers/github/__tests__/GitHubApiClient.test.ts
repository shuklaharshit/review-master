import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubApiClient } from '../GitHubApiClient'
import type { AccountService } from '../../../auth/AccountService'

// Mock Octokit so every `new Octokit()` exposes the installation endpoints we
// drive from the test. Hoisted so the vi.mock factory can close over them
// (vitest hoists vi.mock above the imports, so the static import is mocked).
const { mockListInstallations, mockListRepos, mockGetContent } = vi.hoisted(() => ({
  mockListInstallations: vi.fn(),
  mockListRepos: vi.fn(),
  mockGetContent: vi.fn()
}))

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    rest: {
      apps: {
        listInstallationsForAuthenticatedUser: mockListInstallations,
        listInstallationReposForAuthenticatedUser: mockListRepos
      },
      repos: {
        getContent: mockGetContent
      }
    }
  }))
}))

/** Mirrors the GitHub Contents API shape for a file blob. */
function fileContentResponse(text: string | null, overrides: Record<string, unknown> = {}) {
  const content = text == null ? '' : Buffer.from(text, 'utf8').toString('base64')
  return { data: { type: 'file', encoding: 'base64', content, size: text?.length ?? 0, ...overrides } }
}

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

describe('GitHubApiClient — getFileContent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('decodes a base64 text blob and requests the given ref', async () => {
    mockGetContent.mockResolvedValueOnce(fileContentResponse('line1\nline2\n'))

    const res = await makeClient().getFileContent('acct1', 'acme', 'repo', 'src/a.ts', 'deadbeef')

    expect(res).toEqual({ text: 'line1\nline2\n', isBinary: false, truncated: false, byteSize: 12 })
    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'repo',
      path: 'src/a.ts',
      ref: 'deadbeef'
    })
  })

  it('flags binary content (NUL byte) without returning text', async () => {
    const b64 = Buffer.from([0x89, 0x50, 0x00, 0x01]).toString('base64')
    mockGetContent.mockResolvedValueOnce({ data: { type: 'file', encoding: 'base64', content: b64, size: 4 } })

    const res = await makeClient().getFileContent('acct1', 'acme', 'repo', 'img.png', 'sha')

    expect(res.isBinary).toBe(true)
    expect(res.text).toBeNull()
  })

  it('flags oversized files (empty content but non-zero size) as truncated', async () => {
    mockGetContent.mockResolvedValueOnce(fileContentResponse(null, { size: 5_000_000 }))

    const res = await makeClient().getFileContent('acct1', 'acme', 'repo', 'big.json', 'sha')

    expect(res.truncated).toBe(true)
    expect(res.text).toBeNull()
    expect(res.byteSize).toBe(5_000_000)
  })

  it('rejects a path that resolves to a directory', async () => {
    mockGetContent.mockResolvedValueOnce({ data: [{ type: 'file', name: 'a.ts' }] })

    await expect(
      makeClient().getFileContent('acct1', 'acme', 'repo', 'src', 'sha')
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})
