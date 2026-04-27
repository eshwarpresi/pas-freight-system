import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import ShipmentDetail from './pages/ShipmentDetail'
import CreateShipment from './pages/CreateShipment'
import Layout from './layouts/MainLayout'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="shipment/:id" element={<ShipmentDetail />} />
          <Route path="create" element={<CreateShipment />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App