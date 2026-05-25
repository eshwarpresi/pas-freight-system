import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import OnlineUsers from '../components/OnlineUsers'
import { 
  Package, Clock, Download, Archive, Search, Plus,
  CheckCircle2, Truck, FileSpreadsheet,
  Eye, ArchiveRestore, X, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Inbox, AlertCircle, RefreshCw,
  FileSearch, ArchiveIcon, TrendingUp, Layers, Filter,
  ArrowUpRight, SlidersHorizontal, Box, FileCheck, Info, User, Pencil, Hash, RotateCcw
} from 'lucide-react'

const PER_PAGE_OPTIONS = [10, 25, 50, 100]
const STICKY_KEY = 'pas_dashboard_filters'

function TableSkeleton() {
  return (
    <div className="bg-white/80 backdrop-blur rounded-xl border border-indigo-100/50 overflow-hidden shadow-lg animate-pulse">
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-4 h-4 bg-gray-200 rounded" />
            <div className="h-4 bg-gray-200 rounded w-6" />
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-4 bg-gray-200 rounded w-32 flex-1" />
            <div className="h-4 bg-gray-200 rounded w-16" />
            <div className="h-4 bg-gray-200 rounded w-16" />
            <div className="h-6 bg-gray-200 rounded-full w-20" />
            <div className="h-4 bg-gray-200 rounded w-16" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Load saved filters from sessionStorage
function loadStickyFilters() {
  try {
    const saved = sessionStorage.getItem(STICKY_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return { search: '', statusFilter: '', shipmentTypeFilter: '', page: 1, perPage: 25 }
}

export default function Dashboard() {
  const { addToast } = useToast()
  const sticky = loadStickyFilters()
  const [search, setSearch] = useState(sticky.search || '')
  const [statusFilter, setStatusFilter] = useState(sticky.statusFilter || '')
  const [shipmentTypeFilter, setShipmentTypeFilter] = useState(sticky.shipmentTypeFilter || '')
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(sticky.page || 1)
  const [perPage, setPerPage] = useState(sticky.perPage || 25)
  const [showFilters, setShowFilters] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const queryClient = useQueryClient()

  // Save filters whenever they change (after initial load)
  useEffect(() => {
    if (initialized) {
      try {
        sessionStorage.setItem(STICKY_KEY, JSON.stringify({
          search, statusFilter, shipmentTypeFilter, page, perPage
        }))
      } catch {}
    }
  }, [search, statusFilter, shipmentTypeFilter, page, perPage, initialized])

  // Mark initialized after first render
  useEffect(() => {
    setInitialized(true)
  }, [])

  const buildEditUrl = (shipmentId) => {
    const params = new URLSearchParams()
    params.set('edit', shipmentId)
    if (page > 1) params.set('page', page)
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    if (shipmentTypeFilter) params.set('type', shipmentTypeFilter)
    return `/create?${params.toString()}`
  }

  useEffect(() => {
    const shouldShowArchived = sessionStorage.getItem('showArchived')
    if (shouldShowArchived === 'true') {
      setShowArchived(true)
      sessionStorage.removeItem('showArchived')
    }
  }, [])

  const updateSearch = (val) => { setSearch(val); setPage(1) }
  const updateStatus = (val) => { setStatusFilter(val); setPage(1) }
  const updateShipmentTypeFilter = (val) => { setShipmentTypeFilter(val); setPage(1) }
  const toggleArchived = (val) => { setShowArchived(val); setPage(1); setSelected([]) }

  const clearAllFilters = () => {
    setSearch('')
    setStatusFilter('')
    setShipmentTypeFilter('')
    setPage(1)
    addToast('Filters cleared', 'info')
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shipments', search, statusFilter, shipmentTypeFilter, showArchived, page, perPage],
    queryFn: async () => {
      const params = { isArchived: showArchived ? 'true' : 'false', page, limit: perPage }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      if (shipmentTypeFilter) params.shipmentType = shipmentTypeFilter
      const res = await api.get('/freight/shipments', { params })
      try { sessionStorage.setItem('cached_shipments', JSON.stringify(res.data)) } catch {}
      return res.data
    },
    staleTime: 60000, gcTime: 600000, refetchOnMount: true, refetchOnWindowFocus: false,
    placeholderData: () => { try { const c = sessionStorage.getItem('cached_shipments'); return c ? JSON.parse(c) : undefined } catch { return undefined } },
    retry: 1, retryDelay: 1000,
  })

  const shipments = data?.data || []
  const totalCount = data?.pagination?.total || 0
  const totalPages = data?.pagination?.totalPages || 0

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/freight/export', { params: { isArchived: showArchived }, responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a'); link.href = url
      link.setAttribute('download', `PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`)
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url)
      addToast('Export downloaded!', 'success')
    } catch (err) { addToast('Failed to export', 'error') }
    finally { setExporting(false) }
  }

  const archiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/archive`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shipments'] }); addToast('Shipment archived', 'success') },
    onError: () => addToast('Failed to archive', 'error')
  })
  const unarchiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/unarchive`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shipments'] }); addToast('Shipment restored', 'success') },
    onError: () => addToast('Failed to restore', 'error')
  })
  const bulkArchiveMutation = useMutation({
    mutationFn: async (ids) => { await Promise.all(ids.map(id => api.put(`/archive/shipments/${id}/archive`))) },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shipments'] }); setSelected([]); addToast('Shipments archived', 'success') },
    onError: () => addToast('Bulk archive failed', 'error')
  })

  const analytics = useMemo(() => {
    const d = shipments.filter(s => s.currentStatus === 'DELIVERED').length
    const t = shipments.filter(s => ['BOOKED','SCHEDULED','AWB_GENERATED'].includes(s.currentStatus)).length
    const c = shipments.filter(s => ['CHECKLIST_APPROVED','BOE_FILED','OOC_DONE'].includes(s.currentStatus)).length
    const p = shipments.filter(s => ['ENQUIRY','RATES_ADDED','NOMINATED'].includes(s.currentStatus)).length
    const i = shipments.filter(s => ['INVOICE_GENERATED','INVOICE_SENT'].includes(s.currentStatus)).length
    return { delivered: d, inTransit: t, customs: c, pending: p, invoiced: i, deliveryRate: shipments.length > 0 ? Math.round((d/shipments.length)*100) : 0 }
  }, [shipments])

  const toggleSelectAll = () => { if (selected.length === shipments.length) setSelected([]); else setSelected(shipments.map(s => s.id)) }
  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const getStatusBadge = (s) => {
    const b = {
      'ENQUIRY':'bg-gradient-to-r from-amber-400 to-amber-300 text-amber-900 ring-amber-300','RATES_ADDED':'bg-gradient-to-r from-sky-400 to-sky-300 text-sky-900 ring-sky-300','NOMINATED':'bg-gradient-to-r from-violet-400 to-violet-300 text-violet-900 ring-violet-300','BOOKED':'bg-gradient-to-r from-indigo-400 to-indigo-300 text-indigo-900 ring-indigo-300','SCHEDULED':'bg-gradient-to-r from-cyan-400 to-cyan-300 text-cyan-900 ring-cyan-300','AWB_GENERATED':'bg-gradient-to-r from-teal-400 to-teal-300 text-teal-900 ring-teal-300','CHECKLIST_APPROVED':'bg-gradient-to-r from-emerald-400 to-emerald-300 text-emerald-900 ring-emerald-300','BOE_FILED':'bg-gradient-to-r from-lime-400 to-lime-300 text-lime-900 ring-lime-300','DO_COLLECTED':'bg-gradient-to-r from-green-400 to-green-300 text-green-900 ring-green-300','OOC_DONE':'bg-gradient-to-r from-sky-500 to-sky-400 text-sky-900 ring-sky-400','GATE_PASS':'bg-gradient-to-r from-purple-400 to-purple-300 text-purple-900 ring-purple-300','DELIVERED':'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white ring-emerald-400','INVOICE_GENERATED':'bg-gradient-to-r from-orange-400 to-orange-300 text-orange-900 ring-orange-300','INVOICE_SENT':'bg-gradient-to-r from-rose-400 to-rose-300 text-rose-900 ring-rose-300','COMPLETED':'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-800 ring-gray-300'
    }; return b[s]||'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-700 ring-gray-300'
  }
  const getModeBadge = (t) => t==='CHA Only'?'bg-gradient-to-r from-emerald-500 to-green-500 text-white ring-green-400':!t?'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-600 ring-gray-300':'bg-gradient-to-r from-blue-500 to-indigo-500 text-white ring-blue-400'
  const getImportExportBadge = (v) => v==='Import'?'bg-gradient-to-r from-violet-500 to-purple-500 text-white ring-purple-400':v==='Export'?'bg-gradient-to-r from-orange-500 to-amber-500 text-white ring-amber-400':'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-600 ring-gray-300'

  const quickFilters = [{l:'All',v:'',i:Layers},{l:'Enquiry',v:'ENQUIRY',i:Search},{l:'Transit',v:'BOOKED',i:Truck},{l:'Customs',v:'CHECKLIST_APPROVED',i:FileSpreadsheet},{l:'Delivered',v:'DELIVERED',i:CheckCircle2},{l:'Invoiced',v:'INVOICE_GENERATED',i:TrendingUp}]
  const startItem = totalCount===0?0:(page-1)*perPage+1; const endItem = Math.min(page*perPage,totalCount)
  const hasFilters = search||statusFilter||shipmentTypeFilter; const isEmpty = !isLoading&&!isError&&shipments.length===0; const showSkeleton = isLoading && !data

  const statGradients = ['from-blue-500 to-indigo-600','from-amber-500 to-orange-600','from-emerald-500 to-teal-600','from-violet-500 to-purple-600']
  const statCards = [
    { label: 'Total Shipments', value: totalCount, icon: Box, gradient: statGradients[0], desc: 'All shipments' },
    { label: 'In Progress', value: analytics.pending + analytics.inTransit + analytics.customs, icon: Clock, gradient: statGradients[1], desc: 'Enquiry to Customs' },
    { label: 'Delivered', value: analytics.delivered, icon: CheckCircle2, gradient: statGradients[2], desc: 'Successfully completed' },
    { label: 'Invoiced', value: analytics.invoiced, icon: FileSpreadsheet, gradient: statGradients[3], desc: 'Invoice generated/sent' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold tracking-wider text-indigo-600 uppercase bg-gradient-to-r from-indigo-100 to-blue-100 px-2.5 py-0.5 rounded-md">Shipments</span>
            <span className="text-xs text-gray-500 font-medium">{totalCount} total</span>
            <OnlineUsers />
          </div>
          <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent tracking-tight">{showArchived ? 'Archive' : 'Overview'}</h1>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex bg-gradient-to-r from-indigo-50 to-blue-50 backdrop-blur rounded-lg p-0.5 border border-indigo-200/50">
            <button onClick={()=>updateShipmentTypeFilter('')} className={`px-3 py-2 rounded-md text-xs font-semibold ${!shipmentTypeFilter?'bg-white text-indigo-700 shadow-sm':'text-gray-500'}`}>All</button>
            <button onClick={()=>updateShipmentTypeFilter('FULL_SHIPMENT')} className={`px-3 py-2 rounded-md text-xs font-semibold ${shipmentTypeFilter==='FULL_SHIPMENT'?'bg-white text-indigo-700 shadow-sm':'text-gray-500'}`}>Freight</button>
            <button onClick={()=>updateShipmentTypeFilter('CHA_ONLY')} className={`px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1 ${shipmentTypeFilter==='CHA_ONLY'?'bg-white text-emerald-700 shadow-sm':'text-gray-500'}`}><FileCheck size={12}/>CHA Only</button>
          </div>
          <div className="flex bg-gradient-to-r from-gray-50 to-slate-50 backdrop-blur rounded-lg p-0.5 border border-gray-200/50">
            <button onClick={()=>toggleArchived(false)} className={`px-3.5 py-2 rounded-md text-xs font-semibold ${!showArchived?'bg-white text-gray-800 shadow-sm':'text-gray-500'}`}>Active</button>
            <button onClick={()=>toggleArchived(true)} className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 ${showArchived?'bg-white text-gray-800 shadow-sm':'text-gray-500'}`}><Archive size={13}/>Archive</button>
          </div>
          <Link to="/create" className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:from-indigo-700 hover:to-blue-700 text-xs font-semibold shadow-lg shadow-indigo-200"><Plus size={15}/> New Shipment</Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{statCards.map((stat,i)=>{const Icon=stat.icon;return (<div key={i} className="relative overflow-hidden bg-white/80 backdrop-blur rounded-xl p-4 border border-white/50 hover:scale-[1.02] transition-all duration-300 shadow-lg group"><div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${stat.gradient} opacity-10 rounded-bl-full group-hover:opacity-20`}/><div className="relative"><div className="flex items-center justify-between mb-2"><div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg`}><Icon size={18} className="text-white"/></div></div><p className="text-2xl font-bold text-gray-800">{stat.value.toLocaleString()}</p><p className="text-[11px] text-gray-500 mt-0.5 font-semibold">{stat.label}</p><p className="text-[10px] text-gray-400 mt-0.5">{stat.desc}</p></div></div>)})}</div>

      {/* Progress */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 backdrop-blur rounded-xl border border-indigo-200/50 p-4"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><span className="text-xs font-semibold text-indigo-500 uppercase">Delivery Progress</span><Info size={12} className="text-indigo-400"/></div><span className="text-xs font-bold text-indigo-700">{analytics.deliveryRate}%</span></div><div className="w-full bg-gray-200/50 rounded-full h-2 overflow-hidden"><div className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700" style={{width:`${analytics.deliveryRate}%`}}/></div></div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400"/>
          <input type="text" placeholder="Search by Ref No, Consignee, HAWB, BOE, SB..." value={search} onChange={e=>updateSearch(e.target.value)} className="w-full pl-9 pr-9 py-2.5 bg-white/80 backdrop-blur border border-indigo-200/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm"/>
          {search&&<button onClick={()=>updateSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"><X size={14}/></button>}
        </div>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <button onClick={clearAllFilters} className="px-3 py-2.5 bg-white/80 border border-indigo-200/50 rounded-lg text-xs font-semibold text-indigo-600 flex items-center gap-1.5 hover:bg-indigo-50" title="Clear all filters">
              <RotateCcw size={14} /> Clear
            </button>
          )}
          <button onClick={()=>setShowFilters(!showFilters)} className={`p-2.5 rounded-lg border ${showFilters?'bg-gradient-to-r from-indigo-100 to-blue-100 border-indigo-300 text-indigo-600':'bg-white/80 border-indigo-200/50 text-gray-500'}`}><SlidersHorizontal size={15}/></button>
          <button onClick={handleExport} disabled={exporting} className="px-3.5 py-2.5 bg-gradient-to-r from-white to-indigo-50 border border-indigo-200/50 rounded-lg text-xs font-semibold text-indigo-600 flex items-center gap-2 disabled:opacity-50">{exporting?<RefreshCw size={14} className="animate-spin"/>:<Download size={14}/>}{exporting?'Exporting...':'Export'}</button>
        </div>
      </div>

      {showFilters&&(<div className="flex flex-wrap gap-2 p-3.5 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-200/50"><span className="text-[11px] font-semibold text-indigo-400 uppercase flex items-center mr-1"><Filter size={11} className="mr-1"/>Status</span>{quickFilters.map(f=>{const I=f.i;const a=statusFilter===f.v;return <button key={f.v} onClick={()=>updateStatus(a?'':f.v)} className={`px-3 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 ${a?'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg':'bg-white/80 text-gray-600'}`}><I size={12}/>{f.l}{a&&<X size={11}/>}</button>})}</div>)}

      {selected.length>0&&(<div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-300/50 rounded-xl px-4 py-3 flex items-center justify-between"><span className="text-sm text-indigo-700 font-medium">{selected.length} selected</span><div className="flex gap-2">{!showArchived&&<button onClick={()=>bulkArchiveMutation.mutate(selected)} className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg"><Archive size={13}/> Archive</button>}<button onClick={()=>setSelected([])} className="px-3.5 py-1.5 border border-indigo-300 text-indigo-700 rounded-lg text-xs font-semibold">Clear</button></div></div>)}

      {isError&&(<div className="bg-white/80 rounded-xl border border-red-200/50 p-16 text-center"><div className="w-16 h-16 bg-gradient-to-br from-red-400 to-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><AlertCircle size={28} className="text-white"/></div><h3 className="text-base font-semibold text-gray-800 mb-1">Connection Error</h3><p className="text-sm text-gray-500 mb-4">Unable to load shipments.</p><button onClick={()=>refetch()} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-sm font-semibold shadow-lg"><RefreshCw size={14}/> Retry</button></div>)}
      {!isError&&isEmpty&&hasFilters&&(<div className="bg-white/80 rounded-xl border border-amber-200/50 p-16 text-center"><div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><FileSearch size={28} className="text-white"/></div><h3 className="text-base font-semibold text-gray-800 mb-1">No Results</h3><p className="text-sm text-gray-500 mb-4">Try adjusting your search or filters.</p><button onClick={clearAllFilters} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600"><RotateCcw size={14}/> Clear All Filters</button></div>)}
      {!isError&&isEmpty&&!hasFilters&&!showArchived&&(<div className="bg-white/80 rounded-xl border border-indigo-200/50 p-16 text-center"><div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><Inbox size={28} className="text-white"/></div><h3 className="text-base font-semibold text-gray-800 mb-1">Welcome to PAS Freight</h3><p className="text-sm text-gray-500 mb-4">Create your first shipment to get started.</p><Link to="/create" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-sm font-semibold shadow-lg"><Plus size={14}/> Create Shipment</Link></div>)}
      {!isError&&isEmpty&&!hasFilters&&showArchived&&(<div className="bg-white/80 rounded-xl border border-gray-200/50 p-16 text-center"><div className="w-16 h-16 bg-gradient-to-br from-gray-400 to-slate-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><ArchiveIcon size={28} className="text-white"/></div><h3 className="text-base font-semibold text-gray-800 mb-1">Archive Empty</h3><button onClick={()=>toggleArchived(false)} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600"><Package size={14}/> View Active Shipments</button></div>)}
      {showSkeleton&&<TableSkeleton/>}

      {!showSkeleton&&!isError&&shipments.length>0&&(<>
        {/* DESKTOP TABLE */}
        <div className="hidden md:block bg-white/80 backdrop-blur rounded-xl border border-indigo-100/50 overflow-hidden shadow-lg"><div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-gradient-to-r from-indigo-50 to-blue-50"><th className="w-10 pl-4 py-3"><input type="checkbox" checked={selected.length===shipments.length&&shipments.length>0} onChange={toggleSelectAll} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"/></th><th className="text-center px-2 py-3 text-[11px] font-semibold text-indigo-500 uppercase w-12">SL No</th><th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Ref No</th><th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Transport Mode</th><th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Import/Export</th><th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Consignee</th><th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Created By</th><th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">HAWB</th><th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">SB/BOE No</th><th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Status</th><th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Date</th><th className="text-right pr-4 py-3 text-[11px] font-semibold text-indigo-500 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-gray-50">{shipments.map((s, idx)=> { const slNo = (page - 1) * perPage + idx + 1; return (<tr key={s.id} className="group hover:bg-gradient-to-r hover:from-indigo-50 hover:to-transparent"><td className="pl-4 py-3"><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggleSelect(s.id)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"/></td><td className="px-2 py-3 text-center text-xs font-semibold text-gray-500">{slNo}</td><td className="px-3 py-3"><Link to={`/shipment/${s.id}`} className="text-sm font-bold text-indigo-600">{s.refNo}</Link></td><td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ring-1 ring-inset ${getModeBadge(s.shipmentType)}`}>{s.shipmentType||'—'}</span></td><td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ring-1 ring-inset ${getImportExportBadge(s.importExport)}`}>{s.importExport||'—'}</span></td><td className="px-3 py-3 text-sm text-gray-700 font-medium">{s.freightForwarding?.consigneeName||<span className="text-gray-300">—</span>}</td><td className="px-3 py-3 text-xs text-gray-500"><span className="flex items-center gap-1"><User size={10} className="text-gray-400"/>{s.createdByName||<span className="text-gray-300">—</span>}</span></td><td className="px-3 py-3 text-sm text-gray-500">{s.freightForwarding?.hawb||<span className="text-gray-300">—</span>}</td><td className="px-3 py-3 text-sm text-gray-500">{s.cha?.sbNo || s.cha?.boeNo || <span className="text-gray-300">—</span>}</td><td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ring-1 ring-inset ${getStatusBadge(s.currentStatus)}`}>{s.currentStatus.replace(/_/g,' ')}</span></td><td className="px-3 py-3 text-sm text-gray-500">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td><td className="pr-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Link to={buildEditUrl(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-md flex items-center gap-1.5"><Pencil size={12}/> Edit</Link><Link to={`/shipment/${s.id}`} className="px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md flex items-center gap-1.5"><Eye size={12}/> View</Link>{showArchived?<button onClick={()=>unarchiveMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 rounded-md flex items-center gap-1.5"><ArchiveRestore size={12}/> Restore</button>:<button onClick={()=>archiveMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 hover:bg-amber-50 rounded-md flex items-center gap-1.5"><Archive size={12}/> Archive</button>}</div></td></tr>)})}</tbody></table></div></div>

        {/* MOBILE CARDS */}
        <div className="md:hidden space-y-3">{shipments.map((s, idx) => { const slNo = (page - 1) * perPage + idx + 1; return (<div key={s.id} className="bg-white/80 rounded-xl border border-indigo-100/50 p-4 shadow-sm"><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><span className="text-xs font-bold text-gray-400">#{slNo}</span><Link to={`/shipment/${s.id}`} className="text-sm font-bold text-indigo-600">{s.refNo}</Link></div><span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ring-1 ring-inset ${getStatusBadge(s.currentStatus)}`}>{s.currentStatus.replace(/_/g,' ')}</span></div><div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-gray-400">Consignee:</span> <span className="text-gray-700 font-medium">{s.freightForwarding?.consigneeName||'—'}</span></div><div><span className="text-gray-400">Mode:</span> <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${getModeBadge(s.shipmentType)}`}>{s.shipmentType||'—'}</span></div><div><span className="text-gray-400">Created By:</span> <span className="text-gray-700 flex items-center gap-1"><User size={10}/>{s.createdByName||'—'}</span></div><div><span className="text-gray-400">HAWB:</span> <span className="text-gray-700">{s.freightForwarding?.hawb||'—'}</span></div><div><span className="text-gray-400">SB/BOE:</span> <span className="text-gray-700">{s.cha?.sbNo || s.cha?.boeNo || '—'}</span></div><div><span className="text-gray-400">I/E:</span> <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${getImportExportBadge(s.importExport)}`}>{s.importExport||'—'}</span></div><div><span className="text-gray-400">Date:</span> <span className="text-gray-700">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></div></div><div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100"><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggleSelect(s.id)} className="rounded border-gray-300 text-indigo-600 w-3.5 h-3.5"/><div className="flex items-center gap-1"><Link to={buildEditUrl(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 hover:bg-amber-50 rounded-md flex items-center gap-1.5"><Pencil size={12}/> Edit</Link><Link to={`/shipment/${s.id}`} className="px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded-md flex items-center gap-1.5"><Eye size={12}/> View</Link>{showArchived?<button onClick={()=>unarchiveMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 rounded-md flex items-center gap-1.5"><ArchiveRestore size={12}/> Restore</button>:<button onClick={()=>archiveMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 hover:bg-amber-50 rounded-md flex items-center gap-1.5"><Archive size={12}/> Archive</button>}</div></div></div>)})}</div>

        {/* Pagination */}
        <div className="bg-white/80 rounded-xl border border-indigo-100/50 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs text-gray-500"><span className="font-semibold text-indigo-700">{startItem}-{endItem}</span><span className="text-gray-400">of</span><span className="font-semibold text-indigo-700">{totalCount.toLocaleString()}</span><select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1)}} className="ml-2 border border-indigo-200 rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">{PER_PAGE_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}</select></div><div className="flex items-center gap-0.5"><button onClick={()=>setPage(1)} disabled={page===1} className="p-1.5 rounded-md hover:bg-indigo-50 disabled:opacity-30"><ChevronsLeft size={14}/></button><button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded-md hover:bg-indigo-50 disabled:opacity-30"><ChevronLeft size={14}/></button>{generatePageNumbers(page,totalPages).map((p,i)=>p==='...'?<span key={i} className="px-1.5 text-gray-400 text-xs">...</span>:<button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded-md text-[11px] font-semibold ${page===p?'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg':'text-indigo-600 hover:bg-indigo-50'}`}>{p}</button>)}<button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages||totalPages===0} className="p-1.5 rounded-md hover:bg-indigo-50 disabled:opacity-30"><ChevronRight size={14}/></button><button onClick={()=>setPage(totalPages)} disabled={page===totalPages||totalPages===0} className="p-1.5 rounded-md hover:bg-indigo-50 disabled:opacity-30"><ChevronsRight size={14}/></button></div></div>
      </>)}
    </div>
  )
}
function generatePageNumbers(c,t){if(t<=7)return Array.from({length:t},(_,i)=>i+1);if(c<=3)return[1,2,3,4,5,'...',t];if(c>=t-2)return[1,'...',t-4,t-3,t-2,t-1,t];return[1,'...',c-1,c,c+1,'...',t]}