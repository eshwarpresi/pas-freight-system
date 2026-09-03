import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useSocket } from '../App'
import OnlineUsers from '../components/OnlineUsers'
import { 
  Package, Clock, Download, Archive, Search, Plus,
  CheckCircle2, Truck, FileSpreadsheet,
  Eye, ArchiveRestore, X, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Inbox, AlertCircle, RefreshCw,
  FileSearch, ArchiveIcon, TrendingUp, Layers, Filter,
  ArrowUpRight, SlidersHorizontal, Box, FileCheck, Info, User, Pencil, Hash, RotateCcw, MapPin, Weight, Calendar, Zap, ClipboardList, FileText,
  Trash2, RotateCcw as RotateIcon, History, Mail
} from 'lucide-react'

// ─── QUICK TOOLS ───
// Your other in-house tools, launched from here. External apps — each
// opens in a new tab, nothing about them is fetched or embedded.
const QUICK_TOOLS = [
  { title: 'Bulk Emailing', desc: 'Send bulk status emails to clients', url: 'https://pasfreight-mailer.onrender.com', icon: Mail, gradient: 'from-sky-500 to-blue-600' },
  { title: 'Quotation Generator', desc: 'Prepare and send client quotations', url: 'https://pas-freight-quotation.vercel.app/', icon: FileSpreadsheet, gradient: 'from-amber-500 to-orange-600' },
  { title: 'CAN & FC Certificates', desc: 'Generate CAN / FC certificates', url: 'https://can-fc-pasfreightservices.vercel.app/', icon: FileCheck, gradient: 'from-emerald-500 to-teal-600' },
]

const PER_PAGE_OPTIONS = [10, 25, 50, 100]
const STICKY_KEY = 'pas_dashboard_filters'

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
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 flex-1" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

