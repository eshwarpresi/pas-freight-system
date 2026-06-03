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
  Box, Info, User, Pencil, RotateCcw, Zap, Ship, Weight, Scale, Barcode
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
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function FreightDashboard() {
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
      'shipment:archiveUpdate': (d) => { queryClient.invalidateQueries({ queryKey: ['shipments'] }) },
    }
    Object.entries(handlers).forEach(([event, handler]) => { socket.on(event, handler); return () => socket.off(event, handler) })
  }, [socket, showArchived, queryClient])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shipments', search, statusFilter, 'FULL_SHIPMENT', showArchived, page, perPage],
    queryFn: async () => {
      const params = { isArchived: showArchived ? 'true' : 'false', page, limit: perPage, shipmentType: 'FULL_SHIPMENT' }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/freight/shipments', { params })
      return res.data
    },
    staleTime: 60000, gcTime: 600000, refetchOnMount: true, refetchOnWindowFocus: false,
    retry: 1, retryDelay: 1000,
  })

  const shipments = data?.data || []
  const totalCount = data?.pagination?.total || 0
  const totalPages = data?.pagination?.totalPages || 0

  const analytics = useMemo(() => {
    const delivered = shipments.filter(s => s.currentStatus === 'DELIVERED' || s.currentStatus === 'HAND_OVER').length
    const invoiced = shipments.filter(s => ['INVOICE_GENERATED', 'INVOICE_SENT'].includes(s.currentStatus)).length
    const totalPkgs = shipments.reduce((sum, s) => sum + (s.freightForwarding?.noOfPackages || 0), 0)
    const totalWt = shipments.reduce((sum, s) => sum + (parseFloat(s.freightForwarding?.grossWeight) || 0), 0)
    return { delivered, invoiced, totalPkgs, totalWt, deliveryRate: totalCount > 0 ? Math.round((delivered / totalCount) * 100) : 0 }
  }, [shipments, totalCount])

  const archiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/archive`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shipments'] }); addToast('Archived', 'success') },
    onError: () => addToast('Failed', 'error')
  })
  const unarchiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/unarchive`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shipments'] }); addToast('Restored', 'success') },
    onError: () => addToast('Failed', 'error')
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/freight/export', { params: { isArchived: showArchived }, responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a'); link.href = url
      link.setAttribute('download', `Freight_${new Date().toISOString().split('T')[0]}.xlsx`)
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url)
      addToast('Export downloaded!', 'success')
    } catch (err) { addToast('Failed to export', 'error') }
    finally { setExporting(false) }
  }

  const getStatusBadge = (s) => {
    const b = {
      'ENQUIRY':'bg-amber-400 text-amber-900','RATES_ADDED':'bg-sky-400 text-sky-900','NOMINATED':'bg-violet-400 text-violet-900',
      'BOOKED':'bg-indigo-400 text-indigo-900','SCHEDULED':'bg-cyan-400 text-cyan-900','AWB_GENERATED':'bg-teal-400 text-teal-900',
      'DELIVERED':'bg-emerald-500 text-white','INVOICE_GENERATED':'bg-orange-400 text-orange-900','INVOICE_SENT':'bg-rose-400 text-rose-900',
    }
    return b[s] || 'bg-gray-400 text-gray-700'
  }

  const getModeBadge = (t) => {
    if (!t) return 'bg-gray-400 text-gray-600'
    return 'bg-blue-500 text-white'
  }

  const statCards = [
    { label: 'Freight Shipments', value: totalCount, icon: Ship, gradient: 'from-blue-500 to-indigo-600', desc: 'Total freight' },
    { label: 'Packages', value: analytics.totalPkgs.toLocaleString(), icon: Box, gradient: 'from-amber-500 to-orange-600', desc: 'Total packages' },
    { label: 'Weight (kg)', value: `${analytics.totalWt.toLocaleString()} kg`, icon: Weight, gradient: 'from-emerald-500 to-teal-600', desc: 'Gross weight' },
    { label: 'Delivered', value: analytics.delivered, icon: CheckCircle2, gradient: 'from-violet-500 to-purple-600', desc: `${analytics.deliveryRate}% success` },
  ]

  const startItem = totalCount===0?0:(page-1)*perPage+1; const endItem = Math.min(page*perPage,totalCount)
  const isEmpty = !isLoading&&!isError&&shipments.length===0; const showSkeleton = isLoading && !data

  return (
    <div className="space-y-6 animate-fade-in">
      {liveNotification && (
        <div className="fixed top-4 right-4 z-50 animate-slide-down">
          <div className="px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 text-sm font-medium bg-indigo-50 border-indigo-300 text-indigo-800 dark:bg-indigo-900/40 dark:border-indigo-700 dark:text-indigo-200">
            <Zap size={16} /><span>{liveNotification.message}</span>
            <button onClick={() => setLiveNotification(null)} className="ml-2 text-gray-400"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-md">Freight</span>
            <span className="text-xs text-[var(--text-secondary)]">{totalCount} shipments</span>
            {socket?.connected && <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</span>}
          </div>
          <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">Freight Forwarding</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex glass rounded-lg p-0.5 border border-[var(--border-color)]">
            <button onClick={()=>setShowArchived(false)} className={`px-3.5 py-2 rounded-md text-xs font-semibold ${!showArchived?'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 shadow-sm':'text-[var(--text-secondary)]'}`}>Active</button>
            <button onClick={()=>setShowArchived(true)} className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 ${showArchived?'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 shadow-sm':'text-[var(--text-secondary)]'}`}><Archive size={13}/>Archive</button>
          </div>
          <Link to="/create?mode=freight" className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover-lift text-xs font-semibold shadow-lg"><Plus size={15}/> New Freight Shipment</Link>
        </div>
      </div>

      {/* Stats */}
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

      {/* Progress */}
      <div className="glass rounded-xl border border-[var(--border-color)] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Freight Delivery Progress</span>
          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{analytics.deliveryRate}%</span>
        </div>
        <div className="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-2 overflow-hidden">
          <div className="h-2 rounded-full bg-gradient-to-r from-indigo-400 to-blue-500 transition-all duration-700" style={{width:`${analytics.deliveryRate}%`}}/>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{analytics.delivered} of {totalCount} freight shipments delivered</p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400"/>
          <input type="text" placeholder="Search by Ref No, Consignee, HAWB, MAWB..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} className="w-full pl-9 pr-9 py-2.5 glass border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm text-[var(--text-primary)]"/>
          {search&&<button onClick={()=>setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"><X size={14}/></button>}
        </div>
        <button onClick={handleExport} disabled={exporting} className="px-3.5 py-2.5 glass border border-[var(--border-color)] rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">{exporting?<RefreshCw size={14} className="animate-spin"/>:<Download size={14}/>}{exporting?'Exporting...':'Export'}</button>
      </div>

      {/* Error / Empty */}
      {isError&&(<div className="glass rounded-xl border border-red-200/50 p-16 text-center"><AlertCircle size={28} className="text-white bg-red-400 rounded-2xl p-4 mx-auto mb-4"/><h3 className="font-semibold text-[var(--text-primary)]">Connection Error</h3><button onClick={()=>refetch()} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm"><RefreshCw size={14}/> Retry</button></div>)}
      {isEmpty&&!isError&&(<div className="glass rounded-xl border border-[var(--border-color)] p-16 text-center"><Inbox size={28} className="text-gray-300 mx-auto mb-2"/><p className="text-[var(--text-muted)]">No freight shipments found</p><Link to="/create?mode=freight" className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm"><Plus size={14}/> Create Shipment</Link></div>)}
      {showSkeleton&&<TableSkeleton/>}

      {/* TABLE */}
      {!showSkeleton&&!isError&&shipments.length>0&&(<>
        <div className="hidden md:block glass rounded-xl border border-[var(--border-color)] overflow-hidden shadow-lg animate-scale-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-950/50">
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase w-12">SL No</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Ref No</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Mode</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Consignee</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Packages</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Weight</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">AWB</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Status</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Date</th>
                  <th className="text-right pr-4 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {shipments.map((s, idx) => {
                  const ff = s.freightForwarding || {}
                  return (
                    <tr key={s.id} className="group hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
                      <td className="px-3 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">{(page-1)*perPage+idx+1}</td>
                      <td className="px-3 py-3"><Link to={`/shipment/${s.id}`} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{s.refNo}</Link></td>
                      <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ring-1 ring-inset ${getModeBadge(s.shipmentType)}`}>{s.shipmentType||'—'}</span></td>
                      <td className="px-3 py-3 text-sm text-[var(--text-primary)] font-medium">{ff.consigneeName||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{ff.noOfPackages||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{ff.grossWeight ? `${ff.grossWeight} kg` : <span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{ff.hawb||ff.mawb||<span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ${getStatusBadge(s.currentStatus)}`}>{s.currentStatus?.replace(/_/g,' ')||'—'}</span></td>
                      <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                      <td className="pr-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/shipment/${s.id}`} className="px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md flex items-center gap-1.5"><Eye size={12}/> View</Link>
                          {showArchived ? <button onClick={()=>unarchiveMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 rounded-md"><ArchiveRestore size={12}/> Restore</button>
                          : <button onClick={()=>archiveMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 rounded-md"><Archive size={12}/> Archive</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="glass rounded-xl border border-[var(--border-color)] px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--text-secondary)]"><span className="font-semibold text-indigo-700">{startItem}-{endItem}</span> of <span className="font-semibold text-indigo-700">{totalCount.toLocaleString()}</span></span>
          <div className="flex items-center gap-0.5">
            <button onClick={()=>setPage(1)} disabled={page===1} className="p-1.5 rounded-md hover:bg-indigo-50 disabled:opacity-30"><ChevronsLeft size={14}/></button>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded-md hover:bg-indigo-50 disabled:opacity-30"><ChevronLeft size={14}/></button>
            {Array.from({length:Math.min(totalPages,5)},(_,i)=>i+1).map(p=><button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded-md text-[11px] font-semibold ${page===p?'bg-indigo-600 text-white':'text-indigo-600 hover:bg-indigo-50'}`}>{p}</button>)}
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages||totalPages===0} className="p-1.5 rounded-md hover:bg-indigo-50 disabled:opacity-30"><ChevronRight size={14}/></button>
            <button onClick={()=>setPage(totalPages)} disabled={page===totalPages||totalPages===0} className="p-1.5 rounded-md hover:bg-indigo-50 disabled:opacity-30"><ChevronsRight size={14}/></button>
          </div>
        </div>
      </>)}
    </div>
  )
}