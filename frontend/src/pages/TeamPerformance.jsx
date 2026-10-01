// frontend/src/pages/TeamPerformance.jsx
//
// Admin-only. Two views, switchable by tab:
//
// 1. Contribution View (existing) — Created/Co-handled/Touched per
//    employee, any custom date range, powered by getEmployeePerformance.
//
// 2. Monthly Report (NEW) — the end-of-month scorecard: pick any
//    calendar month, see Created/Touched/Closed/Total Actions/Active
//    Days per employee, powered by getMonthlyReport. This is the "is
//    everyone working" answer — Active Days against a full working
//    month makes low activity impossible to miss. One-click CSV export
//    (opens fine in Excel) for whichever view is currently showing.
//
// ✅ REWORKED — three real problems fixed in this pass:
//   1. This page had NO live updates at all — a shipment created or
//      changed anywhere else never refreshed these numbers until the
//      60-second staleTime passed. Added a socket listener + a small
//      "Updated just now" indicator so it's visibly live, not just
//      hopefully fresh.
//   2. The Freight/Customs/Accounts tabs silently showed an empty table
//      whenever no employee had that team assigned — impossible to tell
//      "nobody's on this team" from "this is broken". Tabs now show a
//      live count, e.g. "Freight (0)", so an empty result is
//      self-explanatory.
//   3. Six competing numbers per employee (Created/Co-handled/Touched/
//      Closed/Total Actions/Active Days) made it hard to tell at a
//      glance who's actually working. Added one clear traffic-light
//      status (🟢🟡🔴) based on recency, shown first — the detailed
//      numbers are all still here, just not fighting for attention.

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useSocket } from '../App'
import { TrendingUp, Loader2, RefreshCw, Package, Users2, Activity, Clock, Calendar, AlertTriangle, Download, BarChart2, Zap } from 'lucide-react'

const TEAM_VALUES = ['FREIGHT', 'CUSTOMS', 'ACCOUNTS']

const TEAM_BADGE = {
  FREIGHT: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40',
  CUSTOMS: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40',
  ACCOUNTS: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40',
}

const STALE_DAYS = 3

