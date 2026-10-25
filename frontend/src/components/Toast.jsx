import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { CheckCircle2, X, AlertCircle, Info, AlertTriangle } from 'lucide-react'

const ToastContext = createContext()

export function useToast() {
  return useContext(ToastContext)
}

const MAX_VISIBLE = 4
const DEFAULT_MS = { success: 3500, info: 4500, warning: 6000, error: 7000 }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success', duration) => {
    const id = Date.now() + Math.random()
    const ms = duration ?? DEFAULT_MS[type] ?? DEFAULT_MS.info
    setToasts(prev => [...prev, { id, message, type, duration: ms }].slice(-MAX_VISIBLE))
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[70] inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:inset-x-auto lg:right-5 lg:bottom-5 lg:w-[380px] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const TYPES = {
  success: { icon: CheckCircle2, bar: 'bg-emerald-500', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  error: { icon: AlertCircle, bar: 'bg-red-500', iconColor: 'text-red-600 dark:text-red-400' },
  warning: { icon: AlertTriangle, bar: 'bg-amber-500', iconColor: 'text-amber-600 dark:text-amber-400' },
  info: { icon: Info, bar: 'bg-indigo-500', iconColor: 'text-indigo-600 dark:text-indigo-300' },
}

function ToastItem({ toast, onRemove }) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true))
    let removeTimer = null
    const timer = setTimeout(() => {
      setIsVisible(false)
      removeTimer = setTimeout(() => onRemove(toast.id), 200)
    }, toast.duration)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      clearTimeout(removeTimer)
    }
  }, [toast, onRemove])

  const { icon: Icon, bar, iconColor } = TYPES[toast.type] || TYPES.info

  const close = () => {
    setIsVisible(false)
    setTimeout(() => onRemove(toast.id), 200)
  }

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto relative overflow-hidden flex items-start gap-3 pl-5 pr-3 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-lg transition-all duration-200 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      <span className={`absolute left-0 inset-y-0 w-1.5 ${bar}`} />
      <Icon size={18} className={`flex-shrink-0 mt-0.5 ${iconColor}`} />
      <p className="text-sm font-medium flex-1 leading-snug">{toast.message}</p>
      <button onClick={close} aria-label="Dismiss" className="flex-shrink-0 p-1 -m-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]">
        <X size={16} />
      </button>
    </div>
  )
}