import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Upload, Search, CheckCircle2, AlertCircle, FileSpreadsheet, X, ChevronLeft, ChevronRight, ArrowLeft, RefreshCw } from 'lucide-react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { rowsForSheet, buildSheet, readMeSheet, parseSheets, readWorkbook, downloadWorkbook } from '../lib/backlogExcel'

// The tabs are the same stages as the dashboard cards, so every number here matches a card.
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'enquiry', label: 'Enquiry' },
  { key: 'nominated', label: 'Freight' },
  { key: 'customs1', label: 'Customs 1' },
  { key: 'customs2', label: 'Customs 2' },
  { key: 'invoice', label: 'Pending Invoice' },
  { key: 'simple', label: 'FF Only / Transport / DO' },
]
const STAGE_LABEL = { enquiry: 'Enquiry', nominated: 'Freight', customs1: 'Customs 1', customs2: 'Customs 2', invoice: 'Invoice', simple: 'Invoice' }
const TEAM_CHIP = {
  freight: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
  customs: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  invoice: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
}
const PAGE_SIZE = 50
const CHECK_CHUNK = 80
const APPLY_CHUNK = 40

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export default function BacklogCleanup() {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef(null)

  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [creator, setCreator] = useState('')
  const [type, setType] = useState('')
  const [team, setTeam] = useState('')
  const [page, setPage] = useState(1)
  const [includeEnquiries, setIncludeEnquiries] = useState(false)
  const [imp, setImp] = useState(null) // the Excel import in progress

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['backlog'],
    queryFn: async () => (await api.get('/freight/backlog')).data?.data,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  })
  const rows = data?.rows || []
  const fields = data?.fields || []
  const counts = data?.counts || {}
  const labelOf = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f])), [fields])

  const creators = useMemo(() => [...new Set(rows.map((r) => r.createdByName).filter(Boolean))].sort(), [rows])
  const types = useMemo(() => [...new Set(rows.map((r) => r.shipmentType).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (tab !== 'all' && r.stage !== tab) return false
      if (creator && r.createdByName !== creator) return false
      if (type && r.shipmentType !== type) return false
      if (team && !r.missing.some((k) => labelOf[k]?.team === team)) return false
      if (q && !(`${r.refNo} ${r.consignee}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [rows, tab, search, creator, type, team, labelOf])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE)
  const resetPage = (fn) => (v) => { fn(v); setPage(1) }

  // ─── Download ───
  // The sheet follows what is on screen (tab, search, creator, type), so a team lead can hand each person their own list.
  const download = async (kinds, fileName) => {
    try {
      const sheets = []
      let total = 0
      for (const kind of kinds) {
        const list = rowsForSheet(filtered, fields, kind, includeEnquiries)
        if (!list.length) continue
        total += list.length
        sheets.push(buildSheet(list, fields, kind))
      }
      if (!sheets.length) { addToast('Nothing to download for this selection', 'warning'); return }
      await downloadWorkbook(fileName, [...sheets, readMeSheet()])
      addToast(`Downloaded ${total.toLocaleString()} shipments`, 'success')
    } catch (err) {
      console.error(err)
      addToast('Could not create the Excel file. Please try again.', 'error')
    }
  }

  // ─── Upload ───
  const send = async (list, apply, onProgress) => {
    const size = apply ? APPLY_CHUNK : CHECK_CHUNK
    const results = []
    let done = 0
    for (const part of chunk(list, size)) {
      const res = await api.post('/freight/backlog/import', { rows: part, apply })
      results.push(...(res.data?.data?.results || []))
      done += part.length
      onProgress && onProgress(done, list.length)
    }
    return results
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImp({ phase: 'reading', fileName: file.name })
    try {
      const sheets = await readWorkbook(file)
      const parsed = parseSheets(sheets, fields)
      if (!parsed.sheetsUsed.length) { setImp(null); addToast('This file has no ID column. Please use a sheet downloaded from this page.', 'error'); return }
      if (!parsed.rows.length) { setImp(null); addToast('No filled cells found in the sheet', 'warning'); return }
      setImp({ phase: 'checking', fileName: file.name, rows: parsed.rows, progress: 0 })
      const results = await send(parsed.rows, false, (d, t) => setImp((p) => p && { ...p, progress: Math.round((d / t) * 100) }))
      setImp({ phase: 'ready', fileName: file.name, rows: parsed.rows, results })
    } catch (err) {
      console.error(err)
      setImp(null)
      addToast('Could not read or check that file. Make sure it is an .xlsx file from this page.', 'error')
    }
  }

  const apply = async () => {
    if (!imp || imp.phase !== 'ready') return
    // results come back in the same order as the rows that were sent
    const toSave = imp.rows.filter((_, i) => imp.results[i]?.status === 'update')
    setImp((p) => ({ ...p, phase: 'applying', progress: 0 }))
    try {
      const results = await send(toSave, true, (d, t) => setImp((p) => p && { ...p, progress: Math.round((d / t) * 100) }))
      const saved = results.filter((r) => r.saved).length
      const failed = results.filter((r) => r.status === 'error').length
      setImp((p) => ({ ...p, phase: 'done', saved, failed }))
      addToast(`Saved ${saved.toLocaleString()} shipments`, failed ? 'warning' : 'success')
      queryClient.invalidateQueries()
      refetch()
    } catch (err) {
      console.error(err)
      setImp((p) => ({ ...p, phase: 'ready' }))
      addToast('Saving stopped part-way. Nothing is lost: upload the same file again and the rows already saved will be skipped.', 'error')
    }
  }

  const summary = useMemo(() => {
    if (!imp?.results) return null
    const s = { rows: imp.results.length, update: 0, fields: 0, nochange: 0, error: 0 }
    for (const r of imp.results) {
      s[r.status] = (s[r.status] || 0) + 1
      if (r.status === 'update') s.fields += r.updates.length
    }
    return s
  }, [imp])

  const problems = useMemo(() => (imp?.results || []).filter((r) => r.issues?.length), [imp])

  const tabCount = (key) => (key === 'all' ? data?.total || 0 : counts[key] || 0)
  const btn = 'px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border border-[var(--border-color)] glass hover:border-indigo-300 text-[var(--text-primary)] transition-all disabled:opacity-50'

  return (
    <div className="space-y-5 pb-10">
      <div>
        <Link to="/overview" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-indigo-600 mb-2"><ArrowLeft size={14} />Back to dashboard</Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">Backlog Clean-up</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Active shipments that still have empty fields. Fill them one by one, or download an Excel sheet for your team and upload it back. Existing values are never overwritten and no customer emails are sent.</p>
      </div>

      {/* Stage tabs: same numbers as the dashboard cards */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => { setTab(t.key); setPage(1) }}
            className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-2 border transition-all ${tab === t.key ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'glass border-[var(--border-color)] text-[var(--text-secondary)] hover:border-indigo-300'}`}>
            {t.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === t.key ? 'bg-white/25 text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'}`}>{tabCount(t.key).toLocaleString()}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} placeholder="Search Ref No or consignee"
            className="pl-8 pr-3 py-2 rounded-lg text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] w-60" />
        </div>
        <select value={creator} onChange={(e) => resetPage(setCreator)(e.target.value)} className="px-3 py-2 rounded-lg text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <option value="">All creators</option>
          {creators.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={type} onChange={(e) => resetPage(setType)(e.target.value)} className="px-3 py-2 rounded-lg text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <option value="">All types</option>
          {types.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={team} onChange={(e) => resetPage(setTeam)(e.target.value)} className="px-3 py-2 rounded-lg text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <option value="">Missing for any team</option>
          <option value="freight">Missing for Freight</option>
          <option value="customs">Missing for Customs</option>
          <option value="invoice">Missing for Invoice</option>
        </select>
        <button type="button" onClick={() => refetch()} className={btn} disabled={isFetching}><RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />Refresh</button>
        <span className="text-xs text-[var(--text-muted)]">{filtered.length.toLocaleString()} shipments</span>
      </div>

      {/* Excel */}
      <div className="glass rounded-2xl border border-[var(--border-color)] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><FileSpreadsheet size={16} className="text-emerald-600" />Excel</div>
        <p className="text-xs text-[var(--text-secondary)]">The sheet contains what is shown above (tab, search, creator, type), so pick the filters first. Each shipment row only has the columns that team fills in.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} disabled={!filtered.length} onClick={() => download(['freight'], 'Freight-backlog.xlsx')}><Download size={13} />Freight sheet</button>
          <button type="button" className={btn} disabled={!filtered.length} onClick={() => download(['customsImport', 'customsExport'], 'Customs-backlog.xlsx')}><Download size={13} />Customs sheet</button>
          <button type="button" className={btn} disabled={!filtered.length} onClick={() => download(['invoice'], 'Invoice-backlog.xlsx')}><Download size={13} />Invoice sheet</button>
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] ml-1">
            <input type="checkbox" checked={includeEnquiries} onChange={(e) => setIncludeEnquiries(e.target.checked)} />
            Include enquiries not yet nominated in the Freight sheet
          </label>
          <span className="flex-1" />
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={onFile} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={!fields.length || (imp && ['reading', 'checking', 'applying'].includes(imp.phase))}
            className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"><Upload size={13} />Upload filled sheet</button>
        </div>
      </div>

      {/* Import panel */}
      {imp && (
        <div className="glass rounded-2xl border border-indigo-200 dark:border-indigo-800 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">{imp.fileName}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {imp.phase === 'reading' && 'Reading the file...'}
                {imp.phase === 'checking' && `Checking every value... ${imp.progress || 0}%`}
                {imp.phase === 'ready' && 'Checked. Nothing has been saved yet.'}
                {imp.phase === 'applying' && `Saving... ${imp.progress || 0}%`}
                {imp.phase === 'done' && `Done. ${imp.saved.toLocaleString()} shipments saved${imp.failed ? `, ${imp.failed} could not be saved` : ''}. Shipments that are now complete moved to Archive by themselves.`}
              </p>
            </div>
            {!['reading', 'checking', 'applying'].includes(imp.phase) && (
              <button type="button" onClick={() => setImp(null)} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-muted)]" aria-label="Close"><X size={16} /></button>
            )}
          </div>

          {['checking', 'applying'].includes(imp.phase) && (
            <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${imp.progress || 0}%` }} /></div>
          )}

          {summary && imp.phase !== 'done' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl bg-[var(--bg-secondary)] p-3"><p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Rows read</p><p className="text-xl font-extrabold text-[var(--text-primary)]">{summary.rows.toLocaleString()}</p></div>
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3"><p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-bold">Will be updated</p><p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">{summary.update.toLocaleString()}</p><p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">{summary.fields.toLocaleString()} fields</p></div>
                <div className="rounded-xl bg-[var(--bg-secondary)] p-3"><p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Nothing to change</p><p className="text-xl font-extrabold text-[var(--text-primary)]">{summary.nochange.toLocaleString()}</p></div>
                <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3"><p className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-300 font-bold">Rows with errors</p><p className="text-xl font-extrabold text-red-700 dark:text-red-300">{summary.error.toLocaleString()}</p></div>
              </div>

              {problems.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5"><AlertCircle size={14} className="text-amber-500" />Skipped values ({problems.length.toLocaleString()} rows). These cells will not be saved:</p>
                  <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-[var(--border-color)] divide-y divide-[var(--border-color)] text-xs">
                    {problems.slice(0, 150).map((r, i) => (
                      <div key={`${r.id}-${i}`} className="px-3 py-2">
                        <span className="font-semibold text-[var(--text-primary)]">{r.refNo || r.id || 'Unknown row'}</span>
                        <span className="text-[var(--text-secondary)]"> — {r.issues.map((x) => (x.label ? `${x.label}: ${x.reason}` : x.reason)).join('; ')}</span>
                      </div>
                    ))}
                    {problems.length > 150 && <div className="px-3 py-2 text-[var(--text-muted)]">...and {(problems.length - 150).toLocaleString()} more</div>}
                  </div>
                </div>
              )}

              {summary.update > 0 && (
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-500" />What will be saved (first 30 rows):</p>
                  <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-[var(--border-color)] divide-y divide-[var(--border-color)] text-xs">
                    {imp.results.filter((r) => r.status === 'update').slice(0, 30).map((r) => (
                      <div key={r.id} className="px-3 py-2">
                        <span className="font-semibold text-[var(--text-primary)]">{r.refNo}</span>
                        <span className="text-[var(--text-secondary)]"> — {r.updates.map((u) => `${u.label} = ${u.value}`).join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button type="button" onClick={apply} disabled={imp.phase !== 'ready' || summary.update === 0}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Apply {summary.update.toLocaleString()} shipments</button>
                <button type="button" onClick={() => setImp(null)} className={btn}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* List */}
      <div className="glass rounded-2xl border border-[var(--border-color)] overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-red-600">Could not load the list. Press Refresh to try again.</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--text-secondary)] flex flex-col items-center gap-2"><CheckCircle2 size={22} className="text-emerald-500" />Nothing missing for this selection.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-color)]">
                  {['Ref No', 'Stage', 'Type', 'Consignee', 'Created by', 'Still missing'].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const shown = r.missing.filter((k) => !team || labelOf[k]?.team === team)
                  return (
                    <tr key={r.id} className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-secondary)]/50 align-top">
                      <td className="px-3 py-2.5 whitespace-nowrap"><Link to={`/shipment/${r.id}`} className="font-bold text-indigo-600 hover:underline">{r.refNo}</Link></td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[var(--text-secondary)]">{STAGE_LABEL[r.stage] || r.stage}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[var(--text-secondary)]">{r.shipmentType || '-'} {r.importExport ? `· ${r.importExport}` : ''}</td>
                      <td className="px-3 py-2.5 text-[var(--text-primary)] max-w-[220px] truncate" title={r.consignee}>{r.consignee || '-'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[var(--text-secondary)]">{r.createdByName || '-'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {shown.map((k) => (
                            <span key={k} className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${TEAM_CHIP[labelOf[k]?.team] || ''}`}>{labelOf[k]?.label || k}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
            <span>Page {Math.min(page, pages)} of {pages}</span>
            <div className="flex items-center gap-1">
              <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={14} />Previous</button>
              <button type="button" className={btn} disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next<ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}