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
import { BellRing, Loader2, RefreshCw, Phone, Clock, AlarmClock, PauseCircle, CheckCircle2, Search, Download, X } from 'lucide-react'

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

// Welcome banner shown to Admins (the MD and support): a calm, one-glance
// summary of where the company stands right now.
function AdminWelcome({ name, items, onPickTeam, onPickPerson }) {
  const hourIST = Number(new Date().toLocaleString('en-IN', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }))
  const greeting = hourIST < 12 ? 'Good morning' : hourIST < 17 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })
  const active = items.filter((i) => !i.paused)
  const late = active.filter((i) => i.state === 'LATE')
  const stuck3 = late.filter((i) => i.lateDays >= 3)

  const teams = ['FREIGHT', 'CUSTOMS', 'ACCOUNTS'].map((t) => {
    const mine = active.filter((i) => i.team === t)
    return { t, late: mine.filter((i) => i.state === 'LATE').length, today: mine.filter((i) => i.state === 'DUE').length }
  })

  const byPerson = {}
  stuck3.forEach((i) => {
    const k = i.handler?.name || 'Unassigned'
    if (!byPerson[k]) byPerson[k] = { name: k, phone: i.handler?.phone, n: 0 }
    byPerson[k].n++
  })
  const callFirst = Object.values(byPerson).sort((a, b) => b.n - a.n).slice(0, 3)

  return (
    <div className="rounded-2xl p-5 sm:p-6 text-white shadow-lg bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-800 relative overflow-hidden">
      <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10" />
      <div className="absolute -right-2 top-16 w-24 h-24 rounded-full bg-white/5" />
      <div className="relative">
        <p className="text-xs opacity-80">{today}</p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5">{greeting}, {name} 👋</h2>
        <p className="text-sm opacity-90 mt-1">
          {stuck3.length === 0
            ? (late.length === 0 ? 'Everything is on track right now. Nothing is overdue.' : `${late.length} shipment${late.length > 1 ? 's are' : ' is'} running late, none for more than 2 working days.`)
            : `${stuck3.length} shipment${stuck3.length > 1 ? 's have' : ' has'} been stuck for 3 or more working days.`}
        </p>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4">
          {teams.map((x) => (
            <button key={x.t} type="button" onClick={() => onPickTeam(x.t)}
              className="text-left rounded-xl bg-white/10 hover:bg-white/20 transition-colors p-3 backdrop-blur-sm">
              <p className="text-[11px] opacity-80">{TEAM_LABEL[x.t]} team</p>
              {x.late === 0 ? (
                <p className="text-sm font-bold mt-0.5">✅ On track</p>
              ) : (
                <p className="text-sm font-bold mt-0.5">{x.late} overdue</p>
              )}
              <p className="text-[10px] opacity-70">{x.today} due today</p>
            </button>
          ))}
        </div>

        {callFirst.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wider opacity-70 mb-1.5">📞 Worth a call today</p>
            <div className="flex flex-wrap gap-2">
              {callFirst.map((c) => (
                <span key={c.name} className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 text-xs">
                  <button type="button" onClick={() => onPickPerson(c.name)} className="font-bold underline-offset-2 hover:underline">{c.name}</button>
                  <span className="opacity-80">{c.n} stuck</span>
                  {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 font-semibold"><Phone size={11} />{c.phone}</a>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Reminders() {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const socket = useSocket()
  const [tab, setTab] = useState('ALL')
  const [status, setStatus] = useState('ALL') // ALL | LATE | DUE | SOON | PAUSED
  const [search, setSearch] = useState('')
  const [handler, setHandler] = useState('ALL')
  const [modeFilter, setModeFilter] = useState('ALL')
  const [minLate, setMinLate] = useState(0) // 0 = any, 3 = "3+ days late"
  const [sort, setSort] = useState('LATE') // LATE | DUE | REF
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

  const handlerOptions = useMemo(() => [...new Set(items.map((i) => i.handler?.name || 'Unassigned'))].sort(), [items])
  const modeOptions = useMemo(() => [...new Set(items.map((i) => i.mode))].sort(), [items])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = items.filter((i) => {
      if (tab !== 'ALL' && i.team !== tab) return false
      if (status === 'PAUSED' ? !i.paused : (status !== 'ALL' && (i.paused || i.state !== status))) return false
      if (handler !== 'ALL' && (i.handler?.name || 'Unassigned') !== handler) return false
      if (modeFilter !== 'ALL' && i.mode !== modeFilter) return false
      if (minLate && (i.paused || i.lateDays < minLate)) return false
      if (q && !`${i.refNo} ${i.customer} ${i.handler?.name || ''} ${i.label}`.toLowerCase().includes(q)) return false
      return true
    })
    const bySort = {
      LATE: (a, b) => b.lateDays - a.lateDays,
      DUE: (a, b) => a.dueDay.localeCompare(b.dueDay),
      REF: (a, b) => a.refNo.localeCompare(b.refNo),
    }[sort]
    return [...list].sort((a, b) => (a.paused ? 1 : 0) - (b.paused ? 1 : 0) || bySort(a, b))
  }, [items, tab, status, search, handler, modeFilter, minLate, sort])

  const filtersActive = tab !== 'ALL' || status !== 'ALL' || search || handler !== 'ALL' || modeFilter !== 'ALL' || minLate
  const clearFilters = () => { setTab('ALL'); setStatus('ALL'); setSearch(''); setHandler('ALL'); setModeFilter('ALL'); setMinLate(0) }

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [['Ref', 'Customer', 'Mode', 'Team', 'Pending step', 'Needs', 'Due date', 'Working days late', 'Handler', 'Phone', 'Paused']]
    shown.forEach((i) => rows.push([i.refNo, i.customer, i.mode, TEAM_LABEL[i.team], i.label, i.missing, i.dueDay, i.lateDays, i.handler?.name, i.handler?.phone || '', i.paused ? (i.paused.type + (i.paused.note ? ': ' + i.paused.note : '')) : '']))
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `reminders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

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

      {isAdmin && (
        <AdminWelcome
          name={data?.me?.greetName || 'there'}
          items={items}
          onPickTeam={(t) => { setTab(t); setStatus('LATE') }}
          onPickPerson={(n) => { setHandler(n); setStatus('ALL') }}
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['LATE', 'Overdue', counts.overdue, 'text-red-600 bg-red-50 dark:bg-red-900/20', AlarmClock],
          ['DUE', 'Due today', counts.today, 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', Clock],
          ['SOON', 'Due tomorrow', counts.soon, 'text-sky-600 bg-sky-50 dark:bg-sky-900/20', BellRing],
          ['PAUSED', 'Waiting / snoozed', counts.waiting, 'text-gray-600 bg-gray-100 dark:bg-gray-800/40', PauseCircle],
        ].map(([key, label, n, cls, Icon]) => (
          <button key={key} type="button" onClick={() => setStatus(status === key ? 'ALL' : key)}
            className={`rounded-xl p-4 text-left transition-all ${cls} ${status === key ? 'ring-2 ring-indigo-500 scale-[1.02]' : 'hover:scale-[1.01]'}`}>
            <Icon size={16} className="mb-1 opacity-80" />
            <p className="text-2xl font-bold leading-none">{n}</p>
            <p className="text-[11px] mt-1 opacity-80">{label}</p>
          </button>
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

      {/* Sticky filter bar — stays visible while you scroll the list */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2">
        <div className="glass rounded-xl border border-[var(--glass-border)] p-3 space-y-2 shadow-md">
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ref, customer, person…"
                className="w-full text-xs rounded-lg pl-8 pr-2.5 py-2 border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <select value={handler} onChange={(e) => setHandler(e.target.value)} className="text-xs rounded-lg px-2.5 py-2 border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)]">
              <option value="ALL">All people</option>
              {handlerOptions.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} className="text-xs rounded-lg px-2.5 py-2 border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)]">
              <option value="ALL">All shipment types</option>
              {modeOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={minLate} onChange={(e) => setMinLate(Number(e.target.value))} className="text-xs rounded-lg px-2.5 py-2 border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)]">
              <option value={0}>Any lateness</option>
              <option value={1}>1+ days late</option>
              <option value={3}>3+ days late</option>
              <option value={7}>7+ days late</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="text-xs rounded-lg px-2.5 py-2 border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)]">
              <option value="LATE">Most late first</option>
              <option value="DUE">Due date</option>
              <option value="REF">Reference no.</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--text-secondary)]">Showing <b>{shown.length}</b> of {items.length}</span>
            {filtersActive && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1 text-rose-600 font-semibold"><X size={12} /> Clear filters</button>
            )}
            <button onClick={exportCsv} disabled={!shown.length} className="ml-auto inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 disabled:opacity-40"><Download size={12} /> Download list</button>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="glass rounded-xl border border-[var(--border-color)] p-16 text-center">
          <CheckCircle2 size={30} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">{filtersActive ? 'No shipments match these filters' : 'All clear 🎉'}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">{filtersActive ? 'Try clearing a filter.' : 'Nothing is due or overdue right now.'}</p>
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