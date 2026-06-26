import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'
import { SpinnerIcon } from './icons'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-foreground border border-transparent hover:bg-accent-hover disabled:bg-accent/40 disabled:text-accent-foreground/70',
  secondary:
    'bg-background-panel text-text-primary border border-border-strong hover:bg-background-panel-hover disabled:opacity-50',
  ghost:
    'bg-transparent text-text-secondary border border-transparent hover:bg-background-panel-hover hover:text-text-primary disabled:opacity-40',
  danger:
    'bg-transparent text-danger border border-danger/40 hover:bg-danger/10 disabled:opacity-50'
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-md',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg',
  icon: 'h-8 w-8 p-0 justify-center rounded-md'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors select-none disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading && <SpinnerIcon className="h-3.5 w-3.5" />}
      {children}
    </button>
  )
})
