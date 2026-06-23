import * as SwitchPrimitive from '@radix-ui/react-switch'
import { forwardRef } from 'react'
import { cn } from './cn'

export const Switch = forwardRef<HTMLButtonElement, SwitchPrimitive.SwitchProps>(function Switch(
  { className, ...props },
  ref
) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border-strong transition-colors',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=unchecked]:bg-background-elevated',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform',
          'data-[state=checked]:translate-x-[18px]'
        )}
      />
    </SwitchPrimitive.Root>
  )
})
