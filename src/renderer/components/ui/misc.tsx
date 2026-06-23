import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { SpinnerIcon } from './icons'

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------
export function Spinner({ className }: { className?: string }) {
  return <SpinnerIcon className={cn('h-4 w-4 text-text-muted', className)} />
}

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------
export function ProgressBar({
  value,
  tone = 'accent',
  className
}: {
  value: number
  tone?: 'accent' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-success'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'danger'
          ? 'bg-danger'
          : 'bg-accent'
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-border-subtle', className)}>
      <div className={cn('h-full rounded-full transition-all duration-300', toneClass)} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-background-elevated text-text-secondary border-border-strong',
  accent: 'bg-accent-soft text-accent-hover border-accent/40',
  success: 'bg-success/10 text-success border-success/40',
  warning: 'bg-warning/10 text-warning border-warning/40',
  danger: 'bg-danger/10 text-danger border-danger/40',
  info: 'bg-info/10 text-info border-info/40'
}

export function Badge({
  tone = 'neutral',
  className,
  children
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border-subtle bg-background-panel', className)}
      {...props}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-subtle bg-background-panel/40 px-6 py-12 text-center',
        className
      )}
    >
      {icon && <div className="text-text-muted">{icon}</div>}
      <div className="text-sm font-medium text-text-primary">{title}</div>
      {description && <div className="max-w-sm text-xs text-text-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rm-pulse rounded-md bg-background-elevated', className)} />
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
export function Avatar({
  src,
  alt,
  size = 24,
  className
}: {
  src?: string
  alt?: string
  size?: number
  className?: string
}) {
  const initial = (alt ?? '?').charAt(0).toUpperCase()
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? ''}
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full border border-border-subtle object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-border-subtle bg-background-elevated text-text-secondary',
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  )
}
