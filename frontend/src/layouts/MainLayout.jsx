import { useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, Package, Menu, X, 
  Box, Archive, ChevronRight, Command
} from 'lucide-react'

export default function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Overview', shortcut: 'O' },
    { path: '/create', icon: Package, label: 'New Shipment', shortcut: 'N' },
  ]

  const goToArchives = () => {
    navigate('/')
    // Store a flag in sessionStorage so Dashboard opens archive tab
    sessionStorage.setItem('showArchived', 'true')
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-all"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-[260px] bg-white border-r border-gray-100 z-50
        transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo Area */}
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
        
        {/* Navigation */}
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

        {/* Bottom Section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Archive size={14} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700">Archive</p>
                <p className="text-[10px] text-gray-400">Completed shipments</p>
              </div>
            </div>
            <button 
              onClick={goToArchives}
              className="flex items-center justify-between w-full text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span>View archives</span>
              <ChevronRight size={12} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 px-1">
            <div className="w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center">
              <Command size={10} className="text-gray-500" />
            </div>
            <span className="text-[10px] text-gray-400 font-medium">© 2026 PAS Freight</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-[260px]">
        {/* Mobile Header */}
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
          <div className="w-10" />
        </header>

        {/* Page Content */}
        <main className="p-6 md:p-8 lg:p-10 max-w-[1400px]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}