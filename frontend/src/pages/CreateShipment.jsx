import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  ArrowLeft, Hash, Calendar, Box, User, Anchor, 
  Ship, Sparkles, Loader2, Building2, Globe, AlertCircle,
  FileCheck, ArrowUpDown, Barcode, Weight, Info, Pencil, Eye, Scale, Mail
} from 'lucide-react'

const DRAFT_KEY = 'pas_shipment_draft'
const IMPORT_EXPORT_TYPES = ['Import', 'Export']
const TRANSPORT_MODES = ['Air', 'Sea FCL', 'Sea LCL', 'Courier']

export default function CreateShipment() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [shipmentMode, setShipmentMode] = useState('freight')
  const [isEditMode, setIsEditMode] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loadingShipment, setLoadingShipment] = useState(false)

  const isCHA = shipmentMode === 'cha-import' || shipmentMode === 'cha-export'
  const isCHAExport = shipmentMode === 'cha-export'

  const generateRefNo = () => {
    const date = new Date()
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
    const prefix = isCHA ? 'CHAB' : 'PAS'
    return `${prefix}-${y}${m}${d}-${rand}`
  }

  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem(DRAFT_KEY)
    if (saved) { try { return JSON.parse(saved) } catch {} }
    return { 
      refNo: '', enquiryDate: new Date().toISOString().split('T')[0], 
      noOfPackages: '', consigneeName: '', shipperName: '', agent: '', 
      importExport: '', mode: '',
      hawb: '', mawb: '', awbDate: '', weight: '', grossWeight: '',
      notificationEmail: ''
    }
  })

  useEffect(() => {
    const editParam = searchParams.get('edit')
    if (editParam) {
      setIsEditMode(true)
      setEditId(editParam)
      loadShipmentForEdit(editParam)
    }
  }, [searchParams])

  const loadShipmentForEdit = async (id) => {
    setLoadingShipment(true)
    try {
      const res = await api.get(`/freight/shipments/${id}`)
      const s = res.data.data
      const ff = s.freightForwarding || {}
      
      const mode = s.shipmentType === 'CHA Only' ? (s.importExport === 'Export' ? 'cha-export' : 'cha-import') : 'freight'
      setShipmentMode(mode)
      setFormData({
        refNo: s.refNo || '',
        enquiryDate: ff.enquiryDate ? new Date(ff.enquiryDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        noOfPackages: ff.noOfPackages || '',
        consigneeName: ff.consigneeName || '',
        shipperName: ff.shipperName || '',
        agent: ff.agent || '',
        importExport: s.importExport || '',
        mode: s.shipmentType || '',
        hawb: ff.hawb || '',
        mawb: ff.mawb || '',
        awbDate: ff.awbDate ? new Date(ff.awbDate).toISOString().split('T')[0] : '',
        weight: ff.weight || '',
        grossWeight: ff.grossWeight || '',
        notificationEmail: ff.notificationEmail || ''
      })
    } catch (err) {
      addToast('Failed to load shipment for editing', 'error')
      navigate('/create')
    } finally {
      setLoadingShipment(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setTouched(prev => ({ ...prev, [name]: true }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.consigneeName.trim()) newErrors.consigneeName = 'Consignee name is required'
    if (!formData.shipperName.trim()) newErrors.shipperName = 'Shipper name is required'
    if (!isCHA && !isEditMode && !formData.refNo.trim()) newErrors.refNo = 'Reference number is required'
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) { addToast('Please fix the validation errors', 'warning'); return false }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const importExportVal = isCHAExport ? 'Export' : (isCHA ? 'Import' : formData.importExport)
      const shipmentTypeVal = isCHA ? 'CHA Only' : (formData.mode || '')

      if (isEditMode) {
        const updatePromises = []
        updatePromises.push(api.put(`/freight/shipments/${editId}/refno`, { refNo: formData.refNo }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/rates`, { 
          enquiryDate: formData.enquiryDate || null, noOfPackages: formData.noOfPackages ? parseInt(formData.noOfPackages) : null,
          weight: formData.weight ? parseFloat(formData.weight) : undefined, grossWeight: formData.grossWeight ? parseFloat(formData.grossWeight) : undefined,
          notificationEmail: formData.notificationEmail || null
        }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/shipmenttype`, { shipmentType: shipmentTypeVal }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/importexport`, { importExport: importExportVal }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/awb`, { hawb: formData.hawb || '', mawb: formData.mawb || '', awbDate: formData.awbDate || null }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/consignee`, { consigneeName: formData.consigneeName }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/shipper`, { shipperName: formData.shipperName }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/agent`, { agent: formData.agent }))
        await Promise.all(updatePromises)
        addToast('Shipment updated successfully!', 'success')
        queryClient.removeQueries({ queryKey: ['shipment', editId] })
        queryClient.removeQueries({ queryKey: ['shipments'] })
        setTimeout(() => { window.location.href = `/#/shipment/${editId}?t=${Date.now()}` }, 300)
      } else {
        const submitData = { 
          ...formData, refNo: formData.refNo || generateRefNo(),
          enquiryDate: formData.enquiryDate || new Date().toISOString().split('T')[0],
          noOfPackages: formData.noOfPackages ? parseInt(formData.noOfPackages) : null,
          weight: formData.weight ? parseFloat(formData.weight) : null,
          grossWeight: formData.grossWeight ? parseFloat(formData.grossWeight) : null,
          shipmentType: shipmentTypeVal, importExport: importExportVal
        }
        const response = await api.post('/freight/shipments', submitData)
        localStorage.removeItem(DRAFT_KEY)
        addToast(isCHA ? 'CHA Bill created successfully!' : 'Shipment created successfully!', 'success')
        setTimeout(() => navigate(`/shipment/${response.data.data.id}${isCHA ? '?tab=customs' : ''}`), 500)
      }
    } catch (err) { addToast(err.response?.data?.message || 'Failed to save', 'error') }
    finally { setLoading(false) }
  }

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
    setFormData({ refNo: '', enquiryDate: new Date().toISOString().split('T')[0], noOfPackages: '', consigneeName: '', shipperName: '', agent: '', importExport: '', mode: '', hawb: '', mawb: '', awbDate: '', weight: '', grossWeight: '', notificationEmail: '' })
    setErrors({}); setTouched({})
  }

  const hasDraft = !isEditMode && localStorage.getItem(DRAFT_KEY)
  const getFieldClass = (name) => errors[name] && touched[name] ? 'border-red-400 bg-red-50' : touched[name] && formData[name] && !errors[name] ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300'
  const focusRing = isCHA ? (isCHAExport ? 'focus:ring-amber-500 focus:border-amber-500' : 'focus:ring-emerald-500 focus:border-emerald-500') : 'focus:ring-indigo-500 focus:border-indigo-500'
  const accentText = isCHAExport ? 'text-amber-400' : isCHA ? 'text-emerald-400' : 'text-indigo-400'
  const inputClass = `w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`

  if (loadingShipment) return (
    <div className="flex items-center justify-center h-96">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin shadow-lg" />
        <p className="text-sm text-indigo-500 font-medium">Loading shipment...</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-700 mb-4"><ArrowLeft size={15} /> Back to shipments</Link>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 bg-gradient-to-br ${isCHAExport ? 'from-amber-400 to-orange-500' : isCHA ? 'from-emerald-400 to-green-500' : 'from-indigo-500 to-blue-600'} rounded-xl flex items-center justify-center shadow-lg`}>
            {isEditMode ? <Pencil size={22} className="text-white" /> : isCHA ? <FileCheck size={22} className="text-white" /> : <Ship size={22} className="text-white" />}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
              {isEditMode ? `Edit: ${formData.refNo}` : isCHAExport ? 'New CHA Bill Export' : isCHA ? 'New CHA Bill Import' : 'New Freight Shipment'}
            </h2>
          </div>
          {isEditMode && <Link to={`/shipment/${editId}`} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-lg hover:from-indigo-600 hover:to-blue-700 text-sm font-medium shadow-lg"><Eye size={16} /> View Shipment</Link>}
        </div>
      </div>

      {!isEditMode && (
        <div className="mb-6">
          <div className="flex bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-1 border border-indigo-100">
            <button type="button" onClick={() => setShipmentMode('freight')} className={`flex-1 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'freight' ? 'bg-white text-indigo-700 shadow-md' : 'text-gray-500 hover:text-indigo-600'}`}>🚢 Freight Shipment</button>
            <button type="button" onClick={() => setShipmentMode('cha-import')} className={`flex-1 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'cha-import' ? 'bg-white text-emerald-700 shadow-md' : 'text-gray-500 hover:text-emerald-600'}`}>🛃 CHA Bill Import</button>
            <button type="button" onClick={() => setShipmentMode('cha-export')} className={`flex-1 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'cha-export' ? 'bg-white text-amber-700 shadow-md' : 'text-gray-500 hover:text-amber-600'}`}>📤 CHA Bill Export</button>
          </div>
        </div>
      )}

      {hasDraft && !loading && (
        <div className="mb-4 flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg text-sm">
          <span className="text-amber-700 flex items-center gap-2"><Sparkles size={14} />You have a saved draft</span>
          <button onClick={clearDraft} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Clear draft</button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-xl border border-indigo-100 shadow-lg overflow-hidden">

          {/* FREIGHT SHIPMENT */}
          {shipmentMode === 'freight' && (
            <>
              <div className="p-6 border-b border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
                <div className="flex items-center gap-2 mb-1"><Hash size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Reference Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Reference Number <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      <div className="relative flex-1"><input type="text" name="refNo" value={formData.refNo} onChange={handleChange} className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} ${getFieldClass('refNo')}`} /></div>
                      {!isEditMode && <button type="button" onClick={() => setFormData(prev => ({ ...prev, refNo: generateRefNo() }))} className="px-3 py-2.5 bg-gradient-to-r from-indigo-100 to-blue-100 rounded-lg text-xs font-medium text-indigo-600 flex items-center gap-1"><Sparkles size={14} />Auto</button>}
                    </div>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Enquiry Date</label>
                    <div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="date" name="enquiryDate" value={formData.enquiryDate} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div>
                  </div>
                </div>
              </div>
              <div className="p-6 border-b border-indigo-100">
                <div className="flex items-center gap-2 mb-1"><Ship size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Shipment Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Number of Packages</label><div className="relative"><Box size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="number" name="noOfPackages" value={formData.noOfPackages} onChange={handleChange} min="1" className={`${inputClass} ${getFieldClass('noOfPackages')}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Transport Mode</label>
                    <div className="flex gap-2">
                      <select name="mode" value={TRANSPORT_MODES.includes(formData.mode) ? formData.mode : ''} onChange={handleChange} className={`flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} bg-white`}><option value="">Select mode...</option>{TRANSPORT_MODES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                      <input type="text" name="mode" value={!TRANSPORT_MODES.includes(formData.mode) ? formData.mode : ''} onChange={handleChange} placeholder="Or type..." className={`w-1/3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} />
                    </div>
                  </div>
                </div>
                <div className="mt-4"><label className="block text-sm font-medium text-gray-700 mb-1.5">Import / Export</label>
                  <div className="flex gap-2">
                    <select name="importExport" value={IMPORT_EXPORT_TYPES.includes(formData.importExport) ? formData.importExport : ''} onChange={handleChange} className={`flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} bg-white`}><option value="">Select type...</option>{IMPORT_EXPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    <input type="text" name="importExport" value={!IMPORT_EXPORT_TYPES.includes(formData.importExport) ? formData.importExport : ''} onChange={handleChange} placeholder="Or type..." className={`w-1/3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} />
                  </div>
                </div>
              </div>
              <div className="p-6 border-b border-indigo-100">
                <div className="flex items-center gap-2 mb-1"><Building2 size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Parties Involved</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Consignee Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="text" name="consigneeName" value={formData.consigneeName} onChange={handleChange} className={`${inputClass} ${getFieldClass('consigneeName')}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Shipper Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="text" name="shipperName" value={formData.shipperName} onChange={handleChange} className={`${inputClass} ${getFieldClass('shipperName')}`} /></div></div>
                </div>
              </div>
              <div className="p-6 border-b border-indigo-100">
                <div className="flex items-center gap-2 mb-1"><Globe size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Agent Information</h3></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Agent / Forwarder</label><div className="relative"><Anchor size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="text" name="agent" value={formData.agent} onChange={handleChange} className={`${inputClass}`} /></div></div>
              </div>
              <div className="p-6 border-b border-indigo-100">
                <div className="flex items-center gap-2 mb-1"><Barcode size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">AWB Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">HAWB No</label><div className="relative"><Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="text" name="hawb" value={formData.hawb} onChange={handleChange} className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">MAWB No</label><div className="relative"><Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="text" name="mawb" value={formData.mawb} onChange={handleChange} className={`${inputClass}`} /></div></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">AWB Date</label><div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="date" name="awbDate" value={formData.awbDate} onChange={handleChange} className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Package Weight (kg)</label><div className="relative"><Weight size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="number" name="weight" value={formData.weight} onChange={handleChange} step="0.01" className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Gross Weight (kg)</label><div className="relative"><Scale size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="number" name="grossWeight" value={formData.grossWeight} onChange={handleChange} step="0.01" className={`${inputClass}`} /></div></div>
                </div>
              </div>
              <div className="p-6 border-b border-amber-100 bg-gradient-to-br from-amber-50/30 to-yellow-50/30">
                <div className="flex items-center gap-2 mb-1"><Mail size={16} className="text-amber-500" /><h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Client Notification</h3></div>
                <p className="text-[11px] text-amber-500 mb-4">Client will receive automatic email updates on key status changes</p>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Notification Email</label><div className="relative"><Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" /><input type="email" name="notificationEmail" value={formData.notificationEmail} onChange={handleChange} placeholder="client@example.com" className={`${inputClass.replace(focusRing, 'focus:ring-amber-500 focus:border-amber-500')}`} /></div></div>
              </div>
            </>
          )}

          {/* CHA IMPORT / EXPORT */}
          {isCHA && (
            <>
              <div className={`p-6 border-b ${isCHAExport ? 'border-amber-100 bg-gradient-to-br from-white to-amber-50/30' : 'border-emerald-100 bg-gradient-to-br from-white to-emerald-50/30'}`}>
                <div className="flex items-center gap-2 mb-1"><Building2 size={16} className={isCHAExport ? 'text-amber-500' : 'text-emerald-500'} /><h3 className={`text-sm font-semibold uppercase tracking-wider ${isCHAExport ? 'text-amber-700' : 'text-emerald-700'}`}>Parties Involved</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isCHAExport ? (
                    <>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Shipper Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${accentText}`} /><input type="text" name="shipperName" value={formData.shipperName} onChange={handleChange} className={`${inputClass} ${getFieldClass('shipperName')}`} /></div></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Consignee Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${accentText}`} /><input type="text" name="consigneeName" value={formData.consigneeName} onChange={handleChange} className={`${inputClass} ${getFieldClass('consigneeName')}`} /></div></div>
                    </>
                  ) : (
                    <>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Consignee Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${accentText}`} /><input type="text" name="consigneeName" value={formData.consigneeName} onChange={handleChange} className={`${inputClass} ${getFieldClass('consigneeName')}`} /></div></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Shipper Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${accentText}`} /><input type="text" name="shipperName" value={formData.shipperName} onChange={handleChange} className={`${inputClass} ${getFieldClass('shipperName')}`} /></div></div>
                    </>
                  )}
                </div>
              </div>
              <div className={`p-6 border-b ${isCHAExport ? 'border-amber-100' : 'border-emerald-100'}`}>
                <div className="flex items-center gap-2 mb-1"><Globe size={16} className={isCHAExport ? 'text-amber-500' : 'text-emerald-500'} /><h3 className={`text-sm font-semibold uppercase tracking-wider ${isCHAExport ? 'text-amber-700' : 'text-emerald-700'}`}>Agent Information</h3></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Agent / Forwarder</label><div className="relative"><Anchor size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${accentText}`} /><input type="text" name="agent" value={formData.agent} onChange={handleChange} className={`${inputClass}`} /></div></div>
              </div>
              <div className={`p-6 border-b ${isCHAExport ? 'border-amber-100' : 'border-emerald-100'}`}>
                <div className="flex items-center gap-2 mb-1"><FileCheck size={16} className={isCHAExport ? 'text-amber-500' : 'text-emerald-500'} /><h3 className={`text-sm font-semibold uppercase tracking-wider ${isCHAExport ? 'text-amber-700' : 'text-emerald-700'}`}>CHA Bill Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Import / Export</label>
                    <select name="importExport" value={isCHAExport ? 'Export' : 'Import'} disabled className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-700`}>
                      <option value="Import">Import</option><option value="Export">Export</option>
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Transport Mode</label>
                    <div className="flex gap-2">
                      <select name="mode" value={TRANSPORT_MODES.includes(formData.mode) ? formData.mode : ''} onChange={handleChange} className={`flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} bg-white`}><option value="">Select mode...</option>{TRANSPORT_MODES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                      <input type="text" name="mode" value={!TRANSPORT_MODES.includes(formData.mode) ? formData.mode : ''} onChange={handleChange} placeholder="Or type..." className={`w-1/3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">HAWB No</label><div className="relative"><Barcode size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${accentText}`} /><input type="text" name="hawb" value={formData.hawb} onChange={handleChange} className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">MAWB No</label><div className="relative"><Barcode size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${accentText}`} /><input type="text" name="mawb" value={formData.mawb} onChange={handleChange} className={`${inputClass}`} /></div></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">AWB Date</label><div className="relative"><Calendar size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${accentText}`} /><input type="date" name="awbDate" value={formData.awbDate} onChange={handleChange} className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Package Weight (kg)</label><div className="relative"><Weight size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${accentText}`} /><input type="number" name="weight" value={formData.weight} onChange={handleChange} step="0.01" className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Gross Weight (kg)</label><div className="relative"><Scale size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${accentText}`} /><input type="number" name="grossWeight" value={formData.grossWeight} onChange={handleChange} step="0.01" className={`${inputClass}`} /></div></div>
                </div>
              </div>
              <div className="p-6 border-b border-amber-100 bg-gradient-to-br from-amber-50/30 to-yellow-50/30">
                <div className="flex items-center gap-2 mb-1"><Mail size={16} className="text-amber-500" /><h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Client Notification</h3></div>
                <p className="text-[11px] text-amber-500 mb-4">Client will receive automatic email updates on key status changes</p>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Notification Email</label><div className="relative"><Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" /><input type="email" name="notificationEmail" value={formData.notificationEmail} onChange={handleChange} placeholder="client@example.com" className={`${inputClass.replace(focusRing, 'focus:ring-amber-500 focus:border-amber-500')}`} /></div></div>
              </div>
            </>
          )}

          <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-t border-indigo-100 flex items-center justify-between">
            <p className="text-xs text-gray-500"><span className="text-red-500">*</span> Required fields</p>
            <div className="flex gap-3">
              <Link to="/" className="px-5 py-2.5 border border-indigo-200 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors">Cancel</Link>
              <button type="submit" disabled={loading} className={`px-6 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg ${isCHAExport && !isEditMode ? 'bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-200' : isCHA && !isEditMode ? 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-emerald-200' : 'bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-200'}`}>
                {loading ? <><Loader2 size={16} className="animate-spin" />Saving...</> : <>{isEditMode ? <Pencil size={16} /> : isCHA ? <FileCheck size={16} /> : <Ship size={16} />}{isEditMode ? 'Update Shipment' : isCHAExport ? 'Create CHA Export Bill' : isCHA ? 'Create CHA Import Bill' : 'Create Shipment'}</>}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}