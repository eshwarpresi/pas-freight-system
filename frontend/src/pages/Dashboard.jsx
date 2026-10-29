import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PipelineBoard from '../components/PipelineBoard'

// ✅ NEW — dd-mm-yyyy everywhere on this page, instead of the previous
// mixed locale-dependent formats.
// ✅ BULK STATUS / STAGE CHANGE — option lists for the bulk action bar.
// Must match VALID_MANUAL_STATUSES / VALID_STAGES in the backend controller.
const BULK_STATUS_VALUES = [
  'ENQUIRY', 'RATES_REQUESTED', 'RATES_ADDED', 'NOMINATED', 'BOOKED', 'PICKUP_DONE', 'SCHEDULED', 'DRAFT', 'PRE_ALERTS', 'AWB_GENERATED',
  'CHECKLIST_APPROVED', 'BOE_FILED', 'SB_FILED', 'DO_COLLECTED', 'OOC_DONE', 'LEO_DONE', 'GATE_PASS',
  'HAND_OVER', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT', 'CANCELLED'
]
const prettyStatus = (v) => v.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function fmtDDMMYYYY(dateInput) {
  const d = new Date(dateInput)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}
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
  ArrowUpRight, SlidersHorizontal, Box, FileCheck, Info, User, Pencil, Hash, RotateCcw, MapPin, Weight, Calendar, Zap, ClipboardList, FileText, PlaneTakeoff, PlaneLanding,
  Trash2, RotateCcw as RotateIcon, History, Mail, LayoutGrid, List, Banknote, Lightbulb, Bookmark, Copy
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

// ─── SHIPMENT TABLE HELPERS ───
// Role views: each one shows only the columns that role works with. "All
// columns" is the full 14-column table. The choice is remembered per browser.
const VIEW_OPTIONS = [
  { key: 'sales', label: 'Sales' },
  { key: 'operations', label: 'Operations' },
  { key: 'customs', label: 'Customs' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'all', label: 'All columns' },
]
const VIEW_COLS = {
  sales: ['ref', 'mode', 'ie', 'consignee', 'by', 'status', 'stage', 'date'],
  operations: ['ref', 'mode', 'ie', 'consignee', 'by', 'hawb', 'etd', 'eta', 'status', 'stage', 'date'],
  customs: ['ref', 'mode', 'ie', 'consignee', 'hawb', 'sbboe', 'eta', 'status', 'stage', 'date'],
  accounts: ['ref', 'ie', 'consignee', 'by', 'status', 'stage', 'date'],
  all: ['ref', 'mode', 'ie', 'consignee', 'by', 'hawb', 'sbboe', 'etd', 'eta', 'status', 'stage', 'date'],
}
const TABLE_TH = 'text-left px-2.5 py-3 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap'

// Seven-step track: where a shipment is, from the status it is in now.
const RAIL_STEPS = ['Enquiry', 'Rates', 'Booked', 'Docs', 'Customs', 'Delivered', 'Invoice']
const STEP_OF = {
  ENQUIRY: 1, RATES_REQUESTED: 2, RATES_ADDED: 2,
  NOMINATED: 3, BOOKED: 3, PICKUP_DONE: 3, SCHEDULED: 3,
  DRAFT: 4, PRE_ALERTS: 4, AWB_GENERATED: 4, CHECKLIST_APPROVED: 4,
  BOE_FILED: 5, SB_FILED: 5, DO_COLLECTED: 5, OOC_DONE: 5, LEO_DONE: 5, GATE_PASS: 5,
  HAND_OVER: 6, DELIVERED: 6,
  INVOICE_GENERATED: 7, INVOICE_SENT: 7, COMPLETED: 7,
}
const TONE_HEX = {
  amber: '#F59E0B', orange: '#F97316', sky: '#0EA5E9', violet: '#8B5CF6', indigo: '#6366F1', cyan: '#06B6D4',
  fuchsia: '#D946EF', pink: '#EC4899', teal: '#14B8A6', emerald: '#10B981', lime: '#84CC16', green: '#22C55E',
  purple: '#A855F7', rose: '#F43F5E', red: '#EF4444', gray: '#9CA3AF',
}
const QUICK_STATUS_CHIPS = [
  { l: 'All', v: '' }, { l: 'Enquiry', v: 'ENQUIRY' }, { l: 'Rates Added', v: 'RATES_ADDED' },
  { l: 'Booked', v: 'BOOKED' }, { l: 'Invoice', v: 'INVOICE_GENERATED' }, { l: 'Delivered', v: 'DELIVERED' },
]

function readPref(key, fallback, allowed) {
  try {
    const v = localStorage.getItem(key)
    return v && allowed.includes(v) ? v : fallback
  } catch { return fallback }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value) } catch {}
}

const AVATAR_COLORS = ['#4F46E5', '#0EA5A4', '#F97316', '#E11D74', '#7C3AED', '#0369A1']
function avatarColor(name) {
  let h = 0
  for (const ch of String(name || '')) h = (h + ch.charCodeAt(0)) % 997
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initialsOf(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean)
  return (((p[0] || '?')[0]) + ((p[1] || '')[0] || '')).toUpperCase()
}
function Avatar({ name, size = 24 }) {
  return (
    <span title={name} className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0" style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)), background: avatarColor(name) }}>
      {initialsOf(name)}
    </span>
  )
}

