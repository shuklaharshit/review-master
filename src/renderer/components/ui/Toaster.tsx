import * as ToastPrimitive from '@radix-ui/react-toast'
import { useAppStore, type Toast as ToastModel, type ToastLevel } from '../../stores/appStore'
import { cn } from './cn'
import { AlertTriangleIcon, CheckIcon, CircleIcon, XIcon } from './icons'

export const ToastProvider = ToastPrimitive.Provider

const levelStyles: Record<ToastLevel, { border: string; icon: JSX.Element }> = {
  success: { border: 'border-l-success', icon: <CheckIcon className="h-4 w-4 text-success" /> },
  error: { border: 'border-l-danger', icon: <AlertTriangleIcon className="h-4 w-4 text-danger" /> },
  warning: { border: 'border-l-warning', icon: <AlertTriangleIcon className="h-4 w-4 text-warning" /> },
  info: { border: 'border-l-info', icon: <CircleIcon className="h-4 w-4 text-info" /> }
}

function ToastItem({ toast }: { toast: ToastModel }) {
  const dismiss = useAppStore((s) => s.dismissToast)
  const style = levelStyles[toast.level]
  return (
    <ToastPrimitive.Root
      duration={toast.level === 'error' ? 8000 : 4500}
      onOpenChange={(open) => {
        if (!open) dismiss(toast.id)
      }}
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-2.5 rounded-lg border border-border-strong border-l-2 bg-background-elevated px-3.5 py-3 shadow-xl',
        'data-[state=open]:animate-[rm-fade-in_140ms_ease-out]',
        style.border
      )}
    >
      <span className="mt-0.5 shrink-0">{style.icon}</span>
      <ToastPrimitive.Description className="flex-1 text-[13px] leading-snug text-text-secondary">
        {toast.message}
      </ToastPrimitive.Description>
      <ToastPrimitive.Close
        className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary"
        aria-label="Dismiss"
      >
        <XIcon className="h-3.5 w-3.5" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}

export function Toaster() {
  const toasts = useAppStore((s) => s.toasts)
  return (
    <>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2 outline-none" />
    </>
  )
}
