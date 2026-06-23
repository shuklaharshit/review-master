import * as TabsPrimitive from '@radix-ui/react-tabs'
import { forwardRef } from 'react'
import { cn } from './cn'

export const Tabs = TabsPrimitive.Root

export const TabsList = forwardRef<HTMLDivElement, TabsPrimitive.TabsListProps>(function TabsList(
  { className, ...props },
  ref
) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn('flex items-center gap-1 border-b border-border-subtle', className)}
      {...props}
    />
  )
})

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsPrimitive.TabsTriggerProps>(function TabsTrigger(
  { className, ...props },
  ref
) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'relative -mb-px h-9 px-3 text-[13px] font-medium text-text-muted transition-colors',
        'hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=active]:text-text-primary',
        'data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-accent',
        className
      )}
      {...props}
    />
  )
})

export const TabsContent = TabsPrimitive.Content
