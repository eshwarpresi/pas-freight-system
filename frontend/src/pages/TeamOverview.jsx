// frontend/src/pages/TeamOverview.jsx
//
// Admin-only. Lists every employee with how many shipments they've
// created, how many are cleared (delivered/invoiced), and how many are
// still pending. Clicking a name opens that person's full dashboard;
// clicking "View Pending" opens it pre-filtered to just their unfinished
// shipments. Read-only page — no shipment data is modified here.

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { Users, ArrowUpRight, Loader2, RefreshCw, Package, CheckCircle2, Clock } from 'lucide-react'

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-600',
  'from-sky-500 to-cyan-600',
  'from-rose-500 to-pink-600',
]

export default function TeamOverview() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['team-overview'],
    queryFn: async () => {
      const res = await api.get('/freight/team-overview')
      return res.data?.data || []
    },
    staleTime: 60000,
  })

  const team = data || []
  const maxCount = Math.max(...team.map((t) => t.shipmentCount), 1)

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
        <p className="text-sm text-[var(--text-secondary)] mb-4">Failed to load team overview.</p>
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
          <span className="text-xs text-[var(--text-secondary)]">{team.length} team members</span>
        </div>
        <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">Team</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Click a name for their full dashboard, or "View Pending" for just their unfinished shipments.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {team.map((member, i) => {
          const gradient = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]
          const initial = (member.name || member.email || '?').charAt(0).toUpperCase()
          const pct = maxCount > 0 ? Math.round((member.shipmentCount / maxCount) * 100) : 0
          const displayName = member.name || member.email
          const clearedPct = member.shipmentCount > 0 ? Math.round((member.clearedCount / member.shipmentCount) * 100) : 0
          return (
            <div
              key={member.id}
              className="glass rounded-xl p-4 border border-[var(--glass-border)] transition-all hover-lift group"
            >
              <Link to={`/team/${member.id}?name=${encodeURIComponent(displayName)}`} className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-bold shadow-md flex-shrink-0`}>
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{member.name || 'Unnamed'}</p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">{member.email}</p>
                </div>
                <ArrowUpRight size={15} className="text-[var(--text-muted)] group-hover:text-indigo-500 transition-colors flex-shrink-0" />
              </Link>

              <div className="flex items-center gap-2 mb-2">
                <Package size={13} className="text-[var(--text-muted)]" />
                <span className="text-lg font-bold text-[var(--text-primary)]">{member.shipmentCount}</span>
                <span className="text-[10px] text-[var(--text-muted)]">shipments opened</span>
              </div>

              <div className="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-1.5 overflow-hidden mb-3">
                <div className={`h-1.5 rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${pct}%` }} />
              </div>

              <div className="grid grid-cols-2 gap-2 mb-1">
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                  <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 leading-none">{member.clearedCount}</p>
                    <p className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">Cleared</p>
                  </div>
                </div>
                {member.pendingCount > 0 ? (
                  <Link
                    to={`/team/${member.id}?name=${encodeURIComponent(displayName)}&pendingOnly=true`}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                  >
                    <Clock size={13} className="text-amber-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-amber-700 dark:text-amber-400 leading-none">{member.pendingCount}</p>
                      <p className="text-[9px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">Pending</p>
                    </div>
                  </Link>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/40">
                    <Clock size={13} className="text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-500 dark:text-gray-400 leading-none">0</p>
                      <p className="text-[9px] text-gray-400 mt-0.5">Pending</p>
                    </div>
                  </div>
                )}
              </div>

              {member.shipmentCount > 0 && (
                <p className="text-[9px] text-[var(--text-muted)] mt-1">{clearedPct}% cleared</p>
              )}

              {member.role === 'ADMIN' && (
                <span className="inline-block mt-2 text-[9px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full">ADMIN</span>
              )}
            </div>
          )
        })}
        {team.length === 0 && (
          <div className="col-span-full glass rounded-xl border border-[var(--border-color)] p-16 text-center">
            <Users size={28} className="text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">No team members found yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}