function loadStickyFilters() {
  try {
    const saved = sessionStorage.getItem(STICKY_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return { search: '', statusFilter: '', shipmentTypeFilter: '', page: 1, perPage: 25 }
}

// mineOnly: forces every query to only include shipments created by the
// logged-in user — powers the new default "My Shipments" landing page.
//
// targetUserId / targetUserName: used by Admin's Team page — when set,
// every query is scoped to that specific employee's shipments instead of
// "mine" or "everyone". Only Admins ever pass these in (route is guarded
// in App.jsx), but the scoping itself works the same way either way.
export default function Dashboard({ defaultType = '', mineOnly = false, targetUserId = null, targetUserName = null, pendingOnly = false }) {
  const { addToast } = useToast()
  const socket = useSocket()
  const navigate = useNavigate()
  const sticky = loadStickyFilters()
  const [search, setSearch] = useState(sticky.search || '')
  const [statusFilter, setStatusFilter] = useState(sticky.statusFilter || '')
  const [shipmentTypeFilter, setShipmentTypeFilter] = useState(sticky.shipmentTypeFilter || defaultType)
  const [showArchived, setShowArchived] = useState(false)
  const [showBin, setShowBin] = useState(false)
  const [todayOnly, setTodayOnly] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(sticky.page || 1)
  const [perPage, setPerPage] = useState(sticky.perPage || 25)
  const [showFilters, setShowFilters] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [liveNotification, setLiveNotification] = useState(null)
  const [binCount, setBinCount] = useState(0)
  const queryClient = useQueryClient()

  const isTransportFilter = shipmentTypeFilter === 'TRANSPORT'
  const isDOReleaseFilter = shipmentTypeFilter === 'DO_RELEASE'
  const isFreightFilter = shipmentTypeFilter === 'FULL_SHIPMENT'
  const isCHAFilter = shipmentTypeFilter === 'CHA_ONLY'

  // Personal or single-employee scope, merged into every request below.
  // A stable key string is used inside queryKeys so React Query treats
  // "my shipments" and "everyone" and "Rajeswari's shipments" as
  // completely separate caches — switching between them never shows
  // stale data from a different scope.
  const scopeParams = {
    ...(mineOnly ? { mine: 'true' } : targetUserId ? { userId: targetUserId } : {}),
    ...(pendingOnly ? { pendingOnly: 'true' } : {}),
  }
  const scopeKey = (mineOnly ? 'mine' : targetUserId ? `user:${targetUserId}` : 'all') + (pendingOnly ? ':pending' : '')

  // ─── READ ?search= FROM URL ───
  // Lets other pages (e.g. Reference Codes) deep-link into a pre-filled
  // search, e.g. /?search=RLIM. Runs once on mount.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const urlSearch = params.get('search')
      if (urlSearch) {
        setSearch(urlSearch)
        setPage(1)
      }
    } catch {}
  }, [])

  // ─── FETCH BIN COUNT ───
  // Bin stays company-wide regardless of scope — bin/trash is an
  // operational safety net, not a personal workload metric.
  useEffect(() => {
    const fetchBinCount = async () => {
      try {
        const res = await api.get('/freight/shipments/bin/count')
        setBinCount(res.data.data?.count || 0)
      } catch (err) {
        console.error('Failed to fetch bin count:', err)
      }
    }
    fetchBinCount()
    const interval = setInterval(fetchBinCount, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (defaultType && shipmentTypeFilter !== defaultType) {
      setShipmentTypeFilter(defaultType)
    }
  }, [defaultType])

  // ─── TOTAL STATS - CORRECT QUERY KEY ───
  const { data: totalStats } = useQuery({
    queryKey: ['shipments-total-stats', showArchived, scopeKey],
    queryFn: async () => {
      const isArchivedParam = showArchived ? 'true' : 'false'
      const res = await api.get('/freight/shipments', { 
        params: { isArchived: isArchivedParam, page: 1, limit: 1, ...scopeParams } 
      })
      return res.data.pagination?.total || 0
    },
    staleTime: 120000,
  })

  // ─── TODAY'S SHIPMENTS COUNT (NEW) ───
  const { data: todayCount } = useQuery({
    queryKey: ['shipments-today-count', scopeKey],
    queryFn: async () => {
      const res = await api.get('/freight/shipments', {
        params: { today: 'true', page: 1, limit: 1, ...scopeParams }
      })
      return res.data.pagination?.total || 0
    },
    staleTime: 60000,
    refetchInterval: 120000,
  })

  // ─── FULL-DATASET STATS ───
  // Backend already computes total/delivered/invoiced/deliveryRate across
  // every matching shipment (not just the current page) via
  // /freight/shipments/stats. Uses the exact same filters as the main
  // shipments query, so the numbers always describe what's on screen.
  const { data: fullStats } = useQuery({
    queryKey: ['shipments-full-stats', statusFilter, shipmentTypeFilter, showArchived, search, scopeKey],
    queryFn: async () => {
      const params = { isArchived: showArchived ? 'true' : 'false', ...scopeParams }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      if (shipmentTypeFilter) params.shipmentType = shipmentTypeFilter
      const res = await api.get('/freight/shipments/stats', { params })
      return res.data?.data || null
    },
    enabled: !showBin,
    staleTime: 60000,
  })

  useEffect(() => {
    if (liveNotification) {
      const timer = setTimeout(() => setLiveNotification(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [liveNotification])

  // ─── SOCKET EVENTS ───
  useEffect(() => {
    if (!socket) return
    const handleNewShipment = (data) => {
      if (!showArchived && !showBin) {
        setLiveNotification({ type: 'new', refNo: data.refNo, message: `New shipment created: ${data.refNo}` })
        queryClient.invalidateQueries({ queryKey: ['shipments'] })
        queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
        queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
      }
    }
    const handleUpdate = (data) => {
      setLiveNotification({ type: 'update', refNo: data.refNo, message: `Shipment updated: ${data.refNo}` })
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
    }
    const handleStatusUpdate = (data) => {
      setLiveNotification({ type: 'status', refNo: data.refNo, message: `${data.refNo} → ${data.status}` })
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
    }
    const handleArchiveUpdate = (data) => {
      setLiveNotification({ type: 'archive', refNo: data.refNo, message: `${data.refNo} ${data.archived ? 'archived' : 'restored'}` })
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
    }
    socket.on('shipment:new', handleNewShipment)
    socket.on('shipment:update', handleUpdate)
    socket.on('shipment:statusUpdate', handleStatusUpdate)
    socket.on('shipment:archiveUpdate', handleArchiveUpdate)
    return () => {
      socket.off('shipment:new', handleNewShipment)
      socket.off('shipment:update', handleUpdate)
      socket.off('shipment:statusUpdate', handleStatusUpdate)
      socket.off('shipment:archiveUpdate', handleArchiveUpdate)
    }
  }, [socket, showArchived, showBin, queryClient])

  useEffect(() => {
    if (initialized) {
      try { sessionStorage.setItem(STICKY_KEY, JSON.stringify({ search, statusFilter, shipmentTypeFilter, page, perPage })) } catch {}
    }
  }, [search, statusFilter, shipmentTypeFilter, page, perPage, initialized])

  useEffect(() => { setInitialized(true) }, [])

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
    if (shouldShowArchived === 'true') { setShowArchived(true); sessionStorage.removeItem('showArchived') }
  }, [])

  const updateSearch = (val) => { setSearch(val); setPage(1) }
  const updateStatus = (val) => { setStatusFilter(val); setPage(1) }
  const updateShipmentTypeFilter = (val) => { setShipmentTypeFilter(val); setPage(1) }

  const toggleView = (view) => {
    setShowArchived(view === 'archived')
    setShowBin(view === 'bin')
    setTodayOnly(false)
    setCustomDate('')
    setPage(1)
    setSelected([])
    if (view === 'bin') {
      setSearch('')
      setStatusFilter('')
    }
  }

  // ─── SHOW TODAY'S SHIPMENTS ───
  const showTodayShipments = () => {
    setTodayOnly(true)
    setCustomDate('')
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── PICK A SPECIFIC DATE (NEW) ───
  const updateCustomDate = (val) => {
    setCustomDate(val)
    setTodayOnly(false)
    if (val) {
      setShowArchived(false)
      setShowBin(false)
      setSearch('')
      setStatusFilter('')
    }
    setPage(1)
    setSelected([])
  }

  const clearAllFilters = () => {
    setSearch(''); setStatusFilter(''); setShipmentTypeFilter(''); setTodayOnly(false); setCustomDate(''); setPage(1)
    addToast('Filters cleared', 'info')
  }

  // ─── QUERY FOR SHIPMENTS ───
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shipments', search, statusFilter, shipmentTypeFilter, showArchived, showBin, todayOnly, customDate, page, perPage, scopeKey],
    queryFn: async () => {
      if (showBin) {
        const params = { page, limit: perPage }
        if (search) params.search = search
        const res = await api.get('/freight/shipments/bin', { params })
        return res.data
      } else {
        const params = { isArchived: showArchived ? 'true' : 'false', page, limit: perPage, ...scopeParams }
        if (customDate) params.date = customDate
        else if (todayOnly) params.today = 'true'
        if (search) params.search = search
        if (statusFilter) params.status = statusFilter
        if (shipmentTypeFilter) params.shipmentType = shipmentTypeFilter
        const res = await api.get('/freight/shipments', { params })
        try { sessionStorage.setItem('cached_shipments', JSON.stringify(res.data)) } catch {}
        return res.data
      }
    },
    staleTime: 60000, gcTime: 600000, refetchOnMount: true, refetchOnWindowFocus: false,
    placeholderData: () => { 
      if (!showBin) {
        try { const c = sessionStorage.getItem('cached_shipments'); return c ? JSON.parse(c) : undefined } catch { return undefined }
      }
      return undefined
    },
    retry: 1, retryDelay: 1000,
  })

  const shipments = data?.data || []
  const totalCount = data?.pagination?.total || 0
  const totalPages = data?.pagination?.totalPages || 0
  const overallTotal = totalStats || totalCount

  // ─── EXPORT ───
  // Respects the page's current scope (mine / a specific employee / the
  // whole company) plus whatever search and status filters are active —
  // the download always matches what's actually on screen, not the full
  // unfiltered dataset. shipmentType and archived/active aren't sent since
  // the backend export always includes both active and archived shipments
  // together in one file.
  const handleExport = async () => {
    setExporting(true)
    try {
      const params = { ...scopeParams }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/freight/export', { 
        params,
        responseType: 'blob',
        timeout: 300000
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      addToast('Export downloaded!', 'success')
    } catch (err) {
      console.error('Export error:', err)
      addToast('Failed to export. Please try again.', 'error')
    } finally {
      setExporting(false)
    }
  }

  // ─── MUTATIONS ───
  const archiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/archive`),
    onSuccess: (_, id) => { 
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
      addToast('Shipment archived', 'success')
      if (socket) { const s = shipments.find(s => s.id === id); socket.emit('shipment:archived', { refNo: s?.refNo || '', archived: true, id }) }
    },
    onError: () => addToast('Failed to archive', 'error')
  })

  const unarchiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/unarchive`),
    onSuccess: (_, id) => { 
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
      addToast('Shipment restored', 'success')
      if (socket) { const s = shipments.find(s => s.id === id); socket.emit('shipment:archived', { refNo: s?.refNo || '', archived: false, id }) }
    },
    onError: () => addToast('Failed to restore', 'error')
  })

  const bulkArchiveMutation = useMutation({
    mutationFn: async (ids) => { await Promise.all(ids.map(id => api.put(`/archive/shipments/${id}/archive`))) },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
      setSelected([])
      addToast('Shipments archived', 'success') 
    },
    onError: () => addToast('Bulk archive failed', 'error')
  })

  // ─── BIN MUTATIONS (NO PERMANENT DELETE) ───
  const softDeleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/freight/shipments/${id}/delete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
      setBinCount(prev => prev + 1)
      addToast('Shipment moved to bin', 'info')
    },
    onError: () => addToast('Failed to move to bin', 'error')
  })

  const restoreMutation = useMutation({
    mutationFn: (id) => api.put(`/freight/shipments/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
      setBinCount(prev => Math.max(0, prev - 1))
      addToast('Shipment restored successfully', 'success')
    },
    onError: () => addToast('Failed to restore', 'error')
  })

  const bulkRestoreMutation = useMutation({
    mutationFn: (ids) => api.put('/freight/shipments/bin/restore-bulk', { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
      setSelected([])
      setBinCount(prev => Math.max(0, prev - selected.length))
      addToast(`Restored ${selected.length} shipments`, 'success')
    },
    onError: () => addToast('Failed to restore shipments', 'error')
  })

  // ─── ANALYTICS ───
  // Sourced from the full-dataset stats endpoint (fullStats) instead of the
  // current page's `shipments` array, so these numbers reflect every
  // matching shipment — not just the up-to-perPage rows on screen.
  const analytics = useMemo(() => {
    const total = fullStats?.total ?? overallTotal
    const delivered = fullStats?.delivered ?? 0
    const invoiced = fullStats?.invoiced ?? 0
    // "In Progress" = everything not yet delivered and not yet invoiced.
    // This is a deliberately simple definition (matches the card's own
    // "Enquiry to Customs" subtitle) rather than re-deriving every
    // intermediate status client-side.
    const pendingTotal = Math.max(0, total - delivered - invoiced)
    const deliveryRate = fullStats?.deliveryRate ?? (total > 0 ? Math.round((delivered / total) * 100) : 0)

    return {
      delivered,
      invoiced,
      pendingTotal,
      total,
      deliveryRate,
    }
  }, [fullStats, overallTotal])

  const toggleSelectAll = () => { if (selected.length === shipments.length) setSelected([]); else setSelected(shipments.map(s => s.id)) }
  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // ─── BADGE STYLES ───
  const getStatusBadge = (s) => {
    const b = {
      'ENQUIRY':'bg-gradient-to-r from-amber-400 to-amber-300 text-amber-900 ring-amber-300','RATES_ADDED':'bg-gradient-to-r from-sky-400 to-sky-300 text-sky-900 ring-sky-300','NOMINATED':'bg-gradient-to-r from-violet-400 to-violet-300 text-violet-900 ring-violet-300','BOOKED':'bg-gradient-to-r from-indigo-400 to-indigo-300 text-indigo-900 ring-indigo-300','SCHEDULED':'bg-gradient-to-r from-cyan-400 to-cyan-300 text-cyan-900 ring-cyan-300','AWB_GENERATED':'bg-gradient-to-r from-teal-400 to-teal-300 text-teal-900 ring-teal-300','CHECKLIST_APPROVED':'bg-gradient-to-r from-emerald-400 to-emerald-300 text-emerald-900 ring-emerald-300','BOE_FILED':'bg-gradient-to-r from-lime-400 to-lime-300 text-lime-900 ring-lime-300','DO_COLLECTED':'bg-gradient-to-r from-green-400 to-green-300 text-green-900 ring-green-300','OOC_DONE':'bg-gradient-to-r from-sky-500 to-sky-400 text-sky-900 ring-sky-400','GATE_PASS':'bg-gradient-to-r from-purple-400 to-purple-300 text-purple-900 ring-purple-300','LEO_DONE':'bg-gradient-to-r from-sky-500 to-sky-400 text-sky-900 ring-sky-400','HAND_OVER':'bg-gradient-to-r from-purple-400 to-purple-300 text-purple-900 ring-purple-300','SB_FILED':'bg-gradient-to-r from-lime-400 to-lime-300 text-lime-900 ring-lime-300','DELIVERED':'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white ring-emerald-400','INVOICE_GENERATED':'bg-gradient-to-r from-orange-400 to-orange-300 text-orange-900 ring-orange-300','INVOICE_SENT':'bg-gradient-to-r from-rose-400 to-rose-300 text-rose-900 ring-rose-300','COMPLETED':'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-800 ring-gray-300'
    }; return b[s]||'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-700 ring-gray-300'
  }

  const getModeBadge = (t) => {
    if (t === 'CHA Only') return 'bg-gradient-to-r from-emerald-500 to-green-500 text-white ring-green-400'
    if (t === 'Transport') return 'bg-gradient-to-r from-sky-500 to-blue-500 text-white ring-sky-400'
    if (t === 'DO Release') return 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white ring-teal-400'
    if (t === 'FF Only') return 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white ring-purple-400'
    if (!t) return 'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-600 ring-gray-300'
    return 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white ring-blue-400'
  }

  const getImportExportBadge = (v) => v==='Import'?'bg-gradient-to-r from-violet-500 to-purple-500 text-white ring-purple-400':v==='Export'?'bg-gradient-to-r from-orange-500 to-amber-500 text-white ring-amber-400':'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-600 ring-gray-300'

  // Same palette as the per-shipment Stage field on ShipmentDetail, so a
  // shipment's stage looks the same whether you're viewing it in the list
  // or on its detail page.
  const getStageBadge = (stage) => {
    const b = {
      'Draft': 'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-800',
      'Created': 'bg-gradient-to-r from-blue-400 to-blue-300 text-blue-900',
      'Confirmed': 'bg-gradient-to-r from-amber-400 to-amber-300 text-amber-900',
      'Booked': 'bg-gradient-to-r from-purple-400 to-purple-300 text-purple-900',
      'Scheduled': 'bg-gradient-to-r from-cyan-400 to-cyan-300 text-cyan-900',
      'In Progress': 'bg-gradient-to-r from-yellow-400 to-yellow-300 text-yellow-900',
      'Completed': 'bg-gradient-to-r from-emerald-400 to-emerald-300 text-emerald-900',
      'Cancelled': 'bg-gradient-to-r from-red-400 to-red-300 text-red-900',
      'On Hold': 'bg-gradient-to-r from-orange-400 to-orange-300 text-orange-900',
    }
    return b[stage] || 'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-700'
  }

  const quickFilters = [{l:'All',v:'',i:Layers},{l:'Enquiry',v:'ENQUIRY',i:Search},{l:'Transit',v:'BOOKED',i:Truck},{l:'Customs',v:'CHECKLIST_APPROVED',i:FileSpreadsheet},{l:'Delivered',v:'DELIVERED',i:CheckCircle2},{l:'Invoiced',v:'INVOICE_GENERATED',i:TrendingUp}]
  const startItem = totalCount===0?0:(page-1)*perPage+1; const endItem = Math.min(page*perPage,totalCount)
  const hasFilters = search||statusFilter||shipmentTypeFilter||todayOnly||customDate; const isEmpty = !isLoading&&!isError&&shipments.length===0; const showSkeleton = isLoading && !data

  const statGradients = ['from-blue-500 to-indigo-600','from-amber-500 to-orange-600','from-emerald-500 to-teal-600','from-violet-500 to-purple-600']
  
  // ─── STAT CARDS ───
  const statCards = [
    { label: 'Total Shipments', value: overallTotal, icon: Box, gradient: statGradients[0], desc: 'All shipments' },
    { 
      label: showArchived ? 'Completed' : 'In Progress', 
      value: showArchived ? analytics.delivered + analytics.invoiced : analytics.pendingTotal, 
      icon: showArchived ? CheckCircle2 : Clock, 
      gradient: showArchived ? statGradients[2] : statGradients[1], 
      desc: showArchived ? 'All archived shipments' : 'Enquiry to Customs' 
    },
    { label: 'Delivered / Hand Over', value: analytics.delivered, icon: CheckCircle2, gradient: statGradients[2], desc: 'Successfully completed' },
    { label: 'Invoiced', value: analytics.invoiced, icon: FileSpreadsheet, gradient: statGradients[3], desc: 'Invoice generated/sent' },
    { label: "Today's Shipments", value: todayCount || 0, icon: Calendar, gradient: 'from-rose-500 to-pink-600', desc: 'Created today', onClick: showTodayShipments, active: todayOnly },
  ]

  const getTitle = () => {
    if (showBin) return 'Bin / Trash'
    if (customDate) return `Shipments on ${new Date(customDate + 'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`
    if (todayOnly) return "Today's Shipments"
    if (showArchived) return 'Archive'
    if (targetUserName) return pendingOnly ? `${targetUserName}'s Pending Shipments` : `${targetUserName}'s Shipments`
    if (mineOnly) return 'My Shipments'
    if (isDOReleaseFilter) return 'DO Release'
    if (isTransportFilter) return 'Transport'
    if (isCHAFilter) return 'CHA'
    if (isFreightFilter) return 'Freight'
    return 'Overview'
  }

  const currentPath = window.location.pathname
  // The module quick-switch (All / FF Only / Freight / CHA...) intentionally
  // isn't shown in personal or single-employee scope — those sub-pages are
  // company-wide views and would silently drop the "mine"/employee filter,
  // which would be confusing rather than helpful here.
  const showModuleSwitcher = !mineOnly && !targetUserId

  return (
    <div className="space-y-6 animate-fade-in">
      {liveNotification && (
        <div className="fixed top-4 right-4 z-50 animate-slide-down">
          <div className={`px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 text-sm font-medium ${
            liveNotification.type === 'new' ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-300 text-emerald-800 dark:from-emerald-900/40 dark:to-teal-900/40 dark:border-emerald-700 dark:text-emerald-200' :
            liveNotification.type === 'status' ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300 text-blue-800 dark:from-blue-900/40 dark:to-indigo-900/40 dark:border-blue-700 dark:text-blue-200' :
            'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-300 text-amber-800 dark:from-amber-900/40 dark:to-orange-900/40 dark:border-amber-700 dark:text-amber-200'
          }`}>
            <Zap size={16} className="flex-shrink-0" />
            <span>{liveNotification.message}</span>
            <button onClick={() => setLiveNotification(null)} className="ml-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"><X size={14} /></button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-md">Shipments</span>
            <span className="text-xs text-[var(--text-secondary)] font-medium">{overallTotal} total</span>
            {binCount > 0 && !showBin && !mineOnly && !targetUserId && (
              <span className="flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full cursor-pointer" onClick={() => toggleView('bin')}>
                <Trash2 size={10} /> {binCount} in bin
              </span>
            )}
            {socket?.connected && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </span>
            )}
            <OnlineUsers />
          </div>
          <h1 className="text-[28px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">{getTitle()}</h1>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {showModuleSwitcher && (
            <div className="flex glass rounded-lg p-0.5 border border-[var(--border-color)]">
              <Link to="/overview" className={`px-3 py-2 rounded-md text-xs font-semibold transition-all ${currentPath === '/overview' ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}>All</Link>
              <Link to="/ff-only" className={`px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${currentPath === '/ff-only' ? 'bg-white dark:bg-slate-700 text-purple-700 dark:text-purple-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}><FileText size={12}/>FF Only</Link>
              <Link to="/freight" className={`px-3 py-2 rounded-md text-xs font-semibold transition-all ${currentPath === '/freight' ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}>Freight</Link>
              <Link to="/cha" className={`px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${currentPath === '/cha' ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}><FileCheck size={12}/>CHA</Link>
              <Link to="/transport" className={`px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${currentPath === '/transport' ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}><Truck size={12}/>Transport</Link>
              <Link to="/do-release" className={`px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${currentPath === '/do-release' ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}><ClipboardList size={12}/>DO Release</Link>
            </div>
          )}
          <div className="flex glass rounded-lg p-0.5 border border-[var(--border-color)]">
            <button onClick={()=>toggleView('active')} className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${!showArchived && !showBin ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 shadow-sm' : 'text-[var(--text-secondary)]'}`}>Active</button>
            <button onClick={()=>toggleView('archived')} className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${showArchived ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 shadow-sm' : 'text-[var(--text-secondary)]'}`}><Archive size={13}/>Archive</button>
            {!mineOnly && !targetUserId && (
              <button onClick={()=>toggleView('bin')} className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${showBin ? 'bg-white dark:bg-slate-700 text-red-700 dark:text-red-400 shadow-sm' : 'text-[var(--text-secondary)]'}`}>
                <Trash2 size={13} className={showBin ? 'text-red-500' : ''} />
                Bin
                {binCount > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full ${showBin ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{binCount}</span>
                )}
              </button>
            )}
          </div>
          <Link to="/create" className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:from-indigo-700 hover:to-blue-700 text-xs font-semibold shadow-lg shadow-indigo-200 hover-lift"><Plus size={15}/> New Shipment</Link>
        </div>
      </div>

      {/* ── QUICK TOOLS — only on the personal landing page, not on admin/employee-scoped views ── */}
      {!targetUserId && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {QUICK_TOOLS.map((tool) => {
            const Icon = tool.icon
            return (
              <a
                key={tool.url}
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden glass rounded-xl p-4 border border-[var(--glass-border)] hover-lift flex items-center gap-3"
              >
                <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${tool.gradient} opacity-10 rounded-bl-full group-hover:opacity-20 transition-opacity`} />
                <div className={`relative w-11 h-11 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center shadow-lg flex-shrink-0 group-hover:scale-110 transition-transform`}>
                  <Icon size={20} className="text-white" />
                </div>
                <div className="relative flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{tool.title}</p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">{tool.desc}</p>
                </div>
                <ArrowUpRight size={16} className="relative text-[var(--text-muted)] group-hover:text-indigo-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all flex-shrink-0" />
              </a>
            )
          })}
        </div>
      )}

      {!showBin && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {statCards.map((stat,i)=>{
              const Icon=stat.icon;
              return (
                <div key={i} onClick={stat.onClick} className={`glass rounded-xl p-4 border hover-lift group animate-scale-in ${stat.onClick ? 'cursor-pointer' : ''} ${stat.active ? 'border-rose-400 dark:border-rose-500 ring-2 ring-rose-300/50' : 'border-[var(--glass-border)]'}`} style={{animationDelay: `${i*100}ms`}}>
                  <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${stat.gradient} opacity-10 rounded-bl-full group-hover:opacity-20 transition-opacity`}/>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                        <Icon size={18} className="text-white"/>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{stat.value.toLocaleString()}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-semibold">{stat.label}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{stat.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="glass rounded-xl border border-[var(--border-color)] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Delivery Progress</span>
                <Info size={12} className="text-indigo-400"/>
              </div>
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{analytics.deliveryRate}%</span>
            </div>
            <div className="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-2 overflow-hidden">
              <div className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700 animate-pulse-glow" style={{width:`${analytics.deliveryRate}%`}}/>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{analytics.delivered} of {analytics.total} shipments delivered / handed over</p>
          </div>
        </>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400"/>
          <input type="text" placeholder={showBin ? "Search in bin..." : isDOReleaseFilter ? "Search by Ref No, MAWB, Customer..." : isTransportFilter ? "Search by Ref No, Customer..." : "Search by Ref No, Consignee, HAWB, BOE, SB..."} value={search} onChange={e=>updateSearch(e.target.value)} className="w-full pl-9 pr-9 py-2.5 glass border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"/>
          {search&&<button onClick={()=>updateSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={14}/></button>}
        </div>
        {!showBin && (
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none"/>
            <input
              type="date"
              value={customDate}
              onChange={e=>updateCustomDate(e.target.value)}
              className="pl-8 pr-3 py-2.5 glass border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm text-[var(--text-primary)]"
              title="View shipments created on a specific date"
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          {hasFilters && (
            <button onClick={clearAllFilters} className="px-3 py-2.5 glass border border-[var(--border-color)] rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"><RotateCcw size={14} /> Clear</button>
          )}
          {!showBin && (
            <>
              <button onClick={()=>setShowFilters(!showFilters)} className={`p-2.5 rounded-lg border transition-all ${showFilters?'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400':'glass border-[var(--border-color)] text-[var(--text-secondary)]'}`}><SlidersHorizontal size={15}/></button>
              <button onClick={handleExport} disabled={exporting} className="px-3.5 py-2.5 glass border border-[var(--border-color)] rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 disabled:opacity-50">{exporting?<RefreshCw size={14} className="animate-spin"/>:<Download size={14}/>}{exporting?'Exporting...':'Export'}</button>
            </>
          )}
        </div>
      </div>

      {!showBin && showFilters && (
        <div className="flex flex-wrap gap-2 p-3.5 glass rounded-xl border border-[var(--border-color)] animate-slide-down">
          <span className="text-[11px] font-semibold text-indigo-400 uppercase flex items-center mr-1"><Filter size={11} className="mr-1"/>Status</span>
          {quickFilters.map(f=>{const I=f.i;const a=statusFilter===f.v;return <button key={f.v} onClick={()=>updateStatus(a?'':f.v)} className={`px-3 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-all ${a?'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg':'glass text-[var(--text-secondary)]'}`}><I size={12}/>{f.l}{a&&<X size={11}/>}</button>})}
        </div>
      )}

      {selected.length > 0 && (
        <div className="glass border border-indigo-300/50 dark:border-indigo-700/50 rounded-xl px-4 py-3 flex items-center justify-between animate-slide-down">
          <span className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">{selected.length} selected</span>
          <div className="flex gap-2">
            {showBin ? (
              <>
                <button onClick={() => bulkRestoreMutation.mutate(selected)} className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg">
                  <RotateIcon size={13}/> Restore Selected
                </button>
              </>
            ) : (
              <>
                {!showArchived && (
                  <button onClick={() => bulkArchiveMutation.mutate(selected)} className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg">
                    <Archive size={13}/> Archive
                  </button>
                )}
                <button onClick={() => {
                  if (window.confirm(`Move ${selected.length} shipment(s) to bin?`)) {
                    selected.forEach(id => softDeleteMutation.mutate(id))
                    setSelected([])
                  }
                }} className="px-3.5 py-1.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg">
                  <Trash2 size={13}/> Move to Bin
                </button>
              </>
            )}
            <button onClick={()=>setSelected([])} className="px-3.5 py-1.5 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-xs font-semibold">Clear</button>
          </div>
        </div>
      )}

      {isError&&(<div className="glass rounded-xl border border-red-200/50 dark:border-red-800/50 p-16 text-center"><div className="w-16 h-16 bg-gradient-to-br from-red-400 to-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><AlertCircle size={28} className="text-white"/></div><h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Connection Error</h3><p className="text-sm text-[var(--text-secondary)] mb-4">Unable to load shipments.</p><button onClick={()=>refetch()} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-sm font-semibold shadow-lg"><RefreshCw size={14}/> Retry</button></div>)}
      
      {!isError&&isEmpty&&hasFilters&&(<div className="glass rounded-xl border border-amber-200/50 dark:border-amber-800/50 p-16 text-center"><div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><FileSearch size={28} className="text-white"/></div><h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">No Results</h3><p className="text-sm text-[var(--text-secondary)] mb-4">Try adjusting your search or filters.</p><button onClick={clearAllFilters} className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm font-semibold text-[var(--text-primary)]"><RotateCcw size={14}/> Clear All Filters</button></div>)}

      {!isError&&isEmpty&&!hasFilters&&!showArchived&&!showBin&&(<div className="glass rounded-xl border border-indigo-200/50 dark:border-indigo-800/50 p-16 text-center"><div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><Inbox size={28} className="text-white"/></div><h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">{mineOnly ? "You haven't created any shipments yet" : targetUserName ? `${targetUserName} hasn't created any shipments yet` : 'Welcome to PAS Freight'}</h3><p className="text-sm text-[var(--text-secondary)] mb-4">Create your first shipment to get started.</p><Link to="/create" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-sm font-semibold shadow-lg"><Plus size={14}/> Create Shipment</Link></div>)}

      {!isError&&isEmpty&&!hasFilters&&showArchived&&(<div className="glass rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-16 text-center"><div className="w-16 h-16 bg-gradient-to-br from-gray-400 to-slate-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><ArchiveIcon size={28} className="text-white"/></div><h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Archive Empty</h3><button onClick={()=>toggleView('active')} className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm font-semibold text-[var(--text-primary)]"><Package size={14}/> View Active Shipments</button></div>)}

      {!isError&&isEmpty&&!hasFilters&&showBin&&(<div className="glass rounded-xl border border-red-200/50 dark:border-red-800/50 p-16 text-center"><div className="w-16 h-16 bg-gradient-to-br from-red-400 to-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><Trash2 size={28} className="text-white"/></div><h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Bin is Empty</h3><p className="text-sm text-[var(--text-secondary)] mb-4">No shipments in bin.</p><button onClick={()=>toggleView('active')} className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm font-semibold text-[var(--text-primary)]"><Package size={14}/> View Active Shipments</button></div>)}

      {showSkeleton&&<TableSkeleton/>}

      {!showSkeleton&&!isError&&shipments.length>0&&(<>
        <div className="hidden md:block glass rounded-xl border border-[var(--border-color)] overflow-hidden shadow-lg animate-scale-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`bg-gradient-to-r ${showBin ? 'from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/50' : 'from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-950/50'}`}>
                  <th className="w-10 pl-4 py-3"><input type="checkbox" checked={selected.length===shipments.length&&shipments.length>0} onChange={toggleSelectAll} className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"/></th>
                  <th className="text-center px-2 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase w-12">SL No</th>
                  {isDOReleaseFilter ? (
                    <>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Ref No</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">MAWB</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">HAWB</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">CHA Name</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Customer</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Status</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Stage</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Date</th>
                      {showBin && <th className="text-left px-3 py-3 text-[11px] font-semibold text-red-500 dark:text-red-400 uppercase">Deleted By</th>}
                    </>
                  ) : isTransportFilter ? (
                    <>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Vehicle No</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Transport Mode</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Customer</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Weight</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">From</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">To</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Delivery</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Status</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Stage</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Date</th>
                      {showBin && <th className="text-left px-3 py-3 text-[11px] font-semibold text-red-500 dark:text-red-400 uppercase">Deleted By</th>}
                    </>
                  ) : (
                    <>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Ref No</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Transport Mode</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Import/Export</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Consignee</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Created By</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">HAWB</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">SB/BOE No</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Status</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Stage</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Date</th>
                      {showBin && <th className="text-left px-3 py-3 text-[11px] font-semibold text-red-500 dark:text-red-400 uppercase">Deleted By</th>}
                    </>
                  )}
                  <th className="text-right pr-4 py-3 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {shipments.map((s, idx)=> { 
                  const slNo = (page - 1) * perPage + idx + 1; 
                  return (
                    <tr key={s.id} className={`group hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors ${showBin ? 'hover:bg-red-50/30 dark:hover:bg-red-900/10' : ''}`}>
                      <td className="pl-4 py-3"><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggleSelect(s.id)} className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"/></td>
                      <td className="px-2 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">{slNo}</td>
                      {isDOReleaseFilter ? (
                        <>
                          <td className="px-3 py-3"><Link to={`/shipment/${s.id}`} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{s.refNo}</Link></td>
                          <td className="px-3 py-3 text-sm text-[var(--text-primary)] font-medium">{s.freightForwarding?.mawb || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{s.freightForwarding?.hawb || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{s.freightForwarding?.agent || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-3 py-3 text-sm text-[var(--text-primary)] font-medium">{s.freightForwarding?.customerName || <span className="text-[var(--text-muted)]">—</span>}</td>
                        </>
                      ) : isTransportFilter ? (
                        <>
                          <td className="px-3 py-3"><Link to={`/shipment/${s.id}`} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{s.refNo}</Link></td>
                          <td className="px-3 py-3 text-sm text-[var(--text-primary)] font-medium">{s.freightForwarding?.transportMode || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-3 py-3 text-sm text-[var(--text-primary)] font-medium">{s.freightForwarding?.customerName || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{s.freightForwarding?.weight ? `${s.freightForwarding.weight} kg` : <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{s.freightForwarding?.fromLocation || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-3 py-3 text-sm text-[var(--text-primary)]">{s.freightForwarding?.toLocation || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{s.freightForwarding?.deliveryDate ? new Date(s.freightForwarding.deliveryDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : <span className="text-[var(--text-muted)]">—</span>}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3"><Link to={`/shipment/${s.id}`} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{s.refNo}</Link></td>
                          <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ring-1 ring-inset ${getModeBadge(s.shipmentType)}`}>{s.shipmentType||'—'}</span></td>
                          <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ring-1 ring-inset ${getImportExportBadge(s.importExport)}`}>{s.importExport||'—'}</span></td>
                          <td className="px-3 py-3 text-sm text-[var(--text-primary)] font-medium">{s.freightForwarding?.consigneeName||<span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-3 py-3 text-xs text-[var(--text-secondary)]"><span className="flex items-center gap-1"><User size={10} className="text-[var(--text-muted)]"/>{s.createdByName||<span className="text-[var(--text-muted)]">—</span>}</span></td>
                          <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{s.freightForwarding?.hawb||<span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{s.cha?.sbNo || s.cha?.boeNo || <span className="text-[var(--text-muted)]">—</span>}</td>
                        </>
                      )}
                      <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold ring-1 ring-inset ${getStatusBadge(s.currentStatus)}`}>{s.currentStatus.replace(/_/g,' ')}</span></td>
                      <td className="px-3 py-3">{s.shipmentStage ? <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${getStageBadge(s.shipmentStage)}`}>{s.shipmentStage}</span> : <span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                      {showBin && (
                        <td className="px-3 py-3 text-xs text-red-600 dark:text-red-400 font-medium">{s.deletedBy || 'Unknown'}</td>
                      )}
                      <td className="pr-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {showBin ? (
                            <>
                              <button onClick={() => restoreMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md flex items-center gap-1.5">
                                <RotateIcon size={12}/> Restore
                              </button>
                            </>
                          ) : (
                            <>
                              <Link to={buildEditUrl(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md flex items-center gap-1.5"><Pencil size={12}/> Edit</Link>
                              <Link to={`/shipment/${s.id}`} className="px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md flex items-center gap-1.5"><Eye size={12}/> View</Link>
                              {showArchived ? (
                                <button onClick={()=>unarchiveMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md flex items-center gap-1.5"><ArchiveRestore size={12}/> Restore</button>
                              ) : (
                                <>
                                  <button onClick={()=>archiveMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md flex items-center gap-1.5"><Archive size={12}/> Archive</button>
                                  <button onClick={() => {
                                    if (window.confirm(`Move ${s.refNo} to bin?`)) {
                                      softDeleteMutation.mutate(s.id)
                                    }
                                  }} className="px-2.5 py-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md flex items-center gap-1.5">
                                    <Trash2 size={12}/> Delete
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="md:hidden space-y-3">
          {shipments.map((s, idx) => { 
            const slNo = (page - 1) * perPage + idx + 1; 
            return (
              <div key={s.id} className={`glass rounded-xl border border-[var(--border-color)] p-4 shadow-sm hover-lift animate-scale-in ${showBin ? 'border-red-200/50 dark:border-red-800/50' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--text-muted)]">#{slNo}</span>
                    <Link to={`/shipment/${s.id}`} className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{s.refNo}</Link>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ring-1 ring-inset ${getStatusBadge(s.currentStatus)}`}>{s.currentStatus.replace(/_/g,' ')}</span>
                </div>
                {isDOReleaseFilter ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-[var(--text-muted)]">MAWB:</span> <span className="text-[var(--text-primary)] font-medium">{s.freightForwarding?.mawb||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">HAWB:</span> <span className="text-[var(--text-primary)]">{s.freightForwarding?.hawb||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">CHA Name:</span> <span className="text-[var(--text-primary)]">{s.freightForwarding?.agent||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Customer:</span> <span className="text-[var(--text-primary)] font-medium">{s.freightForwarding?.customerName||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Stage:</span> {s.shipmentStage ? <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStageBadge(s.shipmentStage)}`}>{s.shipmentStage}</span> : <span className="text-[var(--text-primary)]">—</span>}</div>
                    <div><span className="text-[var(--text-muted)]">Date:</span> <span className="text-[var(--text-primary)]">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></div>
                    {showBin && <div><span className="text-[var(--text-muted)]">Deleted By:</span> <span className="text-red-600 dark:text-red-400 font-medium">{s.deletedBy || 'Unknown'}</span></div>}
                  </div>
                ) : isTransportFilter ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-[var(--text-muted)]">Transport Mode:</span> <span className="text-[var(--text-primary)] font-medium">{s.freightForwarding?.transportMode||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Customer:</span> <span className="text-[var(--text-primary)] font-medium">{s.freightForwarding?.customerName||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Weight:</span> <span className="text-[var(--text-primary)]">{s.freightForwarding?.weight ? `${s.freightForwarding.weight} kg` : '—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">From:</span> <span className="text-[var(--text-primary)]">{s.freightForwarding?.fromLocation||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">To:</span> <span className="text-[var(--text-primary)]">{s.freightForwarding?.toLocation||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Delivery:</span> <span className="text-[var(--text-primary)]">{s.freightForwarding?.deliveryDate ? new Date(s.freightForwarding.deliveryDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Stage:</span> {s.shipmentStage ? <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStageBadge(s.shipmentStage)}`}>{s.shipmentStage}</span> : <span className="text-[var(--text-primary)]">—</span>}</div>
                    <div><span className="text-[var(--text-muted)]">Date:</span> <span className="text-[var(--text-primary)]">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></div>
                    {showBin && <div><span className="text-[var(--text-muted)]">Deleted By:</span> <span className="text-red-600 dark:text-red-400 font-medium">{s.deletedBy || 'Unknown'}</span></div>}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-[var(--text-muted)]">Consignee:</span> <span className="text-[var(--text-primary)] font-medium">{s.freightForwarding?.consigneeName||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Mode:</span> <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${getModeBadge(s.shipmentType)}`}>{s.shipmentType||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Created By:</span> <span className="text-[var(--text-primary)] flex items-center gap-1"><User size={10}/>{s.createdByName||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">HAWB:</span> <span className="text-[var(--text-primary)]">{s.freightForwarding?.hawb||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">SB/BOE:</span> <span className="text-[var(--text-primary)]">{s.cha?.sbNo || s.cha?.boeNo || '—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">I/E:</span> <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${getImportExportBadge(s.importExport)}`}>{s.importExport||'—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Stage:</span> {s.shipmentStage ? <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStageBadge(s.shipmentStage)}`}>{s.shipmentStage}</span> : <span className="text-[var(--text-primary)]">—</span>}</div>
                    <div><span className="text-[var(--text-muted)]">Date:</span> <span className="text-[var(--text-primary)]">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></div>
                    {showBin && <div><span className="text-[var(--text-muted)]">Deleted By:</span> <span className="text-red-600 dark:text-red-400 font-medium">{s.deletedBy || 'Unknown'}</span></div>}
                  </div>
                )}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-color)]">
                  <input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggleSelect(s.id)} className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 w-3.5 h-3.5"/>
                  <div className="flex items-center gap-1">
                    {showBin ? (
                      <>
                        <button onClick={() => restoreMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md flex items-center gap-1.5">
                          <RotateIcon size={12}/> Restore
                        </button>
                      </>
                    ) : (
                      <>
                        <Link to={buildEditUrl(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md flex items-center gap-1.5"><Pencil size={12}/> Edit</Link>
                        <Link to={`/shipment/${s.id}`} className="px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md flex items-center gap-1.5"><Eye size={12}/> View</Link>
                        {showArchived ? (
                          <button onClick={()=>unarchiveMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md flex items-center gap-1.5"><ArchiveRestore size={12}/> Restore</button>
                        ) : (
                          <>
                            <button onClick={()=>archiveMutation.mutate(s.id)} className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md flex items-center gap-1.5"><Archive size={12}/> Archive</button>
                            <button onClick={() => {
                              if (window.confirm(`Move ${s.refNo} to bin?`)) {
                                softDeleteMutation.mutate(s.id)
                              }
                            }} className="px-2.5 py-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md flex items-center gap-1.5">
                              <Trash2 size={12}/> Delete
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="glass rounded-xl border border-[var(--border-color)] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{startItem}-{endItem}</span>
            <span className="text-[var(--text-muted)]">of</span>
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{totalCount.toLocaleString()}</span>
            <select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1)}} className="ml-2 border border-[var(--border-color)] rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-[var(--input-bg)] text-[var(--input-text)]">{PER_PAGE_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={()=>setPage(1)} disabled={page===1} className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 text-[var(--text-secondary)]"><ChevronsLeft size={14}/></button>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 text-[var(--text-secondary)]"><ChevronLeft size={14}/></button>
            {generatePageNumbers(page,totalPages).map((p,i)=>p==='...'?<span key={i} className="px-1.5 text-[var(--text-muted)] text-xs">...</span>:<button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded-md text-[11px] font-semibold transition-all ${page===p?'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg':'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'}`}>{p}</button>)}
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages||totalPages===0} className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 text-[var(--text-secondary)]"><ChevronRight size={14}/></button>
            <button onClick={()=>setPage(totalPages)} disabled={page===totalPages||totalPages===0} className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 text-[var(--text-secondary)]"><ChevronsRight size={14}/></button>
          </div>
        </div>
      </>)}
    </div>
  )
}
function generatePageNumbers(c,t){if(t<=7)return Array.from({length:t},(_,i)=>i+1);if(c<=3)return[1,2,3,4,5,'...',t];if(c>=t-2)return[1,'...',t-4,t-3,t-2,t-1,t];return[1,'...',c-1,c,c+1,'...',t]}