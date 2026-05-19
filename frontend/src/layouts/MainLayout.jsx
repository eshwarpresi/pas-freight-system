import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, Package, Menu, X, 
  Box, Command,
  LogOut, User, ChevronDown
} from 'lucide-react'
import api from '../lib/api'

export default function MainLayout({ user }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

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
    <div className="min-h-screen bg-[#f8f9fb]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-all"
          onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-[260px] bg-white border-r border-gray-100 z-50
        transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-100">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <Box size={16} className="text-white" />
            </div>
            <div className="leading-tight">
              <h1 className="text-sm font-bold text-gray-900 tracking-tight">PAS Freight</h1>
              <p className="text-[10px] text-gray-400 font-medium">Services Pvt Ltd</p>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
        
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{displayName}</p>
              <p className="text-[10px] text-gray-400 truncate">{user?.email || ''}</p>
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-0.5">
          <p className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Menu</p>
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
                    ? 'bg-gray-50 text-gray-900' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={17} className={isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-600'} />
                  <span>{item.label}</span>
                </div>
                {isActive && (
                  <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    ⌘{item.shortcut}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100">
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] text-gray-400 font-medium">© 2026 PAS Freight</span>
          </div>
        </div>
      </aside>

      <div className="lg:ml-[260px]">
        <header className="hidden lg:flex sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-gray-100 px-6 py-3 items-center justify-end">
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">
                {userInitial}
              </div>
              <span className="text-sm font-medium text-gray-700">{displayName}</span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 animate-in">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                  <p className="text-xs text-gray-400">{user?.email}</p>
                </div>
                <div className="py-1">
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                    <User size={14} /> Profile
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <header className="lg:hidden sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Menu size={20} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-900 rounded-md flex items-center justify-center">
              <Box size={12} className="text-white" />
            </div>
            <h1 className="text-sm font-bold text-gray-900">PAS Freight</h1>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-red-50 rounded-lg transition-colors">
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
