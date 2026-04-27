import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { Package, Clock, Download, Archive, RefreshCw, Search, Plus } from 'lucide-react'

export default function Dashboard() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const queryClient = useQueryClient()

  // Instant data with React Query caching
  const { data: shipments = [], isLoading } = useQuery({
    queryKey: ['shipments', search, statusFilter, false],
    queryFn: async () => {
      const params = { isArchived: 'false' }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/freight/shipments', { params })
      return res.data.data
    }
  })

  const { data: archivedShipments = [] } = useQuery({
    queryKey: ['shipments', '', '', true],
    queryFn: async () => {
      const res = await api.get('/freight/shipments', { 
        params: { isArchived: 'true' } 
      })
      return res.data.data
    }
  })

  // Instant archive/unarchive mutations
  const archiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
    }
  })

  const unarchiveMutation = useMutation({
    mutationFn: (id) => api.put(`/archive/shipments/${id}/unarchive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
    }
  })

  const getStatusColor = (status) => {
    const colors = {
      'ENQUIRY': 'bg-yellow-100 text-yellow-800',
      'RATES_ADDED': 'bg-blue-100 text-blue-800',
      'NOMINATED': 'bg-purple-100 text-purple-800',
      'BOOKED': 'bg-indigo-100 text-indigo-800',
      'SCHEDULED': 'bg-cyan-100 text-cyan-800',
      'AWB_GENERATED': 'bg-teal-100 text-teal-800',
      'CHECKLIST_APPROVED': 'bg-green-100 text-green-800',
      'BOE_FILED': 'bg-lime-100 text-lime-800',
      'DO_COLLECTED': 'bg-emerald-100 text-emerald-800',
      'OOC_DONE': 'bg-sky-100 text-sky-800',
      'GATE_PASS': 'bg-violet-100 text-violet-800',
      'DELIVERED': 'bg-green-200 text-green-900',
      'INVOICE_GENERATED': 'bg-orange-100 text-orange-800',
      'INVOICE_SENT': 'bg-rose-100 text-rose-800',
      'COMPLETED': 'bg-gray-200 text-gray-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const activeShipments = shipments
  const inProgress = shipments.filter(s => s.currentStatus !== 'DELIVERED' && s.currentStatus !== 'COMPLETED').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
          <p className="text-gray-500 mt-1">Real-time shipment tracking</p>
        </div>
        <Link
          to="/create"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={18} />
          New Shipment
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <StatCard icon={Package} label="Active" value={activeShipments.length} color="bg-blue-500" />
        <StatCard icon={Clock} label="In Progress" value={inProgress} color="bg-yellow-500" />
        <StatCard icon={Archive} label="Archived" value={archivedShipments.length} color="bg-gray-500" />
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setShowArchived(false)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${!showArchived ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}
          >
            Active
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${showArchived ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}
          >
            <Archive size={14} />
            Archives
          </button>
        </div>
        
        <a
          href={`http://localhost:5000/api/freight/export?isArchived=${showArchived}`}
          target="_blank"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Download size={16} />
          Export
        </a>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Ref No, Consignee, Shipper..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        {!showArchived && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="ENQUIRY">Enquiry</option>
            <option value="BOOKED">Booked</option>
            <option value="AWB_GENERATED">AWB Generated</option>
            <option value="DELIVERED">Delivered</option>
            <option value="COMPLETED">Completed</option>
          </select>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ref No</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Consignee</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan="5" className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : (showArchived ? archivedShipments : shipments).length === 0 ? (
              <tr><td colSpan="5" className="px-6 py-12 text-center text-gray-400">
                {showArchived ? 'No archived shipments' : 'No shipments yet. Create your first one!'}
              </td></tr>
            ) : (
              (showArchived ? archivedShipments : shipments).map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/shipment/${s.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                      {s.refNo}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {s.freightForwarding?.consigneeName || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(s.currentStatus)}`}>
                      {s.currentStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <Link to={`/shipment/${s.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">View</Link>
                    {showArchived ? (
                      <button onClick={() => unarchiveMutation.mutate(s.id)} className="text-green-600 hover:text-green-800 text-xs font-medium">Restore</button>
                    ) : (
                      <button onClick={() => archiveMutation.mutate(s.id)} className="text-orange-600 hover:text-orange-800 text-xs font-medium">Archive</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3">
        <div className={`${color} p-2.5 rounded-lg`}>
          <Icon size={20} className="text-white" />
        </div>
        <div>
          <p className="text-xl font-bold text-gray-800">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  )
}