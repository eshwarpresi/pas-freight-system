// frontend/src/pages/Reminders.jsx
//
// Live list of shipments that are due / overdue, with the named handler.
// Admins (the MD) see every team; everyone else sees only the items their
// own team is responsible for. Snooze / "waiting on customer" pause a
// reminder (and the MD's escalation) for that step.

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useSocket } from '../App'
import { BellRing, Loader2, RefreshCw, Phone, Clock, AlarmClock, PauseCircle, CheckCircle2 } from 'lucide-react'

const TEAM_LABEL = { FREIGHT: 'Freight', CUSTOMS: 'Customs', ACCOUNTS: 'Accounts' }
const TEAM_BADGE = {
  FREIGHT: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40',
  CUSTOMS: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40',
  ACCOUNTS: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40',
}
const MODE_INFO = {
  dry: { label: 'DRY RUN — nothing is sent yet', cls: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
  bell: { label: 'BELL ONLY', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  live: { label: 'LIVE — bell + email + MD alerts', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  off: { label: 'OFF', cls: 'bg-red-100 text-red-700' },
}

const fmtDay = (d) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}-${m}-${y}`
}

export default function Reminders() {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const socket = useSocket()
  const [tab, setTab] = useState('ALL')
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['reminders'],
    queryFn: async () => {
      const res = await api.get('/reminders')
      setLastUpdated(new Date())
      return res.data?.data
    },
    staleTime: 20000,
    refetchInterval: 60000,
  })

  useEffect(() => {
    if (!socket) return
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['reminders'] })
    const events = ['shipment:new', 'shipment:update', 'shipment:statusUpdate', 'shipment:archiveUpdate']
    events.forEach((e) => socket.on(e, refresh))
    return () => events.forEach((e) => socket.off(e, refresh))
  }, [socket, queryClient])

  const pauseMutation = useMutation({
    mutationFn: (body) => api.post('/reminders/pause', body),
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      addToast(vars.type === 'WAITING' ? 'Marked as waiting on customer' : 'Snoozed', 'success')
    },
    onError: () => addToast('Could not update reminder', 'error'),
  })

  const items = data?.items || []
  const isAdmin = !!data?.isAdmin
  const active = items.filter((i) => !i.paused)
  const waiting = items.filter((i) => i.paused)

  const shown = useMemo(() => {
    const list = tab === 'ALL' ? items : items.filter((i) => i.team === tab)
    return [...list].sort((a, b) => (a.paused ? 1 : 0) - (b.paused ? 1 : 0) || b.lateDays - a.lateDays)
  }, [items, tab])

  const counts = {
    overdue: active.filter((i) => i.state === 'LATE').length,
    today: active.filter((i) => i.state === 'DUE').length,
    soon: active.filter((i) => i.state === 'SOON').length,
    waiting: waiting.length,
  }

  // "Who to call first" — most overdue per handler (admin only)
  const ranking = useMemo(() => {
    const m = {}
    active.filter((i) => i.state === 'LATE').forEach((i) => {
      const k = i.handler?.name || 'Unassigned'
      if (!m[k]) m[k] = { name: k, phone: i.handler?.phone, n: 0 }
      m[k].n++
    })
    return Object.values(m).sort((a, b) => b.n - a.n).slice(0, 8)
  }, [active])

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={28} className="animate-spin text-indigo-500" /></div>
  }
  if (isError) {
    return (
      <div className="glass rounded-xl border border-red-200/50 p-16 text-center">
        <p className="text-sm text-[var(--text-secondary)] mb-4">Failed to load reminders.</p>
        <button onClick={() => refetch()} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold"><RefreshCw size={14} /> Retry</button>
      </div>
    )
  }

  const mode = MODE_INFO[data?.mode] || MODE_INFO.dry

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={`text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-md ${mode.cls}`}>{mode.label}</span>
          <span className="text-xs text-[var(--text-secondary)]">Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST {isFetching && '· refreshing…'}</span>
        </div>
        <h1 className="text-[28px] font-bold bg-gradient-to-r from-rose-600 to-orange-500 bg-clip-text text-transparent tracking-tight flex items-center gap-2"><BellRing size={26} className="text-rose-500" /> Reminders</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {isAdmin ? 'Every shipment waiting on a team, with the person to call. ' : 'Shipments waiting on your team. '}
          Working days only (Sundays excluded). Updating the pending step in the shipment removes it from this list.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Overdue', counts.overdue, 'text-red-600 bg-red-50 dark:bg-red-900/20', AlarmClock],
          ['Due today', counts.today, 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', Clock],
          ['Due tomorrow', counts.soon, 'text-sky-600 bg-sky-50 dark:bg-sky-900/20', BellRing],
          ['Waiting / snoozed', counts.waiting, 'text-gray-600 bg-gray-100 dark:bg-gray-800/40', PauseCircle],
        ].map(([label, n, cls, Icon]) => (
          <div key={label} className={`rounded-xl p-4 ${cls}`}>
            <Icon size={16} className="mb-1 opacity-80" />
            <p className="text-2xl font-bold leading-none">{n}</p>
            <p className="text-[11px] mt-1 opacity-80">{label}</p>
          </div>
        ))}
      </div>

      {isAdmin && ranking.length > 0 && (
        <div className="glass rounded-xl border border-[var(--glass-border)] p-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">📞 Who to call first</p>
          <div className="flex flex-wrap gap-2">
            {ranking.map((r) => (
              <span key={r.name} className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                <b>{r.name}</b> · {r.n} overdue
                {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 underline"><Phone size={11} />{r.phone}</a>}
              </span>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {['ALL', 'FREIGHT', 'CUSTOMS', 'ACCOUNTS'].map((k) => {
            const n = k === 'ALL' ? items.length : items.filter((i) => i.team === k).length
            return (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${tab === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-indigo-400'}`}>
                {k === 'ALL' ? 'All teams' : TEAM_LABEL[k]} <span className="opacity-70">({n})</span>
              </button>
            )
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="glass rounded-xl border border-[var(--border-color)] p-16 text-center">
          <CheckCircle2 size={30} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">All clear 🎉</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Nothing is due or overdue{tab !== 'ALL' ? ' for this team' : ''} right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((i) => {
            const late = i.state === 'LATE'
            const dot = i.paused ? 'bg-gray-400' : late ? 'bg-red-500' : i.state === 'DUE' ? 'bg-amber-500' : 'bg-sky-500'
            return (
              <div key={`${i.shipmentId}-${i.step}`} className={`glass rounded-xl border p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center gap-3 ${late && !i.paused ? 'border-red-300/60' : 'border-[var(--glass-border)]'}`}>
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${dot}`} />
                  <div className="min-w-0">
                    <Link to={`/shipment/${i.shipmentId}`} className="text-sm font-bold text-[var(--text-primary)] hover:text-indigo-500">{i.refNo}</Link>
                    <span className="text-xs text-[var(--text-muted)]"> · {i.customer} · {i.mode}</span>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{i.label} <span className="text-[var(--text-muted)]">— needs {i.missing}</span></p>
                    {i.paused && (
                      <p className="text-[11px] text-amber-600 mt-0.5">
                        {i.paused.type === 'WAITING' ? '🟡 Waiting on customer' : '💤 Snoozed'}{i.paused.note ? `: ${i.paused.note}` : ''} (until {new Date(i.paused.until).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })})
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-md font-semibold ${TEAM_BADGE[i.team]}`}>{TEAM_LABEL[i.team]}</span>
                  <span className={`px-2 py-0.5 rounded-md font-semibold ${late ? 'bg-red-100 text-red-700' : i.state === 'DUE' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                    {late ? `${i.lateDays} working day${i.lateDays > 1 ? 's' : ''} late` : i.state === 'DUE' ? 'Due today' : `Due ${fmtDay(i.dueDay)}`}
                  </span>
                  <span className="text-[var(--text-secondary)]">👤 {i.handler?.name}{i.handler?.phone && <a href={`tel:${i.handler.phone}`} className="ml-1 underline">{i.handler.phone}</a>}</span>
                </div>

                {!i.paused && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button disabled={pauseMutation.isPending} onClick={() => pauseMutation.mutate({ shipmentId: i.shipmentId, step: i.step, type: 'SNOOZE', days: 1 })}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-[var(--border-color)] hover:border-indigo-400 disabled:opacity-50">Snooze 1 day</button>
                    <button disabled={pauseMutation.isPending} onClick={() => {
                      const note = window.prompt('Waiting on customer — reason (the MD will see this):', '')
                      if (note === null) return
                      pauseMutation.mutate({ shipmentId: i.shipmentId, step: i.step, type: 'WAITING', days: 5, note })
                    }} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50">Waiting on customer</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}