import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from './components/layout/AppShell'
import { Onboarding } from './routes/Onboarding'
import { AccountPicker } from './routes/AccountPicker'
import { Repositories } from './routes/Repositories'
import { PullRequests } from './routes/PullRequests'
import { ReviewWorkspace } from './routes/ReviewWorkspace'
import { Settings } from './routes/Settings'
import { ForceUpdateScreen } from './components/layout/ForceUpdateScreen'
import { useAppEvents } from './queries/useAppEvents'
import { useBootstrap } from './queries/useBootstrap'
import { useNavigationShortcuts } from './hooks/useNavigationShortcuts'
import { useAppStore } from './stores/appStore'
import { queryKeys } from './queries/keys'
import { api } from './lib/api'

export function App(): JSX.Element {
  useAppEvents()
  useNavigationShortcuts()

  const qc = useQueryClient()
  const route = useAppStore((s) => s.route)
  const navigate = useAppStore((s) => s.navigate)
  const setBootstrap = useAppStore((s) => s.setBootstrap)
  const setActiveAccountId = useAppStore((s) => s.setActiveAccountId)
  const activeAccountId = useAppStore((s) => s.activeAccountId)
  const updateStatus = useAppStore((s) => s.updateStatus)

  const { data: bootstrap } = useBootstrap()
  const decidedInitialRoute = useRef(false)

  // One-time initial routing decision from bootstrap status.
  useEffect(() => {
    if (!bootstrap || decidedInitialRoute.current) return
    decidedInitialRoute.current = true
    setBootstrap(bootstrap)

    // Seed active account from settings, falling back to the first account.
    void api.settings.get().then((settings) => {
      const fromSettings = settings.activeAccountId
      const fallback = bootstrap.accounts[0]?.id ?? null
      setActiveAccountId(fromSettings ?? fallback)
    })

    const ready = bootstrap.ready
    const hasAccounts = bootstrap.hasAccounts
    // Seed the history stack with the entry screen (replace, not push) so there
    // is nothing to go "back" into before the app's real starting point.
    navigate({ route: !ready || !hasAccounts ? 'onboarding' : 'accounts' }, { replace: true })
  }, [bootstrap, setBootstrap, navigate, setActiveAccountId])

  // Refresh accounts list when one is added in the background.
  useEffect(() => {
    const unsub = api.events.onAppEvent((event) => {
      if (event.type === 'account.added') {
        void qc.invalidateQueries({ queryKey: queryKeys.accounts })
        void qc.invalidateQueries({ queryKey: queryKeys.bootstrap })
        if (!activeAccountId) setActiveAccountId(event.accountId)
      }
    })
    return unsub
  }, [qc, activeAccountId, setActiveAccountId])

  // Forced update blocks the whole app (spec §23.3).
  if (updateStatus?.state === 'unsupported' || updateStatus?.forced) {
    return <ForceUpdateScreen status={updateStatus} />
  }

  return <AppShell>{renderRoute(route)}</AppShell>
}

function renderRoute(route: ReturnType<typeof useAppStore.getState>['route']): JSX.Element {
  switch (route) {
    case 'onboarding':
      return <Onboarding />
    case 'accounts':
      return <AccountPicker />
    case 'repos':
      return <Repositories />
    case 'prs':
      return <PullRequests />
    case 'workspace':
      return <ReviewWorkspace />
    case 'settings':
      return <Settings />
    default:
      return <AccountPicker />
  }
}
