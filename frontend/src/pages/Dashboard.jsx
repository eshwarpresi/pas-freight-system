import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  Package, Clock, Download, Archive, Search, Plus,
  CheckCircle2, Truck, FileSpreadsheet, BarChart3,
  Eye, ArchiveRestore, X, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Inbox, AlertCircle, RefreshCw,
  FileSearch, ArchiveIcon, TrendingUp, Layers, Filter,
  ArrowUpRight, MoreHorizontal, SlidersHorizontal
} from 'lucide-react'

const PER_PAGE_OPTIONS = [10, 25, 50, 100]
const API_BASE = 'https://pas-freight-api.onrender.com'

export default function Dashboard() {
  const { addToast } = useToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [showFilters, setShowFilters] = useState(false)
  const queryClient = useQueryClient()

  const updateSearch = (val) => { setSearch(val); setPage(1) }
  const updateStatus = (val) => { setStatusFilter(val); setPage(1) }
  const toggleArchived = (val) => { setShowArchived(val); setPage(1); setSelected([]) }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shipments', search, statusFilter, showArchived, page, perPage],
    queryFn: async () => {
      const params = { isArchived: showArchived ? 'true' : 'false', page, limit: perPage }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
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
      'ENQUIRY':'bg-amber-50 text-amber-700 ring-amber-200','RATES_ADDED':'bg-sky-50 text-sky-700 ring-sky-200','NOMINATED':'bg-violet-50 text-violet-700 ring-violet-200','BOOKED':'bg-indigo-50 text-indigo-700 ring-indigo-200','SCHEDULED':'bg-cyan-50 text-cyan-700 ring-cyan-200','AWB_GENERATED':'bg-teal-50 text-teal-700 ring-teal-200','CHECKLIST_APPROVED':'bg-emerald-50 text-emerald-700 ring-emerald-200','BOE_FILED':'bg-lime-50 text-lime-700 ring-lime-200','DO_COLLECTED':'bg-green-50 text-green-700 ring-green-200','OOC_DONE':'bg-blue-50 text-blue-700 ring-blue-200','GATE_PASS':'bg-purple-50 text-purple-700 ring-purple-200','DELIVERED':'bg-green-100 text-green-800 ring-green-300','INVOICE_GENERATED':'bg-orange-50 text-orange-700 ring-orange-200','INVOICE_SENT':'bg-rose-50 text-rose-700 ring-rose-200','COMPLETED':'bg-gray-100 text-gray-600 ring-gray-300'}
    return b[s]||'bg-gray-50 text-gray-600 ring-gray-200'
  }

  const quickFilters = [
    {l:'All',v:'',i:Layers},{l:'Enquiry',v:'ENQUIRY',i:Search},{l:'Transit',v:'BOOKED',i:Truck},{l:'Customs',v:'CHECKLIST_APPROVED',i:FileSpreadsheet},{l:'Delivered',v:'DELIVERED',i:CheckCircle2},{l:'Invoiced',v:'INVOICE_GENERATED',i:TrendingUp}
  ]

  const startItem = totalCount===0?0:(page-1)*perPage+1
  const endItem = Math.min(page*perPage,totalCount)
  const hasFilters = search||statusFilter
  const isEmpty = !isLoading&&!isError&&shipments.length===0

  const statCards = [
    { label: 'Total', value: totalCount, icon: Package, color: 'from-blue-500 to-blue-600', bg: 'bg-blue-50' },
    { label: 'In Progress', value: analytics.pending + analytics.inTransit + analytics.customs, icon: Clock, color: 'from-amber-500 to-amber-600', bg: 'bg-amber-50' },
    { label: 'Delivered', value: analytics.delivered, icon: CheckCircle2, color: 'from-green-500 to-green-600', bg: 'bg-green-50' },
    { label: 'Invoiced', value: analytics.invoiced, icon: TrendingUp, color: 'from-purple-500 to-purple-600', bg: 'bg-purple-50' },
  ]

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold tracking-widest text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded">Shipments</span>
            <span className="text-xs text-gray-400">{totalCount} total</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            {showArchived ? 'Archive' : 'Overview'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button onClick={()=>toggleArchived(false)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${!showArchived?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>Active</button>
            <button onClick={()=>toggleArchived(true)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${showArchived?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}><Archive size={14}/>Archive</button>
          </div>
          <Link to="/create" className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 text-sm font-medium transition-all duration-200 shadow-lg shadow-gray-200 hover:shadow-gray-300">
            <Plus size={16}/> New Shipment
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon
          return (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center`}>
                  <Icon size={20} className={`bg-gradient-to-br ${stat.color} bg-clip-text text-transparent`} />
                </div>
                <ArrowUpRight size={14} className="text-gray-300" />
              </div>
              <p className="text-2xl font-bold text-gray-900 tracking-tight">{stat.value.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Delivery Progress</span>
          </div>
          <span className="text-sm font-bold text-gray-900">{analytics.deliveryRate}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className="bg-gradient-to-r from-green-400 to-green-500 h-2 rounded-full transition-all duration-700 ease-out" style={{ width: `${analytics.deliveryRate}%` }} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by Ref No, Consignee, Shipper..." value={search} onChange={e=>updateSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm transition-all" />
          {search && <button onClick={()=>updateSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={15}/></button>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowFilters(!showFilters)} className={`p-2.5 rounded-xl border transition-all ${showFilters?'bg-blue-50 border-blue-200 text-blue-600':'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            <SlidersHorizontal size={17} />
          </button>
          <a href={`${API_BASE}/api/freight/export?isArchived=${showArchived}`} target="_blank"
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2 transition-all">
            <Download size={15}/> Export
          </a>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 p-4 bg-white rounded-2xl border border-gray-100 animate-in slide-in-from-top-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center mr-2"><Filter size={12} className="mr-1"/>Status</span>
          {quickFilters.map(f=>{const I=f.i;const a=statusFilter===f.v;return <button key={f.v} onClick={()=>updateStatus(a?'':f.v)}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
              a?'bg-gray-900 text-white shadow-sm':'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}><I size={13}/>{f.l}{a&&<X size={12}/>}</button>})}
        </div>
      )}

      {/* Bulk Actions */}
      {selected.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5 flex items-center justify-between animate-in slide-in-from-top-2">
          <span className="text-sm text-blue-700 font-medium">{selected.length} shipment{selected.length>1?'s':''} selected</span>
          <div className="flex gap-2">
            {!showArchived && <button onClick={()=>bulkArchiveMutation.mutate(selected)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center gap-2 transition-all"><Archive size={14}/> Archive</button>}
            <button onClick={()=>setSelected([])} className="px-4 py-2 border border-blue-300 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-100 transition-all">Clear</button>
          </div>
        </div>
      )}

      {/* Empty States */}
      {isError && (
        <div className="bg-white rounded-2xl border border-gray-100 p-20 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5"><AlertCircle size={28} className="text-red-500"/></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Connection Error</h3>
          <p className="text-sm text-gray-500 mb-5">Unable to load shipments. Please check your connection.</p>
          <button onClick={()=>refetch()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-all"><RefreshCw size={15}/> Retry</button>
        </div>
      )}

      {!isError && isEmpty && hasFilters && (
        <div className="bg-white rounded-2xl border border-gray-100 p-20 text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5"><FileSearch size={28} className="text-amber-500"/></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Results Found</h3>
          <p className="text-sm text-gray-500 mb-5">Try adjusting your search or filter criteria.</p>
          <button onClick={()=>{updateSearch('');updateStatus('')}} className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"><X size={15}/> Clear Filters</button>
        </div>
      )}

      {!isError && isEmpty && !hasFilters && !showArchived && (
        <div className="bg-white rounded-2xl border border-gray-100 p-20 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5"><Inbox size={28} className="text-blue-500"/></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Start Tracking Shipments</h3>
          <p className="text-sm text-gray-500 mb-5">Create your first shipment to begin managing logistics.</p>
          <Link to="/create" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"><Plus size={15}/> Create First Shipment</Link>
        </div>
      )}

      {!isError && isEmpty && !hasFilters && showArchived && (
        <div className="bg-white rounded-2xl border border-gray-100 p-20 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5"><ArchiveIcon size={28} className="text-gray-400"/></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Archive is Empty</h3>
          <p className="text-sm text-gray-500 mb-5">Completed shipments will appear here.</p>
          <button onClick={()=>toggleArchived(false)} className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"><Package size={15}/> View Active</button>
        </div>
      )}

      {isLoading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-20 text-center">
          <div className="w-10 h-10 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading shipments...</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && shipments.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="w-10 pl-5 py-4">
                    <input type="checkbox" checked={selected.length===shipments.length && shipments.length>0} onChange={toggleSelectAll}
                      className="rounded-md border-gray-300 text-gray-900 focus:ring-gray-900 w-4 h-4" />
                  </th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ref No</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Consignee</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Shipper</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Date</th>
                  <th className="text-right pr-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shipments.map(s => (
                  <tr key={s.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="pl-5 py-3.5">
                      <input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggleSelect(s.id)}
                        className="rounded-md border-gray-300 text-gray-900 focus:ring-gray-900 w-4 h-4" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Link to={`/shipment/${s.id}`} className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                        {s.refNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 font-medium">
                      {s.freightForwarding?.consigneeName || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-500 hidden md:table-cell">
                      {s.freightForwarding?.shipperName || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ring-1 ring-inset ${getStatusBadge(s.currentStatus)}`}>
                        {s.currentStatus.replace(/_/g,' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-500 hidden lg:table-cell">
                      {new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                    </td>
                    <td className="pr-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/shipment/${s.id}`}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all flex items-center gap-1.5">
                          <Eye size={13}/> View
                        </Link>
                        {showArchived ? (
                          <button onClick={()=>unarchiveMutation.mutate(s.id)}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all flex items-center gap-1.5">
                            <ArchiveRestore size={13}/> Restore
                          </button>
                        ) : (
                          <button onClick={()=>archiveMutation.mutate(s.id)}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all flex items-center gap-1.5">
                            <Archive size={13}/> Archive
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
          <div className="border-t border-gray-100 px-5 py-3.5 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="font-medium text-gray-700">{startItem}-{endItem}</span>
              <span className="text-gray-400">of</span>
              <span className="font-medium text-gray-700">{totalCount.toLocaleString()}</span>
              <select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1)}}
                className="ml-3 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white">
                {PER_PAGE_OPTIONS.map(n=><option key={n} value={n}>{n} per page</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={()=>setPage(1)} disabled={page===1} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronsLeft size={15}/></button>
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronLeft size={15}/></button>
              {generatePageNumbers(page,totalPages).map((p,i)=>p==='...'?<span key={i} className="px-2 text-gray-400 text-xs">...</span>:
                <button key={p} onClick={()=>setPage(p)} className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all ${page===p?'bg-gray-900 text-white shadow-sm':'text-gray-600 hover:bg-gray-200'}`}>{p}</button>)}
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages||totalPages===0} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronRight size={15}/></button>
              <button onClick={()=>setPage(totalPages)} disabled={page===totalPages||totalPages===0} className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronsRight size={15}/></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function generatePageNumbers(c,t){if(t<=7)return Array.from({length:t},(_,i)=>i+1);if(c<=3)return[1,2,3,4,5,'...',t];if(c>=t-2)return[1,'...',t-4,t-3,t-2,t-1,t];return[1,'...',c-1,c,c+1,'...',t]}