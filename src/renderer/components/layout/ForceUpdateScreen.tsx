import type { UpdateStatus } from '@shared/types'
import { Button } from '../ui/Button'
import { AlertTriangleIcon } from '../ui/icons'
import { api } from '../../lib/api'

export function ForceUpdateScreen({ status }: { status: UpdateStatus }): JSX.Element {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5 bg-background px-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertTriangleIcon className="h-6 w-6" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold text-text-primary">Update required</h1>
        <p className="text-[13px] leading-relaxed text-text-secondary">
          {status.message ?? 'This version of Review Master is no longer supported. Please update to continue.'}
        </p>
        <p className="text-[11px] text-text-muted">
          Current version {status.currentVersion}
          {status.newVersion ? ` • Latest ${status.newVersion}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {status.state === 'downloaded' ? (
          <Button variant="primary" onClick={() => void api.updates.install()}>
            Restart &amp; install
          </Button>
        ) : (
          <Button
            variant="primary"
            loading={status.state === 'downloading'}
            onClick={() => void api.updates.download()}
          >
            {status.state === 'downloading'
              ? `Downloading… ${status.progressPercent ?? 0}%`
              : 'Download update'}
          </Button>
        )}
        <Button variant="ghost" onClick={() => void api.app.openExternal('https://github.com/review-master/review-master/releases')}>
          Open releases
        </Button>
      </div>
    </div>
  )
}
