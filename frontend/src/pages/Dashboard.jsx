import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  Package, Clock, Download, Archive, Search, Plus,
  CheckCircle2, Truck, FileSpreadsheet,
  Eye, ArchiveRestore, X, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Inbox, AlertCircle, RefreshCw,
  FileSearch, ArchiveIcon, TrendingUp, Layers, Filter,
  ArrowUpRight, SlidersHorizontal, Box, FileCheck
} from 'lucide-react'

const PER_PAGE_OPTIONS = [10, 25, 50, 100]
const API_BASE = 'https://pas-freight-api.onrender.com'

export default function Dashboard() {
  const { addToast } = useToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [shipmentTypeFilter, setShipmentTypeFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [showFilters, setShowFilters] = useState(false)
  const queryClient = useQueryClient()

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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shipments', search, statusFilter, shipmentTypeFilter, showArchived, page, perPage],
    queryFn: async () => {
      const params = { isArchived: showArchived ? 'true' : 'false', page, limit: perPage }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      if (shipmentTypeFilter) params.shipmentType = shipmentTypeFilter
      const res = await api.get('/freight/shipments', { params })
      return res.data
    },
    staleTime: 10000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev
  })

  const shipments = data?.data || []
  const totalCount = data?.pagination?.total || 0
  const totalPages = data?.pagination?.totalPages || 0

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

  const toggleSelectAll = () => {
    if (selected.length === shipments.length) setSelected([])
    else setSelected(shipments.map(s => s.id))
  }
  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const getStatusBadge = (s) => {
    const b = {
      'ENQUIRY':'bg-amber-100/80 text-amber-700 ring-amber-200','RATES_ADDED':'bg-blue-100/80 text-blue-700 ring-blue-200','NOMINATED':'bg-purple-100/80 text-purple-700 ring-purple-200','BOOKED':'bg-indigo-100/80 text-indigo-700 ring-indigo-200','SCHEDULED':'bg-cyan-100/80 text-cyan-700 ring-cyan-200','AWB_GENERATED':'bg-teal-100/80 text-teal-700 ring-teal-200','CHECKLIST_APPROVED':'bg-emerald-100/80 text-emerald-700 ring-emerald-200','BOE_FILED':'bg-lime-100/80 text-lime-700 ring-lime-200','DO_COLLECTED':'bg-green-100/80 text-green-700 ring-green-200','OOC_DONE':'bg-sky-100/80 text-sky-700 ring-sky-200','GATE_PASS':'bg-violet-100/80 text-violet-700 ring-violet-200','DELIVERED':'bg-green-200/80 text-green-800 ring-green-300','INVOICE_GENERATED':'bg-orange-100/80 text-orange-700 ring-orange-200','INVOICE_SENT':'bg-rose-100/80 text-rose-700 ring-rose-200','COMPLETED':'bg-gray-200/80 text-gray-700 ring-gray-300'}
    return b[s]||'bg-gray-100/80 text-gray-600 ring-gray-200'
  }

  const getTypeBadge = (type) => {
    if (type === 'CHA Only') return 'bg-green-100/80 text-green-700 ring-green-200'
    return 'bg-blue-100/80 text-blue-700 ring-blue-200'
  }

  const quickFilters = [
    {l:'All',v:'',i:Layers},{l:'Enquiry',v:'ENQUIRY',i:Search},{l:'Transit',v:'BOOKED',i:Truck},{l:'Customs',v:'CHECKLIST_APPROVED',i:FileSpreadsheet},{l:'Delivered',v:'DELIVERED',i:CheckCircle2},{l:'Invoiced',v:'INVOICE_GENERATED',i:TrendingUp}
  ]

  const startItem = totalCount===0?0:(page-1)*perPage+1
  const endItem = Math.min(page*perPage,totalCount)
  const hasFilters = search||statusFilter||shipmentTypeFilter
  const isEmpty = !isLoading&&!isError&&shipments.length===0

  const statCards = [
    { label: 'Total', value: totalCount, icon: Box, color: 'text-blue-600', bg: 'bg-blue-100/80' },
    { label: 'Active', value: analytics.pending + analytics.inTransit + analytics.customs, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100/80' },
    { label: 'Completed', value: analytics.delivered, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100/80' },
    { label: 'Invoiced', value: analytics.invoiced, icon: FileSpreadsheet, color: 'text-orange-600', bg: 'bg-orange-100/80' },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold tracking-wider text-blue-600 uppercase bg-blue-100/80 px-2.5 py-0.5 rounded-md">Shipments</span>
            <span className="text-xs text-gray-500 font-medium">{totalCount} total</span>
          </div>
          <h1 className="text-[28px] font-bold text-gray-800 tracking-tight">
            {showArchived ? 'Archive' : 'Overview'}
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Shipment Type Filter Toggle */}
          <div className="flex bg-white/60 backdrop-blur rounded-lg p-0.5 border border-white/50 mr-1">
            <button onClick={()=>updateShipmentTypeFilter('')} className={`px-3 py-2 rounded-md text-xs font-semibold transition-all duration-200 ${!shipmentTypeFilter?'bg-white text-gray-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>All</button>
            <button onClick={()=>updateShipmentTypeFilter('FULL_SHIPMENT')} className={`px-3 py-2 rounded-md text-xs font-semibold transition-all duration-200 ${shipmentTypeFilter==='FULL_SHIPMENT'?'bg-white text-gray-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>Shipments</button>
            <button onClick={()=>updateShipmentTypeFilter('CHA_ONLY')} className={`px-3 py-2 rounded-md text-xs font-semibold transition-all duration-200 flex items-center gap-1 ${shipmentTypeFilter==='CHA_ONLY'?'bg-white text-gray-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}><FileCheck size={12}/>CHA Only</button>
          </div>
          <div className="flex bg-white/60 backdrop-blur rounded-lg p-0.5 border border-white/50">
            <button onClick={()=>toggleArchived(false)} className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-all duration-200 ${!showArchived?'bg-white text-gray-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>Active</button>
            <button onClick={()=>toggleArchived(true)} className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${showArchived?'bg-white text-gray-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}><Archive size={13}/>Archive</button>
          </div>
          <Link to="/create" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-semibold transition-all duration-200 shadow-sm">
            <Plus size={15}/> New Shipment
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat, i) => {
          const Icon = stat.icon
          return (
            <div key={i} className="bg-white/70 backdrop-blur rounded-xl p-4 border border-white/50 hover:bg-white/90 transition-all duration-200">
              <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 ${stat.bg} rounded-lg flex items-center justify-center`}>
                  <Icon size={16} className={stat.color} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-800 tracking-tight">{stat.value.toLocaleString()}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 font-medium">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Progress Bar */}
      <div className="bg-white/70 backdrop-blur rounded-xl border border-white/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Delivery Progress</span>
          <span className="text-xs font-bold text-gray-800">{analytics.deliveryRate}%</span>
        </div>
        <div className="w-full bg-gray-200/50 rounded-full h-1.5 overflow-hidden">
          <div className="bg-green-500 h-1.5 rounded-full transition-all duration-700 ease-out" style={{ width: `${analytics.deliveryRate}%` }} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by Ref No, Consignee, HAWB, BOE, Invoice..." value={search} onChange={e=>updateSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 bg-white/70 backdrop-blur border border-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 text-sm transition-all" />
          {search && <button onClick={()=>updateSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14}/></button>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowFilters(!showFilters)} className={`p-2.5 rounded-lg border transition-all ${showFilters?'bg-blue-100/80 border-blue-200 text-blue-600':'bg-white/70 border-white/50 text-gray-500 hover:bg-white/90'}`}>
            <SlidersHorizontal size={15} />
          </button>
          <a href={`${API_BASE}/api/freight/export?isArchived=${showArchived}`} target="_blank"
            className="px-3.5 py-2.5 bg-white/70 backdrop-blur border border-white/50 rounded-lg hover:bg-white/90 text-xs font-semibold text-gray-600 flex items-center gap-2 transition-all">
            <Download size={14}/> Export
          </a>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 p-3.5 bg-white/70 backdrop-blur rounded-xl border border-white/50">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center mr-1"><Filter size={11} className="mr-1"/>Status</span>
          {quickFilters.map(f=>{const I=f.i;const a=statusFilter===f.v;return <button key={f.v} onClick={()=>updateStatus(a?'':f.v)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              a?'bg-blue-600 text-white':'bg-white/80 text-gray-600 hover:bg-white'}`}><I size={12}/>{f.l}{a&&<X size={11}/>}</button>})}
        </div>
      )}

      {/* Bulk Actions */}
      {selected.length > 0 && (
        <div className="bg-blue-50/80 backdrop-blur border border-blue-200/50 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-blue-700 font-medium">{selected.length} selected</span>
          <div className="flex gap-2">
            {!showArchived && <button onClick={()=>bulkArchiveMutation.mutate(selected)} className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 flex items-center gap-1.5 transition-all"><Archive size={13}/> Archive</button>}
            <button onClick={()=>setSelected([])} className="px-3.5 py-1.5 border border-blue-300 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-all">Clear</button>
          </div>
        </div>
      )}

      {/* Empty States */}
      {isError && (
        <div className="bg-white/70 backdrop-blur rounded-xl border border-white/50 p-16 text-center">
          <div className="w-14 h-14 bg-red-100/80 rounded-xl flex items-center justify-center mx-auto mb-4"><AlertCircle size={24} className="text-red-500"/></div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">Connection Error</h3>
          <p className="text-sm text-gray-500 mb-4">Unable to load shipments.</p>
          <button onClick={()=>refetch()} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all"><RefreshCw size={14}/> Retry</button>
        </div>
      )}

      {!isError && isEmpty && hasFilters && (
        <div className="bg-white/70 backdrop-blur rounded-xl border border-white/50 p-16 text-center">
          <div className="w-14 h-14 bg-amber-100/80 rounded-xl flex items-center justify-center mx-auto mb-4"><FileSearch size={24} className="text-amber-500"/></div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">No Results</h3>
          <p className="text-sm text-gray-500 mb-4">Try adjusting your search.</p>
          <button onClick={()=>{updateSearch('');updateStatus('');updateShipmentTypeFilter('')}} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"><X size={14}/> Clear Filters</button>
        </div>
      )}

      {!isError && isEmpty && !hasFilters && !showArchived && (
        <div className="bg-white/70 backdrop-blur rounded-xl border border-white/50 p-16 text-center">
          <div className="w-14 h-14 bg-blue-100/80 rounded-xl flex items-center justify-center mx-auto mb-4"><Inbox size={24} className="text-blue-500"/></div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">No Shipments Yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create your first shipment to get started.</p>
          <Link to="/create" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all"><Plus size={14}/> Create Shipment</Link>
        </div>
      )}

      {!isError && isEmpty && !hasFilters && showArchived && (
        <div className="bg-white/70 backdrop-blur rounded-xl border border-white/50 p-16 text-center">
          <div className="w-14 h-14 bg-gray-100/80 rounded-xl flex items-center justify-center mx-auto mb-4"><ArchiveIcon size={24} className="text-gray-500"/></div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">Archive Empty</h3>
          <p className="text-sm text-gray-500 mb-4">Completed shipments appear here.</p>
          <button onClick={()=>toggleArchived(false)} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"><Package size={14}/> View Active</button>
        </div>
      )}

      {isLoading && (
        <div className="bg-white/70 backdrop-blur rounded-xl border border-white/50 p-16 text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && shipments.length > 0 && (
        <div className="bg-white/70 backdrop-blur rounded-xl border border-white/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-white/50">
                  <th className="w-10 pl-4 py-3">
                    <input type="checkbox" checked={selected.length===shipments.length && shipments.length>0} onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5" />
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ref No</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Type</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Consignee</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">HAWB</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">BOE No</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Date</th>
                  <th className="text-right pr-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shipments.map(s => (
                  <tr key={s.id} className="group hover:bg-white/50 transition-colors">
                    <td className="pl-4 py-3">
                      <input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggleSelect(s.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5" />
                    </td>
                    <td className="px-3 py-3">
                      <Link to={`/shipment/${s.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                        {s.refNo}
                      </Link>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ring-1 ring-inset ${getTypeBadge(s.shipmentType)}`}>
                        {s.shipmentType || <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700 font-medium">
                      {s.freightForwarding?.consigneeName || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 hidden md:table-cell">
                      {s.freightForwarding?.hawb || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 hidden lg:table-cell">
                      {s.cha?.boeNo || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ring-1 ring-inset ${getStatusBadge(s.currentStatus)}`}>
                        {s.currentStatus.replace(/_/g,' ')}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 hidden lg:table-cell">
                      {new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                    </td>
                    <td className="pr-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/shipment/${s.id}`}
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all flex items-center gap-1.5">
                          <Eye size={12}/> View
                        </Link>
                        {showArchived ? (
                          <button onClick={()=>unarchiveMutation.mutate(s.id)}
                            className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-md transition-all flex items-center gap-1.5">
                            <ArchiveRestore size={12}/> Restore
                          </button>
                        ) : (
                          <button onClick={()=>archiveMutation.mutate(s.id)}
                            className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-all flex items-center gap-1.5">
                            <Archive size={12}/> Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="border-t border-gray-100 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/30">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{startItem}-{endItem}</span>
              <span className="text-gray-400">of</span>
              <span className="font-semibold text-gray-700">{totalCount.toLocaleString()}</span>
              <select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1)}}
                className="ml-2 border border-gray-200 rounded-md px-2 py-1 text-[11px] font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white/80">
                {PER_PAGE_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={()=>setPage(1)} disabled={page===1} className="p-1.5 rounded-md hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronsLeft size={14}/></button>
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded-md hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronLeft size={14}/></button>
              {generatePageNumbers(page,totalPages).map((p,i)=>p==='...'?<span key={i} className="px-1.5 text-gray-400 text-xs">...</span>:
                <button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded-md text-[11px] font-semibold transition-all ${page===p?'bg-blue-600 text-white':'text-gray-600 hover:bg-white'}`}>{p}</button>)}
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages||totalPages===0} className="p-1.5 rounded-md hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronRight size={14}/></button>
              <button onClick={()=>setPage(totalPages)} disabled={page===totalPages||totalPages===0} className="p-1.5 rounded-md hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronsRight size={14}/></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function generatePageNumbers(c,t){if(t<=7)return Array.from({length:t},(_,i)=>i+1);if(c<=3)return[1,2,3,4,5,'...',t];if(c>=t-2)return[1,'...',t-4,t-3,t-2,t-1,t];return[1,'...',c-1,c,c+1,'...',t]}