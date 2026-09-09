// frontend/src/pages/TeamPerformance.jsx
//
// Admin-only. Shows, per employee, three independent counts across every
// shipment: Created (they opened it), Co-handled (assigned to it), and
// Touched (their name shows up anywhere in status history — the
// catch-all that catches cross-team work, e.g. Accounts entering an
// invoice number on a shipment Freight created and Customs handled).
// Grouped by team (Freight/Customs/Accounts) with an optional date range,
// and flags anyone who's gone quiet with a "stale" indicator.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { TrendingUp, Loader2, RefreshCw, Package, Users2, Activity, Clock, Calendar, AlertTriangle } from 'lucide-react'

const TEAM_TABS = [
  { value: '', label: 'All Teams' },
  { value: 'FREIGHT', label: 'Freight' },
  { value: 'CUSTOMS', label: 'Customs' },
  { value: 'ACCOUNTS', label: 'Accounts' },
]

const TEAM_BADGE = {
  FREIGHT: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40',
  CUSTOMS: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40',
  ACCOUNTS: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40',
}

// Anyone whose most recent tracked action is older than this many days
// gets flagged as stale — the "who's gone quiet" signal.
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

export default function TeamPerformance() {
  const [team, setTeam] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['employee-performance', team, from, to],
    queryFn: async () => {
      const params = {}
      if (team) params.team = team
      if (from) params.from = from
      if (to) params.to = to
      const res = await api.get('/freight/employee-performance', { params })
      return res.data?.data || []
    },
    staleTime: 60000,
  })

  const employees = data || []
  const totals = employees.reduce(
    (acc, e) => ({
      created: acc.created + e.created,
      coHandled: acc.coHandled + e.coHandled,
      touched: acc.touched + e.touched,
    }),
    { created: 0, coHandled: 0, touched: 0 }
  )

  const clearFilters = () => { setTeam(''); setFrom(''); setTo('') }
  const hasFilters = team || from || to

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
        <p className="text-sm text-[var(--text-secondary)] mb-4">Failed to load team performance.</p>
        <button onClick={() => refetch()} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-md">Admin</span>
          <span className="text-xs text-[var(--text-secondary)]">{employees.length} employees</span>
        </div>
        <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">Team Performance</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Created = they opened the shipment. Co-handled = assigned to it. Touched = their name appears anywhere in that shipment's history — the true measure of contribution, even for cross-team work.</p>
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass rounded-xl p-4 border border-[var(--glass-border)]">
          <div className="flex items-center gap-2 mb-1"><Package size={14} className="text-indigo-400" /><span className="text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Created</span></div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{totals.created}</p>
        </div>
        <div className="glass rounded-xl p-4 border border-[var(--glass-border)]">
          <div className="flex items-center gap-2 mb-1"><Users2 size={14} className="text-violet-400" /><span className="text-[11px] font-semibold text-violet-500 dark:text-violet-400 uppercase">Co-handled</span></div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{totals.coHandled}</p>
        </div>
        <div className="glass rounded-xl p-4 border border-[var(--glass-border)]">
          <div className="flex items-center gap-2 mb-1"><Activity size={14} className="text-emerald-400" /><span className="text-[11px] font-semibold text-emerald-500 dark:text-emerald-400 uppercase">Touched (total actions)</span></div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{totals.touched}</p>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="glass rounded-xl border border-[var(--border-color)] p-3.5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {TEAM_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTeam(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${team === t.value ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg' : 'glass border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-indigo-300 dark:hover:border-indigo-600'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
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
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Employee</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Team</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Created</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Co-handled</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Touched</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Last Active</th>
                  <th className="text-right pr-4 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {employees.map((e) => {
                  const stale = e.lastActive ? daysAgo(e.lastActive) > STALE_DAYS : true
                  return (
                    <tr key={e.userId} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-[var(--text-primary)]">{e.name || 'Unnamed'}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{e.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        {e.team ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${TEAM_BADGE[e.team]}`}>{e.team}</span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">No team set</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-[var(--text-primary)]">{e.created}</td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-[var(--text-primary)]">{e.coHandled}</td>
                      <td className="px-3 py-3 text-center text-sm font-bold text-emerald-600 dark:text-emerald-400">{e.touched}</td>
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
            return (
              <div key={e.userId} className="glass rounded-xl border border-[var(--border-color)] p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-[var(--text-primary)]">{e.name || 'Unnamed'}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{e.email}</p>
                  </div>
                  {e.team ? (
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${TEAM_BADGE[e.team]}`}>{e.team}</span>
                  ) : (
                    <span className="text-[10px] text-[var(--text-muted)]">No team</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="text-center p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                    <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{e.created}</p>
                    <p className="text-[9px] text-indigo-600/70 dark:text-indigo-400/70">Created</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-violet-50 dark:bg-violet-900/20">
                    <p className="text-sm font-bold text-violet-700 dark:text-violet-400">{e.coHandled}</p>
                    <p className="text-[9px] text-violet-600/70 dark:text-violet-400/70">Co-handled</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{e.touched}</p>
                    <p className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70">Touched</p>
                  </div>
                </div>
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