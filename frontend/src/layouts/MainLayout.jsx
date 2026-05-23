import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, Package, Menu, X, 
  Box, Command,
  LogOut, User, ChevronDown, Moon, Sun
} from 'lucide-react'
import api from '../lib/api'

export default function MainLayout({ user }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('pas_dark_mode') === 'true'
  })

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('pas_dark_mode', darkMode)
  }, [darkMode])

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Overview', shortcut: 'O' },
    { path: '/create', icon: Package, label: 'New Shipment', shortcut: 'N' },
  ]

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch (e) {}
    localStorage.removeItem('pas_token')
    delete api.defaults.headers.common['Authorization']
    navigate('/login')
  }

  useEffect(() => {
    const handler = () => setUserMenuOpen(false)
    if (userMenuOpen) {
      document.addEventListener('click', handler)
      return () => document.removeEventListener('click', handler)
    }
  }, [userMenuOpen])

  const displayName = user?.name || user?.email?.split('@')[0] || 'User'
  const userInitial = displayName.charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-all"
          onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-[260px] border-r z-50
        transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        lg:translate-x-0
        bg-[var(--bg-primary)] border-[var(--border-color)]
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-[var(--border-color)]">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <Box size={16} className="text-white" />
            </div>
            <div className="leading-tight">
              <h1 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">PAS Freight</h1>
              <p className="text-[10px] text-[var(--text-muted)] font-medium">Services Pvt Ltd</p>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X size={16} className="text-[var(--text-secondary)]" />
          </button>
        </div>
        
        <div className="px-4 py-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{displayName}</p>
              <p className="text-[10px] text-[var(--text-muted)] truncate">{user?.email || ''}</p>
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-0.5">
          <p className="px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">Menu</p>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-[var(--brand-indigo-light)] text-[var(--brand-indigo)]' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={17} />
                  <span>{item.label}</span>
                </div>
                {isActive && (
                  <span className="text-[10px] font-medium text-[var(--brand-indigo)] bg-[var(--brand-indigo-light)] px-1.5 py-0.5 rounded">
                    ⌘{item.shortcut}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] text-[var(--text-muted)] font-medium">© 2026 PAS Freight</span>
          </div>
        </div>
      </aside>

      <div className="lg:ml-[260px]">
        <header className="hidden lg:flex sticky top-0 z-30 bg-[var(--glass-bg-strong)] backdrop-blur-lg border-b border-[var(--border-color)] px-6 py-3 items-center justify-end gap-3">
          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? (
              <Sun size={18} className="text-amber-400" />
            ) : (
              <Moon size={18} className="text-[var(--text-secondary)]" />
            )}
          </button>

          <div className="relative" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">
                {userInitial}
              </div>
              <span className="text-sm font-medium text-[var(--text-primary)]">{displayName}</span>
              <ChevronDown size={14} className="text-[var(--text-secondary)]" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-[var(--bg-primary)] rounded-xl shadow-xl border border-[var(--border-color)] py-2 z-50 animate-in">
                <div className="px-4 py-2 border-b border-[var(--border-color)]">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{displayName}</p>
                  <p className="text-xs text-[var(--text-muted)]">{user?.email}</p>
                </div>
                <div className="py-1">
                  <button className="w-full text-left px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] flex items-center gap-2">
                    <User size={14} /> Profile
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <header className="lg:hidden sticky top-0 z-30 bg-[var(--glass-bg-strong)] backdrop-blur-lg border-b border-[var(--border-color)] px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors">
            <Menu size={20} className="text-[var(--text-secondary)]" />
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            >
              {darkMode ? (
                <Sun size={18} className="text-amber-400" />
              ) : (
                <Moon size={18} className="text-[var(--text-secondary)]" />
              )}
            </button>
            <div className="w-6 h-6 bg-gray-900 rounded-md flex items-center justify-center">
              <Box size={12} className="text-white" />
            </div>
            <h1 className="text-sm font-bold text-[var(--text-primary)]">PAS Freight</h1>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
            <LogOut size={18} className="text-red-500" />
          </button>
        </header>

        <main className="p-6 md:p-8 lg:p-10 max-w-[1400px]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}