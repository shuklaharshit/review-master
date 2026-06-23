import * as SelectPrimitive from '@radix-ui/react-select'
import { forwardRef, type ReactNode } from 'react'
import { cn } from './cn'
import { CheckIcon, ChevronDownIcon } from './icons'

export const SelectRoot = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export const SelectTrigger = forwardRef<HTMLButtonElement, SelectPrimitive.SelectTriggerProps>(
  function SelectTrigger({ className, children, ...props }, ref) {
    return (
      <SelectPrimitive.Trigger
        ref={ref}
        className={cn(
          'inline-flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border border-border-strong bg-background-elevated px-2.5 text-[13px] text-text-primary',
          'hover:bg-background-panel-hover focus:border-accent focus:outline-none disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
        <SelectPrimitive.Icon>
          <ChevronDownIcon className="h-3.5 w-3.5 text-text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
    )
  }
)

export function SelectContent({ children }: { children: ReactNode }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className="z-[60] max-h-72 overflow-hidden rounded-md border border-border-strong bg-background-elevated shadow-xl"
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export const SelectItem = forwardRef<HTMLDivElement, SelectPrimitive.SelectItemProps>(function SelectItem(
  { className, children, ...props },
  ref
) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded px-2 py-1.5 pl-7 text-[13px] text-text-secondary outline-none',
        'data-[highlighted]:bg-background-panel-hover data-[highlighted]:text-text-primary',
        'data-[state=checked]:text-text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className
      )}
      {...props}
    >
      <span className="absolute left-1.5 inline-flex items-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="h-3.5 w-3.5 text-accent" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
})

/** Convenience single-select with a label + options array. */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  ariaLabel
}: {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <SelectRoot value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  )
}
