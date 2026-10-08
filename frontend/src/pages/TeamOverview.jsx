// frontend/src/pages/TeamOverview.jsx
//
// Admin-only. Lists every employee with how many shipments they've
// created, how many are cleared (delivered/invoiced), and how many are
// still pending. Clicking a name opens that person's full dashboard;
// clicking "View Pending" opens it pre-filtered to just their unfinished
// shipments. Read-only page — no shipment data is modified here.
//
// ✅ TEAM ASSIGNMENT (NEW) — each card also lets an Admin set which of
// the 3 workflow teams (Freight/Customs/Accounts) that employee belongs
// to. This is what the Team Performance report groups by.

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useSocket } from '../App'
import { Users, ArrowUpRight, Loader2, RefreshCw, Package, CheckCircle2, Clock, AlertTriangle, X } from 'lucide-react'

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-600',
  'from-sky-500 to-cyan-600',
  'from-rose-500 to-pink-600',
]

const TEAM_OPTIONS = [
  { value: '', label: 'No team set' },
  { value: 'FREIGHT', label: 'Freight' },
  { value: 'CUSTOMS', label: 'Customs' },
  { value: 'ACCOUNTS', label: 'Accounts' },
]

const TEAM_BADGE = {
  FREIGHT: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40',
  CUSTOMS: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40',
  ACCOUNTS: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40',
}

