import { lazy, Suspense, useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './layouts/MainLayout'
import api from './lib/api'
import { io } from 'socket.io-client'

const Dashboard = lazy(() => import('./pages/Dashboard'))
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

// Protected route wrapper
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('pas_token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

// Socket context
const SocketContext = createContext(null)
export const useSocket = () => useContext(SocketContext)

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [socket, setSocket] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('pas_token')
    if (token) {
      api.get('/auth/me')
        .then(res => setUser(res.data.data))
        .catch(() => localStorage.removeItem('pas_token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  // Connect socket when user is available
  useEffect(() => {
    if (user) {
      const SOCKET_URL = import.meta.env.VITE_API_URL || 'https://pas-freight-api.onrender.com'
      const newSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10
      })

      newSocket.on('connect', () => {
        console.log('🔌 Socket connected:', newSocket.id)
        newSocket.emit('user:join', {
          name: user.name || user.email,
          email: user.email
        })
      })

      newSocket.on('connect_error', (err) => {
        console.log('Socket connection error:', err.message)
      })

      setSocket(newSocket)

      return () => {
        newSocket.disconnect()
      }
    }
  }, [user])

  if (loading) return <PageLoader />

  return (
    <SocketContext.Provider value={socket}>
      <Router>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage setUser={setUser} />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout user={user} />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
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