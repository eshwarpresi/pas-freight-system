import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Menu, X, LogOut, ChevronDown, ChevronLeft, ChevronRight, Moon, Sun, Bell, CheckCheck,
  Ship, FileCheck, Truck, ClipboardList, FileText, BarChart3, FileUp, Receipt, Hash, Mail,
  FileSpreadsheet, ExternalLink, Layers, Users, Shield, BarChart2, TrendingUp, BellRing, Plus,
  RefreshCw, WifiOff, CheckCircle2, Upload, Banknote
} from 'lucide-react'
import AdminWelcomeBanner from '../components/AdminWelcomeBanner'
import api, { onNetworkStatusChange } from '../lib/api'
import { useSocket } from '../App'
import { useToast } from '../components/Toast'

const GROUPS_KEY = 'pas_nav_groups'
const COLLAPSED_KEY = 'pas_sidebar_collapsed'
const DARK_KEY = 'pas_dark_mode'
const DEFAULT_GROUPS = { overview: true, team: true, modules: true, actions: true, refs: false, insights: false, tools: false }

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
        { path: '/analytics', icon: BarChart3, label: 'Analytics' },
      ]
    : [
        { path: '/', icon: LayoutDashboard, label: 'My Shipments' },
        { path: '/overview', icon: Layers, label: 'Overview' },
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
      ],
    },
    {
      id: 'modules', label: 'Modules', items: [
        { path: '/ff-only', icon: FileText, label: 'FF Only' },
        { path: '/freight', icon: Ship, label: 'Freight' },
        { path: '/cha', icon: FileCheck, label: 'CHA' },
        { path: '/transport', icon: Truck, label: 'Transport' },
        { path: '/do-release', icon: ClipboardList, label: 'DO Release' },
      ],
    },
    {
      id: 'refs', label: 'Reference Groups', items: [
        { path: '/rl', icon: Hash, code: 'RL', label: 'RL (RLI / RLE)' },
        { path: '/pp', icon: Hash, code: 'PP', label: 'PP (PPI / PPE)' },
        { path: '/sp', icon: Hash, code: 'SP', label: 'SP (SPI / SPE)' },
        { path: '/jd', icon: Hash, code: 'JD', label: 'JD (JDI / JDE)' },
      ],
    },
    {
      id: 'insights', label: 'Insights', items: [
        { path: '/reference-codes', icon: Hash, label: 'Reference Codes' },
        { path: '/employee-stats', icon: Users, label: 'Employee Stats' },
      ],
    },
    {
      id: 'actions', label: 'Actions', items: [
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
  const notifRef = useRef(null)
  const userRef = useRef(null)

  const isAdmin = user?.role === 'ADMIN'
  const groups = useMemo(() => buildGroups(isAdmin), [isAdmin])

  const displayName = user?.name || user?.email?.split('@')[0] || 'User'
  const userInitial = displayName.charAt(0).toUpperCase()

  useEffect(() => { writeStored(COLLAPSED_KEY, sidebarCollapsed) }, [sidebarCollapsed])
  useEffect(() => { writeStored(GROUPS_KEY, JSON.stringify(openGroups)) }, [openGroups])

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
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

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

  const renderItem = (item, external) => {
    const Icon = item.icon
    const active = !external && pathMatches(pathname, item.path)
    const base = `relative flex items-center gap-3 min-h-[44px] lg:min-h-[38px] px-3 rounded-lg text-[15px] lg:text-sm ${rail ? 'lg:justify-center lg:px-0' : ''}`
    const tone = active
      ? 'bg-[var(--nav-active-bg)] text-[var(--brand-indigo)] font-semibold'
      : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] font-medium'
    const inner = (
      <>
        {active && <span className="absolute left-0 inset-y-2 w-[3px] rounded-r bg-[var(--accent)]" />}
        {item.code
          ? <span className="w-[22px] h-[18px] flex-shrink-0 rounded text-[10px] font-bold flex items-center justify-center bg-[var(--bg-tertiary)] border border-[var(--border-color)]">{item.code}</span>
          : <Icon size={18} className="flex-shrink-0" strokeWidth={active ? 2.25 : 2} />}
        <span className={`flex-1 truncate ${hideInRail}`}>{item.label}</span>
        {external && <ExternalLink size={13} className={`text-[var(--text-muted)] ${hideInRail}`} />}
      </>
    )
    if (external) {
      return (
        <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" title={rail ? item.label : undefined} className={`${base} ${tone}`}>
          {inner}
        </a>
      )
    }
    return (
      <Link key={item.path} to={item.path} onClick={closeSidebar} title={rail ? item.label : undefined}
        aria-current={active ? 'page' : undefined} className={`${base} ${tone}`}>
        {inner}
      </Link>
    )
  }

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
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-[290px] max-w-[86vw] ${rail ? 'lg:w-[76px]' : 'lg:w-[260px]'} bg-[var(--bg-primary)] border-r border-[var(--border-color)] transition-transform duration-200 lg:transition-none lg:translate-x-0 ${sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
      >
        <div className={`flex-shrink-0 h-16 flex items-center justify-between px-4 border-b border-[var(--border-color)] ${rail ? 'lg:justify-center lg:px-2' : ''}`}>
          <Link to="/" onClick={closeSidebar} aria-label="PAS Freight Services, home" className="flex items-center rounded-md dark:bg-white dark:px-1.5 dark:py-0.5">
            <Logo alt="PAS Freight Services" className={`h-11 w-auto ${rail ? 'lg:h-9' : ''}`} textClass={hideInRail} />
          </Link>
          <button onClick={closeSidebar} aria-label="Close menu" className="lg:hidden w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">
            <X size={20} />
          </button>
        </div>

        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          aria-label={rail ? 'Expand menu' : 'Collapse menu'}
          title={rail ? 'Expand menu' : 'Collapse menu'}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-sm items-center justify-center text-[var(--text-secondary)] hover:text-[var(--brand-indigo)] z-10"
        >
          {rail ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className={`flex-shrink-0 p-3 ${rail ? 'lg:px-2' : ''}`}>
          <Link to="/create" onClick={closeSidebar} title={rail ? 'New Shipment' : undefined}
            className={`flex items-center justify-center gap-2 h-11 lg:h-10 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] shadow-sm ${rail ? 'lg:px-0' : ''}`}>
            <Plus size={18} strokeWidth={2.5} />
            <span className={hideInRail}>New Shipment</span>
          </Link>
        </div>

        <nav className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 pb-3 ${rail ? 'lg:px-2' : ''}`}>
          {groups.map((group, index) => {
            const hasActive = !group.external && group.items.some((it) => pathMatches(pathname, it.path))
            const expanded = openGroups[group.id] || hasActive
            return (
              <div key={group.id} className={index > 0 ? 'mt-1' : ''}>
                {rail && index > 0 && <div className="hidden lg:block h-px bg-[var(--border-color)] my-2" />}
                <button
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={expanded}
                  className={`w-full flex items-center justify-between px-3 h-9 rounded-md text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] ${hideInRail}`}
                >
                  <span>{group.label}</span>
                  <ChevronDown size={14} className={`transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />
                </button>
                <div className={`space-y-0.5 ${expanded ? '' : `hidden ${rail ? 'lg:block' : ''}`}`}>
                  {group.items.map((item) => renderItem(item, group.external))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="flex-shrink-0 border-t border-[var(--border-color)] p-3">
          <div className={`flex items-center gap-3 px-1 ${rail ? 'lg:justify-center lg:px-0' : ''}`}>
            <div className="w-9 h-9 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{userInitial}</div>
            <div className={`flex-1 min-w-0 ${hideInRail}`}>
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                {displayName}
                {isAdmin && <Shield size={12} className="text-[var(--accent)] flex-shrink-0" aria-label="Admin" />}
              </p>
              <p className="text-xs text-[var(--text-muted)] truncate">{user?.email || ''}</p>
            </div>
          </div>
          <div className="lg:hidden mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setDarkMode(v => !v)} className="btn btn-secondary min-h-[44px]">
              {darkMode ? <Sun size={16} /> : <Moon size={16} />} {darkMode ? 'Light' : 'Dark'}
            </button>
            <button onClick={handleLogout} className="btn btn-danger min-h-[44px]"><LogOut size={16} /> Sign out</button>
          </div>
        </div>
      </aside>

      <div className={rail ? 'lg:ml-[76px]' : 'lg:ml-[260px]'}>
        <div className="sticky top-0 z-30">
          {updateAvailable && (
            <div role="status" className="px-4 py-2 text-center text-sm font-medium text-white bg-indigo-600 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-2"><RefreshCw size={14} /> A new version of PAS Freight is available</span>
              <button onClick={() => window.location.reload()} className="px-3 py-0.5 bg-[var(--accent)] text-white rounded-full text-xs font-semibold hover:bg-[var(--accent-hover)]">
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
              {bell}
              <button onClick={() => setDarkMode(v => !v)} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                className="hidden lg:flex w-10 h-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">
                {darkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
              </button>
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
                <span className="w-12 h-12 -mt-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-lg shadow-orange-500/30 ring-4 ring-[var(--bg-primary)]">
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