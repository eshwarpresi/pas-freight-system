import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { CheckCircle2, X, AlertCircle, Info, AlertTriangle } from 'lucide-react'

const ToastContext = createContext()

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onRemove }) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true))
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => onRemove(toast.id), 300)
    }, toast.duration)
    return () => clearTimeout(timer)
  }, [toast, onRemove])

  const config = {
    success: { icon: CheckCircle2, bg: 'bg-green-600', border: 'border-green-700' },
    error: { icon: AlertCircle, bg: 'bg-red-600', border: 'border-red-700' },
    warning: { icon: AlertTriangle, bg: 'bg-amber-500', border: 'border-amber-600' },
    info: { icon: Info, bg: 'bg-blue-600', border: 'border-blue-700' },
  }

  const { icon: Icon, bg, border } = config[toast.type] || config.info

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${bg} ${border} text-white transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <Icon size={18} className="flex-shrink-0" />
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button onClick={() => { setIsVisible(false); setTimeout(() => onRemove(toast.id), 300) }} className="flex-shrink-0 hover:opacity-80">
        <X size={16} />
      </button>
    </div>
  )
}