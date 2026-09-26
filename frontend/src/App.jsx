import { lazy, Suspense, useState, useEffect, createContext, useContext, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import Layout from './layouts/MainLayout'
import api from './lib/api'
import { io } from 'socket.io-client'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const FreightDashboard = lazy(() => import('./pages/FreightDashboard'))
const CHADashboard = lazy(() => import('./pages/CHADashboard'))
const TransportDashboard = lazy(() => import('./pages/TransportDashboard'))
const DOReleaseDashboard = lazy(() => import('./pages/DOReleaseDashboard'))
const FFOnlyDashboard = lazy(() => import('./pages/FFOnlyDashboard'))
const Analytics = lazy(() => import('./pages/Analytics'))
const ChecklistScanner = lazy(() => import('./pages/ChecklistScanner'))
const DeliveryChallan = lazy(() => import('./pages/DeliveryChallan'))
const ReferenceCodes = lazy(() => import('./pages/ReferenceCodes'))
const EmployeeStats = lazy(() => import('./pages/EmployeeStats')) // ✅ NEW
const TeamOverview = lazy(() => import('./pages/TeamOverview')) // ✅ NEW — Admin only
const EmployeeDashboard = lazy(() => import('./pages/EmployeeDashboard')) // ✅ NEW — Admin only
const DailyReport = lazy(() => import('./pages/DailyReport')) // ✅ NEW — Admin only
const TeamPerformance = lazy(() => import('./pages/TeamPerformance')) // ✅ NEW — Admin only
const ShipmentDetail = lazy(() => import('./pages/ShipmentDetail'))
const CreateShipment = lazy(() => import('./pages/CreateShipment'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin shadow-lg" />
        <p className="text-sm text-indigo-500 font-medium">Loading...</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('pas_token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

// ✅ NEW — guards /team and /team/:userId. Anyone who isn't ADMIN is
// bounced back to their own "My Shipments" page rather than seeing an
// error screen — a non-admin landing here is almost always just an old
// bookmark or a typed URL, not a real access attempt worth alarming them
// over.
function AdminRoute({ user, children }) {
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />
  return children
}

const SocketContext = createContext(null)
export const useSocket = () => useContext(SocketContext)

function ParticleEffects() {
  const canvasRef = useRef(null)
  const [effect, setEffect] = useState('rain')

  useEffect(() => {
    const effects = ['rain', 'snow', 'stars']
    let i = 0
    const interval = setInterval(() => { i = (i + 1) % effects.length; setEffect(effects[i]) }, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animationId
    let particles = []

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const createParticles = () => {
      particles = []
      const count = effect === 'stars' ? 150 : effect === 'snow' ? 80 : 100
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          speed: effect === 'snow' ? 0.3 + Math.random() * 1.5 : effect === 'stars' ? 0 : 2 + Math.random() * 4,
          size: effect === 'stars' ? 0.5 + Math.random() * 1.5 : effect === 'snow' ? 2 + Math.random() * 4 : 0.5 + Math.random() * 1.5,
          opacity: effect === 'stars' ? 0.3 + Math.random() * 0.7 : 0.1 + Math.random() * 0.3,
          wind: effect === 'snow' ? -0.5 + Math.random() * 1 : 0, angle: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.01 + Math.random() * 0.03, length: effect === 'rain' ? 10 + Math.random() * 15 : 0
        })
      }
    }
    createParticles()

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach(p => {
        ctx.beginPath()
        if (effect === 'rain') {
          ctx.strokeStyle = `rgba(174, 194, 224, ${p.opacity})`; ctx.lineWidth = p.size
          ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.wind, p.y + p.length); ctx.stroke()
          p.y += p.speed * 3; p.x += p.wind * 0.5
          if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width }
        } else if (effect === 'snow') {
          ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`; ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill()
          p.y += p.speed; p.x += p.wind + Math.sin(p.y * 0.01) * 0.5
          if (p.y > canvas.height + 10) { p.y = -10; p.x = Math.random() * canvas.width }
          if (p.x > canvas.width + 10) p.x = -10; if (p.x < -10) p.x = canvas.width + 10
        } else if (effect === 'stars') {
          const twinkle = 0.5 + Math.sin(p.angle) * 0.5
          ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity * twinkle})`; ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.fillStyle = `rgba(168, 185, 255, ${p.opacity * twinkle * 0.3})`
          ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2); ctx.fill()
          p.angle += p.twinkleSpeed
        }
      })
      animationId = requestAnimationFrame(animate)
    }
    animate()
    return () => { cancelAnimationFrame(animationId); window.removeEventListener('resize', resize) }
  }, [effect])

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 1 }} />
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [socket, setSocket] = useState(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    const token = localStorage.getItem('pas_token')
    if (token) {
      api.get('/auth/me').then(res => setUser(res.data.data)).catch(() => localStorage.removeItem('pas_token')).finally(() => setLoading(false))
    } else { setLoading(false) }
  }, [])

  useEffect(() => {
    if (user) {
      const SOCKET_URL = import.meta.env.VITE_API_URL || 'https://pas-freight-api.onrender.com'
      // ✅ FIX — the old config (reconnectionDelay: 1000, no max) let
      // Socket.IO retry too fast, too many times, hammering the server
      // with reconnection attempts — which can look like abuse to
      // Render's rate limiter (the 429s you were seeing) and make an
      // already-strained backend worse instead of giving it room to
      // recover. This backs off properly (1s → 2s → 4s ... capped at
      // 30s) and gives up gracefully after a reasonable number of tries
      // instead of retrying forever.
      const newSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5,
        reconnectionAttempts: 8,
        timeout: 20000,
      })
      newSocket.on('connect', () => { console.log('🔌 Socket connected:', newSocket.id); newSocket.emit('user:join', { name: user.name || user.email, email: user.email }) })
      newSocket.on('connect_error', (err) => { console.log('Socket connection error:', err.message) })
      newSocket.on('reconnect_failed', () => {
        // Stopped retrying after reconnectionAttempts is exhausted —
        // live updates just won't arrive until the person reloads the
        // page, rather than the socket hammering the server forever.
        console.log('Socket gave up reconnecting — live updates paused until page reload')
      })
      setSocket(newSocket)
      return () => { newSocket.disconnect() }
    }
  }, [user])

  // ✅ LIVE EVERYWHERE (NEW) — one central listener, instead of adding
  // socket handling to every single page individually. Previously only
  // the single shipment detail page listened for live events at all;
  // Dashboard, Analytics, Team Performance, Pipeline, Daily/Monthly
  // Report, Employee Stats — none of them refreshed on their own when
  // someone elsewhere created or changed a shipment, only on manual
  // reload or whenever their normal refetch timer happened to fire.
  //
  // Whenever ANY shipment is created, edited, has its status change, or
  // is archived/restored — anywhere in the app, by anyone — this clears
  // React Query's entire cache of "not currently being looked at"
  // freshness, so every page currently open silently refetches with the
  // latest data next time it's due to render. Deliberately broad (no
  // specific query keys listed) rather than trying to keep an exact list
  // of every page's query key in sync by hand — simpler, and guaranteed
  // not to miss a page as new ones get added later.
  useEffect(() => {
    if (!socket) return
    const refreshEverything = () => { queryClient.invalidateQueries() }
    socket.on('shipment:new', refreshEverything)
    socket.on('shipment:update', refreshEverything)
    socket.on('shipment:statusUpdate', refreshEverything)
    socket.on('shipment:archiveUpdate', refreshEverything)
    return () => {
      socket.off('shipment:new', refreshEverything)
      socket.off('shipment:update', refreshEverything)
      socket.off('shipment:statusUpdate', refreshEverything)
      socket.off('shipment:archiveUpdate', refreshEverything)
    }
  }, [socket, queryClient])

  if (loading) return <PageLoader />

  return (
    <SocketContext.Provider value={socket}>
      <Router>
        <ParticleEffects />
        <div className="relative z-10">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage setUser={setUser} />} />
              <Route path="/" element={<ProtectedRoute><Layout user={user} /></ProtectedRoute>}>
                {/* ✅ Admins see everything by default (like before). Everyone
                    else lands on their own shipments only. The full
                    company-wide view stays available at /overview for
                    non-admins who want to switch to it. */}
                <Route index element={user?.role === 'ADMIN' ? <Dashboard defaultType="" /> : <Dashboard mineOnly defaultType="" />} />
                <Route path="overview" element={<Dashboard defaultType="" />} />

                {/* ✅ Team pages — now open to everyone, not admin-only */}
                <Route path="team" element={<TeamOverview />} />
                <Route path="team/:userId" element={<EmployeeDashboard />} />

                {/* ✅ Daily Report — now open to everyone */}
                <Route path="daily-report" element={<DailyReport />} />

                {/* ✅ Team Performance — now open to everyone */}
                <Route path="team-performance" element={<TeamPerformance />} />

                <Route path="freight" element={<FreightDashboard />} />
                <Route path="cha" element={<CHADashboard />} />
                <Route path="transport" element={<TransportDashboard />} />
                <Route path="do-release" element={<DOReleaseDashboard />} />
                <Route path="ff-only" element={<FFOnlyDashboard />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="checklist-scanner" element={<ChecklistScanner />} />
                <Route path="delivery-challan" element={<DeliveryChallan />} />
                <Route path="reference-codes" element={<ReferenceCodes />} />
                <Route path="employee-stats" element={<EmployeeStats />} />

                {/* ✅ NEW — Reference code group dashboards (RL/PP/SP/JD) */}
                <Route path="rl" element={<Dashboard referenceGroup="RL" />} />
                <Route path="pp" element={<Dashboard referenceGroup="PP" />} />
                <Route path="sp" element={<Dashboard referenceGroup="SP" />} />
                <Route path="jd" element={<Dashboard referenceGroup="JD" />} />

                <Route path="shipment/:id" element={<ShipmentDetail />} />
                <Route path="create" element={<CreateShipment />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </SocketContext.Provider>
  )
}

export default App