// Names typed in capitals are shown in normal capitalisation. Words with
// no vowel (TSV, LLP, M/S) stay as typed; the full original is in the tooltip.
const SMALL_WORDS = { PVT: 'Pvt', LTD: 'Ltd' }
function titleCase(text) {
  const t = String(text == null ? '' : text)
  if (!t || t !== t.toUpperCase()) return t
  return t.split(' ').map(w => w.replace(/[A-Z]+/g, seg => {
    if (SMALL_WORDS[seg]) return SMALL_WORDS[seg]
    return /[AEIOUY]/.test(seg) ? seg.charAt(0) + seg.slice(1).toLowerCase() : seg
  })).join(' ')
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}` }
function dayLabel(d) {
  const x = new Date(d)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  const text = x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  if (sameDay(x, today)) return `Today · ${text}`
  if (sameDay(x, yesterday)) return `Yesterday · ${text}`
  return `${x.toLocaleDateString('en-GB', { weekday: 'long' })} · ${text}`
}
function agoLabel(d) {
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  return n <= 0 ? 'today' : `${n}d ago`
}

// Ring showing the days left before an idle enquiry is cancelled automatically.
function CountdownRing({ left }) {
  const frac = Math.max(0, Math.min(1, left / 5))
  const r = 10
  const c = 2 * Math.PI * r
  const color = left >= 3 ? '#F59E0B' : '#EF4444'
  return (
    <span title={`${left} day${left === 1 ? '' : 's'} left before this enquiry is cancelled automatically`} className="relative inline-flex items-center justify-center w-[30px] h-[30px] shrink-0">
      <svg width="30" height="30" viewBox="0 0 26 26" className="absolute inset-0">
        <circle cx="13" cy="13" r={r} fill="none" strokeWidth="3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
        <circle cx="13" cy="13" r={r} fill="none" strokeWidth="3" stroke={color} strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 13 13)" />
      </svg>
      <b className="relative text-[8.5px]" style={{ color }}>{left}d</b>
    </span>
  )
}

function StepRail({ step, className = '' }) {
  return (
    <div className={`flex gap-0.5 ${className}`} title={step > 0 ? `Step ${step} of ${RAIL_STEPS.length} · ${RAIL_STEPS[step - 1]}` : 'Not started'}>
      {RAIL_STEPS.map((n, i) => (
        <span key={n} className={`flex-1 h-1.5 rounded-full ${i < step ? (step >= 6 ? 'bg-emerald-500' : 'bg-indigo-500') : 'bg-gray-200 dark:bg-gray-700'}`} />
      ))}
    </div>
  )
}

// Freight / Customs / Accounts: a filled avatar when someone handled that
// part, a dashed empty circle when nobody has yet.
function HandledBy({ s }) {
  const freight = s.freightNames || []
  const customs = s.customsNames || []
  const accounts = s.accountsNames || []
  const slot = (label, names, title) => names.length > 0
    ? <span key={label} className="flex -space-x-1.5" title={`${title}: ${names.join(', ')}`}>{names.slice(0, 2).map(n => <span key={n} className="ring-2 ring-[var(--bg-primary)] rounded-full inline-flex"><Avatar name={n} size={20} /></span>)}{names.length > 2 && <span className="text-[9px] text-[var(--text-muted)] pl-2 self-center">+{names.length - 2}</span>}</span>
    : <span key={label} title={`${title}: nobody yet`} className="w-5 h-5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-[8px] font-bold text-gray-400 inline-flex items-center justify-center">{label}</span>
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      {slot('F', freight, 'Freight')}
      {slot('C', customs, 'Customs')}
      {slot('A', accounts, 'Accounts')}
      {s.contributorCount > 0 && <span className="text-[10px] text-[var(--text-muted)] ml-0.5" title="People who have worked on this shipment">👥 {s.contributorCount}</span>}
    </div>
  )
}
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
  // ✅ FIX — this used to only remember search/statusFilter/shipmentType/
  // page/perPage. Every OTHER filter (Today's, This Month, In Progress,
  // Delivered, Invoiced, Pending Customs, Pending Invoice, a custom date,
  // Archive view) lived only in React state, gone the instant you left
  // the page — so opening a shipment from a filtered view and clicking
  // Back landed you on the unfiltered Total Shipments view instead of
  // exactly where you were. Now everything that affects what's on screen
  // is remembered.
  return {
    search: '', statusFilter: '', shipmentTypeFilter: '', page: 1, perPage: 25,
    showArchived: false, todayOnly: false, customDate: '', inProgressOnly: false,
    deliveredOnly: false, invoicedOnly: false, todayInvoicedOnly: false, thisMonthOnly: false,
    pendingCustomsOnly: false, customs2Only: false, pendingInvoiceOnly: false, simpleTypesOnly: false, cancelledOnly: false,
    createdFrom: '', createdTo: '', employeeId: '',
  }
}

// mineOnly: forces every query to only include shipments created by the
// logged-in user — powers the new default "My Shipments" landing page.
//
// targetUserId / targetUserName: used by Admin's Team page — when set,
// every query is scoped to that specific employee's shipments instead of
// "mine" or "everyone". Only Admins ever pass these in (route is guarded
// in App.jsx), but the scoping itself works the same way either way.
export default function Dashboard({ defaultType = '', mineOnly = false, targetUserId = null, targetUserName = null, pendingOnly = false, referenceGroup = null }) {
  const { addToast } = useToast()
  const socket = useSocket()
  const navigate = useNavigate()
  const sticky = loadStickyFilters()
  const [search, setSearch] = useState(sticky.search || '')

  // ─── DEBOUNCED SEARCH (NEW) ───
  // `search` updates instantly on every keystroke (so typing feels
  // responsive), but `debouncedSearch` — the value actually sent to the
  // backend — only updates 350ms after you stop typing. At 200,000+
  // shipments, firing a full search query on every single keystroke
  // would mean many wasted, overlapping requests; this cuts that down to
  // one request per pause in typing. Clearing the box (search === '')
  // updates immediately, no delay, so "Clear" always feels instant.
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const isFirstSearchEffect = useRef(true)
  useEffect(() => {
    // ✅ FIX — this effect runs on every mount (including the remount
    // that happens when you click Back from a shipment), not just when
    // you actually type or clear something in the search box. Since
    // `search` is normally empty when you're browsing via a stat card
    // filter, the old code unconditionally reset the page to 1 on every
    // single mount — silently overwriting whatever page had just been
    // correctly restored (e.g. you were on page 5, it'd jump to page 1
    // the instant you came back). Skipping the reset on this first run
    // fixes that, while still resetting the page normally whenever you
    // genuinely type or clear the search box afterward.
    if (isFirstSearchEffect.current) {
      isFirstSearchEffect.current = false
      setDebouncedSearch(search)
      return
    }
    if (search === '') {
      setDebouncedSearch('')
      setPage(1)
      return
    }
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search])
  const [statusFilter, setStatusFilter] = useState(sticky.statusFilter || '')
  const [shipmentTypeFilter, setShipmentTypeFilter] = useState(sticky.shipmentTypeFilter || defaultType)
  const [showArchived, setShowArchived] = useState(sticky.showArchived || false)
  const [showBin, setShowBin] = useState(false)
  const [todayOnly, setTodayOnly] = useState(sticky.todayOnly || false)
  const [customDate, setCustomDate] = useState(sticky.customDate || '')
  const [inProgressOnly, setInProgressOnly] = useState(sticky.inProgressOnly || false)
  const [deliveredOnly, setDeliveredOnly] = useState(sticky.deliveredOnly || false)
  const [invoicedOnly, setInvoicedOnly] = useState(sticky.invoicedOnly || false)
  const [todayInvoicedOnly, setTodayInvoicedOnly] = useState(sticky.todayInvoicedOnly || false)
  const [thisMonthOnly, setThisMonthOnly] = useState(sticky.thisMonthOnly || false)
  const [pendingCustomsOnly, setPendingCustomsOnly] = useState(sticky.pendingCustomsOnly || false)
  const [customs2Only, setCustoms2Only] = useState(sticky.customs2Only || false)
  const [pendingInvoiceOnly, setPendingInvoiceOnly] = useState(sticky.pendingInvoiceOnly || false)
  const [simpleTypesOnly, setSimpleTypesOnly] = useState(sticky.simpleTypesOnly || false)
  const [cancelledOnly, setCancelledOnly] = useState(sticky.cancelledOnly || false)
  // ✅ ADVANCED FILTERS (NEW) — combine freely with search/status/type/
  // each other, unlike the stat-card toggles above which each represent
  // one specific view and override each other.
  const [createdFrom, setCreatedFrom] = useState(sticky.createdFrom || '')
  const [createdTo, setCreatedTo] = useState(sticky.createdTo || '')
  const [employeeId, setEmployeeId] = useState(sticky.employeeId || '')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [employeeList, setEmployeeList] = useState([])
  useEffect(() => {
    api.get('/freight/employees').then(res => setEmployeeList(res.data?.data || [])).catch(() => {})
  }, [])
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(sticky.page || 1)
  const [perPage, setPerPage] = useState(sticky.perPage || 25)
  const [showFilters, setShowFilters] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [liveNotification, setLiveNotification] = useState(null)
  const [binCount, setBinCount] = useState(0)
  const queryClient = useQueryClient()

  // Ctrl+K (or Cmd+K) jumps straight to the search box.
  const searchRef = useRef(null)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault()
        if (searchRef.current) { searchRef.current.focus(); if (searchRef.current.select) searchRef.current.select() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Logged-in user — used only for the greeting and the Me / Team switch.
  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await api.get('/auth/me')
      return res.data?.data || null
    },
    staleTime: 600000, refetchOnWindowFocus: false, retry: 1,
  })

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
    ...(referenceGroup ? { referenceGroup } : {}),
  }
  const scopeKey = (mineOnly ? 'mine' : targetUserId ? `user:${targetUserId}` : 'all') + (pendingOnly ? ':pending' : '') + (referenceGroup ? `:${referenceGroup}` : '')

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
    // ✅ FIXED — was polling every 30s from every open tab, including
    // background tabs nobody is looking at. Now pauses while the tab is
    // hidden, refreshes the moment it's visible again, and polls every
    // 60s while someone is actually watching.
    let interval = null
    const startPolling = () => { if (!interval) interval = setInterval(fetchBinCount, 60000) }
    const stopPolling = () => { if (interval) { clearInterval(interval); interval = null } }
    const onVisibilityChange = () => {
      if (document.hidden) stopPolling()
      else { fetchBinCount(); startPolling() }
    }
    if (!document.hidden) { fetchBinCount(); startPolling() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
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
    refetchInterval: 120000, // safety net: the number corrects itself within 2 min even if live updates are down
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
  // Backend already computes total/delivered/invoiced/deliveryRate/
  // monthlyShipments/monthlyInvoiced across every matching shipment (not
  // just the current page) via /freight/shipments/stats. Uses the exact
  // same filters as the main shipments query, so the numbers always
  // describe what's on screen.
  const { data: fullStats } = useQuery({
    queryKey: ['shipments-full-stats', statusFilter, shipmentTypeFilter, showArchived, debouncedSearch, createdFrom, createdTo, employeeId, scopeKey],
    queryFn: async () => {
      const params = { isArchived: showArchived ? 'true' : 'false', ...scopeParams }
      if (debouncedSearch) params.search = debouncedSearch
      if (statusFilter) params.status = statusFilter
      if (shipmentTypeFilter) params.shipmentType = shipmentTypeFilter
      if (createdFrom) params.createdFrom = createdFrom
      if (createdTo) params.createdTo = createdTo
      if (employeeId) params.employeeId = employeeId
      const res = await api.get('/freight/shipments/stats', { params })
      return res.data?.data || null
    },
    enabled: !showBin,
    staleTime: 60000,
    refetchInterval: 120000, // safety net, as above
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
      try {
        sessionStorage.setItem(STICKY_KEY, JSON.stringify({
          search, statusFilter, shipmentTypeFilter, page, perPage,
          showArchived, todayOnly, customDate, inProgressOnly,
          deliveredOnly, invoicedOnly, todayInvoicedOnly, thisMonthOnly,
          pendingCustomsOnly, customs2Only, pendingInvoiceOnly, simpleTypesOnly, cancelledOnly,
          createdFrom, createdTo, employeeId,
        }))
      } catch {}
    }
  }, [search, statusFilter, shipmentTypeFilter, page, perPage, showArchived, todayOnly, customDate, inProgressOnly, deliveredOnly, invoicedOnly, todayInvoicedOnly, thisMonthOnly, pendingCustomsOnly, customs2Only, pendingInvoiceOnly, simpleTypesOnly, cancelledOnly, createdFrom, createdTo, employeeId, initialized])

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
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
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
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── SHOW THIS MONTH'S SHIPMENTS (NEW) ───
  // Fixes a real bug: this card previously had no click handler at all.
  const showThisMonthShipments = () => {
    setThisMonthOnly(true)
    setTodayOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── TOTAL SHIPMENTS CARD ───
  const showAllShipments = () => {
    setTodayOnly(false)
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── IN PROGRESS CARD ───
  const showInProgressShipments = () => {
    setInProgressOnly(true)
    setTodayOnly(false)
    setThisMonthOnly(false)
    setCustomDate('')
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── DELIVERED CARD (NEW) ───
  const showDeliveredShipments = () => {
    setDeliveredOnly(true)
    setTodayOnly(false)
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── THIS MONTH INVOICE CARD (FIXED) ───
  // Previously reused the lifetime "currentStatus IN (INVOICE_GENERATED,
  // INVOICE_SENT)" filter — which shows a totally different, usually much
  // larger set than the number displayed on the card (which counts only
  // invoices completed THIS calendar month). Now sends a dedicated
  // invoicedThisMonthOnly flag the backend resolves the same way it
  // computes the card's own number, so what you see always matches what
  // you click into.
  const showInvoicedShipments = () => {
    setInvoicedOnly(true)
    setTodayInvoicedOnly(false)
    setTodayOnly(false)
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── TODAY'S INVOICE CARD (NEW) ───
  const showTodayInvoiced = () => {
    setTodayInvoicedOnly(true)
    setInvoicedOnly(false)
    setTodayOnly(false)
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── CUSTOMS 1 CARD ─── Freight done, Customs paperwork up to the BOE / SB still to fill
  const showPendingCustoms = () => {
    setPendingCustomsOnly(true)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
    setTodayOnly(false)
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── CUSTOMS 2 CARD ─── Customs paperwork done up to the BOE; OOC, Gate Pass and Delivery still to fill
  const showCustoms2 = () => {
    setCustoms2Only(true)
    setPendingCustomsOnly(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
    setTodayOnly(false)
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── PENDING INVOICE CARD (NEW) ─── Customs done, waiting on Invoice
  const showPendingInvoice = () => {
    setPendingInvoiceOnly(true)
    setSimpleTypesOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setCancelledOnly(false)
    setTodayOnly(false)
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── FF ONLY / TRANSPORT / DO RELEASE — IN PROGRESS CARD (NEW) ───
  // These 3 types have no separate Freight/Customs stage of their own,
  // so without this card they were invisible everywhere except
  // Cancelled — the reason Total Shipments never visibly added up.
  const showSimpleTypesInProgress = () => {
    setSimpleTypesOnly(true)
    setPendingInvoiceOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setCancelledOnly(false)
    setTodayOnly(false)
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setShowArchived(false)
    setShowBin(false)
    setSearch('')
    setStatusFilter('')
    setPage(1)
    setSelected([])
  }

  // ─── CANCELLED CARD (NEW) ─── Manually cancelled, or stuck at pure Enquiry for 5 days
  const showCancelled = () => {
    setCancelledOnly(true)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setTodayOnly(false)
    setThisMonthOnly(false)
    setCustomDate('')
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
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
    setThisMonthOnly(false)
    setInProgressOnly(false)
    setDeliveredOnly(false)
    setInvoicedOnly(false)
    setTodayInvoicedOnly(false)
    setPendingCustomsOnly(false)
    setCustoms2Only(false)
    setPendingInvoiceOnly(false)
    setSimpleTypesOnly(false)
    setCancelledOnly(false)
    if (val) {
      setShowArchived(false)
      setShowBin(false)
      setSearch('')
      setStatusFilter('')
    }
    setPage(1)
    setSelected([])
  }

  // ─── SAVED VIEWS (NEW) ───
  // Remember a set of filters under a name ("My customs queue") and bring it back
  // in one click. Stored in this browser only, so each person keeps their own.
  const [savedViews, setSavedViews] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('pas_saved_views') || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
  })
  const [viewsOpen, setViewsOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const persistViews = (list) => {
    setSavedViews(list)
    try { localStorage.setItem('pas_saved_views', JSON.stringify(list)) } catch {}
  }
  const saveCurrentView = () => {
    const name = viewName.trim()
    if (!name) { addToast('Give the view a name first', 'warning'); return }
    const filters = {
      search, statusFilter, shipmentTypeFilter, showArchived, todayOnly, customDate, inProgressOnly,
      deliveredOnly, invoicedOnly, todayInvoicedOnly, thisMonthOnly, pendingCustomsOnly, customs2Only, pendingInvoiceOnly,
      simpleTypesOnly, cancelledOnly, createdFrom, createdTo, employeeId,
    }
    persistViews([...savedViews.filter(v => v.name.toLowerCase() !== name.toLowerCase()), { id: String(Date.now()), name, filters }].slice(-12))
    setViewName('')
    setViewsOpen(false)
    addToast(`Saved “${name}”`, 'success')
  }
  const applyView = (v) => {
    const f = v.filters || {}
    setSearch(f.search || ''); setStatusFilter(f.statusFilter || ''); setShipmentTypeFilter(f.shipmentTypeFilter || defaultType)
    setShowArchived(!!f.showArchived); setShowBin(false); setTodayOnly(!!f.todayOnly); setCustomDate(f.customDate || '')
    setInProgressOnly(!!f.inProgressOnly); setDeliveredOnly(!!f.deliveredOnly); setInvoicedOnly(!!f.invoicedOnly)
    setTodayInvoicedOnly(!!f.todayInvoicedOnly); setThisMonthOnly(!!f.thisMonthOnly)
    setPendingCustomsOnly(!!f.pendingCustomsOnly); setCustoms2Only(!!f.customs2Only); setPendingInvoiceOnly(!!f.pendingInvoiceOnly)
    setSimpleTypesOnly(!!f.simpleTypesOnly); setCancelledOnly(!!f.cancelledOnly)
    setCreatedFrom(f.createdFrom || ''); setCreatedTo(f.createdTo || ''); setEmployeeId(f.employeeId || '')
    setPage(1); setSelected([]); setViewsOpen(false)
    addToast(`Showing “${v.name}”`, 'info')
  }
  const removeView = (id) => persistViews(savedViews.filter(v => v.id !== id))

  // Starts a new shipment pre-filled from this one (customer, route, cargo).
  const createSimilar = (id) => { clearHover(); setPeekId(null); navigate(`/create?copy=${id}`) }

  const clearAllFilters = () => {
    setSearch(''); setStatusFilter(''); setShipmentTypeFilter(''); setTodayOnly(false); setThisMonthOnly(false); setCustomDate(''); setInProgressOnly(false); setDeliveredOnly(false); setInvoicedOnly(false); setTodayInvoicedOnly(false); setPendingCustomsOnly(false); setCustoms2Only(false); setPendingInvoiceOnly(false); setCancelledOnly(false); setCreatedFrom(''); setCreatedTo(''); setEmployeeId(''); setPage(1)
    addToast('Filters cleared', 'info')
  }

  // ─── QUERY FOR SHIPMENTS ───
  // Enquiries 3+ days old that are heading for automatic cancellation (shown as a banner)
  const { data: staleData } = useQuery({
    queryKey: ['stale-enquiries', mineOnly ? 'mine' : 'all'],
    queryFn: async () => {
      const res = await api.get('/freight/shipments/stale-enquiries', { params: mineOnly ? { mine: 'true' } : {} })
      return res.data?.data || []
    },
    enabled: !targetUserId && !referenceGroup,
    staleTime: 120000, refetchOnWindowFocus: false
  })
  const dueSoon = (staleData || []).filter(r => !r.enquiryStale)
  const cancelsTomorrow = dueSoon.filter(r => r.enquiryDaysLeft <= 1).length

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shipments', debouncedSearch, statusFilter, shipmentTypeFilter, showArchived, showBin, todayOnly, thisMonthOnly, customDate, inProgressOnly, deliveredOnly, invoicedOnly, todayInvoicedOnly, pendingCustomsOnly, customs2Only, pendingInvoiceOnly, simpleTypesOnly, cancelledOnly, createdFrom, createdTo, employeeId, page, perPage, scopeKey],
    queryFn: async () => {
      if (showBin) {
        const params = { page, limit: perPage }
        if (debouncedSearch) params.search = debouncedSearch
        const res = await api.get('/freight/shipments/bin', { params })
        return res.data
      } else {
        const params = { isArchived: showArchived ? 'true' : 'false', page, limit: perPage, ...scopeParams }
        if (customDate) params.date = customDate
        else if (todayOnly) params.today = 'true'
        else if (thisMonthOnly) params.thisMonthOnly = 'true'
        else if (inProgressOnly) params.pipelineStage = 'freight'
        else if (deliveredOnly) params.deliveredOnly = 'true'
        else if (invoicedOnly) params.invoicedThisMonthOnly = 'true'
        else if (todayInvoicedOnly) params.invoicedTodayOnly = 'true'
        else if (pendingCustomsOnly) params.pipelineStage = 'customs1'
        else if (customs2Only) params.pipelineStage = 'customs2'
        else if (pendingInvoiceOnly) params.pipelineStage = 'invoice'
        else if (simpleTypesOnly) params.pipelineStage = 'simple'
        else if (cancelledOnly) params.cancelledOnly = 'true'
        if (debouncedSearch) params.search = debouncedSearch
        if (statusFilter) params.status = statusFilter
        if (shipmentTypeFilter) params.shipmentType = shipmentTypeFilter
        // ✅ ADVANCED FILTERS — combine with everything above, rather than
        // being mutually exclusive like the stat-card toggles.
        if (createdFrom) params.createdFrom = createdFrom
        if (createdTo) params.createdTo = createdTo
        if (employeeId) params.employeeId = employeeId
        const res = await api.get('/freight/shipments', { params })
        try { sessionStorage.setItem('cached_shipments', JSON.stringify(res.data)) } catch {}
        return res.data
      }
    },
    staleTime: 60000, gcTime: 600000, refetchOnMount: true, refetchOnWindowFocus: false, refetchInterval: 120000,
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
  const handleExport = async () => {
    setExporting(true)
    try {
      const params = { ...scopeParams }
      if (debouncedSearch) params.search = debouncedSearch
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

  // ─── EXPORT FOR CLIENT (NEW) ───
  const [exportingClient, setExportingClient] = useState(false)
  const handleExportForClient = async () => {
    if (selected.length === 0) return
    setExportingClient(true)
    try {
      const res = await api.post('/freight/export-client', { ids: selected }, {
        responseType: 'blob',
        timeout: 300000
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `PAS_Shipment_Update_${new Date().toISOString().split('T')[0]}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      addToast('Client export downloaded!', 'success')
    } catch (err) {
      console.error('Client export error:', err)
      addToast('Failed to export for client', 'error')
    } finally {
      setExportingClient(false)
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

  // ✅ NEW — change status and/or stage for every selected shipment in ONE
  // request (instead of opening each shipment and changing it by hand).
  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status, stage }) => api.put('/freight/shipments/bulk-status', { ids, status, stage }),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
      setSelected([])
      const n = res.data?.data?.updated ?? vars.ids.length
      addToast(`Updated ${n} shipment${n === 1 ? '' : 's'}`, 'success')
      if (socket) socket.emit('shipment:updated', { refNo: `${n} shipment${n === 1 ? '' : 's'}`, bulk: true })
    },
    onError: (err) => addToast(err?.response?.data?.message || 'Bulk status change failed', 'error')
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
  // ✅ NOW ALSO includes monthlyShipments / monthlyInvoiced, sourced
  // straight from the backend's IST-scoped "this calendar month" counts.
  const analytics = useMemo(() => {
    const total = fullStats?.total ?? overallTotal
    const delivered = fullStats?.delivered ?? 0
    const invoiced = fullStats?.invoiced ?? 0
    const pendingTotal = Math.max(0, total - delivered - invoiced)
    const deliveryRate = fullStats?.deliveryRate ?? (total > 0 ? Math.round((delivered / total) * 100) : 0)
    const monthlyShipments = fullStats?.monthlyShipments ?? 0
    const monthlyInvoiced = fullStats?.monthlyInvoiced ?? 0
    const todayInvoiced = fullStats?.todayInvoiced ?? 0
    const pipelineFreight = fullStats?.pipelineFreight ?? 0
    const pipelineCustoms = fullStats?.pipelineCustoms ?? 0
    const pipelineCustoms1 = fullStats?.pipelineCustoms1 ?? 0
    const pipelineCustoms2 = fullStats?.pipelineCustoms2 ?? 0
    const pipelineInvoice = fullStats?.pipelineInvoice ?? 0
    const pipelineSimple = fullStats?.pipelineSimple ?? 0
    const cancelled = fullStats?.cancelled ?? 0

    return {
      delivered,
      invoiced,
      pendingTotal,
      total,
      deliveryRate,
      monthlyShipments,
      monthlyInvoiced,
      todayInvoiced,
      pipelineFreight,
      pipelineCustoms,
      pipelineCustoms1,
      pipelineCustoms2,
      pipelineInvoice,
      pipelineSimple,
      cancelled,
    }
  }, [fullStats, overallTotal])

  const toggleSelectAll = () => { if (selected.length === shipments.length) setSelected([]); else setSelected(shipments.map(s => s.id)) }
  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // ─── BADGE STYLES ───
  // Soft, readable pills — one colour family per meaning, with a dark-mode
  // variant of each so they stay legible on the dark theme too.
  const SOFT = {
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
    sky: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
    violet: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
    cyan: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300',
    fuchsia: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
    pink: 'bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
    emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    lime: 'bg-lime-100 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
    purple: 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300',
    rose: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  }
  const STATUS_TONE = {
    ENQUIRY: 'amber', RATES_REQUESTED: 'orange', RATES_ADDED: 'sky', NOMINATED: 'violet', BOOKED: 'indigo',
    PICKUP_DONE: 'cyan', SCHEDULED: 'cyan', DRAFT: 'fuchsia', PRE_ALERTS: 'pink', AWB_GENERATED: 'teal',
    CHECKLIST_APPROVED: 'emerald', BOE_FILED: 'lime', DO_COLLECTED: 'green', OOC_DONE: 'sky', GATE_PASS: 'purple',
    LEO_DONE: 'sky', HAND_OVER: 'purple', SB_FILED: 'lime', DELIVERED: 'emerald', INVOICE_GENERATED: 'orange',
    INVOICE_SENT: 'rose', COMPLETED: 'gray', CANCELLED: 'red',
  }
  const STAGE_TONE = {
    'Draft': 'gray', 'Created': 'sky', 'Confirmed': 'amber', 'Booked': 'purple', 'Scheduled': 'cyan',
    'In Progress': 'amber', 'Completed': 'emerald', 'Cancelled': 'red', 'On Hold': 'orange',
  }
  const getStatusBadge = (s) => SOFT[STATUS_TONE[s] || 'gray']

  const getModeBadge = (t) => {
    if (t === 'CHA Only') return SOFT.emerald
    if (t === 'Transport') return SOFT.sky
    if (t === 'DO Release') return SOFT.teal
    if (t === 'FF Only') return SOFT.purple
    if (/^air/i.test(t || '')) return SOFT.orange
    if (/^sea/i.test(t || '')) return SOFT.sky
    if (!t) return SOFT.gray
    return SOFT.indigo
  }

  const getImportExportBadge = (v) => v === 'Import' ? SOFT.violet : v === 'Export' ? SOFT.orange : SOFT.gray

  const getStageBadge = (stage) => SOFT[STAGE_TONE[stage] || 'gray']

  // ✅ EXPANDED — every individual workflow status as its own filter,
  // instead of just 6 broad buckets (Enquiry/Transit/Customs/Delivered/
  // Invoiced) each representing a whole range of statuses. Covers the
  // full Freight pipeline plus the CHA Export-only steps (SB/LEO/Hand
  // Over) at the end.
  const quickFilters = [
    {l:'All',v:'',i:Layers},
    {l:'Enquiry',v:'ENQUIRY',i:Search},
    {l:'Rates Requested',v:'RATES_REQUESTED',i:Mail},
    {l:'Rates',v:'RATES_ADDED',i:Banknote},
    {l:'Nominated',v:'NOMINATED',i:User},
    {l:'Booked',v:'BOOKED',i:Calendar},
    {l:'Pickup',v:'PICKUP_DONE',i:Truck},
    {l:'Scheduled',v:'SCHEDULED',i:Clock},
    {l:'Draft',v:'DRAFT',i:FileText},
    {l:'Pre-Alerts',v:'PRE_ALERTS',i:Mail},
    {l:'AWB',v:'AWB_GENERATED',i:PlaneTakeoff},
    {l:'Checklist',v:'CHECKLIST_APPROVED',i:FileCheck},
    {l:'BOE',v:'BOE_FILED',i:FileText},
    {l:'DO',v:'DO_COLLECTED',i:Package},
    {l:'OOC',v:'OOC_DONE',i:CheckCircle2},
    {l:'Gate Pass',v:'GATE_PASS',i:Truck},
    {l:'Delivered',v:'DELIVERED',i:MapPin},
    {l:'SB Filed',v:'SB_FILED',i:FileText},
    {l:'LEO',v:'LEO_DONE',i:CheckCircle2},
    {l:'Hand Over',v:'HAND_OVER',i:Package},
    {l:'Invoice',v:'INVOICE_GENERATED',i:FileSpreadsheet},
    {l:'Invoiced Sent',v:'INVOICE_SENT',i:Mail},
  ]
  const startItem = totalCount===0?0:(page-1)*perPage+1; const endItem = Math.min(page*perPage,totalCount)
  const hasFilters = search||statusFilter||shipmentTypeFilter||todayOnly||thisMonthOnly||customDate||inProgressOnly||deliveredOnly||invoicedOnly||todayInvoicedOnly||pendingCustomsOnly||customs2Only||pendingInvoiceOnly||simpleTypesOnly||cancelledOnly||createdFrom||createdTo||employeeId; const isEmpty = !isLoading&&!isError&&shipments.length===0; const showSkeleton = isLoading && !data

  // ✅ MOVED HERE — must be declared before statCards below, which now
  // references showPipelineTab for the Pending Customs/Invoice cards.
  const showModuleSwitcher = !mineOnly && !targetUserId && !referenceGroup
  // ─── PIPELINE VIEW ───
  // A tab (and, now, 2 stat cards) on the main Overview page only —
  // scoped views (My Shipments, a specific employee, a reference group)
  // don't get it, since the pipeline board/cards are inherently a
  // whole-company view.
  const showPipelineTab = showModuleSwitcher

  const statGradients = ['from-blue-500 to-indigo-600','from-amber-500 to-orange-600','from-emerald-500 to-teal-600','from-violet-500 to-purple-600']
  
  // ✅ STAT CARDS — "Invoiced" (lifetime) replaced with "This Month
  // Invoice" (calendar-month scoped), and a new "This Month Shipments"
  // card added alongside "Today's Shipments". Now 6 cards total.
  const statCards = [
    { label: showArchived ? 'Total Shipments' : 'Active Shipments', value: overallTotal, icon: Box, gradient: statGradients[0], desc: showArchived ? 'All archived shipments' : 'Everything still open', onClick: showAllShipments, active: !todayOnly && !thisMonthOnly && !customDate && !inProgressOnly && !invoicedOnly && !todayInvoicedOnly && !pendingCustomsOnly && !customs2Only && !pendingInvoiceOnly && !simpleTypesOnly && !cancelledOnly && !showArchived && !showBin && !search && !statusFilter },
    { 
      label: showArchived ? 'Completed' : 'Freight', 
      value: showArchived ? analytics.delivered + analytics.invoiced : analytics.pipelineFreight, 
      icon: showArchived ? CheckCircle2 : Clock, 
      gradient: showArchived ? statGradients[2] : statGradients[1], 
      desc: showArchived ? 'Every field filled' : 'Freight details still to fill',
      onClick: showArchived ? undefined : showInProgressShipments,
      active: inProgressOnly
    },
    { label: "Today's Invoice", value: analytics.todayInvoiced, icon: FileSpreadsheet, gradient: 'from-teal-500 to-cyan-600', desc: 'Invoiced today', onClick: showTodayInvoiced, active: todayInvoicedOnly },
    { label: 'This Month Invoice', value: analytics.monthlyInvoiced, icon: FileSpreadsheet, gradient: statGradients[3], desc: 'Invoiced this calendar month', onClick: showInvoicedShipments, active: invoicedOnly },
    // ✅ NEW — same stages as the Pipeline tab, as clickable cards on the
    // main list view. Overview-only (showPipelineTab already restricts to
    // the main company-wide view, not My Shipments/employee/reference-
    // group pages), since these are company-wide counts like the
    // Pipeline board itself.
    ...(showPipelineTab ? [
      { label: 'Customs 1', value: analytics.pipelineCustoms1, icon: FileCheck, gradient: 'from-emerald-500 to-teal-600', desc: 'Job No, Checklist, Approval, BOE', onClick: showPendingCustoms, active: pendingCustomsOnly },
      { label: 'Customs 2', value: analytics.pipelineCustoms2, icon: FileCheck, gradient: 'from-cyan-500 to-sky-600', desc: 'OOC, Gate Pass, Delivery', onClick: showCustoms2, active: customs2Only },
      { label: 'Pending Invoice', value: analytics.pipelineInvoice, icon: Banknote, gradient: 'from-amber-500 to-orange-600', desc: 'Customs done, invoice not made yet', onClick: showPendingInvoice, active: pendingInvoiceOnly },
      { label: 'FF Only / Transport / DO', value: analytics.pipelineSimple, icon: Box, gradient: 'from-violet-500 to-purple-600', desc: 'In progress, not yet invoiced', onClick: showSimpleTypesInProgress, active: simpleTypesOnly },
      { label: 'Cancelled', value: analytics.cancelled, icon: AlertCircle, gradient: 'from-red-500 to-rose-600', desc: 'Cancelled, or no progress for 5 days', onClick: showCancelled, active: cancelledOnly },
    ] : []),
    { label: "Today's Shipments", value: todayCount || 0, icon: Calendar, gradient: 'from-rose-500 to-pink-600', desc: 'Created today', onClick: showTodayShipments, active: todayOnly },
    { label: 'This Month Shipments', value: analytics.monthlyShipments, icon: TrendingUp, gradient: 'from-cyan-500 to-sky-600', desc: 'Created this calendar month', onClick: showThisMonthShipments, active: thisMonthOnly },
  ]

  // ─── DASHBOARD SECTIONS ───
  // The first four stat cards become the big gradient tiles; every other
  // card stays reachable as a "more views" chip underneath. Same handlers
  // and counts as before, nothing is removed.
  const tileLabels = showPipelineTab
    ? [showArchived ? 'Total Shipments' : 'Active Shipments', showArchived ? 'Completed' : 'Freight', 'Customs 1', 'Customs 2', 'Pending Invoice', 'This Month Invoice']
    : [showArchived ? 'Completed' : 'Freight', "Today's Shipments", 'This Month Shipments', 'This Month Invoice']
  const tileGradients = ['from-slate-600 to-slate-700', 'from-indigo-600 to-violet-600', 'from-teal-500 to-emerald-500', 'from-cyan-500 to-sky-600', 'from-orange-500 to-amber-500', 'from-pink-600 to-rose-500']
  const kpiTiles = tileLabels.map(l => statCards.find(c => c.label === l)).filter(Boolean)
  const moreViews = statCards.filter(c => !tileLabels.includes(c.label))

  // "My day" — what is waiting, most urgent first. Built only from numbers
  // this page already loads (quiet enquiries + the Customs / Invoice queues).
  const daysLeftOf = (r) => Number(r.enquiryDaysLeft) || 0
  const todoItems = [
    ...dueSoon.slice().sort((a, b) => daysLeftOf(a) - daysLeftOf(b)).slice(0, 3).map(r => ({
      key: 'enq-' + r.id,
      title: `Follow up: ${r.freightForwarding?.customerName || r.freightForwarding?.shipperName || r.refNo}`,
      sub: `${r.refNo} · ${daysLeftOf(r) <= 0 ? 'cancels today' : `cancels in ${daysLeftOf(r)} day${daysLeftOf(r) === 1 ? '' : 's'}`}`,
      label: 'Follow up', to: `/shipment/${r.id}`, tone: 'orange',
    })),
    ...(analytics.pipelineCustoms1 > 0 ? [{ key: 'customs1', title: `${analytics.pipelineCustoms1.toLocaleString()} need Job No / Checklist / BOE`, sub: 'Freight is done for these', label: 'Open', onClick: showPendingCustoms, tone: 'indigo' }] : []),
    ...(analytics.pipelineCustoms2 > 0 ? [{ key: 'customs2', title: `${analytics.pipelineCustoms2.toLocaleString()} need OOC / Gate Pass / Delivery`, sub: 'BOE is done for these', label: 'Open', onClick: showCustoms2, tone: 'indigo' }] : []),
    ...(analytics.pipelineInvoice > 0 ? [{ key: 'invoice', title: `${analytics.pipelineInvoice.toLocaleString()} invoice${analytics.pipelineInvoice === 1 ? '' : 's'} to raise`, sub: 'Customs is done for these', label: 'View', onClick: showPendingInvoice, tone: 'soft' }] : []),
  ]
  const attentionCount = dueSoon.length + (analytics.pipelineCustoms1 > 0 ? 1 : 0) + (analytics.pipelineCustoms2 > 0 ? 1 : 0) + (analytics.pipelineInvoice > 0 ? 1 : 0)
  const flowNodes = [
    { label: 'Freight', value: analytics.pipelineFreight, color: 'bg-amber-500', onClick: showInProgressShipments },
    { label: 'Customs 1', value: analytics.pipelineCustoms1, color: 'bg-teal-500', onClick: showPendingCustoms },
    { label: 'Customs 2', value: analytics.pipelineCustoms2, color: 'bg-cyan-500', onClick: showCustoms2 },
    { label: 'Invoice', value: analytics.pipelineInvoice, color: 'bg-orange-500', onClick: showPendingInvoice },
    { label: 'Invoiced this month', value: analytics.monthlyInvoiced, color: 'bg-indigo-600', onClick: showInvoicedShipments },
  ]
  const biggestQueue = analytics.pipelineCustoms >= analytics.pipelineInvoice
    ? { name: 'Customs', n: analytics.pipelineCustoms }
    : { name: 'Invoice', n: analytics.pipelineInvoice }
  const todayDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = ((me && me.name) || '').trim().split(' ')[0]
  const isStaff = !!me && me.role !== 'ADMIN'

  const getTitle = () => {
    if (showBin) return 'Bin / Trash'
    if (customDate) return `Shipments on ${fmtDDMMYYYY(customDate + 'T00:00:00')}`
    if (todayOnly) return "Today's Shipments"
    if (thisMonthOnly) return "This Month's Shipments"
    if (inProgressOnly) return 'Freight — Freight Details Still to Fill'
    if (deliveredOnly) return 'Delivered / Hand Over Shipments'
    if (todayInvoicedOnly) return "Invoiced Today"
    if (invoicedOnly) return 'Invoiced This Month'
    if (pendingCustomsOnly) return 'Customs 1 — Job No, Checklist, Approval and BOE Still to Fill'
    if (customs2Only) return 'Customs 2 — OOC, Gate Pass and Delivery Still to Fill'
    if (simpleTypesOnly) return 'FF Only / Transport / DO Release — In Progress'
    if (pendingInvoiceOnly) return 'Pending Invoice — Customs Done, Waiting on Invoice'
    if (cancelledOnly) return 'Cancelled Shipments'
    if (showArchived) return 'Archive'
    if (targetUserName) return pendingOnly ? `${targetUserName}'s Pending Shipments` : `${targetUserName}'s Shipments`
    if (mineOnly) return 'My Shipments'
    if (isDOReleaseFilter) return 'DO Release'
    if (isTransportFilter) return 'Transport'
    if (isCHAFilter) return 'CHA'
    if (isFreightFilter) return 'Freight'
    if (referenceGroup) return `${referenceGroup} Shipments`
    return 'Overview'
  }

  const currentPath = window.location.pathname

  const [viewMode, setViewMode] = useState('list') // 'list' | 'pipeline'

  // ─── TABLE EXTRAS: role view, density, quick peek, inline status, keyboard ───
  const [tableView, setTableView] = useState(() => readPref('pas_table_view', 'all', Object.keys(VIEW_COLS)))
  const [density, setDensity] = useState(() => readPref('pas_table_density', 'comfortable', ['comfortable', 'compact']))
  const [peekId, setPeekId] = useState(null)
  const [statusMenu, setStatusMenu] = useState(null) // { id, refNo, current, top, left }
  const [focusIdx, setFocusIdx] = useState(-1)
  const [hover, setHover] = useState(null) // { id, x, rowTop, rowH } — the hover preview card
  const hoverTimer = useRef(null)
  const hideTimer = useRef(null)
  const navTimer = useRef(null)
  const defaultVariant = !isDOReleaseFilter && !isTransportFilter
  const colOn = (k) => VIEW_COLS[tableView].includes(k)
  const showCol = (k) => !defaultVariant || colOn(k)

  const changeTableView = (v) => { setTableView(v); writePref('pas_table_view', v) }
  const changeDensity = () => { const v = density === 'compact' ? 'comfortable' : 'compact'; setDensity(v); writePref('pas_table_density', v) }

  // Highlights what was typed in the search box inside the matching text.
  const hl = (text) => {
    const q = (debouncedSearch || '').trim()
    const str = String(text == null ? '' : text)
    if (q.length < 2 || !str) return str
    try {
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig')
      return str.split(re).map((part, i) => i % 2 === 1
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 text-inherit rounded px-0.5">{part}</mark>
        : part)
    } catch { return str }
  }

  const openStatusMenu = (e, s) => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    const h = 340
    const top = r.bottom + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6
    setStatusMenu({ id: s.id, refNo: s.refNo, current: s.currentStatus, top, left: Math.max(8, Math.min(r.left, window.innerWidth - 220)) })
  }
  const pickStatus = (v) => {
    const m = statusMenu
    setStatusMenu(null)
    if (!m || v === m.current) return
    if (v === 'CANCELLED' && !window.confirm(`Cancel ${m.refNo}?\n\nIt stays cancelled until you pick a different status.`)) return
    bulkStatusMutation.mutate({ ids: [m.id], status: v })
  }
  useEffect(() => {
    if (!statusMenu) return
    const close = () => setStatusMenu(null)
    const t = setTimeout(() => window.addEventListener('click', close), 0)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { clearTimeout(t); window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [statusMenu])

  const onRowClick = (e, s, idx) => {
    if (showBin) return
    if (e.target.closest && e.target.closest('a,button,input,select,label')) return
    // Selecting text inside the row to copy it should not open the shipment.
    try { if (window.getSelection && String(window.getSelection()).length > 0) return } catch {}
    setFocusIdx(idx)
    clearHover()
    if (e.ctrlKey || e.metaKey) { window.open(`/shipment/${s.id}`, '_blank'); return }
    // Opens after a very short pause so a double-click (select a word to
    // copy it) is not treated as "open the shipment".
    if (navTimer.current) clearTimeout(navTimer.current)
    navTimer.current = setTimeout(() => {
      navTimer.current = null
      try { if (window.getSelection && String(window.getSelection()).length > 0) return } catch {}
      navigate(`/shipment/${s.id}`)
    }, 230)
  }
  const cancelRowOpen = () => {
    if (navTimer.current) { clearTimeout(navTimer.current); navTimer.current = null }
  }

  // Hover preview: rest the cursor on a row for a moment and a small card
  // about that shipment appears. Desktop with a mouse only; it never shows
  // while the quick-view panel or the status menu is open.
  const canHover = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: hover) and (min-width: 1024px)').matches
  const clearHover = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    setHover(null)
  }
  // Leaving the row only hides the card after a short grace period, so the
  // cursor can travel onto the card to select or copy its details.
  const scheduleHide = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { hideTimer.current = null; setHover(null) }, 280)
  }
  const cancelHide = () => {
    // Also drops any switch to another row that was queued while the cursor
    // travelled to the card.
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
  }

  const copyText = async (text, what) => {
    const value = String(text == null ? '' : text)
    if (!value) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(value)
      else throw new Error('no clipboard api')
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = value
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      } catch {
        addToast('Could not copy. Select the text and press Ctrl+C.', 'error')
        return
      }
    }
    addToast(`${what || 'Text'} copied`, 'success')
  }
  const detailsText = (hs, d) => {
    const ff = (d && d.freightForwarding) || hs.freightForwarding || {}
    const ch = (d && d.cha) || hs.cha || {}
    const line = (k, v) => (v === undefined || v === null || v === '' ? null : `${k}: ${v}`)
    return [
      line('Ref No', hs.refNo), line('Consignee', ff.consigneeName), line('Customer', ff.customerName), line('Shipper', ff.shipperName),
      line('Mode', hs.shipmentType), line('Import/Export', hs.importExport),
      line('Route', [ff.fromLocation, ff.toLocation].filter(Boolean).join(' → ')),
      line('Commodity', ff.commodityName), line('Packages', ff.noOfPackages), line('Gross weight', ff.grossWeight), line('Chargeable weight', ff.weight), line('CBM', ff.cbm),
      line('HAWB', ff.hawb), line('MAWB', ff.mawb), line('SB/BOE No', ch.sbNo || ch.boeNo),
      line('ETD', ff.etd ? fmtDDMMYYYY(ff.etd) : ''), line('ETA', ff.eta ? fmtDDMMYYYY(ff.eta) : ''),
      line('Status', String(hs.enquiryStale ? 'CANCELLED' : hs.currentStatus || '').replace(/_/g, ' ')), line('Stage', hs.shipmentStage),
      line('Freight', (hs.freightNames || []).join(', ')), line('Customs', (hs.customsNames || []).join(', ')),
      line('Created by', hs.createdByName), line('Created on', hs.createdAt ? fmtDDMMYYYY(hs.createdAt) : ''),
    ].filter(Boolean).join('\n')
  }
  const onRowEnter = (e, s) => {
    if (showBin || peekId || statusMenu || !canHover()) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    hoverTimer.current = setTimeout(() => setHover({ id: s.id, x, rowTop: rect.top, rowH: rect.height }), 380)
  }
  useEffect(() => {
    if (peekId || statusMenu) clearHover()
  }, [peekId, statusMenu])
  useEffect(() => {
    if (!hover) return
    const hide = () => clearHover()
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [hover])
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); if (hideTimer.current) clearTimeout(hideTimer.current); if (navTimer.current) clearTimeout(navTimer.current) }, [])

  // Quick peek: loads the full record only when the panel is opened.
  const detailId = peekId || (hover && hover.id) || null
  const { data: peekData, isLoading: peekLoading, isError: peekError } = useQuery({
    queryKey: ['shipment-peek', detailId],
    queryFn: async () => {
      const res = await api.get(`/freight/shipments/${detailId}`)
      return res.data?.data || null
    },
    enabled: !!detailId && !showBin,
    staleTime: 30000, refetchOnWindowFocus: false, retry: 1,
  })
  const peekShip = peekId ? (shipments.find(x => x.id === peekId) || peekData || null) : null

  // Keyboard: J / K move, Space peek, Enter open, X select, Esc close.
  useEffect(() => {
    setFocusIdx(-1)
  }, [page, perPage, debouncedSearch, statusFilter, showArchived, showBin, scopeKey])
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      const tag = t && t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return
      if (e.key === 'Escape') {
        if (statusMenu) setStatusMenu(null)
        else if (peekId) setPeekId(null)
        else if (hover) clearHover()
        return
      }
      if (!shipments.length || showBin) return
      const k = String(e.key).toLowerCase()
      if (k === 'j' || k === 'k') {
        e.preventDefault()
        const next = k === 'j' ? Math.min(shipments.length - 1, focusIdx + 1) : Math.max(0, focusIdx < 0 ? 0 : focusIdx - 1)
        setFocusIdx(next)
        const row = document.getElementById('ship-row-' + shipments[next].id)
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' })
        if (peekId) setPeekId(shipments[next].id)
        return
      }
      if (focusIdx < 0 || focusIdx >= shipments.length) return
      const cur = shipments[focusIdx]
      if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); setPeekId(peekId === cur.id ? null : cur.id) }
      else if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') { navigate(`/shipment/${cur.id}`) }
      else if (k === 'x') { toggleSelect(cur.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shipments, focusIdx, peekId, statusMenu, hover, showBin, navigate])

  const toneHex = (st) => TONE_HEX[STATUS_TONE[st] || 'gray']
  const groupCols = 3 + (showBin ? 1 : 0) + VIEW_COLS[tableView].length

  return (
    <div className="w-full space-y-5 animate-fade-in">
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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-sm text-[var(--text-secondary)] font-medium">{todayDate}</span>
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
          {['Overview', 'My Shipments'].includes(getTitle()) ? (
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-[var(--text-primary)]">
              {greeting}{firstName ? `, ${firstName}` : ''}.
              <span className="block bg-gradient-to-r from-indigo-600 to-orange-500 bg-clip-text text-transparent">{attentionCount > 0 ? `You have ${attentionCount} thing${attentionCount === 1 ? '' : 's'} to look at today.` : 'You are all caught up today.'}</span>
            </h1>
          ) : (
            <h1 className="text-2xl sm:text-[30px] font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-orange-500 bg-clip-text text-transparent truncate">{getTitle()}</h1>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isStaff && (mineOnly || currentPath === '/overview') && (
            <div className="flex glass rounded-xl p-1 border border-[var(--border-color)]">
              <Link to="/" className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mineOnly ? 'bg-indigo-600 text-white shadow' : 'text-[var(--text-secondary)]'}`}>Me</Link>
              <Link to="/overview" className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${!mineOnly ? 'bg-indigo-600 text-white shadow' : 'text-[var(--text-secondary)]'}`}>Team</Link>
            </div>
          )}
          {showModuleSwitcher && (
            <div className="flex glass rounded-lg p-0.5 border border-[var(--border-color)] overflow-x-auto max-w-full">
              <Link to="/overview" className={`px-2.5 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${currentPath === '/overview' ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}>All</Link>
              <Link to="/ff-only" className={`px-2.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1 transition-all whitespace-nowrap ${currentPath === '/ff-only' ? 'bg-white dark:bg-slate-700 text-purple-700 dark:text-purple-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}><FileText size={12}/>FF Only</Link>
              <Link to="/freight" className={`px-2.5 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${currentPath === '/freight' ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}>Freight</Link>
              <Link to="/cha" className={`px-2.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1 transition-all whitespace-nowrap ${currentPath === '/cha' ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}><FileCheck size={12}/>CHA</Link>
              <Link to="/transport" className={`px-2.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1 transition-all whitespace-nowrap ${currentPath === '/transport' ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}><Truck size={12}/>Transport</Link>
              <Link to="/do-release" className={`px-2.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1 transition-all whitespace-nowrap ${currentPath === '/do-release' ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}><ClipboardList size={12}/>DO Release</Link>
            </div>
          )}
          <div className="flex glass rounded-lg p-0.5 border border-[var(--border-color)]">
            <button onClick={()=>toggleView('active')} className={`px-3 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${!showArchived && !showBin ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 shadow-sm' : 'text-[var(--text-secondary)]'}`}>Active</button>
            <button onClick={()=>toggleView('archived')} className={`px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${showArchived ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 shadow-sm' : 'text-[var(--text-secondary)]'}`}><Archive size={13}/>Archive</button>
            {!mineOnly && !targetUserId && (
              <button onClick={()=>toggleView('bin')} className={`px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${showBin ? 'bg-white dark:bg-slate-700 text-red-700 dark:text-red-400 shadow-sm' : 'text-[var(--text-secondary)]'}`}>
                <Trash2 size={13} className={showBin ? 'text-red-500' : ''} />
                Bin
                {binCount > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full ${showBin ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{binCount}</span>
                )}
              </button>
            )}
          </div>
          <Link to="/create" className="inline-flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/30 hover-lift whitespace-nowrap"><Plus size={16}/> New Shipment</Link>
        </div>
      </div>

      {/* ✅ LIST / PIPELINE TAB (NEW) — Overview only. The pipeline board
          shows shipments as Freight -> Customs -> Invoice -> Done columns,
          moving automatically as fields get completed. */}
      {showPipelineTab && (
        <div className="flex glass rounded-lg p-0.5 border border-[var(--border-color)] w-fit">
          <button onClick={() => setViewMode('list')} className={`px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}>
            <List size={13} /> List View
          </button>
          <button onClick={() => setViewMode('pipeline')} className={`px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${viewMode === 'pipeline' ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-[var(--text-secondary)]'}`}>
            <LayoutGrid size={13} /> Pipeline
          </button>
        </div>
      )}

      {viewMode === 'pipeline' && showPipelineTab ? (
        <PipelineBoard />
      ) : (
      <>

      {!showBin && (
        <>
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${kpiTiles.length > 4 ? "lg:grid-cols-3" : "xl:grid-cols-4"}`}>
            {kpiTiles.map((stat, i) => {
              const Icon = stat.icon
              return (
                <button key={stat.label} type="button" onClick={stat.onClick} disabled={!stat.onClick}
                  className={`relative overflow-hidden text-left rounded-3xl p-5 sm:p-6 text-white bg-gradient-to-br ${tileGradients[i % tileGradients.length]} shadow-lg transition-all ${stat.onClick ? 'hover:-translate-y-0.5 hover:shadow-xl cursor-pointer' : 'cursor-default'} ${stat.active ? 'ring-4 ring-white/70 dark:ring-white/40' : ''}`}>
                  <span className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-white/15" />
                  <span className="relative flex items-center justify-between">
                    <span className="text-sm font-semibold opacity-90">{stat.label}</span>
                    <Icon size={18} className="opacity-80" />
                  </span>
                  <span className="relative block text-4xl sm:text-5xl font-extrabold tracking-tight mt-3">{Number(stat.value || 0).toLocaleString()}</span>
                  <span className="relative block text-xs opacity-85 mt-2 truncate">{stat.desc}</span>
                </button>
              )
            })}
          </div>

          {moreViews.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mr-1">More views</span>
              {moreViews.map(stat => (
                <button key={stat.label} type="button" onClick={stat.onClick} disabled={!stat.onClick}
                  className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-2 border transition-all whitespace-nowrap ${stat.active ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'glass border-[var(--border-color)] text-[var(--text-secondary)] hover:border-indigo-300'}`}>
                  {stat.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${stat.active ? 'bg-white/25 text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'}`}>{Number(stat.value || 0).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}

          {!showArchived && !targetUserId && !referenceGroup && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <section className="lg:col-span-3 glass rounded-3xl border border-[var(--border-color)] p-5 sm:p-6">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">My day</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">The next things waiting on you, most urgent first</p>
                <div className="mt-3">
                  {todoItems.length === 0 ? (
                    <div className="flex items-center gap-3 py-6 text-sm text-[var(--text-secondary)]">
                      <CheckCircle2 size={20} className="text-emerald-500" /> Nothing is waiting on you right now.
                    </div>
                  ) : todoItems.map(item => (
                    <div key={item.key} className="flex items-center gap-3 py-3.5 border-t border-[var(--border-color)] first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{item.title}</p>
                        <p className="text-xs text-[var(--text-secondary)] truncate">{item.sub}</p>
                      </div>
                      {(() => {
                        const cls = `shrink-0 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${item.tone === 'orange' ? 'bg-orange-500 text-white hover:bg-orange-600' : item.tone === 'indigo' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300'}`
                        return item.to
                          ? <Link to={item.to} className={cls}>{item.label}</Link>
                          : <button type="button" onClick={item.onClick} className={cls}>{item.label}</button>
                      })()}
                    </div>
                  ))}
                </div>
              </section>

              <section className="lg:col-span-2 glass rounded-3xl border border-[var(--border-color)] p-5 sm:p-6">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Where shipments are right now</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Tap a stage to open it</p>
                <div className="flex items-start justify-between mt-5 gap-1">
                  {flowNodes.map((n, i) => (
                    <div key={n.label} className="flex items-start flex-1 min-w-0">
                      <button type="button" onClick={n.onClick} className="flex flex-col items-center gap-2 w-full min-w-0 group">
                        <span className={`w-14 h-14 rounded-full ${n.color} text-white flex items-center justify-center text-sm font-bold shadow group-hover:scale-105 transition-transform`}>{Number(n.value || 0) >= 10000 ? `${Math.round(n.value / 1000)}k` : Number(n.value || 0).toLocaleString()}</span>
                        <span className="text-[11px] font-semibold text-[var(--text-secondary)] text-center leading-tight">{n.label}</span>
                      </button>
                      {i < flowNodes.length - 1 && <span className="hidden sm:block h-0.5 w-4 mt-7 border-t-2 border-dashed border-[var(--border-color)] shrink-0" />}
                    </div>
                  ))}
                </div>
                {biggestQueue.n > 0 && (
                  <div className="mt-5 flex gap-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 p-4 text-sm text-[var(--text-secondary)]">
                    <Lightbulb size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <p><b className="text-[var(--text-primary)]">{biggestQueue.name} has the biggest queue.</b> {biggestQueue.n.toLocaleString()} shipment{biggestQueue.n === 1 ? ' is' : 's are'} waiting there.</p>
                  </div>
                )}
              </section>
            </div>
          )}

          {dueSoon.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-5 py-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <AlertCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{dueSoon.length} enquir{dueSoon.length === 1 ? 'y has' : 'ies have'} had no progress for 3+ days</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{cancelsTomorrow > 0 ? `${cancelsTomorrow} will be cancelled automatically within a day. ` : ''}Enquiries with no progress for 5 days move to Cancelled. Quote them, follow up, or cancel with a reason.</p>
                </div>
              </div>
              <Link to="/enquiry-cleanup" className="btn btn-primary min-h-[40px] shrink-0">Review enquiries</Link>
            </div>
          )}
        </>
      )}

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
                className="group relative overflow-hidden glass rounded-2xl p-4 border border-[var(--glass-border)] hover-lift flex items-center gap-3"
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


      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative flex-1 w-full min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400"/>
          <input type="text" placeholder={showBin ? "Search in bin..." : isDOReleaseFilter ? "Search by Ref No, MAWB, Customer..." : isTransportFilter ? "Search by Ref No, Customer..." : "Search by Ref No, Consignee, Shipper, Employee, HAWB, BOE, SB..."} value={search} ref={searchRef} onChange={e=>updateSearch(e.target.value)} className="w-full pl-9 pr-9 py-3 glass border border-[var(--border-color)] rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"/>
          {search ? <button onClick={()=>updateSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={14}/></button> : <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--bg-secondary)] text-[var(--text-muted)]">Ctrl K</kbd>}
        </div>
        {!showBin && (
          <div className="relative flex-shrink-0">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none"/>
            <input
              type="date"
              value={customDate}
              onChange={e=>updateCustomDate(e.target.value)}
              className="w-full sm:w-auto pl-8 pr-3 py-2.5 glass border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm text-[var(--text-primary)]"
              title="View shipments created on a specific date"
            />
          </div>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasFilters && (
            <button onClick={clearAllFilters} className="px-3 py-2.5 glass border border-[var(--border-color)] rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 whitespace-nowrap"><RotateCcw size={14} /> Clear</button>
          )}
          {!showBin && (
            <>
              <button onClick={()=>setShowFilters(!showFilters)} className={`p-2.5 rounded-lg border transition-all flex-shrink-0 ${showFilters?'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400':'glass border-[var(--border-color)] text-[var(--text-secondary)]'}`}><SlidersHorizontal size={15}/></button>
              <button onClick={handleExport} disabled={exporting} className="px-3.5 py-2.5 glass border border-[var(--border-color)] rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 disabled:opacity-50 whitespace-nowrap">{exporting?<RefreshCw size={14} className="animate-spin"/>:<Download size={14}/>}{exporting?'Exporting...':'Export'}</button>
              <div className="relative">
                <button type="button" onClick={() => setViewsOpen(v => !v)} aria-expanded={viewsOpen}
                  title="Save the filters you have set, and bring them back in one click"
                  className="px-3.5 py-2.5 glass border border-[var(--border-color)] rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 whitespace-nowrap">
                  <Bookmark size={14} /> Saved views{savedViews.length > 0 ? ` (${savedViews.length})` : ''}
                </button>
                {viewsOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setViewsOpen(false)} aria-hidden="true" />
                    <div className="absolute right-0 mt-2 w-80 max-w-[90vw] z-40 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-2xl p-3">
                      <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Your saved views</p>
                      {savedViews.length === 0 && <p className="px-1 pb-3 text-xs text-[var(--text-secondary)]">Nothing saved yet. Set the filters you use often (status, customer search, dates), then save them here with a name.</p>}
                      <div className="max-h-56 overflow-y-auto">
                        {savedViews.map(v => (
                          <div key={v.id} className="flex items-center gap-1 rounded-xl hover:bg-[var(--hover-bg)]">
                            <button type="button" onClick={() => applyView(v)} className="flex-1 min-w-0 text-left px-3 py-2 text-sm font-semibold text-[var(--text-primary)] truncate">{v.name}</button>
                            <button type="button" onClick={() => removeView(v.id)} aria-label={`Delete ${v.name}`} title="Delete this saved view" className="p-2 text-[var(--text-muted)] hover:text-red-500"><X size={14} /></button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-3 border-t border-[var(--border-color)]">
                        {hasFilters ? (
                          <div className="flex gap-2">
                            <input value={viewName} onChange={e => setViewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveCurrentView() }} placeholder="Name this view" maxLength={40}
                              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                            <button type="button" onClick={saveCurrentView} className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">Save</button>
                          </div>
                        ) : (
                          <p className="text-xs text-[var(--text-muted)]">To save a new view, first set some filters on the page, then open this again.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {!showBin && defaultVariant && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">View</span>
            <div className="flex glass rounded-xl p-1 border border-[var(--border-color)] overflow-x-auto max-w-full">
              {VIEW_OPTIONS.map(v => (
                <button key={v.key} type="button" onClick={() => changeTableView(v.key)} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${tableView === v.key ? 'bg-indigo-600 text-white shadow' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{v.label}</button>
              ))}
            </div>
            <button type="button" onClick={changeDensity} className="px-3.5 py-2 glass border border-[var(--border-color)] rounded-xl text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5 whitespace-nowrap" title="Switch between roomy and compact rows"><List size={13}/>{density === 'compact' ? 'Compact' : 'Comfortable'}</button>
            <span className="hidden lg:block text-[11px] text-[var(--text-muted)]">Pick a view to show only the columns your role needs</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_STATUS_CHIPS.map(c => (
              <button key={c.l} type="button" onClick={() => updateStatus(c.v === statusFilter ? '' : c.v)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${statusFilter === c.v ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white' : 'glass border-[var(--border-color)] text-[var(--text-secondary)] hover:border-indigo-300'}`}>{c.l}</button>
            ))}
            {dueSoon.length > 0 && <Link to="/enquiry-cleanup" className="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">Quiet 3+ days · {dueSoon.length}</Link>}
          </div>
        </div>
      )}

      {!showBin && showFilters && (
        <div className="flex flex-col gap-3 p-3.5 glass rounded-xl border border-[var(--border-color)] animate-slide-down">
          <div className="flex flex-wrap gap-2">
            <span className="text-[11px] font-semibold text-indigo-400 uppercase flex items-center mr-1"><Filter size={11} className="mr-1"/>Status</span>
            {quickFilters.map(f=>{const I=f.i;const a=statusFilter===f.v;return <button key={f.v} onClick={()=>updateStatus(a?'':f.v)} className={`px-3 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${a?'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg':'glass text-[var(--text-secondary)]'}`}><I size={12}/>{f.l}{a&&<X size={11}/>}</button>})}
          </div>
          {/* ✅ ADVANCED FILTERS (NEW) — date range and employee, both
              COMBINE with status/search/type above rather than being a
              single exclusive view like the stat cards. */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border-color)]">
            <span className="text-[11px] font-semibold text-indigo-400 uppercase flex items-center mr-1"><Calendar size={11} className="mr-1"/>Created</span>
            <input type="date" value={createdFrom} onChange={e=>{setCreatedFrom(e.target.value); setPage(1)}} className="px-2.5 py-1.5 glass border border-[var(--border-color)] rounded-lg text-[11px] text-[var(--text-primary)]" title="Created from"/>
            <span className="text-[11px] text-[var(--text-muted)]">to</span>
            <input type="date" value={createdTo} onChange={e=>{setCreatedTo(e.target.value); setPage(1)}} className="px-2.5 py-1.5 glass border border-[var(--border-color)] rounded-lg text-[11px] text-[var(--text-primary)]" title="Created to"/>
            {(createdFrom || createdTo) && (
              <button onClick={()=>{setCreatedFrom(''); setCreatedTo(''); setPage(1)}} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={13}/></button>
            )}

            <span className="text-[11px] font-semibold text-indigo-400 uppercase flex items-center ml-3 mr-1"><User size={11} className="mr-1"/>Employee</span>
            <select value={employeeId} onChange={e=>{setEmployeeId(e.target.value); setPage(1)}} className="px-2.5 py-1.5 glass border border-[var(--border-color)] rounded-lg text-[11px] text-[var(--text-primary)] bg-transparent max-w-[160px]">
              <option value="">Anyone</option>
              {employeeList.map(emp => <option key={emp.id} value={emp.id}>{emp.name || emp.email}</option>)}
            </select>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-4xl bg-[var(--bg-primary)] border border-indigo-300/60 dark:border-indigo-700/60 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 shadow-2xl">
          <span className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">{selected.length} selected</span>
          <div className="flex flex-wrap gap-2">
            {showBin ? (
              <>
                <button onClick={() => bulkRestoreMutation.mutate(selected)} className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg whitespace-nowrap">
                  <RotateIcon size={13}/> Restore Selected
                </button>
              </>
            ) : (
              <>
                <select value="" disabled={bulkStatusMutation.isPending} className="px-3 py-1.5 border border-indigo-300/60 dark:border-indigo-700/60 rounded-lg text-xs font-semibold bg-[var(--bg-primary)] text-[var(--text-primary)] cursor-pointer disabled:opacity-50" title="Set the status of every selected shipment"
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    if (window.confirm(`Change the status of ${selected.length} shipment(s) to "${prettyStatus(v)}"?${v === 'CANCELLED' ? '\n\nCancelled shipments stay cancelled until you pick a different status.' : ''}`)) bulkStatusMutation.mutate({ ids: selected, status: v })
                  }}>
                  <option value="">{bulkStatusMutation.isPending ? 'Updating…' : 'Change status…'}</option>
                  {BULK_STATUS_VALUES.map((v) => <option key={v} value={v}>{prettyStatus(v)}</option>)}
                </select>
                <button onClick={handleExportForClient} disabled={exportingClient} className="px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg disabled:opacity-50 whitespace-nowrap">
                  {exportingClient ? <RefreshCw size={13} className="animate-spin"/> : <Download size={13}/>} Export for Client
                </button>
                {!showArchived && (
                  <button onClick={() => bulkArchiveMutation.mutate(selected)} className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg whitespace-nowrap">
                    <Archive size={13}/> Archive
                  </button>
                )}
                <button onClick={() => {
                  if (window.confirm(`Move ${selected.length} shipment(s) to bin?`)) {
                    selected.forEach(id => softDeleteMutation.mutate(id))
                    setSelected([])
                  }
                }} className="px-3.5 py-1.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg whitespace-nowrap">
                  <Trash2 size={13}/> Move to Bin
                </button>
              </>
            )}
            <button onClick={()=>setSelected([])} className="px-3.5 py-1.5 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-xs font-semibold whitespace-nowrap">Clear</button>
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
        {/* ── UNIFIED SCROLLABLE TABLE (every device) ──
            One table, always. No separate mobile card layout — on a phone
            you scroll horizontally to reach every column instead of losing
            data to a cut-down view. Checkbox + SL No columns stay sticky on
            the left so you always know which row you're on while scrolling.
            Actions are compact icon buttons so the row stays short.
            ✅ ETD/ETA columns added to the default (Freight/Overview) view. */}
        <div className="glass rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-lg animate-scale-in">
          <div className="overflow-x-auto">
            <table className={`w-full min-w-[1100px] ${density === 'compact' ? '[&_td]:!py-1.5' : ''}`}>
              <thead>
                <tr className={`${showBin ? 'bg-red-50 dark:bg-red-950/40' : 'bg-[var(--bg-secondary)]'}`}>
                  <th className="sticky left-0 z-10 w-9 pl-3 py-2.5 bg-inherit"><input type="checkbox" checked={selected.length===shipments.length&&shipments.length>0} onChange={toggleSelectAll} className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"/></th>
                  <th className="sticky left-9 z-10 text-center px-2 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase w-11 bg-inherit whitespace-nowrap">SL</th>
                  {isDOReleaseFilter ? (
                    <>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Ref No</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">MAWB</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">HAWB</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">CHA Name</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Customer</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Status</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Stage</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Date</th>
                      {showBin && <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase whitespace-nowrap">Deleted By</th>}
                    </>
                  ) : isTransportFilter ? (
                    <>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Vehicle No</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Transport Mode</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Customer</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Weight</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">From</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">To</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Delivery</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Status</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Stage</th>
                      <th className="text-left px-2.5 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Date</th>
                      {showBin && <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase whitespace-nowrap">Deleted By</th>}
                    </>
                  ) : (
                    <>
                      {colOn('ref') && <th className={TABLE_TH}>Ref No</th>}
                      {colOn('mode') && <th className={TABLE_TH}>Mode</th>}
                      {colOn('ie') && <th className={TABLE_TH}>Import/Export</th>}
                      {colOn('consignee') && <th className={TABLE_TH}>Consignee</th>}
                      {colOn('by') && <th className={TABLE_TH}>Created By</th>}
                      {colOn('hawb') && <th className={TABLE_TH}>HAWB</th>}
                      {colOn('sbboe') && <th className={TABLE_TH}>SB/BOE No</th>}
                      {colOn('etd') && <th className={TABLE_TH}>ETD</th>}
                      {colOn('eta') && <th className={TABLE_TH}>ETA</th>}
                      {colOn('status') && <th className={TABLE_TH}>Status</th>}
                      {colOn('stage') && <th className={TABLE_TH}>Stage</th>}
                      {colOn('date') && <th className={TABLE_TH}>Date</th>}
                      {showBin && <th className="text-left px-2.5 py-3 text-[10px] font-bold tracking-wider text-red-500 dark:text-red-400 uppercase whitespace-nowrap">Deleted By</th>}
                    </>
                  )}
                  <th className="text-right pr-3 py-2.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {shipments.map((s, idx)=> { 
                  const slNo = (page - 1) * perPage + idx + 1; 
                  const shownStatus = s.enquiryStale ? 'CANCELLED' : s.currentStatus
                  const dk = dayKey(s.createdAt)
                  const showGroup = defaultVariant && (idx === 0 || dk !== dayKey(shipments[idx - 1].createdAt))
                  const groupCount = shipments.filter(x => dayKey(x.createdAt) === dk).length
                  return (
                    <Fragment key={s.id}>
                    {showGroup && (
                      <tr><td colSpan={groupCols} className="px-4 py-2 bg-[var(--bg-secondary)] text-xs"><b className="text-[var(--text-primary)] mr-2">{dayLabel(s.createdAt)}</b><span className="text-[var(--text-muted)]">{groupCount} on this page</span></td></tr>
                    )}
                    <tr id={`ship-row-${s.id}`} onClick={(e) => onRowClick(e, s, idx)} onDoubleClick={cancelRowOpen} onMouseEnter={(e) => onRowEnter(e, s)} onMouseLeave={scheduleHide} className={`group transition-colors ${showBin ? 'hover:bg-red-50/30 dark:hover:bg-red-900/10' : 'cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10'} ${focusIdx === idx ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : ''}`}>
                      <td style={{ '--ac': toneHex(shownStatus) }} className="sticky left-0 z-10 bg-[var(--bg-primary)] group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-900/10 pl-3 py-3.5 shadow-[inset_3px_0_0_var(--ac)]"><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggleSelect(s.id)} className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"/></td>
                      <td className="sticky left-9 z-10 bg-[var(--bg-primary)] group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-900/10 px-2 py-3.5 text-center text-xs font-semibold text-[var(--text-muted)] whitespace-nowrap">{slNo}</td>
                      {isDOReleaseFilter ? (
                        <>
                          <td className="px-2.5 py-3.5 whitespace-nowrap"><Link to={`/shipment/${s.id}`} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{s.refNo}</Link></td>
                          <td className="px-2.5 py-3.5 text-sm text-[var(--text-primary)] font-medium whitespace-nowrap">{s.freightForwarding?.mawb || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-2.5 py-3.5 text-sm text-[var(--text-primary)] whitespace-nowrap">{s.freightForwarding?.hawb || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-2.5 py-3.5 text-sm text-[var(--text-primary)] whitespace-nowrap">{s.freightForwarding?.agent || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-2.5 py-3.5 text-sm text-[var(--text-primary)] font-medium whitespace-nowrap">{s.freightForwarding?.customerName || <span className="text-[var(--text-muted)]">—</span>}</td>
                        </>
                      ) : isTransportFilter ? (
                        <>
                          <td className="px-2.5 py-3.5 whitespace-nowrap"><Link to={`/shipment/${s.id}`} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{s.refNo}</Link></td>
                          <td className="px-2.5 py-3.5 text-sm text-[var(--text-primary)] font-medium whitespace-nowrap">{s.freightForwarding?.transportMode || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-2.5 py-3.5 text-sm text-[var(--text-primary)] font-medium whitespace-nowrap">{s.freightForwarding?.customerName || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-2.5 py-3.5 text-sm text-[var(--text-primary)] whitespace-nowrap">{s.freightForwarding?.weight ? `${s.freightForwarding.weight} kg` : <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-2.5 py-3.5 text-sm text-[var(--text-primary)] whitespace-nowrap">{s.freightForwarding?.fromLocation || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-2.5 py-3.5 text-sm text-[var(--text-primary)] whitespace-nowrap">{s.freightForwarding?.toLocation || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="px-2.5 py-3.5 text-sm text-[var(--text-secondary)] whitespace-nowrap">{s.freightForwarding?.deliveryDate ? fmtDDMMYYYY(s.freightForwarding.deliveryDate) : <span className="text-[var(--text-muted)]">—</span>}</td>
                        </>
                      ) : (
                        <>
                          {colOn('ref') && (
                            <td className="px-2.5 py-3.5 whitespace-nowrap">
                              <Link to={`/shipment/${s.id}`} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">{hl(s.refNo)}</Link>
                              <HandledBy s={s} />
                            </td>
                          )}
                          {colOn('mode') && <td className="px-2.5 py-3.5 whitespace-nowrap">{s.shipmentType ? <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${getModeBadge(s.shipmentType)}`}>{/^air/i.test(s.shipmentType) ? '✈ ' : /^sea/i.test(s.shipmentType) ? '🚢 ' : ''}{s.shipmentType}</span> : <span className="text-[var(--text-muted)] opacity-50">—</span>}</td>}
                          {colOn('ie') && <td className="px-2.5 py-3.5 whitespace-nowrap">{s.importExport ? <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${getImportExportBadge(s.importExport)}`}>{s.importExport === 'Import' ? '↓ ' : s.importExport === 'Export' ? '↑ ' : ''}{s.importExport}</span> : <span className="text-[var(--text-muted)] opacity-50">—</span>}</td>}
                          {colOn('consignee') && <td className="px-2.5 py-3.5 text-sm text-[var(--text-primary)] font-semibold whitespace-nowrap"><span className="block max-w-[230px] truncate" title={s.freightForwarding?.consigneeName || ''}>{s.freightForwarding?.consigneeName ? hl(titleCase(s.freightForwarding.consigneeName)) : <span className="text-[var(--text-muted)] opacity-50">—</span>}</span></td>}
                          {colOn('by') && <td className="px-2.5 py-3.5 text-xs text-[var(--text-secondary)] whitespace-nowrap">{s.createdByName ? <span className="flex items-center gap-2"><Avatar name={s.createdByName} size={24} /><span className="font-medium">{String(s.createdByName).split(' ')[0]}</span></span> : <span className="text-[var(--text-muted)] opacity-50">—</span>}</td>}
                          {colOn('hawb') && <td className="px-2.5 py-3.5 text-sm text-[var(--text-secondary)] whitespace-nowrap">{s.freightForwarding?.hawb ? hl(s.freightForwarding.hawb) : <span className="text-[var(--text-muted)] opacity-50">—</span>}</td>}
                          {colOn('sbboe') && <td className="px-2.5 py-3.5 text-sm text-[var(--text-secondary)] whitespace-nowrap">{s.shipmentType === 'FF Only' ? (s.cha?.doCollectionDate ? fmtDDMMYYYY(s.cha.doCollectionDate) : <span className="text-[var(--text-muted)] opacity-50">—</span>) : (s.cha?.sbNo || s.cha?.boeNo ? hl(s.cha?.sbNo || s.cha?.boeNo) : <span className="text-[var(--text-muted)] opacity-50">—</span>)}</td>}
                          {colOn('etd') && <td className="px-2.5 py-3.5 text-sm text-[var(--text-secondary)] whitespace-nowrap">{s.freightForwarding?.etd ? fmtDDMMYYYY(s.freightForwarding.etd) : <span className="text-[var(--text-muted)] opacity-50">—</span>}</td>}
                          {colOn('eta') && <td className="px-2.5 py-3.5 text-sm text-[var(--text-secondary)] whitespace-nowrap">{s.freightForwarding?.eta ? fmtDDMMYYYY(s.freightForwarding.eta) : <span className="text-[var(--text-muted)] opacity-50">—</span>}</td>}
                        </>
                      )}
                      {showCol('status') && (
                        <td className="px-2.5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {showBin ? (
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${getStatusBadge(shownStatus)}`}>{String(shownStatus || '').replace(/_/g, ' ')}</span>
                            ) : (
                              <button type="button" onClick={(e) => openStatusMenu(e, s)} title="Click to change the status" className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold hover:brightness-95 ${getStatusBadge(shownStatus)}`}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: toneHex(shownStatus) }} />
                                {String(shownStatus || '').replace(/_/g, ' ')}
                                <span className="opacity-60">▾</span>
                              </button>
                            )}
                            {s.currentStatus === 'ENQUIRY' && !s.enquiryStale && s.enquiryAgeDays >= 2 && <CountdownRing left={Number(s.enquiryDaysLeft) || 0} />}
                            {s.enquiryStale && <span className="text-[10px] text-[var(--text-muted)]">no progress 5 days</span>}
                          </div>
                        </td>
                      )}
                      {showCol('stage') && (
                        <td className="px-2.5 py-3.5 whitespace-nowrap">
                          {s.shipmentStage ? <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${getStageBadge(s.shipmentStage)}`}>{s.shipmentStage}</span> : <span className="text-[var(--text-muted)] opacity-50 text-xs">—</span>}
                          <StepRail step={s.enquiryStale ? 0 : (STEP_OF[s.currentStatus] || 0)} className="mt-1.5 w-28" />
                        </td>
                      )}
                      {showCol('date') && (
                        <td className="px-2.5 py-3.5 text-sm text-[var(--text-secondary)] whitespace-nowrap">{fmtDDMMYYYY(s.createdAt)}<div className="text-[10px] text-[var(--text-muted)]">{agoLabel(s.createdAt)}</div></td>
                      )}
                      {showBin && (
                        <td className="px-2.5 py-3.5 text-xs text-red-600 dark:text-red-400 font-medium whitespace-nowrap">{s.deletedBy || 'Unknown'}</td>
                      )}
                      <td className="pr-3 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {showBin ? (
                            <button onClick={() => restoreMutation.mutate(s.id)} title="Restore" className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md">
                              <RotateIcon size={14}/>
                            </button>
                          ) : (
                            <>
                              <button type="button" onClick={() => { clearHover(); setPeekId(s.id) }} title="Quick view" className="p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-md"><Info size={14}/></button>
                              <button type="button" onClick={() => createSimilar(s.id)} title="Create similar: start a new shipment with this one's customer, route and cargo" className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md"><Copy size={14}/></button>
                              <Link to={buildEditUrl(s.id)} title="Edit" className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md"><Pencil size={14}/></Link>
                              <Link to={`/shipment/${s.id}`} title="View" className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md"><Eye size={14}/></Link>
                              {showArchived ? (
                                <button onClick={()=>unarchiveMutation.mutate(s.id)} title="Restore" className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md"><ArchiveRestore size={14}/></button>
                              ) : (
                                <>
                                  <button onClick={()=>archiveMutation.mutate(s.id)} title="Archive" className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md"><Archive size={14}/></button>
                                  <button onClick={() => {
                                    if (window.confirm(`Move ${s.refNo} to bin?`)) {
                                      softDeleteMutation.mutate(s.id)
                                    }
                                  }} title="Delete" className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md">
                                    <Trash2 size={14}/>
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass rounded-2xl border border-[var(--border-color)] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] flex-wrap justify-center">
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{startItem}-{endItem}</span>
            <span className="text-[var(--text-muted)]">of</span>
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{totalCount.toLocaleString()}</span>
            <select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1)}} className="ml-2 border border-[var(--border-color)] rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-[var(--input-bg)] text-[var(--input-text)]">{PER_PAGE_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={()=>setPage(1)} disabled={page===1} className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 text-[var(--text-secondary)]"><ChevronsLeft size={14}/></button>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 text-[var(--text-secondary)]"><ChevronLeft size={14}/></button>
            {generatePageNumbers(page,totalPages).map((p,i)=>p==='...'?<span key={`gap-${i}`} className="px-1.5 text-[var(--text-muted)] text-xs">...</span>:<button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded-md text-[11px] font-semibold transition-all ${page===p?'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg':'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'}`}>{p}</button>)}
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages||totalPages===0} className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 text-[var(--text-secondary)]"><ChevronRight size={14}/></button>
            <button onClick={()=>setPage(totalPages)} disabled={page===totalPages||totalPages===0} className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 text-[var(--text-secondary)]"><ChevronsRight size={14}/></button>
          </div>
        </div>
      {defaultVariant && !showBin && (
        <p className="hidden lg:flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)] px-1">
          <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] font-semibold">J</kbd> <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] font-semibold">K</kbd> move</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] font-semibold">Space</kbd> peek</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] font-semibold">Enter</kbd> open</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] font-semibold">X</kbd> select</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] font-semibold">Ctrl K</kbd> search</span>
        </p>
      )}
      {selected.length > 0 && <div className="h-20" />}
      </>)}
      </>
      )}

      {/* ── STATUS MENU (inline status change) ── */}
      {statusMenu && (
        <div className="fixed z-50 w-52 max-h-[340px] overflow-y-auto rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-2xl p-2" style={{ top: statusMenu.top, left: statusMenu.left }} onClick={(e) => e.stopPropagation()}>
          <p className="px-2.5 pt-1.5 pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Change status</p>
          {BULK_STATUS_VALUES.map(v => (
            <button key={v} type="button" onClick={() => pickStatus(v)} className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${v === statusMenu.current ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'} ${v === 'CANCELLED' ? 'text-red-600 dark:text-red-400' : ''}`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: toneHex(v) }} />
              {prettyStatus(v)}
              {v === statusMenu.current && <CheckCircle2 size={13} className="ml-auto" />}
            </button>
          ))}
        </div>
      )}

      {/* ── HOVER PREVIEW CARD ──
          Stays open while the cursor is on it, so the details can be selected
          and copied without opening the shipment. Click a value to copy just
          that value, or use "Copy details" for the whole block. */}
      {hover && !peekId && !statusMenu && !showBin && (() => {
        const hs = shipments.find(x => x.id === hover.id)
        if (!hs) return null
        const d = peekData && String(peekData.id) === String(hover.id) ? peekData : null
        const ff = (d && d.freightForwarding) || hs.freightForwarding || {}
        const ch = (d && d.cha) || hs.cha || {}
        const stepN = hs.enquiryStale ? 0 : (STEP_OF[hs.currentStatus] || 0)
        const W = 370
        const left = hover.x + 14 + W > window.innerWidth ? Math.max(8, hover.x - W - 14) : hover.x + 14
        const top = Math.max(8, Math.min(window.innerHeight - 470, hover.rowTop + hover.rowH / 2 - 235))
        const route = [ff.fromLocation, ff.toLocation].filter(Boolean).join(' → ')
        const weight = [ff.grossWeight ? `${ff.grossWeight} kg gross` : '', ff.weight ? `${ff.weight} kg chargeable` : ''].filter(Boolean).join(' · ')
        const facts = [
          ['Customer', ff.customerName], ['Shipper', ff.shipperName], ['Route', route], ['Commodity', ff.commodityName],
          ['Packages', ff.noOfPackages], ['Weight', weight],
          ['HAWB', ff.hawb], ['MAWB', ff.mawb], ['SB / BOE', ch.sbNo || ch.boeNo],
          ['ETD', ff.etd ? fmtDDMMYYYY(ff.etd) : ''], ['ETA', ff.eta ? fmtDDMMYYYY(ff.eta) : ''],
          ['Freight', (hs.freightNames || []).join(', ')], ['Customs', (hs.customsNames || []).join(', ')],
        ].filter(([k, v]) => v || ['HAWB', 'SB / BOE', 'ETD', 'ETA', 'Freight', 'Customs'].includes(k))
        return (
          <div onMouseEnter={cancelHide} onMouseLeave={clearHover} className="fixed z-30 rounded-3xl bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-2xl p-5 flex flex-col gap-3 overflow-y-auto select-text" style={{ top, left, width: W, maxHeight: window.innerHeight - 16 }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-extrabold tracking-tight text-[var(--text-primary)] truncate">{hs.refNo}</p>
                <p className="text-xs text-[var(--text-secondary)] truncate">{[ff.consigneeName ? titleCase(ff.consigneeName) : null, hs.createdByName ? `by ${String(hs.createdByName).split(' ')[0]}` : null].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="shrink-0 flex flex-col gap-1.5">
                <button type="button" onClick={() => copyText(detailsText(hs, d), 'Details')} className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold">Copy details</button>
                <button type="button" onClick={() => createSimilar(hs.id)} className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">Create similar</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {hs.shipmentType && <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${getModeBadge(hs.shipmentType)}`}>{hs.shipmentType}</span>}
              {hs.importExport && <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${getImportExportBadge(hs.importExport)}`}>{hs.importExport}</span>}
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadge(hs.enquiryStale ? 'CANCELLED' : hs.currentStatus)}`}>{String(hs.enquiryStale ? 'CANCELLED' : hs.currentStatus || '').replace(/_/g, ' ')}</span>
              {hs.currentStatus === 'ENQUIRY' && !hs.enquiryStale && hs.enquiryAgeDays >= 2 && <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300">{Number(hs.enquiryDaysLeft) || 0}d left</span>}
            </div>
            <div>
              <StepRail step={stepN} />
              <p className="text-[11px] font-semibold text-[var(--text-secondary)] mt-1.5">{stepN > 0 ? `Step ${stepN} of ${RAIL_STEPS.length} · ${RAIL_STEPS[stepN - 1]}` : 'Not started'}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {facts.map(([k, v]) => (
                <div key={k} className={`min-w-0 ${k === 'Route' || k === 'Commodity' || k === 'Weight' ? 'col-span-2' : ''}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{k}</p>
                  <p onClick={() => v && copyText(v, k)} title={v ? 'Click to copy' : ''} className={`text-xs font-semibold text-[var(--text-primary)] break-words ${v ? 'cursor-copy hover:text-indigo-600 dark:hover:text-indigo-300' : ''}`}>{v || '—'}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--border-color)] pt-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Latest</p>
              {!d && <p className="text-[11px] text-[var(--text-muted)]">Loading…</p>}
              {d && (d.statusHistory || []).length === 0 && <p className="text-[11px] text-[var(--text-muted)]">No history yet.</p>}
              {d && (d.statusHistory || []).slice(0, 3).map((h, i) => (
                <div key={h.id || i} className="flex items-center gap-2 py-0.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: toneHex(h.status) }} />
                  <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{prettyStatus(String(h.status || ''))}</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-auto whitespace-nowrap">{h.createdAt ? new Date(h.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">Click a value to copy it · click the row to open the shipment</p>
          </div>
        )
      })()}

      {/* ── QUICK PEEK PANEL ── */}
      {peekId && !showBin && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setPeekId(null)} />
          <aside role="dialog" aria-label="Shipment quick view" className="fixed z-50 right-3 top-3 bottom-3 w-[calc(100%-1.5rem)] sm:w-[430px] rounded-3xl bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-2xl p-6 flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)] truncate">{peekShip?.refNo || '…'}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{[peekShip?.freightForwarding?.consigneeName ? titleCase(peekShip.freightForwarding.consigneeName) : null, peekShip?.createdAt ? `created ${fmtDDMMYYYY(peekShip.createdAt)}` : null, peekShip?.createdByName ? `by ${String(peekShip.createdByName).split(' ')[0]}` : null].filter(Boolean).join(' · ')}</p>
              </div>
              <button type="button" onClick={() => setPeekId(null)} aria-label="Close" className="w-9 h-9 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] shrink-0"><X size={16} /></button>
            </div>

            {peekShip && (
              <>
                <div className="flex flex-wrap gap-2">
                  {peekShip.shipmentType && <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${getModeBadge(peekShip.shipmentType)}`}>{peekShip.shipmentType}</span>}
                  {peekShip.importExport && <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${getImportExportBadge(peekShip.importExport)}`}>{peekShip.importExport}</span>}
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${getStatusBadge(peekShip.enquiryStale ? 'CANCELLED' : peekShip.currentStatus)}`}>{String(peekShip.enquiryStale ? 'CANCELLED' : peekShip.currentStatus || '').replace(/_/g, ' ')}</span>
                  {peekShip.shipmentStage && <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${getStageBadge(peekShip.shipmentStage)}`}>{peekShip.shipmentStage}</span>}
                </div>

                <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-indigo-600 to-violet-600">
                  <p className="text-xs opacity-85">Progress</p>
                  <div className="flex gap-1 my-2.5">
                    {RAIL_STEPS.map((n, i) => <span key={n} className={`flex-1 h-2 rounded-full ${i < (peekShip.enquiryStale ? 0 : (STEP_OF[peekShip.currentStatus] || 0)) ? 'bg-white' : 'bg-white/30'}`} />)}
                  </div>
                  <p className="text-sm font-bold">{(() => { const n = peekShip.enquiryStale ? 0 : (STEP_OF[peekShip.currentStatus] || 0); return n > 0 ? `Step ${n} of ${RAIL_STEPS.length} · ${RAIL_STEPS[n - 1]}` : 'Not started' })()}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {[
                    ['Freight', (peekShip.freightNames || []).join(', ')],
                    ['Customs', (peekShip.customsNames || []).join(', ')],
                    ['HAWB', (peekData?.freightForwarding || peekShip.freightForwarding)?.hawb],
                    ['SB / BOE', (peekData?.cha || peekShip.cha)?.sbNo || (peekData?.cha || peekShip.cha)?.boeNo],
                    ['ETD', (peekData?.freightForwarding || peekShip.freightForwarding)?.etd ? fmtDDMMYYYY((peekData?.freightForwarding || peekShip.freightForwarding).etd) : ''],
                    ['ETA', (peekData?.freightForwarding || peekShip.freightForwarding)?.eta ? fmtDDMMYYYY((peekData?.freightForwarding || peekShip.freightForwarding).eta) : ''],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{k}</p>
                      <p className="font-semibold text-[var(--text-primary)] break-words">{v || '—'}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="border-t border-[var(--border-color)] pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">History</p>
              {peekLoading && <p className="text-xs text-[var(--text-muted)]">Loading…</p>}
              {peekError && <p className="text-xs text-red-500">Could not load the history.</p>}
              {!peekLoading && !peekError && (peekData?.statusHistory || []).length === 0 && <p className="text-xs text-[var(--text-muted)]">No history yet.</p>}
              {(peekData?.statusHistory || []).slice(0, 8).map((h, i) => (
                <div key={h.id || i} className="flex gap-3 py-1.5">
                  <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: toneHex(h.status) }} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{prettyStatus(String(h.status || ''))}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{[h.createdAt ? new Date(h.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null, h.changedBy].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto grid grid-cols-2 gap-2.5 pt-2">
              <Link to={`/shipment/${peekId}`} className="col-span-2 text-center px-4 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold shadow-lg shadow-orange-500/30">Open full shipment →</Link>
              <button type="button" onClick={() => createSimilar(peekId)} className="col-span-2 px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-sm font-bold flex items-center justify-center gap-2" title="Start a new shipment with this one's customer, route and cargo"><Copy size={15} /> Create similar</button>
              <Link to={buildEditUrl(peekId)} className="text-center px-4 py-2.5 rounded-2xl bg-[var(--bg-secondary)] text-indigo-600 dark:text-indigo-300 text-sm font-bold">Edit</Link>
              {showArchived
                ? <button type="button" onClick={() => { unarchiveMutation.mutate(peekId); setPeekId(null) }} className="px-4 py-2.5 rounded-2xl bg-[var(--bg-secondary)] text-emerald-600 dark:text-emerald-300 text-sm font-bold">Restore</button>
                : <button type="button" onClick={() => { archiveMutation.mutate(peekId); setPeekId(null) }} className="px-4 py-2.5 rounded-2xl bg-[var(--bg-secondary)] text-indigo-600 dark:text-indigo-300 text-sm font-bold">Archive</button>}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
function generatePageNumbers(c,t){if(t<=7)return Array.from({length:t},(_,i)=>i+1);if(c<=3)return[1,2,3,4,5,'...',t];if(c>=t-2)return[1,'...',t-4,t-3,t-2,t-1,t];return[1,'...',c-1,c,c+1,'...',t]}