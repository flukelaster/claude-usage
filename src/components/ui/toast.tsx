import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastVariant = 'success' | 'warning' | 'error' | 'info'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  durationMs: number
}

interface PushInput {
  title: string
  description?: string
  variant?: ToastVariant
  durationMs?: number
}

interface ToastContextValue {
  push: (input: PushInput) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * Provider mounted once at the root. Components push toasts via the
 * `useToast()` hook, and the provider renders a fixed-position portal
 * in the bottom-right corner.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (input: PushInput) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const toast: Toast = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? 'info',
        durationMs: input.durationMs ?? 4_000,
      }
      setToasts((current) => [...current, toast])
      if (toast.durationMs > 0) {
        const handle = setTimeout(() => dismiss(id), toast.durationMs)
        timers.current.set(id, handle)
      }
      return id
    },
    [dismiss],
  )

  // Cleanup on unmount.
  useEffect(() => {
    const currentTimers = timers.current
    return () => {
      for (const handle of currentTimers.values()) clearTimeout(handle)
      currentTimers.clear()
    }
  }, [])

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div
      className="fixed z-[60] flex flex-col gap-2 bottom-4 right-4 pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { icon: Icon, accent } = VARIANTS[toast.variant]
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-start gap-3 rounded-lg px-4 py-3 min-w-[260px] max-w-[380px]"
      style={{
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        boxShadow:
          '0 10px 30px rgba(0,0,0,0.10), 0px 0px 0px 1px var(--color-border)',
        animation: 'toast-in 140ms ease-out',
      }}
    >
      <Icon size={16} style={{ color: accent, flexShrink: 0, marginTop: 2 }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
          {toast.title}
        </p>
        {toast.description && (
          <p
            className="mt-0.5 text-xs"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

const VARIANTS: Record<ToastVariant, { icon: typeof Info; accent: string }> = {
  success: { icon: CheckCircle2, accent: 'var(--color-success)' },
  warning: { icon: AlertTriangle, accent: 'var(--color-warning)' },
  error: { icon: AlertCircle, accent: 'var(--color-danger)' },
  info: { icon: Info, accent: 'var(--color-primary)' },
}
