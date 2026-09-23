import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, Package, Menu, X, 
  Box, Command,
  LogOut, User, ChevronDown, ChevronLeft, ChevronRight, Moon, Sun, Bell, CheckCheck,
  Ship, FileCheck, Truck, ClipboardList, FileText,
  BarChart3, FileUp, Receipt, Hash, Mail, FileSpreadsheet, ExternalLink,
  Layers, Users, Shield, BarChart2, TrendingUp
} from 'lucide-react'
import api, { onNetworkStatusChange } from '../lib/api'
import { useSocket } from '../App'
import { useToast } from '../components/Toast'
import LogisticsBackground from '../components/LogisticsBackground'

export default function MainLayout({ user }) {
  const location = useLocation()
  const navigate = useNavigate()
  const socket = useSocket()
  const { addToast } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const notifRef = useRef(null)
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('pas_dark_mode') === 'true'
  })

  // ✅ SIDEBAR COLLAPSE — desktop-only collapse to an icon-only rail,
  // freeing up width for the dashboard table. Persisted so it stays how
  // the person left it across reloads. Mobile keeps its existing
  // hamburger/overlay behavior untouched — this only affects lg+ screens.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('pas_sidebar_collapsed') === 'true'
  })
  useEffect(() => {
    localStorage.setItem('pas_sidebar_collapsed', sidebarCollapsed)
  }, [sidebarCollapsed])

  const isAdmin = user?.role === 'ADMIN'

  // ─── SLOW NETWORK / OFFLINE BANNER (NEW) ───
  // Subscribes to the live network-speed tracking in lib/api.js. Shows a
  // small, non-blocking banner rather than interrupting anything — the
  // person keeps working, they just know to expect things to take
  // longer, or that they're fully offline right now.
  const [networkStatus, setNetworkStatus] = useState({ isSlow: false, isOffline: false })
  useEffect(() => {
    const unsubscribe = onNetworkStatusChange(setNetworkStatus)
    return unsubscribe
  }, [])

  // ✅ Notification sound (FIXED)
  // A single AudioContext, created once and reused, instead of a new one
  // per notification — browsers require it to be "unlocked" by a real
  // user interaction (click/tap) before it can play sound, and creating
  // a fresh one every time silently fails until that happens. We create
  // it lazily on first use and resume it if the browser suspended it.
  // Sound is a pleasant two-note chime (soft "ding-dong") instead of one
  // flat beep.
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

  const playSound = () => {
    try {
      const ctx = getAudioCtx()
      if (ctx.state === 'suspended') { ctx.resume().catch(() => {}) }

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
    } catch (e) {}
  }

  useEffect(() => { fetchNotifications() }, [])

  useEffect(() => {
    if (!socket) return
    const handleNewNotification = (data) => {
      setNotifications(prev => [{ ...data, id: Date.now().toString(), isRead: false, createdAt: new Date().toISOString() }, ...prev])
      playSound(); addToast(data.message, 'info')
    }
    socket.on('notification:new', handleNewNotification)
    return () => socket.off('notification:new', handleNewNotification)
  }, [socket, addToast])

  useEffect(() => {
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  useEffect(() => {
    const handler = () => setUserMenuOpen(false)
    if (userMenuOpen) { document.addEventListener('click', handler); return () => document.removeEventListener('click', handler) }
  }, [userMenuOpen])

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    localStorage.setItem('pas_dark_mode', darkMode)
  }, [darkMode])

  const fetchNotifications = async () => {
    try { const res = await api.get('/notifications?limit=20'); setNotifications(res.data.data || []) } catch (e) {}
  }

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
  const markAsRead = (notifId, shipmentId) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n))
    setNotifOpen(false)
    if (shipmentId) navigate(`/shipment/${shipmentId}`)
  }

  const unreadCount = notifications.filter(n => !n.isRead).length

  const navItems = isAdmin
    ? [
        { path: '/', icon: LayoutDashboard, label: 'All Shipments', shortcut: 'A' },
        { path: '/analytics', icon: BarChart3, label: 'Analytics', shortcut: 'R' },
      ]
    : [
        { path: '/', icon: LayoutDashboard, label: 'My Shipments', shortcut: 'A' },
        { path: '/overview', icon: Layers, label: 'Overview', shortcut: 'O' },
        { path: '/analytics', icon: BarChart3, label: 'Analytics', shortcut: 'R' },
      ]

  // ✅ NO LONGER ADMIN-GATED — Team, Daily Report, and Team Performance
  // are now visible to everyone in the sidebar, not just Admins. The
  // backend endpoints behind these pages (getTeamOverview, getDailyReport,
  // getEmployeePerformance, getMonthlyReport, updateEmployeeTeam) were
  // also opened up to any logged-in user to match — otherwise the links
  // would show but clicking them would fail with a 403.
  const teamItems = [
    { path: '/team', icon: Users, label: 'Team', color: 'text-indigo-500' },
    { path: '/daily-report', icon: BarChart2, label: 'Daily Report', color: 'text-emerald-500' },
    { path: '/team-performance', icon: TrendingUp, label: 'Team Performance', color: 'text-rose-500' },
  ]

  const dashboardLinks = [
    { path: '/ff-only', icon: FileText, label: 'FF Only', color: 'text-purple-500' },
    { path: '/freight', icon: Ship, label: 'Freight', color: 'text-indigo-500' },
    { path: '/cha', icon: FileCheck, label: 'CHA', color: 'text-emerald-500' },
    { path: '/transport', icon: Truck, label: 'Transport', color: 'text-sky-500' },
    { path: '/do-release', icon: ClipboardList, label: 'DO Release', color: 'text-teal-500' },
  ]

  const insightLinks = [
    { path: '/reference-codes', icon: Hash, label: 'Reference Codes', color: 'text-fuchsia-500' },
    { path: '/employee-stats', icon: Users, label: 'Employee Stats', color: 'text-cyan-500' },
  ]

  const referenceGroupLinks = [
    { path: '/rl', icon: Hash, label: 'RL (RLI / RLE)', color: 'text-rose-500' },
    { path: '/pp', icon: Hash, label: 'PP (PPI / PPE)', color: 'text-amber-500' },
    { path: '/sp', icon: Hash, label: 'SP (SPI / SPE)', color: 'text-lime-500' },
    { path: '/jd', icon: Hash, label: 'JD (JDI / JDE)', color: 'text-violet-500' },
  ]

  const actionLinks = [
    { path: '/create', icon: Package, label: 'New Shipment', color: 'text-amber-500' },
    { path: '/checklist-scanner', icon: FileUp, label: 'Checklist Scanner', color: 'text-indigo-500' },
    { path: '/delivery-challan', icon: Receipt, label: 'Delivery Challan', color: 'text-orange-500' },
  ]

  const toolLinks = [
    { url: 'https://pasfreight-mailer.onrender.com', icon: Mail, label: 'Bulk Emailing', color: 'text-sky-500' },
    { url: 'https://pas-freight-quotation.vercel.app/', icon: FileSpreadsheet, label: 'Quotation Generator', color: 'text-amber-500' },
    { url: 'https://can-fc-pasfreightservices.vercel.app/', icon: FileCheck, label: 'CAN & FC Certificates', color: 'text-emerald-500' },
  ]

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch (e) {}
    localStorage.removeItem('pas_token')
    delete api.defaults.headers.common['Authorization']
    navigate('/login')
  }

  const displayName = user?.name || user?.email?.split('@')[0] || 'User'
  const userInitial = displayName.charAt(0).toUpperCase()

  const getNotifIcon = (type) => {
    switch (type) {
      case 'AWB': return '📋'; case 'BOE': return '📄'; case 'INVOICE': return '💰'
      case 'DELIVERED': return '✅'; case 'STATUS': return '🔄'; case 'SB': return '📤'
      default: return '🔔'
    }
  }

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  // ✅ Sidebar width now depends on collapsed state (desktop only — the
  // mobile overlay behavior via `sidebarOpen`/translate-x is unchanged).
  const sidebarWidthClass = sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-[260px]'
  const mainMarginClass = sidebarCollapsed ? 'lg:ml-[76px]' : 'lg:ml-[260px]'

  // Renders one nav link, collapsing to icon-only (with a tooltip via
  // `title`) when the sidebar is collapsed on desktop.
  const renderNavLink = (item, extraClass = '') => {
    const Icon = item.icon
    const isActive = location.pathname === item.path || (item.path === '/team' && location.pathname.startsWith('/team/'))
    return (
      <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)} title={sidebarCollapsed ? item.label : undefined}
        className={`group flex items-center ${sidebarCollapsed ? 'lg:justify-center' : 'justify-between'} px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
          isActive ? 'bg-[var(--brand-indigo-light)] text-[var(--brand-indigo)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
        } ${extraClass}`}>
        <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'lg:gap-0' : ''}`}>
          <Icon size={17} className={item.color} />
          <span className={sidebarCollapsed ? 'lg:hidden' : ''}>{item.label}</span>
        </div>
        {isActive && <span className={`w-1.5 h-1.5 rounded-full bg-[var(--brand-indigo)] ${sidebarCollapsed ? 'lg:hidden' : ''}`} />}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <LogisticsBackground />

      {/* ✅ SLOW NETWORK / OFFLINE BANNER (NEW) — fixed to the top of the
          viewport, above everything, so it's visible no matter which page
          is open. Offline takes priority over merely-slow. */}
      {(networkStatus.isOffline || networkStatus.isSlow) && (
        <div className={`fixed top-0 left-0 right-0 z-[60] px-4 py-1.5 text-center text-xs font-medium text-white ${networkStatus.isOffline ? 'bg-red-600' : 'bg-amber-500'}`}>
          {networkStatus.isOffline
            ? "⚠️ You're offline — changes won't save until your connection is back"
            : '🐢 Slow connection detected — some actions may take longer than usual'}
        </div>
      )}

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-all" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-[260px] ${sidebarWidthClass} border-r z-50 transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0 bg-[var(--bg-primary)] border-[var(--border-color)] flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex-shrink-0 h-16 flex items-center justify-between px-5 border-b border-[var(--border-color)]">
          <Link to="/" className={`flex items-center gap-2.5 ${sidebarCollapsed ? 'lg:justify-center lg:w-full' : ''}`}>
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0"><Box size={16} className="text-white" /></div>
            <div className={`leading-tight ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
              <h1 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">PAS Freight</h1>
              <p className="text-[10px] text-[var(--text-muted)] font-medium">Services Pvt Ltd</p>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"><X size={16} className="text-[var(--text-secondary)]" /></button>
        </div>

        {/* ✅ COLLAPSE TOGGLE — desktop only. Floats on the sidebar's
            right edge so it's reachable whether the rail is expanded or
            collapsed. */}
        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-md items-center justify-center text-[var(--text-secondary)] hover:text-indigo-600 hover:border-indigo-300 transition-colors z-10"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
        
        <div className={`flex-shrink-0 px-4 py-3 border-b border-[var(--border-color)] ${sidebarCollapsed ? 'lg:px-2' : ''}`}>
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'lg:justify-center' : ''}`}>
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md flex-shrink-0">{userInitial}</div>
            <div className={`flex-1 min-w-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                {displayName}
                {isAdmin && <Shield size={11} className="text-indigo-500 flex-shrink-0" title="Admin" />}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] truncate">{user?.email || ''}</p>
            </div>
          </div>
        </div>

        <nav className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-0.5 ${sidebarCollapsed ? 'lg:px-2' : ''}`}>
          <p className={`px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Overview</p>
          {navItems.map((item) => renderNavLink(item))}

          {/* ✅ Team / Daily Report / Team Performance — now shown to
              everyone, not just Admins. */}
          <p className={`px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-4 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Team</p>
          {teamItems.map((item) => renderNavLink(item))}

          <p className={`px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-4 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Modules</p>
          {dashboardLinks.map((item) => renderNavLink(item))}

          <p className={`px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-4 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Reference Groups</p>
          {referenceGroupLinks.map((item) => renderNavLink(item))}

          <p className={`px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-4 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Insights</p>
          {insightLinks.map((item) => renderNavLink(item))}

          <p className={`px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-4 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Actions</p>
          {actionLinks.map((item) => renderNavLink(item))}

          <p className={`px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-4 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Tools</p>
          {toolLinks.map((item) => {
            const Icon = item.icon
            return (
              <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" title={sidebarCollapsed ? item.label : undefined}
                className={`group flex items-center ${sidebarCollapsed ? 'lg:justify-center' : 'justify-between'} gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]`}>
                <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'lg:gap-0' : ''}`}><Icon size={17} className={item.color} /><span className={sidebarCollapsed ? 'lg:hidden' : ''}>{item.label}</span></div>
                <ExternalLink size={13} className={`text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity ${sidebarCollapsed ? 'lg:hidden' : ''}`} />
              </a>
            )
          })}
        </nav>

        <div className="flex-shrink-0 p-4 border-t border-[var(--border-color)]">
          <div className={`flex items-center gap-2 px-1 ${sidebarCollapsed ? 'lg:justify-center' : ''}`}><span className={`text-[10px] text-[var(--text-muted)] font-medium ${sidebarCollapsed ? 'lg:hidden' : ''}`}>© 2026 PAS Freight</span></div>
        </div>
      </aside>

      <div className={`relative z-10 ${mainMarginClass}`}>
        <header className="hidden lg:flex sticky top-0 z-30 bg-[var(--glass-bg-strong)] backdrop-blur-lg border-b border-[var(--border-color)] px-6 py-3 items-center justify-end gap-3">
          <div className="relative" ref={notifRef}>
            <button onClick={(e) => { e.stopPropagation(); setNotifOpen(!notifOpen) }} className="relative p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
              <Bell size={18} className="text-[var(--text-secondary)]" />
              {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-1 w-80 bg-[var(--bg-primary)] rounded-xl shadow-xl border border-[var(--border-color)] z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Notifications</h3>
                  {unreadCount > 0 && <button onClick={markAllRead} className="text-[11px] text-indigo-500 hover:text-indigo-600 flex items-center gap-1 font-medium"><CheckCheck size={13} /> Mark all read</button>}
                </div>
                <div className="max-h-[350px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center"><Bell size={28} className="text-gray-300 mx-auto mb-2" /><p className="text-xs text-[var(--text-muted)]">No notifications yet</p></div>
                  ) : (
                    notifications.slice(0, 20).map((n) => (
                      <button key={n.id} onClick={() => markAsRead(n.id, n.shipmentId)} className={`w-full text-left px-4 py-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)] transition-colors flex gap-3 ${!n.isRead ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}>
                        <span className="text-lg mt-0.5">{getNotifIcon(n.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-[var(--text-primary)] truncate">{n.title}</p>{!n.isRead && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />}</div>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{n.message}</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">{timeAgo(n.createdAt)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors" title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {darkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-[var(--text-secondary)]" />}
          </button>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">{userInitial}</div>
              <span className="text-sm font-medium text-[var(--text-primary)]">{displayName}</span>
              <ChevronDown size={14} className="text-[var(--text-secondary)]" />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-[var(--bg-primary)] rounded-xl shadow-xl border border-[var(--border-color)] py-2 z-50 animate-in">
                <div className="px-4 py-2 border-b border-[var(--border-color)]"><p className="text-sm font-semibold text-[var(--text-primary)]">{displayName}</p><p className="text-xs text-[var(--text-muted)]">{user?.email}</p></div>
                <div className="py-1">
                  <button className="w-full text-left px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] flex items-center gap-2"><User size={14} /> Profile</button>
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"><LogOut size={14} /> Sign Out</button>
                </div>
              </div>
            )}
          </div>
        </header>

        <header className="lg:hidden sticky top-0 z-30 bg-[var(--glass-bg-strong)] backdrop-blur-lg border-b border-[var(--border-color)] px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"><Menu size={20} className="text-[var(--text-secondary)]" /></button>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setNotifOpen(!notifOpen) }} className="relative p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
                <Bell size={18} className="text-[var(--text-secondary)]" />
                {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
            </div>
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">{darkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-[var(--text-secondary)]" />}</button>
            <div className="w-6 h-6 bg-gray-900 rounded-md flex items-center justify-center"><Box size={12} className="text-white" /></div>
            <h1 className="text-sm font-bold text-[var(--text-primary)]">PAS Freight</h1>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><LogOut size={18} className="text-red-500" /></button>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 w-full"><Outlet /></main>
      </div>
    </div>
  )
}