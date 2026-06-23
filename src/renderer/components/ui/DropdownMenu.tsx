import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import { forwardRef } from 'react'
import { cn } from './cn'

export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger
export const DropdownMenuSeparator = forwardRef<HTMLDivElement, DropdownPrimitive.DropdownMenuSeparatorProps>(
  function Separator({ className, ...props }, ref) {
    return <DropdownPrimitive.Separator ref={ref} className={cn('my-1 h-px bg-border-subtle', className)} {...props} />
  }
)

export const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownPrimitive.DropdownMenuContentProps>(
  function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
    return (
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          ref={ref}
          sideOffset={sideOffset}
          className={cn(
            'z-[60] min-w-[200px] overflow-hidden rounded-md border border-border-strong bg-background-elevated p-1 shadow-xl',
            'data-[state=open]:animate-[rm-fade-in_120ms_ease-out]',
            className
          )}
          {...props}
        />
      </DropdownPrimitive.Portal>
    )
  }
)

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownPrimitive.DropdownMenuItemProps>(
  function DropdownMenuItem({ className, ...props }, ref) {
    return (
      <DropdownPrimitive.Item
        ref={ref}
        className={cn(
          'flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-[13px] text-text-secondary outline-none',
          'data-[highlighted]:bg-background-panel-hover data-[highlighted]:text-text-primary',
          'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
          className
        )}
        {...props}
      />
    )
  }
)

export const DropdownMenuLabel = forwardRef<HTMLDivElement, DropdownPrimitive.DropdownMenuLabelProps>(
  function DropdownMenuLabel({ className, ...props }, ref) {
    return (
      <DropdownPrimitive.Label
        ref={ref}
        className={cn('px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-text-muted', className)}
        {...props}
      />
    )
  }
)
