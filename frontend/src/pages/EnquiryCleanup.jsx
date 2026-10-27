import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { AlertCircle, RotateCcw, Loader2, FileText, ClipboardList, BarChart3 } from 'lucide-react'

const CANCEL_REASONS = ['Price too high', 'No response from customer', 'Went to a competitor', 'Cargo not ready', 'Customer postponed', 'Agent rate not workable', 'Duplicate enquiry', 'Other']

const fmtDate = (d) => {
  const x = new Date(d)
  return `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`
}

export default function EnquiryCleanup() {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [everyone, setEveryone] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [cancelRow, setCancelRow] = useState(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['stale-enquiries-page', everyone],
    queryFn: async () => {
      const res = await api.get('/freight/shipments/stale-enquiries', { params: everyone ? {} : { mine: 'true' } })
      return res.data?.data || []
    },
    staleTime: 0, refetchOnWindowFocus: false
  })
  const rows = data || []

  const refreshAll = () => {
    refetch()
    queryClient.invalidateQueries({ queryKey: ['stale-enquiries'] })
    queryClient.invalidateQueries({ queryKey: ['shipments'] })
    queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
  }

  // Following up means the customer is still alive, so the 5-day timer starts again
  const followUp = async (row) => {
    setBusyId(row.id)
    try {
      await api.put(`/freight/shipments/${row.id}/reopen`)
      addToast(`${row.refNo}: timer restarted, 5 more days`, 'success')
      refreshAll()
    } catch (e) { addToast(e.response?.data?.message || 'Could not update', 'error') }
    finally { setBusyId(null) }
  }

  const askCancel = (row) => { setReason(''); setNote(''); setCancelRow(row) }
  const confirmCancel = async () => {
    const row = cancelRow
    if (!row) return
    const full = [reason, note.trim()].filter(Boolean).join(' - ')
    setBusyId(row.id); setCancelRow(null)
    try {
      await api.put(`/freight/shipments/${row.id}/status`, { status: 'CANCELLED', reason: full })
      addToast(`${row.refNo} cancelled`, 'success')
      refreshAll()
    } catch (e) { addToast(e.response?.data?.message || 'Could not cancel', 'error') }
    finally { setBusyId(null) }
  }

  const ff = (r) => r.freightForwarding || {}

  return (
    <div className="w-full space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Enquiry clean-up</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Enquiries with no progress for 3 days or more. After 5 days they move to Cancelled on their own.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-[var(--border-color)] overflow-hidden text-xs font-semibold">
            <button onClick={() => setEveryone(false)} className={`px-3 min-h-[40px] ${!everyone ? 'bg-[var(--nav-active-bg)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>Mine</button>
            <button onClick={() => setEveryone(true)} className={`px-3 min-h-[40px] ${everyone ? 'bg-[var(--nav-active-bg)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>Everyone</button>
          </div>
          <Link to="/conversion-report" className="btn btn-secondary min-h-[40px]"><BarChart3 size={16} /> Conversion report</Link>
        </div>
      </div>

      {isLoading && <div className="card p-10 text-center text-sm text-[var(--text-secondary)]"><Loader2 size={20} className="animate-spin inline mr-2" />Loading...</div>}
      {isError && <div className="card p-6 text-sm text-red-600">Could not load the list. <button className="underline" onClick={() => refetch()}>Try again</button></div>}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="card p-10 text-center">
          <ClipboardList size={28} className="mx-auto mb-2 text-[var(--text-secondary)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Nothing to clean up</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Every open enquiry has had some progress in the last 3 days.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                  <th className="px-3 py-2.5">Ref no</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Route</th>
                  <th className="px-3 py-2.5">Created by</th>
                  <th className="px-3 py-2.5">Created</th>
                  <th className="px-3 py-2.5">Waiting</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border-color)] last:border-0 align-middle">
                    <td className="px-3 py-2.5 font-semibold"><Link to={`/shipment/${r.id}`} className="text-[var(--text-primary)] underline underline-offset-2">{r.refNo}</Link></td>
                    <td className="px-3 py-2.5 text-[var(--text-primary)]">{ff(r).customerName || ff(r).consigneeName || ff(r).shipperName || '-'}</td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{ff(r).fromLocation || '-'} to {ff(r).toLocation || '-'}</td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">{r.createdByName || '-'}</td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.enquiryStale
                        ? <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">Cancelled, {r.enquiryAgeDays} days</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{r.enquiryAgeDays} days, {r.enquiryDaysLeft} left</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        {busyId === r.id ? <Loader2 size={16} className="animate-spin" /> : (
                          <>
                            {!r.enquiryStale && <Link to={`/shipment/${r.id}`} className="btn btn-accent min-h-[36px] !text-xs"><FileText size={14} /> Quote</Link>}
                            <button onClick={() => followUp(r)} className="btn btn-secondary min-h-[36px] !text-xs"><RotateCcw size={14} /> {r.enquiryStale ? 'Reopen' : 'Follow up'}</button>
                            {!r.enquiryStale && <button onClick={() => askCancel(r)} className="btn btn-secondary min-h-[36px] !text-xs">Cancel</button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 py-2.5 text-xs text-[var(--text-secondary)] border-t border-[var(--border-color)]">Quote opens the shipment so you can ask for rates. Follow up restarts the 5-day timer once you have spoken to the customer.</p>
        </div>
      )}

      {cancelRow && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-backdrop p-0 sm:p-4" onClick={() => setCancelRow(null)}>
          <div role="dialog" aria-modal="true" className="bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-2xl w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Cancel {cancelRow.refNo}?</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">Tell us why. It is saved in the history and used in the lost-reason report.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {CANCEL_REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)} aria-pressed={reason === r} className={`px-3.5 min-h-[40px] rounded-full text-sm font-medium border ${reason === r ? 'bg-red-600 text-white border-red-600' : 'border-[var(--input-border)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'}`}>{r}</button>
              ))}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" className="w-full h-11 px-3 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] outline-none mb-5" />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button onClick={() => setCancelRow(null)} className="btn btn-secondary min-h-[44px]">Keep it</button>
              <button onClick={confirmCancel} disabled={!reason && !note.trim()} className="btn min-h-[44px] bg-red-600 text-white hover:bg-red-700"><AlertCircle size={16} /> Cancel enquiry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}