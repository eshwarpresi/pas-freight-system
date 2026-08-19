// frontend/src/pages/ReferenceCodes.jsx
//
// NEW FILE — standalone, read-only analytics page. Does not modify any
// shipment data. Groups existing shipments by the code detected at the
// start of their Ref No (e.g. "RLIM-2026-004" -> RLIM) and shows, per
// code: total volume, open vs closed, invoiced count, who's been creating
// shipments under that code, AND (when a code is selected) the full list
// of individual shipments with their status and everyone involved.
//
// Layout note: the breakdown panel renders directly below the specific
// card that was clicked (via Fragment + col-span-full), not below the
// whole grid — CSS grid auto-flow pushes it onto its own full-width row
// right after that card in DOM order.

import { useState, useMemo, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { Hash, Users, ArrowUpRight, Loader2, TrendingUp, RefreshCw, CheckCircle2, Clock, User } from 'lucide-react'

const CARD_GRADIENTS = [
  'from-indigo-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-600',
  'from-sky-500 to-cyan-600',
  'from-rose-500 to-pink-600',
]

export default function ReferenceCodes() {
  const [selectedCode, setSelectedCode] = useState(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reference-codes-stats'],
    queryFn: async () => {
      const res = await api.get('/freight/shipments/reference-codes')
      return res.data?.data || []
    },
    staleTime: 60000,
  })

  const codes = data || []

  // ─── SHIPMENT LIST FOR THE SELECTED CODE ───
  // Only fetched once a code is actually clicked — every shipment matching
  // that code, its open/closed status, and everyone involved (creator +
  // anyone who has updated it since involvement-tracking was added).
  const { data: shipmentList, isLoading: shipmentsLoading } = useQuery({
    queryKey: ['reference-code-shipments', selectedCode],
    queryFn: async () => {
      const res = await api.get('/freight/shipments/by-reference-code', { params: { code: selectedCode } })
      return res.data?.data || []
    },
    enabled: !!selectedCode,
    staleTime: 30000,
  })

  // Build an Employee x Code matrix from the same overview data — no extra request needed
  const matrix = useMemo(() => {
    const employeeTotals = {}
    const codeList = codes.map((c) => c.code)

    codes.forEach((c) => {
      c.employeeBreakdown.forEach(({ name, count }) => {
        if (!employeeTotals[name]) employeeTotals[name] = { name, total: 0, byCode: {} }
        employeeTotals[name].total += count
        employeeTotals[name].byCode[c.code] = count
      })
    })

    const employees = Object.values(employeeTotals).sort((a, b) => b.total - a.total)
    return { employees, codeList }
  }, [codes])

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
        <p className="text-sm text-[var(--text-secondary)] mb-4">Failed to load reference code stats.</p>
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
          <span className="text-xs text-[var(--text-secondary)]">{codes.length} code families detected</span>
        </div>
        <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">Reference Codes</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Auto-grouped by the code at the start of each Ref No — see volume, status, and who's involved in what.</p>
      </div>

      {/* ── CODE OVERVIEW CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {codes.map((c, i) => {
          const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length]
          const isSelected = selectedCode === c.code
          return (
            <Fragment key={c.code}>
              <button
                onClick={() => setSelectedCode(isSelected ? null : c.code)}
                className={`text-left glass rounded-xl p-4 border transition-all hover-lift ${
                  isSelected ? 'border-indigo-400 ring-2 ring-indigo-300/50' : 'border-[var(--glass-border)]'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
                    <Hash size={16} className="text-white" />
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-medium">{c.total} shipments</span>
                </div>

                <p className="text-sm font-bold text-[var(--text-primary)] tracking-wide truncate">{c.code}</p>

                <div className="mt-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-[var(--text-muted)]">Closed</span>
                    <span className="text-[10px] font-semibold text-[var(--text-secondary)]">{c.closedRate}%</span>
                  </div>
                  <div className="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-1.5 rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${c.closedRate}%` }} />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-2.5">
                  {c.topHandler && (
                    <p className="text-[10px] text-[var(--text-muted)] truncate">
                      Top: <span className="font-semibold text-[var(--text-secondary)]">{c.topHandler.name}</span> ({c.topHandler.count})
                    </p>
                  )}
                  {c.invoiced > 0 && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 flex-shrink-0">
                      <TrendingUp size={10} /> {c.invoiced} invoiced
                    </p>
                  )}
                </div>
              </button>

              {/* ── BREAKDOWN — appears directly below this card, spans the full grid width ── */}
              {isSelected && (
                <div className="col-span-1 sm:col-span-2 lg:col-span-3 glass rounded-xl border border-[var(--border-color)] p-5 animate-slide-down">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <Hash size={15} className="text-indigo-500" /> {c.code} — Breakdown
                    </h3>
                    <Link
                      to={`/?search=${encodeURIComponent(c.code)}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      View in main list <ArrowUpRight size={13} />
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                      <p className="text-lg font-bold text-[var(--text-primary)]">{c.total}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Total</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                      <p className="text-lg font-bold text-amber-600">{c.open}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">In Progress</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                      <p className="text-lg font-bold text-emerald-600">{c.closed}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Closed</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                      <p className="text-lg font-bold text-orange-600">{c.invoiced}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Invoiced</p>
                    </div>
                  </div>

                  {/* ── PER-SHIPMENT LIST: status + everyone involved ── */}
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-2">Shipments under {c.code}</p>

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
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                              s.isClosed
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            }`}>
                              {s.isClosed ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                              {s.isClosed ? 'Closed' : 'In Progress'}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--text-muted)] mb-1.5">{s.currentStatus?.replace(/_/g, ' ')}</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <User size={11} className="text-[var(--text-muted)]" />
                            {s.involved.length > 0 ? (
                              s.involved.map((name) => (
                                <span key={name} className="text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded">
                                  {name}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-[var(--text-muted)] italic">No recorded activity yet</span>
                            )}
                          </div>
                        </Link>
                      ))}
                      {(shipmentList || []).length === 0 && !shipmentsLoading && (
                        <p className="text-xs text-[var(--text-muted)] text-center py-6">No shipments found for this code.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>

      {/* ── EMPLOYEE x CODE MATRIX ── */}
      <div className="glass rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
          <Users size={15} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Employee × Code</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-950/50">
                <th className="text-left px-3 py-2.5 font-semibold text-indigo-500 uppercase">Employee</th>
                {matrix.codeList.map((code) => (
                  <th key={code} className="text-center px-3 py-2.5 font-semibold text-indigo-500 uppercase">{code}</th>
                ))}
                <th className="text-center px-3 py-2.5 font-semibold text-indigo-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {matrix.employees.map((emp) => (
                <tr key={emp.name} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10">
                  <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">{emp.name}</td>
                  {matrix.codeList.map((code) => (
                    <td key={code} className="text-center px-3 py-2.5 text-[var(--text-secondary)]">
                      {emp.byCode[code] || <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                  ))}
                  <td className="text-center px-3 py-2.5 font-bold text-indigo-600 dark:text-indigo-400">{emp.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}