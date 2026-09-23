// frontend/src/components/PipelineBoard.jsx
//
// The Kanban-style tab on Overview: Freight -> Customs -> Invoice -> Done.
// A shipment's column isn't chosen manually — it's computed live on the
// backend from actual field completion (see getPipelineBoard in
// freightForwarding.controller.js), so a card "moves" automatically the
// moment the relevant fields get filled in. Nobody drags anything here.

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { Loader2, RefreshCw, Ship, FileCheck, Banknote, CheckCircle2, Clock, ArrowRight } from 'lucide-react'

const COLUMNS = [
  { key: 'freight', label: 'Freight', icon: Ship, gradient: 'from-indigo-500 to-blue-600', accent: 'border-indigo-200 dark:border-indigo-800' },
  { key: 'customs', label: 'Customs', icon: FileCheck, gradient: 'from-emerald-500 to-teal-600', accent: 'border-emerald-200 dark:border-emerald-800' },
  { key: 'invoice', label: 'Invoice', icon: Banknote, gradient: 'from-amber-500 to-orange-600', accent: 'border-amber-200 dark:border-amber-800' },
  { key: 'done', label: 'Done', icon: CheckCircle2, gradient: 'from-gray-400 to-slate-500', accent: 'border-gray-200 dark:border-gray-700' },
]

function daysAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function formatAge(dateStr) {
  const days = daysAgo(dateStr)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function PipelineCard({ shipment, columnKey }) {
  const age = daysAgo(shipment.createdAt)
  const isStale = columnKey !== 'done' && age > 5 // sitting more than 5 days is worth flagging
  const name = shipment.freightForwarding?.consigneeName || shipment.freightForwarding?.customerName || '—'
  return (
    <Link to={`/shipment/${shipment.id}`} className="block glass rounded-lg p-3 border border-[var(--border-color)] hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{shipment.refNo}</span>
        {isStale && <Clock size={12} className="text-red-500 flex-shrink-0" title="Sitting here more than 5 days" />}
      </div>
      <p className="text-xs text-[var(--text-secondary)] truncate mb-1.5">{name}</p>
      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span>{shipment.createdByName || '—'}</span>
        <span className={isStale ? 'text-red-500 font-semibold' : ''}>{formatAge(shipment.createdAt)}</span>
      </div>
    </Link>
  )
}

export default function PipelineBoard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pipeline-board'],
    queryFn: async () => {
      const res = await api.get('/freight/pipeline')
      return res.data?.data || null
    },
    staleTime: 60000,
    refetchInterval: 120000, // keep it fresh without needing a manual refresh
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="glass rounded-xl border border-red-200/50 p-16 text-center">
        <p className="text-sm text-[var(--text-secondary)] mb-4">Failed to load the pipeline board.</p>
        <button onClick={() => refetch()} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-muted)]">
        A shipment moves to the next column automatically the moment its required fields are filled in — nobody drags anything here. A red clock icon means it's been sitting in that stage more than 5 days.
      </p>

      {/* Desktop: 4 columns side by side. Mobile: stacked, scrollable each. */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {COLUMNS.map((col, i) => {
          const Icon = col.icon
          const colData = data[col.key] || { count: 0, items: [] }
          return (
            <div key={col.key} className={`glass rounded-xl border ${col.accent} overflow-hidden flex flex-col`}>
              <div className={`p-3 bg-gradient-to-r ${col.gradient} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <Icon size={16} className="text-white" />
                  <span className="text-sm font-bold text-white">{col.label}</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/25 text-white">{colData.count.toLocaleString()}</span>
              </div>
              <div className="p-2.5 space-y-2 max-h-[520px] overflow-y-auto">
                {colData.items.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] text-center py-8">Nothing here right now</p>
                ) : (
                  colData.items.map((s) => <PipelineCard key={s.id} shipment={s} columnKey={col.key} />)
                )}
                {colData.count > colData.items.length && (
                  <p className="text-[10px] text-[var(--text-muted)] text-center pt-1">
                    +{(colData.count - colData.items.length).toLocaleString()} more in this stage
                  </p>
                )}
              </div>
              {i < COLUMNS.length - 1 && (
                <div className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10">
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}