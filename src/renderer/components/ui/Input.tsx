import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from './cn'
import { SearchIcon } from './icons'

type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-md border border-border-strong bg-background-elevated px-3 text-[13px] text-text-primary',
        'placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-0',
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
})

export const SearchInput = forwardRef<HTMLInputElement, InputProps>(function SearchInput(
  { className, ...props },
  ref
) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <SearchIcon className="pointer-events-none absolute left-2.5 h-4 w-4 text-text-muted" />
      <input
        ref={ref}
        className={cn(
          'h-8 w-full rounded-md border border-border-strong bg-background-elevated pl-8 pr-3 text-[13px] text-text-primary',
          'placeholder:text-text-muted focus:border-accent focus:outline-none'
        )}
        {...props}
      />
    </div>
  )
})
