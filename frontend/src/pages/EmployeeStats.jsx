// frontend/src/pages/EmployeeStats.jsx
//
// Standalone, read-only analytics page — mirrors ReferenceCodes.jsx but
// grouped by who created each shipment instead of by reference code.
// Shows, per employee: total volume, open vs closed, invoiced count, and
// (when an employee is selected) the full list of their individual
// shipments with status.
//
// Layout note: same as ReferenceCodes — the breakdown panel renders
// directly below the specific card that was clicked (via Fragment +
// col-span-full), not below the whole grid.

import { useState, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { User, ArrowUpRight, Loader2, TrendingUp, RefreshCw, CheckCircle2, Clock, Archive } from 'lucide-react'

const CARD_GRADIENTS = [
  'from-indigo-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-600',
  'from-sky-500 to-cyan-600',
  'from-rose-500 to-pink-600',
]

export default function EmployeeStats() {
  const [selected, setSelected] = useState(null) // { userId, name }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['employee-stats'],
    queryFn: async () => {
      const res = await api.get('/freight/employee-stats')
      return res.data?.data || []
    },
    staleTime: 60000,
  })

  const employees = data || []

  // ─── SHIPMENT LIST FOR THE SELECTED EMPLOYEE ───
  // Only fetched once an employee is actually clicked.
  const { data: shipmentList, isLoading: shipmentsLoading } = useQuery({
    queryKey: ['employee-shipments', selected?.userId, selected?.name],
    queryFn: async () => {
      const params = selected.userId && selected.userId !== 'unknown'
        ? { userId: selected.userId }
        : { name: selected.name }
      const res = await api.get('/freight/shipments/by-employee', { params })
      return res.data?.data || []
    },
    enabled: !!selected,
    staleTime: 30000,
  })

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
        <p className="text-sm text-[var(--text-secondary)] mb-4">Failed to load employee stats.</p>
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
          <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-md">Insights</span>
          <span className="text-xs text-[var(--text-secondary)]">{employees.length} employees</span>
        </div>
        <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">Employee Stats</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Grouped by who created each shipment — see volume, status, and drill into their individual shipments.</p>
      </div>

      {/* ── EMPLOYEE OVERVIEW CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {employees.map((e, i) => {
          const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length]
          const key = e.userId || `unknown:${e.name}`
          const isSelected = selected && (selected.userId === e.userId) && (selected.name === e.name)
          return (
            <Fragment key={key}>
              <button
                onClick={() => setSelected(isSelected ? null : { userId: e.userId, name: e.name })}
                className={`text-left glass rounded-xl p-4 border transition-all hover-lift ${
                  isSelected ? 'border-indigo-400 ring-2 ring-indigo-300/50' : 'border-[var(--glass-border)]'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
                    <User size={16} className="text-white" />
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-medium">{e.total} shipments</span>
                </div>

                <p className="text-sm font-bold text-[var(--text-primary)] tracking-wide truncate">{e.name}</p>

                <div className="mt-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-[var(--text-muted)]">Closed</span>
                    <span className="text-[10px] font-semibold text-[var(--text-secondary)]">{e.closedRate}%</span>
                  </div>
                  <div className="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-1.5 rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${e.closedRate}%` }} />
                  </div>
                </div>

                {e.invoiced > 0 && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-2.5">
                    <TrendingUp size={10} /> {e.invoiced} invoiced
                  </p>
                )}
              </button>

              {/* ── BREAKDOWN — appears directly below this card, spans the full grid width ── */}
              {isSelected && (
                <div className="col-span-1 sm:col-span-2 lg:col-span-3 glass rounded-xl border border-[var(--border-color)] p-5 animate-slide-down">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <User size={15} className="text-indigo-500" /> {e.name} — Breakdown
                    </h3>
                    <Link
                      to={`/?search=${encodeURIComponent(e.name)}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      View in main list <ArrowUpRight size={13} />
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                      <p className="text-lg font-bold text-[var(--text-primary)]">{e.total}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Total</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                      <p className="text-lg font-bold text-amber-600">{e.open}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">In Progress</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                      <p className="text-lg font-bold text-emerald-600">{e.closed}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Closed</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                      <p className="text-lg font-bold text-orange-600">{e.invoiced}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Invoiced</p>
                    </div>
                  </div>

                  {/* ── PER-SHIPMENT LIST: status + archive flag ── */}
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-2">Shipments by {e.name}</p>

                  {shipmentsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={20} className="animate-spin text-indigo-500" />
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {(shipmentList || []).map((s) => (
                        <Link
                          key={s.id}
                          to={`/shipment/${s.id}`}
                          className="block p-3 rounded-lg border border-[var(--border-color)] hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{s.refNo}</span>
                            <div className="flex items-center gap-1.5">
                              {s.isArchived && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                  <Archive size={10} /> Archived
                                </span>
                              )}
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                                s.isClosed
                                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                              }`}>
                                {s.isClosed ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                                {s.isClosed ? 'Closed' : 'In Progress'}
                              </span>
                            </div>
                          </div>
                          <p className="text-[10px] text-[var(--text-muted)]">{s.currentStatus?.replace(/_/g, ' ')}</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">{new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        </Link>
                      ))}
                      {(shipmentList || []).length === 0 && !shipmentsLoading && (
                        <p className="text-xs text-[var(--text-muted)] text-center py-6">No shipments found for this employee.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Fragment>
          )
        })}
        {employees.length === 0 && (
          <div className="col-span-full glass rounded-xl border border-[var(--border-color)] p-16 text-center">
            <User size={28} className="text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">No shipments found yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}