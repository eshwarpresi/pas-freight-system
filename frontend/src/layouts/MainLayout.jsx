import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, Package, Menu, X, 
  Box, Command,
  LogOut, User, ChevronDown, Moon, Sun, Bell, CheckCheck,
  Ship, FileCheck, Truck, ClipboardList, FileText,
  BarChart3, FileUp
} from 'lucide-react'
import api from '../lib/api'
import { useSocket } from '../App'
import { useToast } from '../components/Toast'

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

  const playSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 800; osc.type = 'sine'; gain.gain.value = 0.1
      osc.start(); osc.stop(ctx.currentTime + 0.15)
    } catch(e) {}
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

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'All Shipments', shortcut: 'A' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics', shortcut: 'R' },
  ]

  const dashboardLinks = [
    { path: '/ff-only', icon: FileText, label: 'FF Only', color: 'text-purple-500' },
    { path: '/freight', icon: Ship, label: 'Freight', color: 'text-indigo-500' },
    { path: '/cha', icon: FileCheck, label: 'CHA', color: 'text-emerald-500' },
    { path: '/transport', icon: Truck, label: 'Transport', color: 'text-sky-500' },
    { path: '/do-release', icon: ClipboardList, label: 'DO Release', color: 'text-teal-500' },
  ]

  const actionLinks = [
    { path: '/create', icon: Package, label: 'New Shipment', color: 'text-amber-500' },
    { path: '/checklist-scanner', icon: FileUp, label: 'Checklist Scanner', color: 'text-indigo-500' },
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

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-all" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-[260px] border-r z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0 bg-[var(--bg-primary)] border-[var(--border-color)] ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-[var(--border-color)]">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center"><Box size={16} className="text-white" /></div>
            <div className="leading-tight">
              <h1 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">PAS Freight</h1>
              <p className="text-[10px] text-[var(--text-muted)] font-medium">Services Pvt Ltd</p>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"><X size={16} className="text-[var(--text-secondary)]" /></button>
        </div>
        
        <div className="px-4 py-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md">{userInitial}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{displayName}</p>
              <p className="text-[10px] text-[var(--text-muted)] truncate">{user?.email || ''}</p>
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-0.5">
          <p className="px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">Overview</p>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive ? 'bg-[var(--brand-indigo-light)] text-[var(--brand-indigo)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                }`}>
                <div className="flex items-center gap-3"><Icon size={17} /><span>{item.label}</span></div>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-indigo)]" />}
              </Link>
            )
          })}

          <p className="px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-4">Modules</p>
          {dashboardLinks.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive ? 'bg-[var(--brand-indigo-light)] text-[var(--brand-indigo)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                }`}>
                <div className="flex items-center gap-3"><Icon size={17} className={item.color} /><span>{item.label}</span></div>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-indigo)]" />}
              </Link>
            )
          })}

          <p className="px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mt-4">Actions</p>
          {actionLinks.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]`}>
                <Icon size={17} className={item.color} /><span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-2 px-1"><span className="text-[10px] text-[var(--text-muted)] font-medium">© 2026 PAS Freight</span></div>
        </div>
      </aside>

      <div className="lg:ml-[260px]">
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

        <main className="p-6 md:p-8 lg:p-10 max-w-[1400px]"><Outlet /></main>
      </div>
    </div>
  )
}