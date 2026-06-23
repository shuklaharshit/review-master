import type { ReactNode } from 'react'
import { Header } from './Header'

/** Full-height app frame: top header + flexible content area. */
export function AppShell({ centerSlot, children }: { centerSlot?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header centerSlot={centerSlot} />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
