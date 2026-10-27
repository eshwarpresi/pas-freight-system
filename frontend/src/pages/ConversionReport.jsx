import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { Loader2, ArrowLeft } from 'lucide-react'

const isoDay = (d) => {
  const x = new Date(d.getTime() + 330 * 60000)
  return x.toISOString().slice(0, 10)
}
const showDay = (s) => (s ? s.split('-').reverse().join('-') : '')

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-[var(--route-line)] bg-[var(--route-soft)] px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--text-primary)] mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{hint}</p>}
    </div>
  )
}

function PeopleTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border-color)]">
            <th className="px-3 py-2.5">Person</th>
            <th className="px-3 py-2.5 text-right">Enquiries</th>
            <th className="px-3 py-2.5 text-right">Quoted</th>
            <th className="px-3 py-2.5 text-right">Won</th>
            <th className="px-3 py-2.5 text-right">Lost</th>
            <th className="px-3 py-2.5 text-right">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.name} className="border-b border-[var(--border-color)] last:border-0">
              <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">{p.name}</td>
              <td className="px-3 py-2.5 text-right">{p.enquiries}</td>
              <td className="px-3 py-2.5 text-right">{p.quoted}</td>
              <td className="px-3 py-2.5 text-right font-semibold">{p.won}</td>
              <td className="px-3 py-2.5 text-right">{p.lost}</td>
              <td className="px-3 py-2.5 text-right">{p.winRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ConversionReport() {
  const today = new Date()
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 27 * 86400000)))
  const [to, setTo] = useState(isoDay(today))

  const report = useQuery({
    queryKey: ['conversion-report', from, to],
    queryFn: async () => (await api.get('/freight/reports/conversion', { params: { from, to } })).data.data,
    staleTime: 60000, refetchOnWindowFocus: false
  })
  const lost = useQuery({
    queryKey: ['lost-reasons', from, to],
    queryFn: async () => (await api.get('/freight/reports/lost-reasons', { params: { from, to } })).data.data,
    staleTime: 60000, refetchOnWindowFocus: false
  })

  const r = report.data
  const l = lost.data
  const input = 'h-10 px-2.5 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)]'

  return (
    <div className="w-full space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link to="/enquiry-cleanup" className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] mb-1"><ArrowLeft size={12} /> Enquiry clean-up</Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Conversion report</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">How many enquiries turn into quotations and wins, per person and per week.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-[var(--text-secondary)]">From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
          <label className="text-xs text-[var(--text-secondary)]">To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={input} /></label>
        </div>
      </div>

      {report.isLoading && <div className="card p-10 text-center text-sm text-[var(--text-secondary)]"><Loader2 size={20} className="animate-spin inline mr-2" />Loading...</div>}
      {report.isError && <div className="card p-6 text-sm text-red-600">Could not load the report. <button className="underline" onClick={() => report.refetch()}>Try again</button></div>}

      {r && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tile label="Enquiries" value={r.totals.enquiries} />
            <Tile label="Quoted" value={r.totals.quoted} />
            <Tile label="Won" value={r.totals.won} />
            <Tile label="Lost" value={r.totals.lost} hint="Cancelled or timed out" />
            <Tile label="Win rate" value={`${r.totals.winRate}%`} hint="Won / enquiries" />
          </div>

          <section className="card overflow-hidden">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] px-3 pt-3">By person</h2>
            {r.people.length ? <PeopleTable rows={r.people} /> : <p className="p-4 text-sm text-[var(--text-secondary)]">No enquiries in this period.</p>}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Week by week</h2>
            {r.weeks.slice().reverse().map((w) => (
              <div key={w.weekStart} className="card overflow-hidden">
                <p className="px-3 pt-3 text-xs font-semibold text-[var(--text-secondary)]">Week starting {showDay(w.weekStart)}</p>
                <PeopleTable rows={w.people} />
              </div>
            ))}
          </section>
        </>
      )}

      {l && (
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Why enquiries were lost</h2>
          {l.reasons.length === 0 && l.timedOutEnquiries === 0 && <p className="text-sm text-[var(--text-secondary)]">No cancellations in this period.</p>}
          <div className="space-y-2">
            {l.reasons.map((x) => (
              <div key={x.reason}>
                <div className="flex justify-between text-sm"><span className="text-[var(--text-primary)]">{x.reason}</span><span className="font-semibold">{x.count}</span></div>
                <div className="h-2 rounded-full bg-[var(--bg-tertiary)] mt-1"><div className="h-2 rounded-full bg-[var(--route)]" style={{ width: `${Math.round((x.count / Math.max(1, l.reasons[0].count)) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          {l.timedOutEnquiries > 0 && <p className="text-xs text-[var(--text-secondary)] mt-3">{l.timedOutEnquiries} more enquir{l.timedOutEnquiries === 1 ? 'y is' : 'ies are'} currently cancelled because nothing happened for 5 days (no reason recorded).</p>}
        </section>
      )}
    </div>
  )
}