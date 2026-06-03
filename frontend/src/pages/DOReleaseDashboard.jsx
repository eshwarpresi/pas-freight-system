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
  Box, Info, User, RotateCcw, Zap, ClipboardList, Barcode, Building2
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
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DOReleaseDashboard() {
  const { addToast } = useToast()
  const socket = useSocket()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [exporting, setExporting] = useState(false)
  const [liveNotification, setLiveNotification] = useState(null)

  useEffect(() => { if (liveNotification) { const t = setTimeout(() => setLiveNotification(null), 4000); return () => clearTimeout(t) } }, [liveNotification])

  useEffect(() => {
    if (!socket) return
    const h = {
      'shipment:new': (d) => { setLiveNotification({ type: 'new', refNo: d.refNo, message: `New: ${d.refNo}` }); queryClient.invalidateQueries({ queryKey: ['do-release-shipments'] }) },
      'shipment:update': (d) => { setLiveNotification({ type: 'update', refNo: d.refNo, message: `Updated: ${d.refNo}` }); queryClient.invalidateQueries({ queryKey: ['do-release-shipments'] }) },
    }
    Object.entries(h).forEach(([e, f]) => socket.on(e, f))
    return () => Object.keys(h).forEach(e => socket.off(e, h[e]))
  }, [socket, queryClient])

  // ✅ UNIQUE query key for DO Release
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['do-release-shipments', search, statusFilter, showArchived, page, perPage],
    queryFn: async () => {
      const params = { isArchived: showArchived ? 'true' : 'false', page, limit: perPage, shipmentType: 'DO_RELEASE' }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/freight/shipments', { params })
      console.log('🔍 DO Release API:', res.data.pagination.total, 'shipments')
      return res.data
    },
    staleTime: 0, gcTime: 0,
  })

  const shipments = data?.data || []
  const totalCount = data?.pagination?.total || 0
  const totalPages = data?.pagination?.totalPages || 0

  const analytics = useMemo(() => {
    const doCollected = shipments.filter(s => s.currentStatus === 'DO_COLLECTED').length
    const invoiced = shipments.filter(s => ['INVOICE_GENERATED','INVOICE_SENT'].includes(s.currentStatus)).length
    const withMAWB = shipments.filter(s => s.freightForwarding?.mawb).length
    const withHAWB = shipments.filter(s => s.freightForwarding?.hawb).length
    return { doCollected, invoiced, withMAWB, withHAWB, completionRate: totalCount > 0 ? Math.round((doCollected / totalCount) * 100) : 0 }
  }, [shipments, totalCount])

  const archiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/archive`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['do-release-shipments'] }); addToast('Archived', 'success') },
  })
  const unarchiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/unarchive`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['do-release-shipments'] }); addToast('Restored', 'success') },
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/freight/export', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `DO_Release_${new Date().toISOString().split('T')[0]}.xlsx`)
      document.body.appendChild(link); link.click(); link.remove()
      addToast('Export downloaded!', 'success')
    } catch { addToast('Failed', 'error') }
    finally { setExporting(false) }
  }

  const getStatusBadge = (s) => {
    const b = {
      'ENQUIRY':'bg-amber-400 text-amber-900','DO_COLLECTED':'bg-teal-500 text-white',
      'INVOICE_GENERATED':'bg-orange-400 text-orange-900','INVOICE_SENT':'bg-rose-400 text-rose-900',
    }
    return b[s] || 'bg-gray-400 text-gray-700'
  }

  const statCards = [
    { label: 'DO Releases', value: totalCount, icon: ClipboardList, gradient: 'from-teal-500 to-emerald-600', desc: 'Total DOs' },
    { label: 'MAWB Filed', value: analytics.withMAWB, icon: Barcode, gradient: 'from-cyan-500 to-blue-600', desc: 'With MAWB' },
    { label: 'DO Collected', value: analytics.doCollected, icon: CheckCircle2, gradient: 'from-emerald-500 to-green-600', desc: `${analytics.completionRate}% done` },
    { label: 'Invoiced', value: analytics.invoiced, icon: FileSpreadsheet, gradient: 'from-violet-500 to-purple-600', desc: 'Invoice done' },
  ]

  const startItem = totalCount===0?0:(page-1)*perPage+1; const endItem = Math.min(page*perPage,totalCount)
  const isEmpty = !isLoading&&!isError&&shipments.length===0; const showSkeleton = isLoading && !data

  return (
    <div className="space-y-6 animate-fade-in">
      {liveNotification && (
        <div className="fixed top-4 right-4 z-50 animate-slide-down">
          <div className="px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 text-sm font-medium bg-teal-50 border-teal-300 text-teal-800 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-200">
            <Zap size={16} /><span>{liveNotification.message}</span>
            <button onClick={() => setLiveNotification(null)} className="ml-2 text-gray-400"><X size={14} /></button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold tracking-wider text-teal-600 dark:text-teal-400 uppercase bg-teal-100 dark:bg-teal-900/40 px-2.5 py-0.5 rounded-md">DO Release</span>
            <span className="text-xs text-[var(--text-secondary)]">{totalCount} DOs</span>
            {socket?.connected && <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</span>}
          </div>
          <h1 className="text-[28px] font-bold bg-gradient-to-r from-teal-600 to-emerald-600 dark:from-teal-400 dark:to-emerald-400 bg-clip-text text-transparent">DO Release</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex glass rounded-lg p-0.5 border border-[var(--border-color)]">
            <button onClick={()=>setShowArchived(false)} className={`px-3.5 py-2 rounded-md text-xs font-semibold ${!showArchived?'bg-white dark:bg-slate-700 shadow-sm':'text-[var(--text-secondary)]'}`}>Active</button>
            <button onClick={()=>setShowArchived(true)} className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 ${showArchived?'bg-white dark:bg-slate-700 shadow-sm':'text-[var(--text-secondary)]'}`}><Archive size={13}/>Archive</button>
          </div>
          <Link to="/create?mode=do-release" className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg hover-lift text-xs font-semibold shadow-lg"><Plus size={15}/> New DO Release</Link>
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
          <span className="text-xs font-semibold text-teal-500 dark:text-teal-400 uppercase">DO Completion Progress</span>
          <span className="text-xs font-bold text-teal-700 dark:text-teal-300">{analytics.completionRate}%</span>
        </div>
        <div className="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-2 overflow-hidden">
          <div className="h-2 rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-700" style={{width:`${analytics.completionRate}%`}}/>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{analytics.doCollected} of {totalCount} DOs collected</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400"/>
          <input type="text" placeholder="Search by Ref No, MAWB, Customer..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} className="w-full pl-9 pr-9 py-2.5 glass border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 text-sm text-[var(--text-primary)]"/>
          {search&&<button onClick={()=>setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X size={14}/></button>}
        </div>
        <button onClick={handleExport} disabled={exporting} className="px-3.5 py-2.5 glass border rounded-lg text-xs font-semibold text-teal-600 flex items-center gap-2">{exporting?<RefreshCw size={14} className="animate-spin"/>:<Download size={14}/>}Export</button>
      </div>

      {isError&&(<div className="glass rounded-xl border border-red-200/50 p-16 text-center"><AlertCircle size={28} className="bg-red-400 text-white rounded-2xl p-4 mx-auto mb-4"/><h3>Connection Error</h3><button onClick={()=>refetch()} className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg"><RefreshCw size={14}/> Retry</button></div>)}
      {isEmpty&&!isError&&(<div className="glass rounded-xl border p-16 text-center"><Inbox size={28} className="text-gray-300 mx-auto mb-2"/><p className="text-[var(--text-muted)]">No DO releases found</p><Link to="/create?mode=do-release" className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-teal-600 text-white rounded-lg text-sm"><Plus size={14}/> Create DO Release</Link></div>)}
      {showSkeleton&&<TableSkeleton/>}

      {!showSkeleton&&!isError&&shipments.length>0&&(<>
        <div className="hidden md:block glass rounded-xl border border-[var(--border-color)] overflow-hidden shadow-lg animate-scale-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/50 dark:to-emerald-950/50">
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-teal-500 uppercase w-12">SL No</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-teal-500 uppercase">Ref No</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-teal-500 uppercase">MAWB</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-teal-500 uppercase">HAWB</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-teal-500 uppercase">CHA Name</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-teal-500 uppercase">Customer</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-teal-500 uppercase">Status</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-teal-500 uppercase">Date</th>
                  <th className="text-right pr-4 py-3 text-[11px] font-semibold text-teal-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {shipments.map((s, idx) => {
                  const ff = s.freightForwarding || {}
                  return (
                    <tr key={s.id} className="group hover:bg-teal-50/30 dark:hover:bg-teal-900/10 transition-colors">
                      <td className="px-3 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">{(page-1)*perPage+idx+1}</td>
                      <td className="px-3 py-3"><Link to={`/shipment/${s.id}`} className="text-sm font-bold text-teal-600 dark:text-teal-400 hover:underline">{s.refNo}</Link></td>
                      <td className="px-3 py-3 text-sm text-[var(--text-primary)] font-medium">{ff.mawb||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{ff.hawb||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{ff.agent||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-primary)] font-medium">{ff.customerName||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ${getStatusBadge(s.currentStatus)}`}>{s.currentStatus?.replace(/_/g,' ')||'—'}</span></td>
                      <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
                      <td className="pr-4 py-3 text-right">
                        <Link to={`/shipment/${s.id}`} className="px-2.5 py-1.5 text-[11px] font-semibold text-teal-600 hover:bg-teal-50 rounded-md"><Eye size={12}/> View</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass rounded-xl border px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--text-secondary)]"><span className="font-semibold text-teal-700">{startItem}-{endItem}</span> of <span className="font-semibold text-teal-700">{totalCount}</span></span>
          <div className="flex items-center gap-0.5">
            <button onClick={()=>setPage(1)} disabled={page===1} className="p-1.5 rounded-md hover:bg-teal-50 disabled:opacity-30"><ChevronsLeft size={14}/></button>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded-md hover:bg-teal-50 disabled:opacity-30"><ChevronLeft size={14}/></button>
            {Array.from({length:Math.min(totalPages,5)},(_,i)=>i+1).map(p=><button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded-md text-[11px] ${page===p?'bg-teal-600 text-white':'text-teal-600 hover:bg-teal-50'}`}>{p}</button>)}
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="p-1.5 rounded-md hover:bg-teal-50 disabled:opacity-30"><ChevronRight size={14}/></button>
            <button onClick={()=>setPage(totalPages)} disabled={page===totalPages} className="p-1.5 rounded-md hover:bg-teal-50 disabled:opacity-30"><ChevronsRight size={14}/></button>
          </div>
        </div>
      </>)}
    </div>
  )
}