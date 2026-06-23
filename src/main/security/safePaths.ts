import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { appError } from '../../shared/result'

/**
 * Sanitises a single path segment so it cannot escape its parent dir.
 * Strips path separators, control chars (incl. null bytes) and `..` traversal.
 */
function sanitizeSegment(segment: string): string {
  const cleaned = segment
    .replace(/[/\\]/g, '_') // path separators
    .replace(/\.\.+/g, '_') // collapse traversal dots
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '') // control chars incl. null bytes
    .replace(/^\.+/, '') // leading dots
    .trim()
  return cleaned.length > 0 ? cleaned : '_'
}

/**
 * Keeps all filesystem access scoped inside the app data root.
 * Construct with the resolved app data root directory.
 */
export class SafePaths {
  private readonly root: string

  constructor(appDataRoot: string) {
    this.root = path.resolve(appDataRoot)
  }

  dataRoot(): string {
    return this.root
  }

  dbPath(): string {
    return path.join(this.root, 'review-master.sqlite')
  }

  reposDir(): string {
    return path.join(this.root, 'repos')
  }

  /**
   * Cache dir for a checked-out repo:
   * <root>/repos/<provider>/<accountId>/<owner>__<repo>
   */
  repoCachePath(providerId: string, accountId: string, owner: string, repo: string): string {
    const provider = sanitizeSegment(providerId)
    const account = sanitizeSegment(accountId)
    const dirName = `${sanitizeSegment(owner)}__${sanitizeSegment(repo)}`
    const candidate = path.join(this.reposDir(), provider, account, dirName)
    this.assertInside(this.reposDir(), candidate)
    return candidate
  }

  generatedReviewsDir(): string {
    return path.join(this.root, 'generated', 'reviews')
  }

  logsDir(): string {
    return path.join(this.root, 'logs')
  }

  tempDir(): string {
    return path.join(this.root, 'temp')
  }

  /** Throws appError('unsafe_path') if `candidate` resolves outside `root`. */
  assertInside(root: string, candidate: string): void {
    const resolvedRoot = path.resolve(root)
    const resolvedCandidate = path.resolve(candidate)
    const rel = path.relative(resolvedRoot, resolvedCandidate)
    const escapes = rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)
    if (escapes) {
      throw appError('unsafe_path', `Path escapes data root: ${resolvedCandidate}`, false)
    }
  }

  /** mkdir -p the standard directories under the data root. */
  ensureDirsSync(): void {
    const dirs = [
      this.root,
      this.reposDir(),
      this.generatedReviewsDir(),
      this.logsDir(),
      this.tempDir()
    ]
    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true })
    }
  }
}
