import { lazy, Suspense, useState, useEffect, createContext, useContext, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
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
const DeliveryChallan = lazy(() => import('./pages/DeliveryChallan')) // ✅ NEW
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

  useEffect(() => {
    const token = localStorage.getItem('pas_token')
    if (token) {
      api.get('/auth/me').then(res => setUser(res.data.data)).catch(() => localStorage.removeItem('pas_token')).finally(() => setLoading(false))
    } else { setLoading(false) }
  }, [])

  useEffect(() => {
    if (user) {
      const SOCKET_URL = import.meta.env.VITE_API_URL || 'https://pas-freight-api.onrender.com'
      const newSocket = io(SOCKET_URL, { transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 10 })
      newSocket.on('connect', () => { console.log('🔌 Socket connected:', newSocket.id); newSocket.emit('user:join', { name: user.name || user.email, email: user.email }) })
      newSocket.on('connect_error', (err) => { console.log('Socket connection error:', err.message) })
      setSocket(newSocket)
      return () => { newSocket.disconnect() }
    }
  }, [user])

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
                {/* ✅ 6 Separate Dashboards + Analytics + Checklist Scanner */}
                <Route index element={<Dashboard defaultType="" />} />
                <Route path="freight" element={<FreightDashboard />} />
                <Route path="cha" element={<CHADashboard />} />
                <Route path="transport" element={<TransportDashboard />} />
                <Route path="do-release" element={<DOReleaseDashboard />} />
                <Route path="ff-only" element={<FFOnlyDashboard />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="checklist-scanner" element={<ChecklistScanner />} />
                <Route path="delivery-challan" element={<DeliveryChallan />} /> {/* ✅ NEW */}
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