// Phone number box — saved when you leave the field. Shown to the MD in
// reminder escalation emails so he can call the handler directly.
function PhoneField({ member, onSaved }) {
  const [val, setVal] = useState(member.phone || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setVal(member.phone || '') }, [member.phone])
  const save = async () => {
    if ((val || '') === (member.phone || '')) return
    setSaving(true)
    try {
      await api.put(`/reminders/phone/${member.id}`, { phone: val })
      onSaved(true)
    } catch { onSaved(false) } finally { setSaving(false) }
  }
  return (
    <input
      type="tel" value={val} placeholder="Phone number"
      onChange={(e) => setVal(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      disabled={saving}
      className="w-full mb-3 text-[11px] rounded-lg px-2.5 py-1.5 border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
    />
  )
}

export default function TeamOverview() {
  const { addToast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['team-overview'],
    queryFn: async () => {
      const res = await api.get('/freight/team-overview')
      return res.data?.data || []
    },
    staleTime: 60000,
  })

  const updateTeamMutation = useMutation({
    mutationFn: ({ userId, team }) => api.put(`/freight/employees/${userId}/team`, { team: team || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-overview'] })
      addToast('Team updated', 'success')
    },
    onError: () => addToast('Failed to update team', 'error')
  })

  const [filter, setFilter] = useState('ALL')
  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const socket = useSocket()

  // Live: refresh when shipments change so counts stay accurate
  useEffect(() => {
    if (!socket) return
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['team-overview'] })
    const events = ['shipment:new', 'shipment:update', 'shipment:statusUpdate', 'shipment:archiveUpdate']
    events.forEach((e) => socket.on(e, refresh))
    return () => events.forEach((e) => socket.off(e, refresh))
  }, [socket, queryClient])

  const allMembers = data || []
  const counts = useMemo(() => {
    const c = { ALL: allMembers.length, FREIGHT: 0, CUSTOMS: 0, ACCOUNTS: 0, NONE: 0 }
    allMembers.forEach((m) => { if (m.team && c[m.team] !== undefined) c[m.team]++; else c.NONE++ })
    return c
  }, [allMembers])
  const team = allMembers.filter((m) =>
    filter === 'ALL' ? true : filter === 'NONE' ? !m.team : m.team === filter
  )

  const toggle = (id) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const selectAllShown = () => setSelected(new Set(team.map((m) => m.id)))
  const clearSel = () => setSelected(new Set())

  const bulkAssign = async (teamValue) => {
    if (selected.size === 0) return
    setBulkBusy(true)
    const ids = [...selected]
    const results = await Promise.allSettled(
      ids.map((id) => api.put(`/freight/employees/${id}/team`, { team: teamValue || null }))
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    setBulkBusy(false)
    clearSel()
    queryClient.invalidateQueries({ queryKey: ['team-overview'] })
    queryClient.invalidateQueries({ queryKey: ['employee-performance'] })
    if (failed) addToast(`${ids.length - failed} updated, ${failed} failed`, 'error')
    else addToast(`${ids.length} member${ids.length > 1 ? 's' : ''} moved to ${TEAM_OPTIONS.find((o) => o.value === teamValue)?.label || 'No team'}`, 'success')
  }

  const maxCount = Math.max(...allMembers.map((t) => t.shipmentCount), 1)

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
          <span className="text-xs text-[var(--text-secondary)]">{allMembers.length} team members</span>
        </div>
        <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">Team</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Click a name for their full dashboard, or "View Pending" for just their unfinished shipments. Use the team dropdown to assign each person to Freight, Customs, or Accounts — this powers the Team Performance report.</p>
      </div>

      {counts.NONE > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300 flex-1">
            <b>{counts.NONE} member{counts.NONE > 1 ? 's have' : ' has'} no team.</b> Team reports and reminders can only reach people who are assigned to Freight, Customs or Accounts.
          </p>
          <button onClick={() => { setFilter('NONE'); setSelected(new Set(allMembers.filter((m) => !m.team).map((m) => m.id))) }} className="text-xs font-semibold text-amber-700 dark:text-amber-300 underline whitespace-nowrap">Select them</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {[['ALL', 'All'], ['FREIGHT', 'Freight'], ['CUSTOMS', 'Customs'], ['ACCOUNTS', 'Accounts'], ['NONE', 'No team']].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${filter === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-indigo-400'}`}>
            {label} <span className="opacity-70">({counts[k]})</span>
          </button>
        ))}
        {team.length > 0 && (
          <button onClick={selectAllShown} className="ml-auto text-xs font-semibold text-indigo-600 dark:text-indigo-400 underline">Select all shown</button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-300/60 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-2.5 shadow-lg">
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{selected.size} selected</span>
          <span className="text-xs text-[var(--text-secondary)]">Move to:</span>
          {TEAM_OPTIONS.map((opt) => (
            <button key={opt.value || 'none'} disabled={bulkBusy} onClick={() => bulkAssign(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${opt.value ? TEAM_BADGE[opt.value] : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}>
              {opt.label}
            </button>
          ))}
          {bulkBusy && <Loader2 size={14} className="animate-spin text-indigo-500" />}
          <button onClick={clearSel} className="ml-auto p-1 text-[var(--text-muted)] hover:text-red-500"><X size={16} /></button>
        </div>
      )}

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
              <div className="flex items-center gap-3 mb-3">
              <input type="checkbox" checked={selected.has(member.id)} onChange={() => toggle(member.id)}
                className="w-4 h-4 accent-indigo-600 flex-shrink-0 cursor-pointer" aria-label={`Select ${displayName}`} />
              <Link to={`/team/${member.id}?name=${encodeURIComponent(displayName)}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-bold shadow-md flex-shrink-0`}>
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{member.name || 'Unnamed'}</p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">{member.email}</p>
                </div>
                <ArrowUpRight size={15} className="text-[var(--text-muted)] group-hover:text-indigo-500 transition-colors flex-shrink-0" />
              </Link>
              </div>

              {/* ✅ TEAM ASSIGNMENT (NEW) */}
              <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                <select
                  value={member.team || ''}
                  onChange={(e) => updateTeamMutation.mutate({ userId: member.id, team: e.target.value })}
                  disabled={updateTeamMutation.isPending}
                  className={`w-full text-[11px] font-semibold rounded-lg px-2.5 py-1.5 border border-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50 ${member.team ? TEAM_BADGE[member.team] : 'text-[var(--text-secondary)] bg-[var(--bg-secondary)]'}`}
                >
                  {TEAM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <PhoneField member={member} onSaved={(ok) => {
                if (ok) { queryClient.invalidateQueries({ queryKey: ['team-overview'] }); addToast('Phone saved', 'success') }
                else addToast('Could not save phone (admins only)', 'error')
              }} />

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
            <p className="text-sm text-[var(--text-secondary)]">{filter === 'ALL' ? 'No team members found yet.' : 'No members in this group.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}