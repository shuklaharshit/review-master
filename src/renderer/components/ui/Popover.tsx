import * as PopoverPrimitive from '@radix-ui/react-popover'
import { forwardRef } from 'react'
import { cn } from './cn'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor

export const PopoverContent = forwardRef<HTMLDivElement, PopoverPrimitive.PopoverContentProps>(
  function PopoverContent({ className, sideOffset = 6, align = 'start', ...props }, ref) {
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            'z-[60] w-80 rounded-lg border border-border-strong bg-background-elevated p-4 shadow-xl',
            'data-[state=open]:animate-[rm-fade-in_120ms_ease-out] focus:outline-none',
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Portal>
    )
  }
)
