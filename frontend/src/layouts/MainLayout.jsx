import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Menu, X, LogOut, ChevronDown, ChevronLeft, ChevronRight, Moon, Sun, Bell, CheckCheck,
  Ship, FileCheck, Truck, ClipboardList, FileText, BarChart3, FileUp, Receipt, Hash, Mail,
  FileSpreadsheet, ExternalLink, Layers, Users, Shield, BarChart2, TrendingUp, BellRing, Plus,
  RefreshCw, WifiOff, CheckCircle2, Upload, Banknote, Search, Star, CornerDownLeft
} from 'lucide-react'
import AdminWelcomeBanner from '../components/AdminWelcomeBanner'
import api, { onNetworkStatusChange } from '../lib/api'
import { useSocket } from '../App'
import { useToast } from '../components/Toast'

const GROUPS_KEY = 'pas_nav_groups'
const COLLAPSED_KEY = 'pas_sidebar_collapsed'
const DARK_KEY = 'pas_dark_mode'
const PINS_KEY = 'pas_nav_pins'
const DEFAULT_PINS = ['/', '/enquiry-cleanup']
const DEFAULT_GROUPS = { overview: true, team: true, modules: true, refs: true, more: false, tools: true }

// Icon tile colours for the module and reference-group links. Soft tints on the light
// sidebar, and the original glassy tints when dark mode is on.
const TINTS = {
  violet: 'bg-violet-500/15 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300',
  indigo: 'bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/25 dark:text-indigo-200',
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300',
  sky: 'bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300',
  teal: 'bg-teal-500/15 text-teal-600 dark:bg-teal-500/20 dark:text-teal-300',
}
const DOTS = { amber: 'bg-amber-400', teal: 'bg-teal-400', indigo: 'bg-indigo-400', rose: 'bg-rose-400' }

const TOOL_LINKS = [
  { url: 'https://pasfreight-mailer.onrender.com', icon: Mail, label: 'Bulk Emailing' },
  { url: 'https://pas-freight-quotation.vercel.app/', icon: FileSpreadsheet, label: 'Quotation Generator' },
  { url: 'https://can-fc-pasfreightservices.vercel.app/', icon: FileCheck, label: 'CAN & FC Certificates' },
]

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw
  } catch {
    return fallback
  }
}

function writeStored(key, value) {
  try { localStorage.setItem(key, value) } catch { /* private mode or full storage: the setting just won't persist */ }
}

function readPins() {
  try {
    const parsed = JSON.parse(readStored(PINS_KEY, 'null'))
    return Array.isArray(parsed) ? parsed : DEFAULT_PINS
  } catch {
    return DEFAULT_PINS
  }
}

// 1432 -> "1.4k", so a big number still fits in a small badge.
function shortCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

function readGroups() {
  try {
    return { ...DEFAULT_GROUPS, ...JSON.parse(readStored(GROUPS_KEY, '{}')) }
  } catch {
    return DEFAULT_GROUPS
  }
}

// Admins see every shipment on the home page, everyone else sees their own.
// The menu is the same for both apart from this first group.
function buildGroups(isAdmin) {
  const overview = isAdmin
    ? [
        { path: '/', icon: LayoutDashboard, label: 'All Shipments' },
        { path: '/enquiry-cleanup', icon: ClipboardList, label: 'Enquiry Clean-up' },
        { path: '/analytics', icon: BarChart3, label: 'Analytics' },
      ]
    : [
        { path: '/', icon: LayoutDashboard, label: 'My Shipments' },
        { path: '/overview', icon: Layers, label: 'Overview' },
        { path: '/enquiry-cleanup', icon: ClipboardList, label: 'Enquiry Clean-up' },
        { path: '/analytics', icon: BarChart3, label: 'Analytics' },
      ]

  return [
    { id: 'overview', label: 'Overview', items: overview },
    {
      id: 'team', label: 'Team', items: [
        { path: '/team', icon: Users, label: 'Team' },
        { path: '/daily-report', icon: BarChart2, label: 'Daily Report' },
        { path: '/team-performance', icon: TrendingUp, label: 'Team Performance' },
        { path: '/reminders', icon: BellRing, label: 'Reminders' },
        ...(isAdmin ? [{ path: '/conversion-report', icon: TrendingUp, label: 'Conversion Report' }] : []),
      ],
    },
    {
      id: 'modules', label: 'Modules', items: [
        { path: '/ff-only', icon: FileText, label: 'FF Only', tint: 'violet' },
        { path: '/freight', icon: Ship, label: 'Freight', tint: 'indigo' },
        { path: '/cha', icon: FileCheck, label: 'CHA', tint: 'emerald' },
        { path: '/transport', icon: Truck, label: 'Transport', tint: 'sky' },
        { path: '/do-release', icon: ClipboardList, label: 'DO Release', tint: 'teal' },
      ],
    },
    {
      id: 'refs', label: 'Reference Groups', items: [
        { path: '/rl', icon: Hash, code: 'RL', sub: 'RLI / RLE', dot: 'amber', label: 'RL (RLI / RLE)' },
        { path: '/pp', icon: Hash, code: 'PP', sub: 'PPI / PPE', dot: 'teal', label: 'PP (PPI / PPE)' },
        { path: '/sp', icon: Hash, code: 'SP', sub: 'SPI / SPE', dot: 'indigo', label: 'SP (SPI / SPE)' },
        { path: '/jd', icon: Hash, code: 'JD', sub: 'JDI / JDE', dot: 'rose', label: 'JD (JDI / JDE)' },
      ],
    },
    {
      id: 'more', label: 'Insights & Actions', items: [
        { path: '/reference-codes', icon: Hash, label: 'Reference Codes' },
        { path: '/employee-stats', icon: Users, label: 'Employee Stats' },
        { path: '/checklist-scanner', icon: FileUp, label: 'Checklist Scanner' },
        { path: '/delivery-challan', icon: Receipt, label: 'Delivery Challan' },
      ],
    },
    { id: 'tools', label: 'Tools', external: true, items: TOOL_LINKS },
  ]
}

