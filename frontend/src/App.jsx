import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './layouts/MainLayout'

// Lazy load pages - only loaded when user navigates to them
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ShipmentDetail = lazy(() => import('./pages/ShipmentDetail'))
const CreateShipment = lazy(() => import('./pages/CreateShipment'))

// Loading fallback
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
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