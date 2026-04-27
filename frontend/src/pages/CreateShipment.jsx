import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { Package, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function CreateShipment() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({
    refNo: '',
    enquiryDate: new Date().toISOString().split('T')[0],
    noOfPackages: '',
    consigneeName: '',
    shipperName: '',
    agent: ''
  })

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await api.post('/freight/shipments', {
        ...formData,
        noOfPackages: parseInt(formData.noOfPackages) || null
      })

      setSuccess('Shipment created successfully!')
      setTimeout(() => {
        navigate(`/shipment/${response.data.data.id}`)
      }, 1000)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create shipment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link to="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </Link>
        <h2 className="text-2xl font-bold text-gray-800">Create New Shipment</h2>
        <p className="text-gray-500 mt-1">Fill in the enquiry details to create a shipment</p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Ref No */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reference Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="refNo"
              value={formData.refNo}
              onChange={handleChange}
              placeholder="e.g., PAS-2026-001"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Enquiry Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Enquiry Date
            </label>
            <input
              type="date"
              name="enquiryDate"
              value={formData.enquiryDate}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* No of Packages */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Packages
            </label>
            <input
              type="number"
              name="noOfPackages"
              value={formData.noOfPackages}
              onChange={handleChange}
              placeholder="e.g., 5"
              min="1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Consignee Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Consignee Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="consigneeName"
              value={formData.consigneeName}
              onChange={handleChange}
              placeholder="e.g., ABC Imports Ltd"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Shipper Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shipper Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="shipperName"
              value={formData.shipperName}
              onChange={handleChange}
              placeholder="e.g., XYZ Exports Co"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Agent */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Agent
            </label>
            <input
              type="text"
              name="agent"
              value={formData.agent}
              onChange={handleChange}
              placeholder="e.g., Global Freight Agents"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <Package size={20} />
            {loading ? 'Creating...' : 'Create Shipment'}
          </button>
        </form>
      </div>
    </div>
  )
}