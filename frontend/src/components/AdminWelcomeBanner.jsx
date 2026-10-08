// frontend/src/components/AdminWelcomeBanner.jsx
//
// "Welcome back" card shown ONCE per login to Admins (the MD and support).
// Slides in at the top, shows a one-glance summary, and fades away on its own
// after 15 seconds (or when closed). Never blocks the page.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { X, ShieldCheck, ArrowRight } from 'lucide-react'

const SHOW_MS = 15000

function safeGet(k) { try { return window.sessionStorage.getItem(k) } catch { return null } }
function safeSet(k, v) { try { window.sessionStorage.setItem(k, v) } catch { /* ignore */ } }

export default function AdminWelcomeBanner({ user }) {
  const key = `pas_welcome_${user?.id || user?.email || 'admin'}`
  const [open, setOpen] = useState(() => !safeGet(key))
  const [left, setLeft] = useState(100)

  const { data } = useQuery({
    queryKey: ['reminders', 'welcome'],
    queryFn: async () => (await api.get('/reminders')).data?.data,
    enabled: open,
    staleTime: 60000,
  })

  // auto-dismiss + progress bar
  useEffect(() => {
    if (!open) return
    safeSet(key, '1')
    const started = Date.now()
    const t = setInterval(() => {
      const pct = 100 - ((Date.now() - started) / SHOW_MS) * 100
      if (pct <= 0) { setOpen(false); clearInterval(t) } else setLeft(pct)
    }, 150)
    return () => clearInterval(t)
  }, [open, key])

  if (!open) return null

  const items = (data?.items || []).filter((i) => !i.paused)
  const overdue = items.filter((i) => i.state === 'LATE').length
  const stuck = items.filter((i) => i.lateDays >= 3).length
  const dueToday = items.filter((i) => i.state === 'DUE').length

  const hour = Number(new Date().toLocaleString('en-IN', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }))
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const email = String(user?.email || '').toLowerCase()
  const name = email.startsWith('shivu@') ? 'Shivu Sir' : (user?.name || '').split(' ')[0] || 'Admin'

  return (
    <div className="mb-5 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl shadow-xl text-white bg-gradient-to-r from-slate-900 via-indigo-800 to-indigo-600">
        <div className="absolute -right-12 -top-16 w-56 h-56 rounded-full bg-white/10" />
        <div className="absolute right-24 -bottom-16 w-40 h-40 rounded-full bg-white/5" />
        <button onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10"><X size={16} /></button>

        <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 text-xl font-bold">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase bg-white/15 px-2 py-0.5 rounded-full"><ShieldCheck size={11} /> Administrator</span>
              <span className="text-[11px] opacity-70">PAS Freight Services</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight mt-1">Welcome back, {name} 👋</h2>
            <p className="text-sm opacity-90 mt-0.5">
              {!data
                ? `${hello}. Getting your summary…`
                : stuck > 0
                  ? `${hello}. ${stuck} shipment${stuck > 1 ? 's have' : ' has'} been pending for 3+ working days.`
                  : overdue > 0
                    ? `${hello}. ${overdue} shipment${overdue > 1 ? 's are' : ' is'} running late, none beyond 2 days.`
                    : `${hello}. Everything is on track. Nothing is overdue.`}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {data && (
              <>
                <div className="text-center rounded-xl bg-white/10 px-3 py-2 min-w-[64px]"><p className="text-lg font-bold leading-none">{overdue}</p><p className="text-[10px] opacity-75 mt-1">Overdue</p></div>
                <div className="text-center rounded-xl bg-white/10 px-3 py-2 min-w-[64px]"><p className="text-lg font-bold leading-none">{dueToday}</p><p className="text-[10px] opacity-75 mt-1">Due today</p></div>
              </>
            )}
            <Link to="/reminders" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 bg-white text-indigo-700 text-xs font-bold px-3.5 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors">
              Open Reminders <ArrowRight size={14} />
            </Link>
          </div>
        </div>
        <div className="h-1 bg-white/10"><div className="h-1 bg-white/60 transition-[width] duration-150 ease-linear" style={{ width: `${left}%` }} /></div>
      </div>
    </div>
  )
}