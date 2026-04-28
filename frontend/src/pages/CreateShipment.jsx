import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  ArrowLeft, Hash, Calendar, Box, User, Anchor, 
  Ship, Sparkles, Loader2, Building2, Globe, AlertCircle
} from 'lucide-react'
import { Link } from 'react-router-dom'

const DRAFT_KEY = 'pas_shipment_draft'

export default function CreateShipment() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})

  const generateRefNo = () => {
    const date = new Date()
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
    return `PAS-${y}${m}${d}-${rand}`
  }

  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem(DRAFT_KEY)
    if (saved) { try { return JSON.parse(saved) } catch {} }
    return { refNo: '', enquiryDate: new Date().toISOString().split('T')[0], noOfPackages: '', consigneeName: '', shipperName: '', agent: '' }
  })

  useEffect(() => {
    const timer = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(formData)), 500)
    return () => clearTimeout(timer)
  }, [formData])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setTouched(prev => ({ ...prev, [name]: true }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const handleBlur = (e) => {
    const { name, value } = e.target
    setTouched(prev => ({ ...prev, [name]: true }))
    if (!value.trim() && ['refNo', 'consigneeName', 'shipperName'].includes(name)) {
      setErrors(prev => ({ ...prev, [name]: `${name === 'refNo' ? 'Reference number' : name === 'consigneeName' ? 'Consignee name' : 'Shipper name'} is required` }))
    }
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.refNo.trim()) newErrors.refNo = 'Reference number is required'
    if (!formData.consigneeName.trim()) newErrors.consigneeName = 'Consignee name is required'
    if (!formData.shipperName.trim()) newErrors.shipperName = 'Shipper name is required'
    if (formData.noOfPackages && parseInt(formData.noOfPackages) < 1) newErrors.noOfPackages = 'Must be at least 1'
    setErrors(newErrors)
    setTouched({ refNo: true, consigneeName: true, shipperName: true })
    if (Object.keys(newErrors).length > 0) { addToast('Please fix the validation errors', 'warning'); return false }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const response = await api.post('/freight/shipments', { ...formData, noOfPackages: formData.noOfPackages ? parseInt(formData.noOfPackages) : null })
      localStorage.removeItem(DRAFT_KEY)
      addToast('Shipment created successfully!', 'success')
      setTimeout(() => navigate(`/shipment/${response.data.data.id}`), 500)
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create shipment', 'error')
    } finally { setLoading(false) }
  }

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
    setFormData({ refNo: '', enquiryDate: new Date().toISOString().split('T')[0], noOfPackages: '', consigneeName: '', shipperName: '', agent: '' })
    setErrors({}); setTouched({})
    addToast('Draft cleared', 'info')
  }

  const hasDraft = localStorage.getItem(DRAFT_KEY)
  const getFieldClass = (name) => errors[name] && touched[name] ? 'border-red-300 bg-red-50' : touched[name] && formData[name] && !errors[name] ? 'border-green-300 bg-green-50' : 'border-gray-300'

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"><ArrowLeft size={15} /> Back to shipments</Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><Ship size={20} className="text-blue-600" /></div>
          <div><h2 className="text-2xl font-bold text-gray-900">New Shipment Enquiry</h2><p className="text-sm text-gray-500 mt-0.5">Create a new freight forwarding shipment</p></div>
        </div>
      </div>

      {hasDraft && !loading && (
        <div className="mb-4 flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <span className="text-amber-700 flex items-center gap-2"><Sparkles size={14} />You have a saved draft</span>
          <button onClick={clearDraft} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Clear draft</button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-4"><Hash size={16} className="text-blue-500" /><h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Reference Details</h3></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Reference Number <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input type="text" name="refNo" value={formData.refNo} onChange={handleChange} onBlur={handleBlur} placeholder="e.g., PAS-20260427-001"
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${getFieldClass('refNo')}`} />
                  </div>
                  <button type="button" onClick={() => { setFormData(prev => ({ ...prev, refNo: generateRefNo() })); setTouched(prev => ({ ...prev, refNo: true })) }}
                    className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-600 flex items-center gap-1 transition-colors"><Sparkles size={14} />Auto</button>
                </div>
                {errors.refNo && touched.refNo && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.refNo}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Enquiry Date</label>
                <div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="date" name="enquiryDate" value={formData.enquiryDate} onChange={handleChange}
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-4"><Ship size={16} className="text-blue-500" /><h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Shipment Details</h3></div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Number of Packages</label>
              <div className="relative"><Box size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="number" name="noOfPackages" value={formData.noOfPackages} onChange={handleChange} placeholder="Enter quantity" min="1"
                  className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.noOfPackages ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
              </div>
              {errors.noOfPackages && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.noOfPackages}</p>}
            </div>
          </div>

          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-4"><Building2 size={16} className="text-blue-500" /><h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Parties Involved</h3></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Consignee Name <span className="text-red-500">*</span></label>
                <div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" name="consigneeName" value={formData.consigneeName} onChange={handleChange} onBlur={handleBlur} placeholder="e.g., ABC Imports Ltd"
                    className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${getFieldClass('consigneeName')}`} />
                </div>
                {errors.consigneeName && touched.consigneeName && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.consigneeName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Shipper Name <span className="text-red-500">*</span></label>
                <div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" name="shipperName" value={formData.shipperName} onChange={handleChange} onBlur={handleBlur} placeholder="e.g., XYZ Exports Co"
                    className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${getFieldClass('shipperName')}`} />
                </div>
                {errors.shipperName && touched.shipperName && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.shipperName}</p>}
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-2 mb-4"><Globe size={16} className="text-blue-500" /><h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Agent Information</h3></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Agent / Forwarder</label>
              <div className="relative"><Anchor size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" name="agent" value={formData.agent} onChange={handleChange} placeholder="e.g., Global Freight Agents"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500"><span className="text-red-500">*</span> Required fields</p>
            <div className="flex gap-3">
              <Link to="/" className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</Link>
              <button type="submit" disabled={loading}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm">
                {loading ? <><Loader2 size={16} className="animate-spin" />Creating...</> : <><Ship size={16} />Create Shipment</>}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}