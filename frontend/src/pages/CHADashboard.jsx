import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useSocket } from '../App'
import { 
  Package, Clock, Download, Archive, Search, Plus,
  CheckCircle2, FileSpreadsheet,
  Eye, ArchiveRestore, X, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Inbox, AlertCircle, RefreshCw,
  FileSearch, ArchiveIcon, Layers, Filter,
  Box, Info, User, Pencil, RotateCcw, Zap, FileCheck, FileText
} from 'lucide-react'

const PER_PAGE_OPTIONS = [10, 25, 50, 100]

function TableSkeleton() {
  return (
    <div className="glass rounded-xl border border-[var(--border-color)] overflow-hidden shadow-lg animate-pulse">
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-6" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CHADashboard() {
  const { addToast } = useToast()
  const socket = useSocket()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [exporting, setExporting] = useState(false)
  const [liveNotification, setLiveNotification] = useState(null)

  useEffect(() => { if (liveNotification) { const t = setTimeout(() => setLiveNotification(null), 4000); return () => clearTimeout(t) } }, [liveNotification])

  useEffect(() => {
    if (!socket) return
    const handlers = {
      'shipment:new': (d) => { if (!showArchived) { setLiveNotification({ type: 'new', refNo: d.refNo, message: `New: ${d.refNo}` }); queryClient.invalidateQueries({ queryKey: ['shipments'] }) } },
      'shipment:update': (d) => { setLiveNotification({ type: 'update', refNo: d.refNo, message: `Updated: ${d.refNo}` }); queryClient.invalidateQueries({ queryKey: ['shipments'] }) },
      'shipment:statusUpdate': (d) => { setLiveNotification({ type: 'status', refNo: d.refNo, message: `${d.refNo} → ${d.status}` }); queryClient.invalidateQueries({ queryKey: ['shipments'] }) },
    }
    Object.entries(handlers).forEach(([event, handler]) => { socket.on(event, handler) })
    return () => Object.keys(handlers).forEach(event => socket.off(event, handlers[event]))
  }, [socket, showArchived, queryClient])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shipments', search, statusFilter, 'CHA_ONLY', showArchived, page, perPage],
    queryFn: async () => {
      const params = { isArchived: showArchived ? 'true' : 'false', page, limit: perPage, shipmentType: 'CHA_ONLY' }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/freight/shipments', { params })
      return res.data
    },
    staleTime: 60000, gcTime: 600000,
    retry: 1,
  })

  const shipments = data?.data || []
  const totalCount = data?.pagination?.total || 0
  const totalPages = data?.pagination?.totalPages || 0

  const analytics = useMemo(() => {
    const importBills = shipments.filter(s => s.importExport === 'Import').length
    const exportBills = shipments.filter(s => s.importExport === 'Export').length
    const boeFiled = shipments.filter(s => s.currentStatus && ['BOE_FILED','DO_COLLECTED','OOC_DONE','GATE_PASS','DELIVERED'].includes(s.currentStatus)).length
    const sbFiled = shipments.filter(s => s.currentStatus && ['SB_FILED','LEO_DONE','HAND_OVER','DELIVERED'].includes(s.currentStatus)).length
    const delivered = shipments.filter(s => s.currentStatus === 'DELIVERED' || s.currentStatus === 'HAND_OVER').length
    return { importBills, exportBills, boeFiled, sbFiled, delivered, clearanceRate: totalCount > 0 ? Math.round((delivered / totalCount) * 100) : 0 }
  }, [shipments, totalCount])

  const archiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/archive`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shipments'] }); addToast('Archived', 'success') },
  })
  const unarchiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/unarchive`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shipments'] }); addToast('Restored', 'success') },
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/freight/export', { params: { isArchived: showArchived }, responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `CHA_${new Date().toISOString().split('T')[0]}.xlsx`)
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url)
      addToast('Export downloaded!', 'success')
    } catch (err) { addToast('Failed', 'error') }
    finally { setExporting(false) }
  }

  const getStatusBadge = (s) => {
    const b = {
      'ENQUIRY':'bg-amber-400 text-amber-900','CHECKLIST_APPROVED':'bg-emerald-400 text-emerald-900','BOE_FILED':'bg-lime-400 text-lime-900',
      'DO_COLLECTED':'bg-green-400 text-green-900','OOC_DONE':'bg-sky-500 text-sky-900','GATE_PASS':'bg-purple-400 text-purple-900',
      'SB_FILED':'bg-lime-400 text-lime-900','LEO_DONE':'bg-sky-500 text-sky-900','HAND_OVER':'bg-purple-400 text-purple-900',
      'DELIVERED':'bg-emerald-500 text-white','INVOICE_GENERATED':'bg-orange-400 text-orange-900',
    }
    return b[s] || 'bg-gray-400 text-gray-700'
  }

  const getImportExportBadge = (v) => v==='Import'?'bg-violet-500 text-white':v==='Export'?'bg-orange-500 text-white':'bg-gray-400 text-gray-600'

  const statCards = [
    { label: 'CHA Bills', value: totalCount, icon: FileCheck, gradient: 'from-emerald-500 to-green-600', desc: 'Total bills' },
    { label: 'Import Bills', value: analytics.importBills, icon: FileText, gradient: 'from-violet-500 to-purple-600', desc: 'Import clearance' },
    { label: 'Export Bills', value: analytics.exportBills, icon: FileText, gradient: 'from-amber-500 to-orange-600', desc: 'Export clearance' },
    { label: 'Cleared', value: analytics.delivered, icon: CheckCircle2, gradient: 'from-teal-500 to-emerald-600', desc: `${analytics.clearanceRate}% done` },
  ]

  const startItem = totalCount===0?0:(page-1)*perPage+1; const endItem = Math.min(page*perPage,totalCount)
  const isEmpty = !isLoading&&!isError&&shipments.length===0; const showSkeleton = isLoading && !data

  return (
    <div className="space-y-6 animate-fade-in">
      {liveNotification && (
        <div className="fixed top-4 right-4 z-50 animate-slide-down">
          <div className="px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 text-sm font-medium bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-200">
            <Zap size={16} /><span>{liveNotification.message}</span>
            <button onClick={() => setLiveNotification(null)} className="ml-2 text-gray-400"><X size={14} /></button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold tracking-wider text-emerald-600 dark:text-emerald-400 uppercase bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 rounded-md">CHA</span>
            <span className="text-xs text-[var(--text-secondary)]">{totalCount} bills</span>
            {socket?.connected && <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</span>}
          </div>
          <h1 className="text-[28px] font-bold bg-gradient-to-r from-emerald-600 to-green-600 dark:from-emerald-400 dark:to-green-400 bg-clip-text text-transparent">Customs Clearance</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex glass rounded-lg p-0.5 border border-[var(--border-color)]">
            <button onClick={()=>setShowArchived(false)} className={`px-3.5 py-2 rounded-md text-xs font-semibold ${!showArchived?'bg-white dark:bg-slate-700 shadow-sm':'text-[var(--text-secondary)]'}`}>Active</button>
            <button onClick={()=>setShowArchived(true)} className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 ${showArchived?'bg-white dark:bg-slate-700 shadow-sm':'text-[var(--text-secondary)]'}`}><Archive size={13}/>Archive</button>
          </div>
          <Link to="/create?mode=cha-import" className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg hover-lift text-xs font-semibold shadow-lg"><Plus size={15}/> New CHA Bill</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat,i)=>{
          const Icon=stat.icon;
          return (
            <div key={i} className="glass rounded-xl p-4 border border-[var(--glass-border)] hover-lift group animate-scale-in" style={{animationDelay: `${i*100}ms`}}>
              <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${stat.gradient} opacity-10 rounded-bl-full group-hover:opacity-20`}/>
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    <Icon size={18} className="text-white"/>
                  </div>
                </div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-semibold">{stat.label}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{stat.desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="glass rounded-xl border border-[var(--border-color)] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400 uppercase">Clearance Progress</span>
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{analytics.clearanceRate}%</span>
        </div>
        <div className="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-2 overflow-hidden">
          <div className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all duration-700" style={{width:`${analytics.clearanceRate}%`}}/>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{analytics.delivered} of {totalCount} CHA bills cleared</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400"/>
          <input type="text" placeholder="Search by Ref No, Job No, BOE, SB..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} className="w-full pl-9 pr-9 py-2.5 glass border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm text-[var(--text-primary)]"/>
          {search&&<button onClick={()=>setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"><X size={14}/></button>}
        </div>
        <button onClick={handleExport} disabled={exporting} className="px-3.5 py-2.5 glass border border-[var(--border-color)] rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">{exporting?<RefreshCw size={14} className="animate-spin"/>:<Download size={14}/>}{exporting?'Export...':'Export'}</button>
      </div>

      {isError&&(<div className="glass rounded-xl border border-red-200/50 p-16 text-center"><AlertCircle size={28} className="bg-red-400 text-white rounded-2xl p-4 mx-auto mb-4"/><h3 className="font-semibold">Connection Error</h3><button onClick={()=>refetch()} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg"><RefreshCw size={14}/> Retry</button></div>)}
      {isEmpty&&!isError&&(<div className="glass rounded-xl border p-16 text-center"><Inbox size={28} className="text-gray-300 mx-auto mb-2"/><p className="text-[var(--text-muted)]">No CHA bills found</p><Link to="/create?mode=cha-import" className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm"><Plus size={14}/> Create CHA Bill</Link></div>)}
      {showSkeleton&&<TableSkeleton/>}

      {!showSkeleton&&!isError&&shipments.length>0&&(<>
        <div className="hidden md:block glass rounded-xl border border-[var(--border-color)] overflow-hidden shadow-lg animate-scale-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/50 dark:to-green-950/50">
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-emerald-500 uppercase w-12">SL No</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-emerald-500 uppercase">Ref No</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-emerald-500 uppercase">I/E</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-emerald-500 uppercase">Consignee</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-emerald-500 uppercase">Job No</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-emerald-500 uppercase">BOE/SB</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-emerald-500 uppercase">AWB</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-emerald-500 uppercase">Status</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-emerald-500 uppercase">Date</th>
                  <th className="text-right pr-4 py-3 text-[11px] font-semibold text-emerald-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {shipments.map((s, idx) => {
                  const ff = s.freightForwarding || {}; const cha = s.cha || {}
                  return (
                    <tr key={s.id} className="group hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors">
                      <td className="px-3 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">{(page-1)*perPage+idx+1}</td>
                      <td className="px-3 py-3"><Link to={`/shipment/${s.id}`} className="text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:underline">{s.refNo}</Link></td>
                      <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ${getImportExportBadge(s.importExport)}`}>{s.importExport||'—'}</span></td>
                      <td className="px-3 py-3 text-sm text-[var(--text-primary)] font-medium">{ff.consigneeName||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{cha.jobNo||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{cha.boeNo||cha.sbNo||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{ff.hawb||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ${getStatusBadge(s.currentStatus)}`}>{s.currentStatus?.replace(/_/g,' ')||'—'}</span></td>
                      <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
                      <td className="pr-4 py-3 text-right">
                        <Link to={`/shipment/${s.id}`} className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 rounded-md"><Eye size={12}/> View</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass rounded-xl border px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--text-secondary)]"><span className="font-semibold text-emerald-700">{startItem}-{endItem}</span> of <span className="font-semibold text-emerald-700">{totalCount}</span></span>
          <div className="flex items-center gap-0.5">
            <button onClick={()=>setPage(1)} disabled={page===1} className="p-1.5 rounded-md hover:bg-emerald-50 disabled:opacity-30"><ChevronsLeft size={14}/></button>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded-md hover:bg-emerald-50 disabled:opacity-30"><ChevronLeft size={14}/></button>
            {Array.from({length:Math.min(totalPages,5)},(_,i)=>i+1).map(p=><button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded-md text-[11px] font-semibold ${page===p?'bg-emerald-600 text-white':'text-emerald-600 hover:bg-emerald-50'}`}>{p}</button>)}
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="p-1.5 rounded-md hover:bg-emerald-50 disabled:opacity-30"><ChevronRight size={14}/></button>
            <button onClick={()=>setPage(totalPages)} disabled={page===totalPages} className="p-1.5 rounded-md hover:bg-emerald-50 disabled:opacity-30"><ChevronsRight size={14}/></button>
          </div>
        </div>
      </>)}
    </div>
  )
}