function pathMatches(pathname, path) {
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

// Icon and tint for each kind of notification the server sends.
const NOTIF_STYLES = {
  AWB: { icon: FileText, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300' },
  BOE: { icon: FileCheck, tone: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300' },
  INVOICE: { icon: Banknote, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300' },
  DELIVERED: { icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' },
  STATUS: { icon: RefreshCw, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300' },
  SB: { icon: Upload, tone: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' },
}
const NOTIF_DEFAULT = { icon: Bell, tone: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300' }

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// Wraps the part of a label that matches what was typed in the search palette.
function Hl({ text, q }) {
  const at = q ? String(text).toLowerCase().indexOf(q.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-yellow-200 text-inherit rounded px-0.5 dark:bg-yellow-400/30">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  )
}

// The logo image, with a plain text fallback so the menu never shows a broken picture.
function Logo({ alt = '', className = '', textClass = '' }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className="text-lg font-extrabold tracking-tight text-[var(--brand-indigo)] leading-none whitespace-nowrap">
        PAS<span className={`text-[var(--accent)] ${textClass}`}> Freight</span>
      </span>
    )
  }
  return <img src="/pas-logo.png" alt={alt} onError={() => setFailed(true)} className={className} />
}

export default function MainLayout({ user }) {
  const location = useLocation()
  const navigate = useNavigate()
  const socket = useSocket()
  const { addToast } = useToast()
  const pathname = location.pathname

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [darkMode, setDarkMode] = useState(() => readStored(DARK_KEY, 'false') === 'true')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStored(COLLAPSED_KEY, 'false') === 'true')
  const [openGroups, setOpenGroups] = useState(readGroups)
  const [keyboardUp, setKeyboardUp] = useState(false)
  const [pins, setPins] = useState(readPins)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const paletteInputRef = useRef(null)
  const notifRef = useRef(null)
  const userRef = useRef(null)

  const isAdmin = user?.role === 'ADMIN'
  const groups = useMemo(() => buildGroups(isAdmin), [isAdmin])

  const displayName = user?.name || user?.email?.split('@')[0] || 'User'
  const userInitial = displayName.charAt(0).toUpperCase()

  useEffect(() => { writeStored(COLLAPSED_KEY, sidebarCollapsed) }, [sidebarCollapsed])
  useEffect(() => { writeStored(GROUPS_KEY, JSON.stringify(openGroups)) }, [openGroups])
  useEffect(() => { writeStored(PINS_KEY, JSON.stringify(pins)) }, [pins])

  // Counts shown on the menu. Both are cheap calls the dashboard already makes,
  // and the stale-enquiries one shares its cache with the dashboard's banner.
  const scope = isAdmin ? 'all' : 'mine'
  const { data: shipmentTotal } = useQuery({
    queryKey: ['nav-shipment-total', scope],
    queryFn: async () => {
      const params = { isArchived: 'false', ...(isAdmin ? {} : { mine: 'true' }) }
      const res = await api.get('/freight/shipments/stats', { params })
      return res.data?.data?.total ?? null
    },
    staleTime: 120000, refetchInterval: 300000, refetchOnWindowFocus: false, retry: false,
  })
  const { data: staleList } = useQuery({
    queryKey: ['stale-enquiries', scope],
    queryFn: async () => {
      const res = await api.get('/freight/shipments/stale-enquiries', { params: isAdmin ? {} : { mine: 'true' } })
      return res.data?.data || []
    },
    staleTime: 120000, refetchOnWindowFocus: false, retry: false,
  })
  const badgeFor = (path) => {
    if (path === '/' && shipmentTotal > 0) return { n: shipmentTotal, tone: 'bg-orange-500 text-white' }
    if (path === '/enquiry-cleanup' && staleList?.length > 0) return { n: staleList.length, tone: 'bg-rose-500 text-white' }
    return null
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    writeStored(DARK_KEY, darkMode)
  }, [darkMode])

  // The side menu on a phone covers the page, so the page behind it should not scroll.
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  // While someone is typing on a phone the keyboard takes half the screen, so the
  // bottom menu steps aside instead of sitting on top of the field being filled in.
  useEffect(() => {
    let timer = null
    const isField = (el) => el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
    const onFocusIn = (e) => {
      clearTimeout(timer)
      if (isField(e.target)) setKeyboardUp(true)
    }
    const onFocusOut = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setKeyboardUp(false), 150)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  // Slow network / offline banner. It subscribes to the live speed tracking in
  // lib/api.js and never blocks anything: people keep working, they just know
  // to expect things to take longer.
  const [networkStatus, setNetworkStatus] = useState({ isSlow: false, isOffline: false })
  useEffect(() => {
    const unsubscribe = onNetworkStatusChange(setNetworkStatus)
    return unsubscribe
  }, [])

  // New version banner. After a deploy, anyone who already has the app open
  // keeps running the old JavaScript until they reload. Every 5 minutes this
  // fetches the live index.html and compares it with the one this session
  // started with. If they differ, a deploy has happened.
  const [updateAvailable, setUpdateAvailable] = useState(false)
  useEffect(() => {
    let initialHtml = null
    const checkForUpdate = async () => {
      try {
        const res = await fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' })
        const html = await res.text()
        if (initialHtml === null) {
          initialHtml = html
        } else if (html !== initialHtml) {
          setUpdateAvailable(true)
        }
      } catch (e) { /* offline or a failed check: try again at the next interval */ }
    }
    checkForUpdate()
    const interval = setInterval(checkForUpdate, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Notification sound. Browsers only let an AudioContext play after a real tap
  // or click, and a new context per notification would stay silent, so one
  // context is created on first use, reused, and resumed if the browser paused it.
  const audioCtxRef = useRef(null)
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioCtxRef.current
  }

  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioCtx()
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
    document.addEventListener('click', unlock)
    document.addEventListener('touchstart', unlock)
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
  }, [])

  // A soft two-note chime.
  const playSound = () => {
    try {
      const ctx = getAudioCtx()
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})

      const playTone = (freq, startTime, duration, volume) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq
        osc.type = 'sine'
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(volume, startTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
        osc.start(startTime)
        osc.stop(startTime + duration)
      }

      const now = ctx.currentTime
      playTone(880, now, 0.18, 0.15)
      playTone(1108.73, now + 0.12, 0.25, 0.13)
    } catch (e) { /* no audio support: the toast still appears */ }
  }

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications?limit=20')
      setNotifications(res.data.data || [])
    } catch (e) { /* the bell just stays empty until the next load */ }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  useEffect(() => {
    if (!socket) return
    const handleNewNotification = (data) => {
      setNotifications(prev => [{ ...data, id: Date.now().toString(), isRead: false, createdAt: new Date().toISOString() }, ...prev])
      playSound()
      addToast(data.message, 'info')
    }
    socket.on('notification:new', handleNewNotification)
    return () => socket.off('notification:new', handleNewNotification)
  }, [socket, addToast])

  // Close the bell and the user menu on an outside tap or the Escape key.
  useEffect(() => {
    const onPointerDown = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      setNotifOpen(false)
      setUserMenuOpen(false)
      setSidebarOpen(false)
      setPaletteOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  // Ctrl+K / Cmd+K opens the search palette. It runs first (capture phase) so it
  // takes over from the dashboard's own Ctrl+K, which the palette now covers.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setPaletteOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    if (!paletteOpen) return
    setPaletteQuery('')
    setPaletteIndex(0)
    const t = setTimeout(() => paletteInputRef.current && paletteInputRef.current.focus(), 30)
    return () => clearTimeout(t)
  }, [paletteOpen])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(paletteQuery.trim()), 250)
    return () => clearTimeout(t)
  }, [paletteQuery])

  const { data: shipmentHits } = useQuery({
    queryKey: ['nav-palette-shipments', scope, debouncedQuery],
    queryFn: async () => {
      const params = { search: debouncedQuery, limit: 5, page: 1, isArchived: 'false', ...(isAdmin ? {} : { mine: 'true' }) }
      const res = await api.get('/freight/shipments', { params })
      return res.data?.data || []
    },
    enabled: paletteOpen && debouncedQuery.length >= 2,
    staleTime: 30000, retry: false, refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  })

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
  const markAsRead = (notifId, shipmentId) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n))
    setNotifOpen(false)
    if (shipmentId) navigate(`/shipment/${shipmentId}`)
  }
  const unreadCount = notifications.filter(n => !n.isRead).length

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch (e) { /* sign out locally even if the server call fails */ }
    // So the Welcome banner shows again at the next login.
    try { Object.keys(sessionStorage).filter((k) => k.startsWith('pas_welcome_')).forEach((k) => sessionStorage.removeItem(k)) } catch (e) { /* ignore */ }
    localStorage.removeItem('pas_token')
    delete api.defaults.headers.common['Authorization']
    navigate('/login')
  }

  const toggleGroup = (id) => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))
  const closeSidebar = () => setSidebarOpen(false)

  const toggleGroupPin = (path) => setPins(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path])

  const allPages = useMemo(
    () => groups.filter(g => !g.external).flatMap(g => g.items.map(it => ({ ...it, groupLabel: g.label }))),
    [groups]
  )
  const pinnedItems = pins.map(p => allPages.find(it => it.path === p)).filter(Boolean)

  // What the palette shows: pages, shipments and a few actions, in that order.
  const paletteSections = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase()
    const matches = (text) => !q || text.toLowerCase().includes(q)
    const rank = (a, b) => a.label.toLowerCase().indexOf(q) - b.label.toLowerCase().indexOf(q)

    let pages = allPages
      .filter(it => matches(`${it.label} ${it.groupLabel}`))
      .map(it => ({ key: `page-${it.path}`, kind: 'page', label: it.label, sub: it.groupLabel, icon: it.icon, tint: it.tint, run: () => navigate(it.path) }))
    let tools = TOOL_LINKS
      .filter(it => matches(it.label))
      .map(it => ({ key: `tool-${it.url}`, kind: 'tool', label: it.label, sub: 'Opens in a new tab', icon: it.icon, run: () => window.open(it.url, '_blank', 'noopener,noreferrer') }))
    if (q) pages = [...pages].sort(rank)

    const ships = (debouncedQuery.length >= 2 && q.length >= 2 ? shipmentHits || [] : []).map(s => {
      const ff = s.freightForwarding || {}
      const who = ff.consigneeName || ff.customerName || ff.shipperName || ''
      return {
        key: `ship-${s.id}`, kind: 'ship', label: s.refNo, sub: [who, String(s.currentStatus || s.status || '').replace(/_/g, ' ').toLowerCase()].filter(Boolean).join(' · '),
        right: [s.shipmentType, s.importExport].filter(Boolean).join(' · '), icon: Ship, run: () => navigate(`/shipment/${s.id}`),
      }
    })

    const actions = [
      { key: 'act-new', kind: 'action', label: 'New shipment', sub: 'Start a new enquiry', icon: Plus, run: () => navigate('/create') },
      { key: 'act-dark', kind: 'action', label: darkMode ? 'Switch to light mode' : 'Switch to dark mode', sub: 'Appearance', icon: darkMode ? Sun : Moon, run: () => setDarkMode(v => !v) },
    ].filter(a => matches(`${a.label} ${a.sub}`))

    return [
      { title: 'Pages', items: [...pages, ...tools] },
      { title: 'Shipments', items: ships },
      { title: 'Actions', items: actions },
    ].filter(s => s.items.length > 0)
  }, [paletteQuery, debouncedQuery, allPages, shipmentHits, darkMode, navigate])

  const paletteFlat = useMemo(() => paletteSections.flatMap(s => s.items), [paletteSections])
  const activeEntry = paletteFlat[Math.min(paletteIndex, Math.max(paletteFlat.length - 1, 0))]

  const runEntry = (entry) => {
    if (!entry) return
    setPaletteOpen(false)
    closeSidebar()
    entry.run()
  }

  const onPaletteKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIndex(i => Math.min(i + 1, paletteFlat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); runEntry(activeEntry) }
    else if (e.key === 'Escape') { e.preventDefault(); setPaletteOpen(false) }
  }

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!paletteOpen) return
    const el = document.querySelector('[data-palette-active="true"]')
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
  }, [paletteIndex, paletteOpen, paletteFlat.length])

  // Breadcrumb for the top bar: where the person is, in two steps.
  const crumbs = useMemo(() => {
    if (pathname.startsWith('/shipment/')) {
      return [{ label: isAdmin ? 'All Shipments' : 'My Shipments', to: '/' }, { label: 'Shipment details' }]
    }
    if (pathname === '/create') return [{ label: 'Actions' }, { label: 'New Shipment' }]
    for (const group of groups) {
      if (group.external) continue
      const item = group.items.find((it) => pathMatches(pathname, it.path))
      if (item) return [{ label: group.label }, { label: item.label }]
    }
    return [{ label: 'PAS Freight' }]
  }, [pathname, groups, isAdmin])
  const pageLabel = crumbs[crumbs.length - 1].label

  const rail = sidebarCollapsed
  const hideInRail = rail ? 'lg:hidden' : ''

  const renderItem = (item, keyPrefix = '') => {
    const Icon = item.icon
    const active = pathMatches(pathname, item.path)
    const badge = badgeFor(item.path)
    const pinned = pins.includes(item.path)
    const tile = active
      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 dark:shadow-indigo-900/50'
      : (TINTS[item.tint] || 'bg-indigo-500/10 text-indigo-600 dark:bg-white/10 dark:text-indigo-200')
    return (
      <div key={`${keyPrefix}${item.path}`} className="group relative">
        <Link to={item.path} onClick={closeSidebar} title={rail ? item.label : undefined}
          aria-current={active ? 'page' : undefined}
          className={`relative flex items-center gap-3 min-h-[46px] lg:min-h-[42px] px-2 rounded-xl text-[15px] lg:text-sm transition-colors ${rail ? 'lg:justify-center lg:px-0' : ''} ${active
            ? 'bg-gradient-to-r from-indigo-100 to-indigo-50 text-[#12163A] font-semibold ring-1 ring-inset ring-indigo-200/70 dark:from-indigo-500/40 dark:to-indigo-500/10 dark:text-white dark:ring-indigo-400/30'
            : 'text-[#4B5280] hover:bg-indigo-500/[0.07] hover:text-[#12163A] font-medium dark:text-indigo-100/80 dark:hover:bg-white/[0.07] dark:hover:text-white'}`}>
          {active && <span className={`absolute -left-3 ${rail ? 'lg:-left-2' : ''} inset-y-2.5 w-1 rounded-r bg-orange-500`} />}
          <span className={`w-8 h-8 lg:w-7 lg:h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${tile}`}>
            <Icon size={16} strokeWidth={active ? 2.4 : 2} />
          </span>
          <span className={`flex-1 truncate ${hideInRail}`}>{item.label}</span>
          {badge && (
            <>
              <span className={`${hideInRail} min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center lg:group-hover:opacity-0 ${badge.tone}`}>{shortCount(badge.n)}</span>
              {rail && <span className={`hidden lg:flex absolute top-0 right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold items-center justify-center ring-2 ring-white dark:ring-[#141A4A] ${badge.tone}`}>{shortCount(badge.n)}</span>}
            </>
          )}
        </Link>
        {!rail && (
          <button type="button" onClick={() => toggleGroupPin(item.path)}
            aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`} aria-pressed={pinned}
            title={pinned ? 'Unpin' : 'Pin to top'}
            className={`hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 items-center justify-center rounded-lg hover:bg-indigo-500/10 dark:hover:bg-white/10 focus:opacity-100 ${pinned ? 'text-amber-500 dark:text-amber-400 opacity-0 group-hover:opacity-100' : 'text-[#8A90B8] dark:text-indigo-200/70 opacity-0 group-hover:opacity-100'}`}>
            <Star size={14} fill={pinned ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
    )
  }

  const renderRefTile = (item) => {
    const active = pathMatches(pathname, item.path)
    return (
      <Link key={item.path} to={item.path} onClick={closeSidebar} title={rail ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={`rounded-xl px-3 py-2.5 flex flex-col gap-0.5 transition-colors ${rail ? 'lg:items-center lg:px-0 lg:py-2' : ''} ${active ? 'bg-indigo-100 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-500/30 dark:ring-indigo-400/40' : 'bg-white/80 ring-1 ring-inset ring-[#E4E7F7] hover:bg-white dark:bg-white/[0.06] dark:ring-0 dark:hover:bg-white/10'}`}>
        <span className="flex items-center gap-2 text-[15px] font-bold text-[#12163A] dark:text-white">
          <span className={`w-2 h-2 rounded-full ${DOTS[item.dot]}`} />{item.code}
        </span>
        <span className={`text-[10.5px] text-[#8A90B8] dark:text-indigo-200/60 ${hideInRail}`}>{item.sub}</span>
      </Link>
    )
  }

  const renderTools = (items) => (
    <div className={`grid grid-cols-3 gap-2 px-1 ${rail ? 'lg:grid-cols-1 lg:px-0' : ''}`}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" title={item.label} aria-label={`${item.label} (opens in a new tab)`}
            className="relative flex items-center justify-center h-11 rounded-xl bg-white/80 ring-1 ring-inset ring-[#E4E7F7] hover:bg-white text-indigo-600 dark:bg-white/[0.06] dark:ring-0 dark:hover:bg-white/10 dark:text-indigo-100">
            <Icon size={18} />
            <ExternalLink size={9} className="absolute top-1.5 right-1.5 text-[#8A90B8] dark:text-indigo-200/50" />
          </a>
        )
      })}
    </div>
  )

  const bottomTabs = [
    { path: '/', icon: LayoutDashboard, label: 'Home' },
    { path: '/reminders', icon: BellRing, label: 'Reminders' },
    { path: '/create', icon: Plus, label: 'New shipment', primary: true },
    { path: '/team', icon: Users, label: 'Team' },
  ]

  const bell = (
    <div className="relative" ref={notifRef}>
      <button
        onClick={() => setNotifOpen(v => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={notifOpen}
        className="relative w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-[var(--bg-primary)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {notifOpen && (
        <div role="dialog" aria-label="Notifications"
          className="fixed lg:absolute inset-x-3 lg:inset-x-auto top-[60px] lg:top-full lg:right-0 lg:mt-2 lg:w-[380px] bg-[var(--bg-primary)] rounded-xl shadow-xl border border-[var(--border-color)] z-50 overflow-hidden animate-scale-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-[var(--brand-indigo)] flex items-center gap-1 font-semibold hover:underline">
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[min(420px,70vh)] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell size={26} className="text-[var(--text-muted)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-muted)]">No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => {
                const style = NOTIF_STYLES[n.type] || NOTIF_DEFAULT
                const NIcon = style.icon
                return (
                  <button key={n.id} onClick={() => markAsRead(n.id, n.shipmentId)}
                    className={`w-full text-left px-4 py-3 border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--hover-bg)] flex gap-3 ${!n.isRead ? 'bg-[var(--nav-active-bg)]/60' : ''}`}>
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${style.tone}`}><NIcon size={16} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{n.title}</p>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0" />}
                      </div>
                      <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-[var(--bg-primary)] focus:text-[var(--text-primary)] focus:shadow-lg">
        Skip to content
      </a>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeSidebar} aria-hidden="true" />
      )}

      <aside
        aria-label="Main menu"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-[290px] max-w-[86vw] ${rail ? 'lg:w-[80px]' : 'lg:w-[280px]'} bg-gradient-to-b from-white via-[#F3F4FF] to-[#E9ECFF] text-[#4B5280] border-r border-[#E4E7F7] dark:from-[#0E1236] dark:via-[#0E1236] dark:to-[#141A4A] dark:text-indigo-100 dark:border-white/5 transition-transform duration-200 lg:transition-none lg:translate-x-0 ${sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
      >
        <div className={`flex-shrink-0 h-16 flex items-center justify-between px-4 ${rail ? 'lg:justify-center lg:px-2' : ''}`}>
          <Link to="/" onClick={closeSidebar} aria-label="PAS Freight Services, home" className="flex items-center rounded-xl bg-white px-2 py-1 shadow-md shadow-indigo-500/10 ring-1 ring-[#E4E7F7] dark:shadow-lg dark:shadow-black/20 dark:ring-0">
            <Logo alt="PAS Freight Services" className={`h-9 w-auto ${rail ? 'lg:h-7' : ''}`} textClass={hideInRail} />
          </Link>
          <button onClick={closeSidebar} aria-label="Close menu" className="lg:hidden w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-[#4B5280] hover:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          aria-label={rail ? 'Expand menu' : 'Collapse menu'}
          title={rail ? 'Expand menu' : 'Collapse menu'}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-[#E4E7F7] dark:bg-[#141A4A] dark:border-white/15 shadow-sm items-center justify-center text-[#6B72A8] hover:text-indigo-600 dark:text-indigo-200 dark:hover:text-white z-10"
        >
          {rail ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className={`flex-shrink-0 px-3 pb-2 ${rail ? 'lg:px-2' : ''}`}>
          <button onClick={() => setPaletteOpen(true)} title={rail ? 'Search (Ctrl K)' : undefined} aria-label="Search pages and shipments"
            className={`w-full flex items-center gap-2.5 h-11 px-3.5 rounded-xl bg-white border border-[#E4E7F7] text-[#8A90B8] shadow-sm shadow-indigo-500/5 dark:bg-white/[0.07] dark:border-white/10 dark:text-indigo-200/70 dark:shadow-none text-sm hover:border-indigo-300 dark:hover:bg-white/10 ${rail ? 'lg:justify-center lg:px-0' : ''}`}>
            <Search size={16} className="flex-shrink-0" />
            <span className={`flex-1 text-left truncate ${hideInRail}`}>Jump to a page or shipment</span>
            <kbd className={`text-[10.5px] font-bold rounded-md bg-[#F0F2FB] text-[#4B5280] dark:bg-white/10 dark:text-indigo-100/80 px-1.5 py-0.5 hidden lg:block ${hideInRail}`}>Ctrl K</kbd>
          </button>
          <Link to="/create" onClick={closeSidebar}
            className="lg:hidden mt-2 flex items-center justify-center gap-2 h-11 rounded-xl bg-orange-500 text-white text-sm font-bold shadow-lg shadow-orange-500/30">
            <Plus size={18} strokeWidth={2.5} /> New Shipment
          </Link>
        </div>

        <nav className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(79,70,229,0.22)_transparent] dark:[scrollbar-color:rgba(255,255,255,0.18)_transparent] ${rail ? 'lg:px-2' : ''}`}>
          {pinnedItems.length > 0 && (
            <div className={`mb-1 ${rail ? 'lg:hidden' : ''}`}>
              <div className="px-2 h-8 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#8A90B8] dark:text-[#7B82B8]">
                <span>Pinned</span>
                <Star size={11} className="text-amber-400" fill="currentColor" />
              </div>
              <div className="space-y-0.5">{pinnedItems.map((item) => renderItem(item, 'pin-'))}</div>
            </div>
          )}

          {groups.map((group, index) => {
            const hasActive = !group.external && group.items.some((it) => pathMatches(pathname, it.path))
            const expanded = openGroups[group.id] || hasActive
            return (
              <div key={group.id} className="mt-1">
                {rail && index > 0 && <div className="hidden lg:block h-px bg-[#E4E7F7] dark:bg-white/10 my-2" />}
                <button
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={expanded}
                  className={`w-full flex items-center justify-between px-2 h-9 rounded-md text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#8A90B8] hover:text-[#12163A] dark:text-[#7B82B8] dark:hover:text-white ${hideInRail}`}
                >
                  <span>{group.label}</span>
                  <ChevronDown size={14} className={`transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />
                </button>
                <div className={`${expanded ? '' : `hidden ${rail ? 'lg:block' : ''}`}`}>
                  {group.external
                    ? renderTools(group.items)
                    : group.id === 'refs'
                      ? <div className={`grid grid-cols-2 gap-2 px-1 ${rail ? 'lg:grid-cols-1 lg:px-0' : ''}`}>{group.items.map(renderRefTile)}</div>
                      : <div className="space-y-0.5">{group.items.map((item) => renderItem(item))}</div>}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="flex-shrink-0 p-3 border-t border-[#E4E7F7] dark:border-white/10">
          <div className={`flex items-center gap-3 rounded-2xl bg-white ring-1 ring-[#E4E7F7] shadow-sm shadow-indigo-500/5 dark:bg-white/[0.07] dark:ring-0 dark:shadow-none p-2.5 ${rail ? 'lg:flex-col lg:gap-2 lg:p-2' : ''}`}>
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-sm font-bold">{userInitial}</div>
              <span className="absolute right-0 bottom-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-[#141A4A]" />
            </div>
            <div className={`flex-1 min-w-0 ${hideInRail}`}>
              <p className="text-sm font-semibold text-[#12163A] dark:text-white truncate">{displayName}</p>
              <p className="text-xs text-[#8A90B8] dark:text-indigo-200/60 truncate flex items-center gap-1">
                {isAdmin && <Shield size={11} className="text-orange-400 flex-shrink-0" aria-hidden="true" />}
                {isAdmin ? 'Administrator' : 'Team member'}
              </p>
            </div>
            <div className={`flex gap-1.5 ${rail ? 'lg:flex-col' : ''}`}>
              <button onClick={() => setDarkMode(v => !v)} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} title={darkMode ? 'Light mode' : 'Dark mode'}
                className="w-9 h-9 rounded-lg bg-[#F0F2FB] hover:bg-[#E4E7F7] text-[#4B5280] dark:bg-white/10 dark:hover:bg-white/20 dark:text-indigo-100 flex items-center justify-center">
                {darkMode ? <Sun size={16} className="text-amber-300" /> : <Moon size={16} />}
              </button>
              <button onClick={handleLogout} aria-label="Sign out" title="Sign out"
                className="w-9 h-9 rounded-lg bg-[#F0F2FB] text-[#4B5280] hover:bg-rose-500 hover:text-white dark:bg-white/10 dark:hover:bg-rose-500/80 dark:text-indigo-100 flex items-center justify-center">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className={rail ? 'lg:ml-[80px]' : 'lg:ml-[280px]'}>
        <div className="sticky top-0 z-30">
          {updateAvailable && (
            <div role="status" className="px-4 py-2 text-center text-sm font-medium text-white bg-indigo-600 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-2"><RefreshCw size={14} /> A new version of PAS Freight is available</span>
              <button onClick={() => window.location.reload()} className="px-3 py-0.5 bg-[var(--accent)] text-[var(--on-accent)] rounded-full text-xs font-semibold hover:bg-[var(--accent-hover)]">
                Refresh now
              </button>
            </div>
          )}
          {networkStatus.isOffline && (
            <div role="alert" className="px-4 py-2 text-center text-sm font-medium text-white bg-red-600 flex items-center justify-center gap-2">
              <WifiOff size={14} /> You're offline. Changes won't save until your connection is back
            </div>
          )}
          {!networkStatus.isOffline && networkStatus.isSlow && (
            <div role="status" className="px-4 py-2 text-center text-sm font-medium bg-amber-50 text-amber-900 border-b border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30">
              Loading is a little slower than usual right now. Your work is safe, no need to refresh.
            </div>
          )}

          <header className="h-14 lg:h-16 flex items-center justify-between gap-3 px-3 lg:px-8 bg-[var(--bg-primary)] border-b border-[var(--border-color)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link to="/" className="lg:hidden flex-shrink-0 rounded-md dark:bg-white dark:px-1 dark:py-0.5" aria-label="Home">
                <Logo className="h-9 w-auto" />
              </Link>
              <span className="lg:hidden text-[15px] font-semibold text-[var(--text-primary)] truncate">{pageLabel}</span>
              <nav aria-label="Breadcrumb" className="hidden lg:flex items-center gap-2 text-sm min-w-0">
                {crumbs.map((crumb, i) => {
                  const last = i === crumbs.length - 1
                  return (
                    <span key={i} className="flex items-center gap-2 min-w-0">
                      {i > 0 && <ChevronRight size={14} className="text-[var(--text-muted)] flex-shrink-0" />}
                      {crumb.to && !last
                        ? <Link to={crumb.to} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] truncate">{crumb.label}</Link>
                        : <span className={`truncate ${last ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`} aria-current={last ? 'page' : undefined}>{crumb.label}</span>}
                    </span>
                  )
                })}
              </nav>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={() => setPaletteOpen(true)} aria-label="Search pages and shipments" title="Search (Ctrl K)"
                className="w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">
                <Search size={19} />
              </button>
              {bell}
              <button onClick={() => setDarkMode(v => !v)} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                className="hidden lg:flex w-10 h-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">
                {darkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
              </button>
              <Link to="/create" className="hidden lg:flex items-center gap-1.5 ml-2 h-10 px-4 rounded-xl bg-[var(--accent)] text-[var(--on-accent)] text-sm font-bold hover:bg-[var(--accent-hover)] shadow-md shadow-orange-500/25">
                <Plus size={16} strokeWidth={2.75} /> New shipment
              </Link>
              <div className="relative hidden lg:block ml-1" ref={userRef}>
                <button onClick={() => setUserMenuOpen(v => !v)} aria-expanded={userMenuOpen} aria-haspopup="menu"
                  className="flex items-center gap-2.5 pl-1.5 pr-2.5 h-10 rounded-lg hover:bg-[var(--hover-bg)]">
                  <span className="w-8 h-8 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">{userInitial}</span>
                  <span className="text-sm font-medium text-[var(--text-primary)] max-w-[160px] truncate">{displayName}</span>
                  <ChevronDown size={14} className="text-[var(--text-secondary)]" />
                </button>
                {userMenuOpen && (
                  <div role="menu" className="absolute right-0 mt-2 w-60 bg-[var(--bg-primary)] rounded-xl shadow-xl border border-[var(--border-color)] py-1 z-50 animate-scale-in">
                    <div className="px-4 py-3 border-b border-[var(--border-color)]">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{displayName}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate">{user?.email}</p>
                      <p className="text-xs mt-1.5 inline-flex items-center gap-1 font-semibold text-[var(--text-secondary)]">
                        {isAdmin && <Shield size={11} className="text-[var(--accent)]" />} {isAdmin ? 'Administrator' : 'Team member'}
                      </p>
                    </div>
                    <button role="menuitem" onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2">
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
        </div>

        <main id="main" className="px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8 w-full">
          {isAdmin && <AdminWelcomeBanner user={user} />}
          <Outlet />
        </main>
      </div>

      {paletteOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-16 lg:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
          <div className="absolute inset-0 bg-[#0E1236]/50 backdrop-blur-sm" onClick={() => setPaletteOpen(false)} aria-hidden="true" />
          <div className="relative w-full max-w-[660px] bg-[var(--bg-primary)] rounded-3xl shadow-2xl overflow-hidden border border-[var(--border-color)]">
            <div className="flex items-center gap-3 px-5 h-16 border-b border-[var(--border-color)]">
              <Search size={18} className="text-[var(--text-muted)] flex-shrink-0" />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(e) => { setPaletteQuery(e.target.value); setPaletteIndex(0) }}
                onKeyDown={onPaletteKey}
                placeholder="Search pages, shipments, actions…"
                aria-label="Search"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 bg-transparent outline-none text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <kbd className="text-[11px] font-semibold rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-1">Esc</kbd>
            </div>

            <div className="max-h-[min(60vh,480px)] overflow-y-auto p-2" role="listbox">
              {paletteFlat.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                  {paletteQuery.trim() ? `Nothing found for “${paletteQuery.trim()}”` : 'Start typing to search'}
                </p>
              )}
              {(() => {
                let flatIndex = -1
                return paletteSections.map((section) => (
                  <div key={section.title} className="mb-1">
                    <p className="px-3 pt-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{section.title}</p>
                    {section.items.map((entry) => {
                      flatIndex += 1
                      const idx = flatIndex
                      const on = activeEntry && activeEntry.key === entry.key
                      const EIcon = entry.icon
                      return (
                        <button key={entry.key} role="option" aria-selected={on} data-palette-active={on ? 'true' : undefined}
                          onMouseMove={() => setPaletteIndex(idx)} onClick={() => runEntry(entry)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left ${on ? 'bg-[var(--nav-active-bg)]' : ''}`}>
                          <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${TINTS[entry.tint] ? '' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'} ${TINTS[entry.tint] || ''}`}>
                            <EIcon size={17} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-[var(--text-primary)] truncate"><Hl text={entry.label} q={paletteQuery.trim()} /></span>
                            {entry.sub && <span className="block text-xs text-[var(--text-muted)] truncate">{entry.sub}</span>}
                          </span>
                          {entry.right && <span className="text-xs font-semibold text-[var(--text-muted)] flex-shrink-0">{entry.right}</span>}
                          {on && !entry.right && <span className="hidden sm:flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] flex-shrink-0"><CornerDownLeft size={12} /> Open</span>}
                        </button>
                      )
                    })}
                  </div>
                ))
              })()}
            </div>

            <div className="hidden sm:flex items-center gap-5 px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-muted)]">
              <span><kbd className="font-bold mr-1">↑↓</kbd> move</span>
              <span><kbd className="font-bold mr-1">Enter</kbd> open</span>
              <span><kbd className="font-bold mr-1">Esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Quick menu"
        className={`lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--bg-primary)] border-t border-[var(--border-color)] pb-[env(safe-area-inset-bottom)] ${keyboardUp ? 'hidden' : 'flex'} items-stretch`}
      >
        {bottomTabs.map((tab) => {
          const Icon = tab.icon
          const active = !tab.primary && pathMatches(pathname, tab.path)
          if (tab.primary) {
            return (
              <Link key={tab.path} to={tab.path} aria-label={tab.label} className="flex-1 flex items-center justify-center">
                <span className="w-12 h-12 -mt-5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] flex items-center justify-center shadow-lg shadow-orange-500/30 ring-4 ring-[var(--bg-primary)]">
                  <Icon size={24} strokeWidth={2.5} />
                </span>
              </Link>
            )
          }
          return (
            <Link key={tab.path} to={tab.path} aria-current={active ? 'page' : undefined}
              className={`flex-1 min-h-[58px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? 'text-[var(--brand-indigo)]' : 'text-[var(--text-secondary)]'}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {tab.label}
            </Link>
          )
        })}
        <button onClick={() => setSidebarOpen(true)} aria-label="Open full menu"
          className="flex-1 min-h-[58px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
          <Menu size={22} />
          Menu
        </button>
      </nav>
    </div>
  )
}
