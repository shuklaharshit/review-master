import type { ReactNode } from 'react'
import type { RiskSeverity, RiskType } from '@shared/types'
import { cn } from './cn'
import { AlertTriangleIcon, BugIcon, CircleIcon, ShieldIcon, ZapIcon } from './icons'

// ---------------------------------------------------------------------------
// Severity → colour (uses design-system severity variables)
// ---------------------------------------------------------------------------
export const severityColor: Record<RiskSeverity, string> = {
  critical: 'var(--danger)',
  high: 'var(--bug)',
  medium: 'var(--warning)',
  low: 'var(--info)'
}

export function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none"
      style={{
        color: severityColor[severity],
        borderColor: severityColor[severity],
        backgroundColor: 'transparent'
      }}
    >
      {severity}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Risk type → icon + colour
// ---------------------------------------------------------------------------
export function riskTypeColor(type: RiskType): string {
  switch (type) {
    case 'bug':
    case 'regression':
      return 'var(--bug)'
    case 'security':
      return 'var(--security)'
    case 'performance':
    case 'concurrency':
      return 'var(--performance)'
    case 'maintainability':
      return 'var(--maintainability)'
    case 'data_loss':
    case 'migration':
    case 'deployment':
      return 'var(--regression)'
    default:
      return 'var(--text-secondary)'
  }
}

export function RiskTypeIcon({ type, className }: { type: RiskType; className?: string }) {
  const color = riskTypeColor(type)
  const common = cn('h-4 w-4', className)
  let icon: ReactNode
  switch (type) {
    case 'security':
      icon = <ShieldIcon className={common} />
      break
    case 'performance':
    case 'concurrency':
      icon = <ZapIcon className={common} />
      break
    case 'bug':
    case 'regression':
      icon = <BugIcon className={common} />
      break
    case 'maintainability':
    case 'test_gap':
      icon = <CircleIcon className={common} />
      break
    default:
      icon = <AlertTriangleIcon className={common} />
  }
  return <span style={{ color }}>{icon}</span>
}

export const riskTypeLabel: Record<RiskType, string> = {
  bug: 'Bug',
  security: 'Security',
  regression: 'Regression',
  performance: 'Performance',
  maintainability: 'Maintainability',
  test_gap: 'Test gap',
  data_loss: 'Data loss',
  api_contract: 'API contract',
  accessibility: 'Accessibility',
  configuration: 'Configuration',
  deployment: 'Deployment',
  concurrency: 'Concurrency',
  compatibility: 'Compatibility',
  migration: 'Migration',
  dependency: 'Dependency',
  other: 'Other'
}
