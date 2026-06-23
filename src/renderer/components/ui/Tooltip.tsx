import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'
import { cn } from './cn'

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  disabled
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  disabled?: boolean
}) {
  if (disabled || !content) return <>{children}</>
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-[60] max-w-xs rounded-md border border-border-strong bg-background-elevated px-2.5 py-1.5 text-xs text-text-secondary shadow-lg',
            'data-[state=delayed-open]:animate-[rm-fade-in_120ms_ease-out]',
            className
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--border-strong)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
