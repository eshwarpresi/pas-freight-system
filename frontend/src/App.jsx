import { lazy, Suspense, useState, useEffect, useMemo, createContext, useContext } from 'react'
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
const EmployeeStats = lazy(() => import('./pages/EmployeeStats'))
const TeamOverview = lazy(() => import('./pages/TeamOverview'))
const EmployeeDashboard = lazy(() => import('./pages/EmployeeDashboard'))
const DailyReport = lazy(() => import('./pages/DailyReport'))
const Reminders = lazy(() => import('./pages/Reminders'))
const EnquiryCleanup = lazy(() => import('./pages/EnquiryCleanup'))
const ConversionReport = lazy(() => import('./pages/ConversionReport'))
const TeamPerformance = lazy(() => import('./pages/TeamPerformance'))
const ShipmentDetail = lazy(() => import('./pages/ShipmentDetail'))
const CreateShipment = lazy(() => import('./pages/CreateShipment'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const Track = lazy(() => import('./pages/Track'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="flex flex-col items-center gap-3" role="status">
        <div className="w-10 h-10 border-[3px] border-indigo-100 border-t-indigo-600 dark:border-indigo-900 dark:border-t-indigo-300 rounded-full animate-spin" />
        <p className="text-sm text-[var(--text-muted)] font-medium">Loading...</p>
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

// Live updates without a request storm.
// Every field saved on a shipment makes the server tell every other user's
// browser that something changed, and each browser used to refetch all its
// data at once through several separate listeners. With a dozen people
// editing all day, one save turned into dozens of requests at the same moment
// (and ShipmentDetail sends two events per status change).
//
// This wraps the socket so the four shipment events go through one shared
// throttle: the first event is delivered instantly, so changes still feel
// live, and anything arriving in the next few seconds is merged into a single
// refresh at the end of the window. Pages keep calling socket.on / socket.off
// exactly as before. Everything else (emit, connected, other events) passes
// straight through untouched.
const SHIPMENT_EVENTS = ['shipment:new', 'shipment:update', 'shipment:statusUpdate', 'shipment:archiveUpdate']
const LIVE_REFRESH_WINDOW_MS = 8000

function createThrottledSocket(raw) {
  const listeners = {}   // event -> Set of handlers
  const rawHandlers = {} // event -> the single handler registered on the real socket
  let last = 0
  let timer = null
  let pending = null     // { event, args } — only the latest is kept

  const deliver = (event, args) => {
    last = Date.now()
    ;(listeners[event] || new Set()).forEach((fn) => {
      try { fn(...args) } catch (err) { console.error('Live handler error:', err) }
    })
  }

  const onRaw = (event, args) => {
    const sinceLast = Date.now() - last
    if (sinceLast >= LIVE_REFRESH_WINDOW_MS) {
      deliver(event, args)
    } else {
      pending = { event, args }
      if (!timer) {
        timer = setTimeout(() => {
          timer = null
          const p = pending
          pending = null
          if (p) deliver(p.event, p.args)
        }, LIVE_REFRESH_WINDOW_MS - sinceLast)
      }
    }
  }

  const proxy = new Proxy(raw, {
    get(target, prop) {
      if (prop === 'on' || prop === 'addListener') {
        return (event, fn) => {
          if (SHIPMENT_EVENTS.includes(event)) {
            if (!listeners[event]) listeners[event] = new Set()
            listeners[event].add(fn)
            if (!rawHandlers[event]) {
              rawHandlers[event] = (...args) => onRaw(event, args)
              target.on(event, rawHandlers[event])
            }
          } else {
            target.on(event, fn)
          }
          return proxy
        }
      }
      if (prop === 'off' || prop === 'removeListener') {
        return (event, fn) => {
          if (SHIPMENT_EVENTS.includes(event)) {
            const set = listeners[event]
            if (set) {
              set.delete(fn)
              if (set.size === 0 && rawHandlers[event]) {
                target.off(event, rawHandlers[event])
                delete rawHandlers[event]
              }
            }
          } else {
            target.off(event, fn)
          }
          return proxy
        }
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
  return proxy
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [socket, setSocket] = useState(null)
  const queryClient = useQueryClient()
  const liveSocket = useMemo(() => (socket ? createThrottledSocket(socket) : null), [socket])

  useEffect(() => {
    const token = localStorage.getItem('pas_token')
    if (token) {
      api.get('/auth/me').then(res => setUser(res.data.data)).catch(() => localStorage.removeItem('pas_token')).finally(() => setLoading(false))
    } else { setLoading(false) }
  }, [])

  useEffect(() => {
    if (user) {
      const SOCKET_URL = import.meta.env.VITE_API_URL || 'https://pas-freight-api.onrender.com'
      // Reconnects back off from 1s up to 30s with random jitter, so a server
      // restart is not hit by every open tab at once (that looked like abuse
      // to Render's rate limiter and produced the 429s). It keeps trying for
      // as long as the page is open: about two attempts a minute once capped,
      // which is harmless, and giving up would leave a tab without live
      // updates until someone reloaded it.
      const newSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5,
        reconnectionAttempts: Infinity,
        timeout: 20000,
      })
      newSocket.on('connect', () => { newSocket.emit('user:join', { name: user.name || user.email, email: user.email }) })
      // After any gap (restart, network drop, laptop asleep) live events were
      // missed, so refresh everything once the connection is back. The first
      // connect is skipped.
      let hasConnectedBefore = false
      newSocket.on('connect', () => {
        if (hasConnectedBefore) queryClient.invalidateQueries(undefined, { cancelRefetch: false })
        hasConnectedBefore = true
      })
      setSocket(newSocket)
      return () => { newSocket.disconnect() }
    }
  }, [user])

  // One central listener, so pages without their own socket handling
  // (Analytics, Reports, Team pages...) still refresh when anyone changes a
  // shipment. Events arrive throttled (see above). This runs 300ms after the
  // page-level handlers have started their own refetches, and
  // cancelRefetch: false means it only refreshes what is not already loading,
  // so the server does not repeat every lookup two or three times.
  useEffect(() => {
    if (!liveSocket) return
    let timer = null
    const refreshEverything = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { queryClient.invalidateQueries(undefined, { cancelRefetch: false }) }, 300)
    }
    SHIPMENT_EVENTS.forEach((e) => liveSocket.on(e, refreshEverything))
    return () => {
      clearTimeout(timer)
      SHIPMENT_EVENTS.forEach((e) => liveSocket.off(e, refreshEverything))
    }
  }, [liveSocket, queryClient])

  if (loading) return <PageLoader />

  return (
    <SocketContext.Provider value={liveSocket}>
      <Router>
        <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage setUser={setUser} />} />
              <Route path="/track" element={<Track />} />
              <Route path="/" element={<ProtectedRoute><Layout user={user} /></ProtectedRoute>}>
                {/* Admins see every shipment on the home page. Everyone else lands
                    on their own shipments, and can still switch to the
                    company-wide view at /overview. */}
                <Route index element={user?.role === 'ADMIN' ? <Dashboard defaultType="" /> : <Dashboard mineOnly defaultType="" />} />
                <Route path="overview" element={<Dashboard defaultType="" />} />

                <Route path="team" element={<TeamOverview />} />
                <Route path="team/:userId" element={<EmployeeDashboard />} />

                <Route path="daily-report" element={<DailyReport />} />

                <Route path="team-performance" element={<TeamPerformance />} />
                <Route path="reminders" element={<Reminders />} />
                <Route path="enquiry-cleanup" element={<EnquiryCleanup />} />
                <Route path="conversion-report" element={<ConversionReport />} />

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

                {/* Reference code group dashboards */}
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
      </Router>
    </SocketContext.Provider>
  )
}

export default App