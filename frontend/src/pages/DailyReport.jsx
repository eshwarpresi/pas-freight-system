// frontend/src/pages/DailyReport.jsx
//
// Admin-only. Shows the same daily summary that gets emailed to
// management every day at 6:30 PM IST: new shipments, delivered,
// invoiced, total status-change activity, and a per-employee breakdown.
// Defaults to today; a date picker lets you look back at past days.
// Read-only page — no shipment data is modified here.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { Loader2, RefreshCw, Package, CheckCircle2, FileSpreadsheet, Activity, Calendar, Users } from 'lucide-react'

function todayIST() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().split('T')[0]
}

export default function DailyReport() {
  const [date, setDate] = useState(todayIST())

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['daily-report', date],
    queryFn: async () => {
      const res = await api.get('/freight/daily-report', { params: { date } })
      return res.data?.data || null
    },
    staleTime: 60000,
  })

  const dateLabel = new Date(`${date}T00:00:00+05:30`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const statCards = data ? [
    { label: 'New Shipments', value: data.newShipments.count, icon: Package, gradient: 'from-indigo-500 to-blue-600' },
    { label: 'Delivered / Hand Over', value: data.delivered.count, icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-600' },
    { label: 'Invoiced', value: data.invoiced.count, icon: FileSpreadsheet, gradient: 'from-amber-500 to-orange-600' },
    { label: 'Status Changes', value: data.statusChangesCount, icon: Activity, gradient: 'from-sky-500 to-cyan-600' },
  ] : []

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-md">Admin</span>
          </div>
          <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">Daily Report</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{dateLabel}</p>
        </div>
        <div className="relative">
          <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
          <input
            type="date"
            value={date}
            max={todayIST()}
            onChange={(e) => setDate(e.target.value)}
            className="pl-8 pr-3 py-2.5 glass border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm text-[var(--text-primary)]"
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-indigo-500" />
        </div>
      )}

      {isError && (
        <div className="glass rounded-xl border border-red-200/50 p-16 text-center">
          <p className="text-sm text-[var(--text-secondary)] mb-4">Failed to load daily report.</p>
          <button onClick={() => refetch()} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map((stat, i) => {
              const Icon = stat.icon
              return (
                <div key={i} className="relative glass rounded-xl p-4 border border-[var(--glass-border)] animate-scale-in" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${stat.gradient} opacity-10 rounded-bl-full`} />
                  <div className="relative">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg mb-2`}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{stat.value.toLocaleString()}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-semibold">{stat.label}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* NEW SHIPMENTS */}
          {data.newShipments.items.length > 0 && (
            <div className="glass rounded-xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-color)] bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-950/50">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"><Package size={14} className="text-indigo-500" /> New Shipments ({data.newShipments.count})</h3>
              </div>
              <div className="divide-y divide-[var(--border-color)]">
                {data.newShipments.items.map((s) => (
                  <div key={s.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{s.refNo}</span>
                    <span className="text-[var(--text-muted)] text-xs">{s.shipmentType || '—'}</span>
                    <span className="text-[var(--text-secondary)] text-xs">{s.createdByName || 'Unknown'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DELIVERED */}
          {data.delivered.items.length > 0 && (
            <div className="glass rounded-xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-color)] bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Delivered / Hand Over ({data.delivered.count})</h3>
              </div>
              <div className="divide-y divide-[var(--border-color)]">
                {data.delivered.items.map((s) => (
                  <div key={s.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{s.refNo}</span>
                    <span className="text-[var(--text-secondary)] text-xs">{s.createdByName || 'Unknown'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INVOICED */}
          {data.invoiced.items.length > 0 && (
            <div className="glass rounded-xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-color)] bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"><FileSpreadsheet size={14} className="text-amber-500" /> Invoiced ({data.invoiced.count})</h3>
              </div>
              <div className="divide-y divide-[var(--border-color)]">
                {data.invoiced.items.map((s) => (
                  <div key={s.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{s.refNo}</span>
                    <span className="text-[var(--text-secondary)] text-xs">{s.createdByName || 'Unknown'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EMPLOYEE BREAKDOWN */}
          <div className="glass rounded-xl border border-[var(--border-color)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-color)] bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/50 dark:to-purple-950/50">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"><Users size={14} className="text-violet-500" /> Per-Employee Breakdown</h3>
            </div>
            {data.employeeBreakdown.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">No activity recorded for this day.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--bg-secondary)]">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase">Employee</th>
                      <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase">New</th>
                      <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase">Delivered</th>
                      <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase">Invoiced</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {data.employeeBreakdown.map((e) => (
                      <tr key={e.name}>
                        <td className="px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)]">{e.name}</td>
                        <td className="px-4 py-2.5 text-sm text-center text-indigo-600 dark:text-indigo-400 font-semibold">{e.created}</td>
                        <td className="px-4 py-2.5 text-sm text-center text-emerald-600 dark:text-emerald-400 font-semibold">{e.delivered}</td>
                        <td className="px-4 py-2.5 text-sm text-center text-amber-600 dark:text-amber-400 font-semibold">{e.invoiced}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}