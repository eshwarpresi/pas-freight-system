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
  FileSearch, ArchiveIcon
} from 'lucide-react'

const PER_PAGE_OPTIONS = [10, 25, 50, 100]
const API_BASE = 'https://pas-freight-api.onrender.com'

export default function Dashboard() {
  const { addToast } = useToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState([])
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
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
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
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
      'ENQUIRY':'bg-amber-50 text-amber-700 border-amber-200','RATES_ADDED':'bg-sky-50 text-sky-700 border-sky-200','NOMINATED':'bg-violet-50 text-violet-700 border-violet-200','BOOKED':'bg-indigo-50 text-indigo-700 border-indigo-200','SCHEDULED':'bg-cyan-50 text-cyan-700 border-cyan-200','AWB_GENERATED':'bg-teal-50 text-teal-700 border-teal-200','CHECKLIST_APPROVED':'bg-emerald-50 text-emerald-700 border-emerald-200','BOE_FILED':'bg-lime-50 text-lime-700 border-lime-200','DO_COLLECTED':'bg-green-50 text-green-700 border-green-200','OOC_DONE':'bg-blue-50 text-blue-700 border-blue-200','GATE_PASS':'bg-purple-50 text-purple-700 border-purple-200','DELIVERED':'bg-green-100 text-green-800 border-green-300','INVOICE_GENERATED':'bg-orange-50 text-orange-700 border-orange-200','INVOICE_SENT':'bg-rose-50 text-rose-700 border-rose-200','COMPLETED':'bg-gray-100 text-gray-700 border-gray-300'}
    return b[s]||'bg-gray-50 text-gray-600 border-gray-200'
  }

  const quickFilters = [
    {l:'All',v:'',i:Package},{l:'Enquiry',v:'ENQUIRY',i:Search},{l:'In Transit',v:'BOOKED',i:Truck},{l:'Customs',v:'CHECKLIST_APPROVED',i:FileSpreadsheet},{l:'Delivered',v:'DELIVERED',i:CheckCircle2},{l:'Invoiced',v:'INVOICE_GENERATED',i:FileSpreadsheet}
  ]

  const startItem = totalCount===0?0:(page-1)*perPage+1
  const endItem = Math.min(page*perPage,totalCount)
  const hasFilters = search||statusFilter
  const isEmpty = !isLoading&&!isError&&shipments.length===0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Shipment Dashboard</h1><p className="text-sm text-gray-500 mt-0.5">{totalCount.toLocaleString()} {showArchived?'archived':'active'} shipments</p></div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowAnalytics(!showAnalytics)} className={`px-3 py-2 rounded-lg text-sm font-medium border flex items-center gap-2 ${showAnalytics?'bg-blue-50 border-blue-200 text-blue-700':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}><BarChart3 size={16}/>Analytics</button>
          <Link to="/create" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2 shadow-sm"><Plus size={16}/>New Shipment</Link>
        </div>
      </div>

      {showAnalytics&&<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <A l="On Page" v={shipments.length} c="bg-gray-600" i={Package}/><A l="Pending" v={analytics.pending} c="bg-amber-500" i={Clock}/><A l="In Transit" v={analytics.inTransit} c="bg-blue-500" i={Truck}/><A l="Customs" v={analytics.customs} c="bg-purple-500" i={FileSpreadsheet}/><A l="Delivered" v={analytics.delivered} c="bg-green-500" i={CheckCircle2}/><A l="Invoiced" v={analytics.invoiced} c="bg-orange-500" i={FileSpreadsheet}/>
        <div className="col-span-full bg-white rounded-xl p-4 border"><div className="flex justify-between mb-2"><span className="text-sm font-medium">Delivery Progress</span><span className="text-sm font-bold">{analytics.deliveryRate}%</span></div><div className="w-full bg-gray-200 rounded-full h-3"><div className="bg-green-500 h-3 rounded-full transition-all" style={{width:`${analytics.deliveryRate}%`}}/></div></div>
      </div>}

      <div className="flex flex-wrap gap-2">{quickFilters.map(f=>{const I=f.i;const a=statusFilter===f.v;return <button key={f.v} onClick={()=>updateStatus(a?'':f.v)} className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${a?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}><I size={12}/>{f.l}{a&&<X size={12}/>}</button>})}</div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input type="text" placeholder="Search..." value={search} onChange={e=>updateSearch(e.target.value)} className="w-full pl-10 pr-10 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
          {search&&<button onClick={()=>updateSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14}/></button>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={()=>toggleArchived(false)} className={`px-3 py-1.5 rounded-md text-xs font-medium ${!showArchived?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>Active</button>
            <button onClick={()=>toggleArchived(true)} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 ${showArchived?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}><Archive size={12}/>Archived</button>
          </div>
          <a href={`${API_BASE}/api/freight/export?isArchived=${showArchived}`} target="_blank" className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium flex items-center gap-1.5"><Download size={14}/>Export</a>
        </div>
      </div>

      {selected.length>0&&<div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between"><span className="text-sm text-blue-700 font-medium">{selected.length} selected</span><div className="flex gap-2">{!showArchived&&<button onClick={()=>bulkArchiveMutation.mutate(selected)} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 flex items-center gap-1"><Archive size={12}/>Archive</button>}<button onClick={()=>setSelected([])} className="px-3 py-1.5 border border-blue-300 text-blue-700 rounded-md text-xs font-medium hover:bg-blue-100">Clear</button></div></div>}

      {isError&&<div className="bg-white rounded-xl border p-16 text-center"><div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><AlertCircle size={32} className="text-red-500"/></div><h3 className="text-lg font-semibold mb-1">Failed to load</h3><button onClick={()=>refetch()} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"><RefreshCw size={16}/>Try Again</button></div>}
      {!isError&&isEmpty&&hasFilters&&<div className="bg-white rounded-xl border p-16 text-center"><div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><FileSearch size={32} className="text-amber-500"/></div><h3 className="text-lg font-semibold mb-1">No matching shipments</h3><button onClick={()=>{updateSearch('');updateStatus('')}} className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"><X size={16}/>Clear Filters</button></div>}
      {!isError&&isEmpty&&!hasFilters&&!showArchived&&<div className="bg-white rounded-xl border p-16 text-center"><div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Inbox size={32} className="text-blue-500"/></div><h3 className="text-lg font-semibold mb-1">No shipments yet</h3><Link to="/create" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"><Plus size={16}/>Create Your First Shipment</Link></div>}
      {!isError&&isEmpty&&!hasFilters&&showArchived&&<div className="bg-white rounded-xl border p-16 text-center"><div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><ArchiveIcon size={32} className="text-gray-400"/></div><h3 className="text-lg font-semibold mb-1">No archived shipments</h3><button onClick={()=>toggleArchived(false)} className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"><Package size={16}/>View Active</button></div>}
      {isLoading&&<div className="bg-white rounded-xl border p-16 text-center"><div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"/><p className="text-sm text-gray-500">Loading shipments...</p></div>}

      {!isLoading&&!isError&&shipments.length>0&&<div className="bg-white rounded-xl shadow-sm border overflow-hidden"><div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-gray-50 border-b"><th className="w-10 px-4 py-3"><input type="checkbox" checked={selected.length===shipments.length} onChange={toggleSelectAll} className="rounded border-gray-300 text-blue-600"/></th><th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ref No</th><th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Consignee</th><th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Shipper</th><th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th><th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Date</th><th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th></tr></thead><tbody className="divide-y">{shipments.map(s=><tr key={s.id} className="hover:bg-gray-50 transition-colors"><td className="px-4 py-3"><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggleSelect(s.id)} className="rounded border-gray-300 text-blue-600"/></td><td className="px-4 py-3"><Link to={`/shipment/${s.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-800">{s.refNo}</Link></td><td className="px-4 py-3 text-sm text-gray-700 font-medium">{s.freightForwarding?.consigneeName||'—'}</td><td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{s.freightForwarding?.shipperName||'—'}</td><td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(s.currentStatus)}`}>{s.currentStatus.replace(/_/g,' ')}</span></td><td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Link to={`/shipment/${s.id}`} className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1"><Eye size={12}/>View</Link>{showArchived?<button onClick={()=>unarchiveMutation.mutate(s.id)} className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-green-600 hover:bg-green-50 rounded flex items-center gap-1"><ArchiveRestore size={12}/>Restore</button>:<button onClick={()=>archiveMutation.mutate(s.id)} className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded flex items-center gap-1"><Archive size={12}/>Archive</button>}</div></td></tr>)}</tbody></table></div><div className="border-t px-4 py-3 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm"><div className="flex items-center gap-3 text-gray-500"><span>{startItem}-{endItem} of {totalCount.toLocaleString()}</span><select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1)}} className="border rounded px-2 py-1 text-xs">{PER_PAGE_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}</select></div><div className="flex items-center gap-1"><button onClick={()=>setPage(1)} disabled={page===1} className="p-2 rounded hover:bg-gray-200 disabled:opacity-30"><ChevronsLeft size={16}/></button><button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-2 rounded hover:bg-gray-200 disabled:opacity-30"><ChevronLeft size={16}/></button>{generatePageNumbers(page,totalPages).map((p,i)=>p==='...'?<span key={i} className="px-2 py-1 text-gray-400">...</span>:<button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded text-xs font-medium ${page===p?'bg-blue-600 text-white':'hover:bg-gray-200 text-gray-600'}`}>{p}</button>)}<button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages||totalPages===0} className="p-2 rounded hover:bg-gray-200 disabled:opacity-30"><ChevronRight size={16}/></button><button onClick={()=>setPage(totalPages)} disabled={page===totalPages||totalPages===0} className="p-2 rounded hover:bg-gray-200 disabled:opacity-30"><ChevronsRight size={16}/></button></div></div></div>}
    </div>
  )
}

function A({l:t,v,c,i:I}){return <div className="bg-white rounded-xl p-4 border hover:shadow-md transition-shadow"><div className="flex items-center gap-3"><div className={`${c} p-2 rounded-lg`}><I size={16} className="text-white"/></div><div><p className="text-lg font-bold">{v}</p><p className="text-xs text-gray-500">{t}</p></div></div></div>}
function generatePageNumbers(c,t){if(t<=7)return Array.from({length:t},(_,i)=>i+1);if(c<=3)return[1,2,3,4,5,'...',t];if(c>=t-2)return[1,'...',t-4,t-3,t-2,t-1,t];return[1,'...',c-1,c,c+1,'...',t]}