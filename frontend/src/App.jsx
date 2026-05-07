import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './layouts/MainLayout'

// Lazy load pages - only loaded when user navigates to them
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ShipmentDetail = lazy(() => import('./pages/ShipmentDetail'))
const CreateShipment = lazy(() => import('./pages/CreateShipment'))

// Loading fallback - vibrant indigo theme
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

function App() {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="shipment/:id" element={<ShipmentDetail />} />
            <Route path="create" element={<CreateShipment />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  )
}

export default App