function daysAgo(dateStr) {
  if (!dateStr) return null
  const diffMs = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function formatLastActive(dateStr) {
  const days = daysAgo(dateStr)
  if (days === null) return 'No activity'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

// ✅ NEW — one clear status per employee instead of making you read 6
// numbers to figure out who's actually working. Green = active today or
// yesterday. Yellow = active within the stale window. Red = stale or no
// activity ever recorded. Uses the same "last active" signal already
// shown in the table, just surfaced as the very first thing you see.
function getStatusLight(lastActive) {
  const days = daysAgo(lastActive)
  if (days === null) return { emoji: '🔴', label: 'Inactive', color: 'text-red-600 dark:text-red-400' }
  if (days <= 1) return { emoji: '🟢', label: 'Active', color: 'text-emerald-600 dark:text-emerald-400' }
  if (days <= STALE_DAYS) return { emoji: '🟡', label: 'Slowing down', color: 'text-amber-600 dark:text-amber-400' }
  return { emoji: '🔴', label: 'Inactive', color: 'text-red-600 dark:text-red-400' }
}

// ─── CSV EXPORT ───
// Generates a CSV client-side from whatever rows are currently on
// screen — opens directly in Excel, no backend endpoint needed.
function downloadCSV(rows, headers, filename) {
  const escape = (val) => {
    const s = String(val ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map((h) => escape(h.label)).join(',')]
  rows.forEach((row) => {
    lines.push(headers.map((h) => escape(h.get(row))).join(','))
  })
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function getCurrentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function TeamPerformance() {
  const socket = useSocket()
  const queryClient = useQueryClient()
  const [view, setView] = useState('contribution') // 'contribution' | 'monthly'
  const [team, setTeam] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [month, setMonth] = useState(getCurrentMonthValue())
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [justUpdated, setJustUpdated] = useState(false)

  // ✅ NEW — this page had zero live updates before. Any shipment
  // created, edited, or re-statused anywhere else now refreshes both
  // reports here, with a brief "Updated just now" flash so it's
  // visibly live rather than just hopefully current.
  useEffect(() => {
    if (!socket) return
    const refreshBoth = () => {
      queryClient.invalidateQueries({ queryKey: ['employee-performance'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-report'] })
      setLastUpdated(new Date())
      setJustUpdated(true)
      setTimeout(() => setJustUpdated(false), 2500)
    }
    const events = ['shipment:new', 'shipment:update', 'shipment:statusUpdate', 'shipment:archiveUpdate']
    events.forEach((e) => socket.on(e, refreshBoth))
    return () => events.forEach((e) => socket.off(e, refreshBoth))
  }, [socket, queryClient])

  // ─── CONTRIBUTION VIEW DATA ───
  // ✅ CHANGED — no longer sends `team` to the backend. Fetches every
  // employee once, filters by team client-side (same as Monthly Report
  // already did) — this is what makes accurate per-team counts on the
  // tabs possible, from one fetch instead of a separate one per team.
  const { data: allContributionData, isLoading: contribLoading, isError: contribError, refetch: refetchContrib } = useQuery({
    queryKey: ['employee-performance', from, to],
    queryFn: async () => {
      const params = {}
      if (from) params.from = from
      if (to) params.to = to
      const res = await api.get('/freight/employee-performance', { params })
      return res.data?.data || []
    },
    staleTime: 60000,
    enabled: view === 'contribution',
  })

  // ─── MONTHLY REPORT DATA ───
  const { data: allMonthlyData, isLoading: monthlyLoading, isError: monthlyError, refetch: refetchMonthly } = useQuery({
    queryKey: ['monthly-report', month],
    queryFn: async () => {
      const res = await api.get('/freight/monthly-report', { params: { month } })
      return res.data?.data?.employees || []
    },
    staleTime: 60000,
    enabled: view === 'monthly',
  })

  const isLoading = view === 'contribution' ? contribLoading : monthlyLoading
  const isError = view === 'contribution' ? contribError : monthlyError
  const refetch = view === 'contribution' ? refetchContrib : refetchMonthly
  const allEmployees = (view === 'contribution' ? allContributionData : allMonthlyData) || []
  const employees = team ? allEmployees.filter((e) => e.team === team) : allEmployees

  // ✅ NEW — live per-team counts, computed from the full unfiltered
  // list so every tab (including "All Teams") always shows an accurate
  // number. This is what turns a silent empty table into a
  // self-explanatory "Freight (0)".
  const teamCounts = useMemo(() => {
    const counts = { '': allEmployees.length }
    TEAM_VALUES.forEach((t) => { counts[t] = allEmployees.filter((e) => e.team === t).length })
    return counts
  }, [allEmployees])

  const teamTabs = [
    { value: '', label: 'All Teams' },
    { value: 'FREIGHT', label: 'Freight' },
    { value: 'CUSTOMS', label: 'Customs' },
    { value: 'ACCOUNTS', label: 'Accounts' },
  ]

  const totals = employees.reduce(
    (acc, e) => ({
      created: acc.created + (e.created || 0),
      coHandled: acc.coHandled + (e.coHandled || 0),
      touched: acc.touched + (e.touched || 0),
      closed: acc.closed + (e.closed || 0),
    }),
    { created: 0, coHandled: 0, touched: 0, closed: 0 }
  )

  // ✅ NEW — at-a-glance headline: how many of the currently-shown
  // employees are actually active right now, by the same traffic-light
  // logic as each row. Answers "is everyone working" in one number,
  // before you even look at the table.
  const activeCount = employees.filter((e) => getStatusLight(e.lastActive).emoji === '🟢').length

  const clearFilters = () => { setTeam(''); setFrom(''); setTo('') }
  const hasFilters = team || from || to

  const handleExport = () => {
    if (view === 'contribution') {
      downloadCSV(
        employees,
        [
          { label: 'Name', get: (r) => r.name },
          { label: 'Email', get: (r) => r.email },
          { label: 'Team', get: (r) => r.team || '' },
          { label: 'Status', get: (r) => getStatusLight(r.lastActive).label },
          { label: 'Created', get: (r) => r.created },
          { label: 'Co-handled', get: (r) => r.coHandled },
          { label: 'Touched', get: (r) => r.touched },
          { label: 'Last Active', get: (r) => r.lastActive ? new Date(r.lastActive).toLocaleString() : '' },
        ],
        `contribution-report-${from || 'alltime'}-to-${to || 'now'}.csv`
      )
    } else {
      downloadCSV(
        employees,
        [
          { label: 'Name', get: (r) => r.name },
          { label: 'Email', get: (r) => r.email },
          { label: 'Team', get: (r) => r.team || '' },
          { label: 'Status', get: (r) => getStatusLight(r.lastActive).label },
          { label: 'Created', get: (r) => r.created },
          { label: 'Touched', get: (r) => r.touched },
          { label: 'Closed', get: (r) => r.closed },
          { label: 'Total Actions', get: (r) => r.totalActions },
          { label: 'Active Days', get: (r) => r.activeDays },
          { label: 'Last Active', get: (r) => r.lastActive ? new Date(r.lastActive).toLocaleString() : '' },
        ],
        `monthly-report-${month}.csv`
      )
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="glass rounded-xl border border-red-200/50 p-16 text-center">
        <p className="text-sm text-[var(--text-secondary)] mb-4">Failed to load report.</p>
        <button onClick={() => refetch()} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-md">Admin</span>
            <span className="text-xs text-[var(--text-secondary)]">{employees.length} employees</span>
            {/* ✅ NEW — visible proof this page is actually live, not just hopefully fresh */}
            {socket?.connected && (
              <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-colors ${justUpdated ? 'text-indigo-700 bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/40' : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'}`}>
                {justUpdated ? <><Zap size={10} /> Updated just now</> : <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</>}
              </span>
            )}
          </div>
          <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">Team Performance</h1>
        </div>
        <button onClick={handleExport} className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-xs font-semibold shadow-lg hover-lift">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* ── VIEW SWITCHER ── */}
      <div className="flex glass rounded-lg p-0.5 border border-[var(--border-color)] w-fit">
        <button onClick={() => setView('contribution')} className={`px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${view === 'contribution' ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}>
          <Activity size={13} /> Contribution
        </button>
        <button onClick={() => setView('monthly')} className={`px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${view === 'monthly' ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}>
          <BarChart2 size={13} /> Monthly Report
        </button>
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        {view === 'contribution'
          ? 'Created = they opened the shipment. Co-handled = assigned to it. Touched = their name appears anywhere in that shipment\'s history.'
          : 'The end-of-month scorecard. Active Days = distinct days this month with at least one logged action — the clearest signal of who\'s actually working.'}
      </p>

      {/* ── HEADLINE: WHO'S ACTUALLY WORKING RIGHT NOW (NEW) ── */}
      <div className="glass rounded-xl border border-[var(--border-color)] p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shrink-0">
          <span className="text-xl">🟢</span>
        </div>
        <div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{activeCount} of {employees.length} active today or yesterday</p>
          <p className="text-xs text-[var(--text-muted)]">The single fastest way to answer "is everyone working" — full detail is in the table below.</p>
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 ${view === 'monthly' ? 'lg:grid-cols-4' : ''} gap-3`}>
        <div className="glass rounded-xl p-4 border border-[var(--glass-border)]">
          <div className="flex items-center gap-2 mb-1"><Package size={14} className="text-indigo-400" /><span className="text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Created</span></div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{totals.created}</p>
        </div>
        {view === 'contribution' ? (
          <div className="glass rounded-xl p-4 border border-[var(--glass-border)]">
            <div className="flex items-center gap-2 mb-1"><Users2 size={14} className="text-violet-400" /><span className="text-[11px] font-semibold text-violet-500 dark:text-violet-400 uppercase">Co-handled</span></div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{totals.coHandled}</p>
          </div>
        ) : (
          <div className="glass rounded-xl p-4 border border-[var(--glass-border)]">
            <div className="flex items-center gap-2 mb-1"><Package size={14} className="text-emerald-400" /><span className="text-[11px] font-semibold text-emerald-500 dark:text-emerald-400 uppercase">Closed</span></div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{totals.closed}</p>
          </div>
        )}
        <div className="glass rounded-xl p-4 border border-[var(--glass-border)]">
          <div className="flex items-center gap-2 mb-1"><Activity size={14} className="text-emerald-400" /><span className="text-[11px] font-semibold text-emerald-500 dark:text-emerald-400 uppercase">Touched</span></div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{totals.touched}</p>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="glass rounded-xl border border-[var(--border-color)] p-3.5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {/* ✅ FIXED — every tab now shows a live count, e.g. "Freight (0)".
              This is what turns "I clicked Freight and nothing shows up,
              is this broken?" into an immediately obvious "oh, nobody's
              assigned to Freight yet". */}
          {teamTabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTeam(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${team === t.value ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg' : 'glass border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-indigo-300 dark:hover:border-indigo-600'}`}
            >
              {t.label} ({teamCounts[t.value] ?? 0})
            </button>
          ))}
        </div>
        {/* ✅ NEW — only appears when a team tab with zero members is
            selected, pointing directly at the fix instead of leaving an
            unexplained empty table. */}
        {team && teamCounts[team] === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">No employees are assigned to this team yet. Assign teams from the <Link to="/team" className="underline font-semibold">Team page</Link>.</p>
          </div>
        )}
        {view === 'contribution' ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-indigo-400" />
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2.5 py-1.5 glass border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-primary)]" placeholder="From" />
              <span className="text-xs text-[var(--text-muted)]">to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2.5 py-1.5 glass border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-primary)]" placeholder="To" />
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="px-3 py-1.5 glass border border-[var(--border-color)] rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-indigo-400" />
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-2.5 py-1.5 glass border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-primary)]" />
            <button onClick={() => setMonth(getCurrentMonthValue())} className="px-3 py-1.5 glass border border-[var(--border-color)] rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">This Month</button>
          </div>
        )}
      </div>

      {/* ── EMPLOYEE TABLE ── */}
      {employees.length === 0 ? (
        <div className="glass rounded-xl border border-[var(--border-color)] p-16 text-center">
          <Users2 size={28} className="text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">No employees found for this filter.</p>
        </div>
      ) : (
        <div className="hidden md:block glass rounded-xl border border-[var(--border-color)] overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-950/50">
                  {/* ✅ NEW — Status is now the first column, since it's
                      the one number most people actually want first. */}
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase w-16">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Employee</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Team</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Created</th>
                  {view === 'contribution' ? (
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Co-handled</th>
                  ) : (
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Closed</th>
                  )}
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Touched</th>
                  {view === 'monthly' && (
                    <>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Total Actions</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Active Days</th>
                    </>
                  )}
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Last Active</th>
                  <th className="text-right pr-4 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {employees.map((e) => {
                  const stale = e.lastActive ? daysAgo(e.lastActive) > STALE_DAYS : true
                  const status = getStatusLight(e.lastActive)
                  return (
                    <tr key={e.userId} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
                      <td className="px-3 py-3 text-center" title={status.label}><span className="text-lg">{status.emoji}</span></td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-[var(--text-primary)]">{e.name || 'Unnamed'}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{e.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        {e.team ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${TEAM_BADGE[e.team]}`}>{e.team}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium"><AlertTriangle size={10} /> No team set</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-[var(--text-primary)]">{e.created}</td>
                      {view === 'contribution' ? (
                        <td className="px-3 py-3 text-center text-sm font-semibold text-[var(--text-primary)]">{e.coHandled}</td>
                      ) : (
                        <td className="px-3 py-3 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">{e.closed}</td>
                      )}
                      <td className="px-3 py-3 text-center text-sm font-bold text-emerald-600 dark:text-emerald-400">{e.touched}</td>
                      {view === 'monthly' && (
                        <>
                          <td className="px-3 py-3 text-center text-sm font-semibold text-[var(--text-primary)]">{e.totalActions}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-sm font-bold ${e.activeDays === 0 ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>{e.activeDays}</span>
                          </td>
                        </>
                      )}
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${stale ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-secondary)]'}`}>
                          {stale && <AlertTriangle size={12} />}
                          <Clock size={12} className={stale ? '' : 'text-[var(--text-muted)]'} />
                          {formatLastActive(e.lastActive)}
                        </span>
                      </td>
                      <td className="pr-4 py-3 text-right">
                        <Link to={`/team/${e.userId}?name=${encodeURIComponent(e.name || e.email)}`} className="px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md">
                          View Shipments
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MOBILE CARDS ── */}
      {employees.length > 0 && (
        <div className="md:hidden space-y-3">
          {employees.map((e) => {
            const stale = e.lastActive ? daysAgo(e.lastActive) > STALE_DAYS : true
            const status = getStatusLight(e.lastActive)
            return (
              <div key={e.userId} className="glass rounded-xl border border-[var(--border-color)] p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" title={status.label}>{status.emoji}</span>
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{e.name || 'Unnamed'}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{e.email}</p>
                    </div>
                  </div>
                  {e.team ? (
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${TEAM_BADGE[e.team]}`}>{e.team}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium"><AlertTriangle size={10} /> No team</span>
                  )}
                </div>
                <div className={`grid ${view === 'monthly' ? 'grid-cols-3' : 'grid-cols-3'} gap-2 mb-2`}>
                  <div className="text-center p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                    <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{e.created}</p>
                    <p className="text-[9px] text-indigo-600/70 dark:text-indigo-400/70">Created</p>
                  </div>
                  {view === 'contribution' ? (
                    <div className="text-center p-2 rounded-lg bg-violet-50 dark:bg-violet-900/20">
                      <p className="text-sm font-bold text-violet-700 dark:text-violet-400">{e.coHandled}</p>
                      <p className="text-[9px] text-violet-600/70 dark:text-violet-400/70">Co-handled</p>
                    </div>
                  ) : (
                    <div className="text-center p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{e.closed}</p>
                      <p className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70">Closed</p>
                    </div>
                  )}
                  <div className="text-center p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{e.touched}</p>
                    <p className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70">Touched</p>
                  </div>
                </div>
                {view === 'monthly' && (
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="text-center p-2 rounded-lg bg-sky-50 dark:bg-sky-900/20">
                      <p className="text-sm font-bold text-sky-700 dark:text-sky-400">{e.totalActions}</p>
                      <p className="text-[9px] text-sky-600/70 dark:text-sky-400/70">Total Actions</p>
                    </div>
                    <div className={`text-center p-2 rounded-lg ${e.activeDays === 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-cyan-50 dark:bg-cyan-900/20'}`}>
                      <p className={`text-sm font-bold ${e.activeDays === 0 ? 'text-red-600 dark:text-red-400' : 'text-cyan-700 dark:text-cyan-400'}`}>{e.activeDays}</p>
                      <p className={`text-[9px] ${e.activeDays === 0 ? 'text-red-600/70 dark:text-red-400/70' : 'text-cyan-600/70 dark:text-cyan-400/70'}`}>Active Days</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${stale ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-secondary)]'}`}>
                    {stale && <AlertTriangle size={12} />}
                    <Clock size={12} />
                    {formatLastActive(e.lastActive)}
                  </span>
                  <Link to={`/team/${e.userId}?name=${encodeURIComponent(e.name || e.email)}`} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">View →</Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}