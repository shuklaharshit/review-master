import * as DialogPrimitive from '@radix-ui/react-dialog'
import { forwardRef, type ReactNode } from 'react'
import { cn } from './cn'
import { XIcon } from './icons'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger

interface DialogContentProps extends DialogPrimitive.DialogContentProps {
  /** Override default centred sizing (e.g. large draft modal). */
  fullSize?: boolean
}

export const DialogOverlay = forwardRef<HTMLDivElement, DialogPrimitive.DialogOverlayProps>(
  function DialogOverlay({ className, ...props }, ref) {
    return (
      <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
          'fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]',
          'data-[state=open]:animate-[rm-overlay-in_120ms_ease-out]',
          className
        )}
        {...props}
      />
    )
  }
)

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
  { className, children, fullSize, ...props },
  ref
) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
          'flex flex-col overflow-hidden rounded-xl border border-border-strong bg-background-elevated shadow-2xl',
          'data-[state=open]:animate-[rm-content-in_140ms_ease-out] focus:outline-none',
          fullSize ? 'h-[85vh] w-[85vw]' : 'w-full max-w-lg',
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

export function DialogHeader({
  title,
  description,
  onClose,
  className
}: {
  title: ReactNode
  description?: ReactNode
  onClose?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between border-b border-border-subtle px-5 py-4', className)}>
      <div className="min-w-0">
        <DialogPrimitive.Title className="text-[15px] font-semibold text-text-primary">{title}</DialogPrimitive.Title>
        {description && (
          <DialogPrimitive.Description className="mt-1 text-[13px] leading-relaxed text-text-secondary">
            {description}
          </DialogPrimitive.Description>
        )}
      </div>
      <DialogPrimitive.Close
        onClick={onClose}
        className="ml-3 shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-background-panel-hover hover:text-text-primary"
        aria-label="Close"
      >
        <XIcon className="h-4 w-4" />
      </DialogPrimitive.Close>
    </div>
  )
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3', className)}>
      {children}
    </div>
  )
}

export const DialogClose = DialogPrimitive.Close
