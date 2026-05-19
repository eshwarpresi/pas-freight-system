import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  ArrowLeft, Hash, Calendar, Box, User, Anchor, 
  Ship, Sparkles, Loader2, Building2, Globe, AlertCircle,
  FileCheck, ArrowUpDown, Barcode, Weight, Info, Pencil
} from 'lucide-react'

const DRAFT_KEY = 'pas_shipment_draft'
const IMPORT_EXPORT_TYPES = ['Import', 'Export']
const TRANSPORT_MODES = ['Air', 'Sea FCL', 'Sea LCL', 'Courier']

export default function CreateShipment() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [isCHAOnly, setIsCHAOnly] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loadingShipment, setLoadingShipment] = useState(false)

  const generateRefNo = () => {
    const date = new Date()
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
    const prefix = isCHAOnly ? 'CHAB' : 'PAS'
    return `${prefix}-${y}${m}${d}-${rand}`
  }

  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem(DRAFT_KEY)
    if (saved) { try { return JSON.parse(saved) } catch {} }
    return { 
      refNo: '', enquiryDate: new Date().toISOString().split('T')[0], 
      noOfPackages: '', consigneeName: '', shipperName: '', agent: '', 
      importExport: '', mode: '',
      hawb: '', mawb: '', awbDate: '', weight: ''
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
      
      setIsCHAOnly(s.shipmentType === 'CHA Only')
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
        weight: ff.weight || ''
      })
    } catch (err) {
      addToast('Failed to load shipment for editing', 'error')
      navigate('/create')
    } finally {
      setLoadingShipment(false)
    }
  }

  useEffect(() => {
    if (!isEditMode) {
      const timer = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...formData, _isCHAOnly: isCHAOnly })), 500)
      return () => clearTimeout(timer)
    }
  }, [formData, isCHAOnly, isEditMode])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setTouched(prev => ({ ...prev, [name]: true }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const handleBlur = (e) => {
    const { name, value } = e.target
    setTouched(prev => ({ ...prev, [name]: true }))
    if (!value.trim() && ['consigneeName', 'shipperName'].includes(name)) {
      setErrors(prev => ({ ...prev, [name]: `${name === 'consigneeName' ? 'Consignee name' : 'Shipper name'} is required` }))
    }
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.consigneeName.trim()) newErrors.consigneeName = 'Consignee name is required'
    if (!formData.shipperName.trim()) newErrors.shipperName = 'Shipper name is required'
    if (!isCHAOnly && !isEditMode && !formData.refNo.trim()) newErrors.refNo = 'Reference number is required'
    if (formData.noOfPackages && parseInt(formData.noOfPackages) < 1) newErrors.noOfPackages = 'Must be at least 1'
    if (formData.weight && parseFloat(formData.weight) < 0) newErrors.weight = 'Must be positive'
    setErrors(newErrors)
    setTouched({ refNo: !isCHAOnly, consigneeName: true, shipperName: true })
    if (Object.keys(newErrors).length > 0) { addToast('Please fix the validation errors', 'warning'); return false }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      if (isEditMode) {
        const updatePromises = []
        
        // Update Transport Mode (shipmentType)
        updatePromises.push(
          api.put(`/freight/shipments/${editId}/shipmenttype`, { 
            shipmentType: isCHAOnly ? 'CHA Only' : (formData.mode || '') 
          })
        )
        
        // Update Import/Export
        updatePromises.push(
          api.put(`/freight/shipments/${editId}/importexport`, { 
            importExport: formData.importExport 
          })
        )
        
        // Update AWB (HAWB, MAWB, AWB Date)
        updatePromises.push(
          api.put(`/freight/shipments/${editId}/awb`, { 
            hawb: formData.hawb || '', 
            mawb: formData.mawb || '', 
            awbDate: formData.awbDate || null 
          })
        )
        
        // Update Rates (Weight)
        if (formData.weight) {
          updatePromises.push(
            api.put(`/freight/shipments/${editId}/rates`, { 
              weight: parseFloat(formData.weight)
            })
          )
        }
        
        // Update CBM (as Packages count)
        if (formData.noOfPackages) {
          updatePromises.push(
            api.put(`/freight/shipments/${editId}/cbm`, { 
              cbm: parseInt(formData.noOfPackages) 
            })
          )
        }
        
        // Note: consigneeName, shipperName, agent don't have update endpoints
        // They can be edited inline on the Shipment Detail page

        await Promise.all(updatePromises)
        addToast('Shipment updated successfully!', 'success')
        setTimeout(() => navigate(`/shipment/${editId}`), 500)
      } else {
        const submitData = { 
          ...formData, 
          refNo: formData.refNo || generateRefNo(),
          enquiryDate: formData.enquiryDate || new Date().toISOString().split('T')[0],
          noOfPackages: formData.noOfPackages ? parseInt(formData.noOfPackages) : null,
          weight: formData.weight ? parseFloat(formData.weight) : null,
          shipmentType: isCHAOnly ? 'CHA Only' : (formData.mode || '')
        }
        const response = await api.post('/freight/shipments', submitData)
        localStorage.removeItem(DRAFT_KEY)
        addToast(isCHAOnly ? 'CHA Bill created successfully!' : 'Shipment created successfully!', 'success')
        setTimeout(() => {
          const tab = isCHAOnly ? '?tab=customs' : ''
          navigate(`/shipment/${response.data.data.id}${tab}`)
        }, 500)
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save', 'error')
    } finally { setLoading(false) }
  }

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
    setFormData({ refNo: '', enquiryDate: new Date().toISOString().split('T')[0], noOfPackages: '', consigneeName: '', shipperName: '', agent: '', importExport: '', mode: '', hawb: '', mawb: '', awbDate: '', weight: '' })
    setErrors({}); setTouched({}); setIsCHAOnly(false)
    addToast('Draft cleared', 'info')
  }

  const hasDraft = !isEditMode && localStorage.getItem(DRAFT_KEY)
  const getFieldClass = (name) => errors[name] && touched[name] ? 'border-red-400 bg-red-50' : touched[name] && formData[name] && !errors[name] ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300'
  const focusRing = isCHAOnly ? 'focus:ring-emerald-500 focus:border-emerald-500' : 'focus:ring-indigo-500 focus:border-indigo-500'

  if (loadingShipment) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin shadow-lg" />
          <p className="text-sm text-indigo-500 font-medium">Loading shipment...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-700 mb-4 transition-colors"><ArrowLeft size={15} /> Back to shipments</Link>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 bg-gradient-to-br ${isCHAOnly ? 'from-emerald-400 to-green-500' : 'from-indigo-500 to-blue-600'} rounded-xl flex items-center justify-center shadow-lg ${isCHAOnly ? 'shadow-emerald-200' : 'shadow-indigo-200'}`}>
            {isEditMode ? <Pencil size={22} className="text-white" /> : isCHAOnly ? <FileCheck size={22} className="text-white" /> : <Ship size={22} className="text-white" />}
          </div>
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
              {isEditMode ? `Edit: ${formData.refNo}` : isCHAOnly ? 'New CHA Bill' : 'New Freight Shipment'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEditMode ? 'Update shipment details' : isCHAOnly ? 'Customs clearance only' : 'Full freight forwarding shipment'}
            </p>
          </div>
        </div>
      </div>

      {!isEditMode && (
        <div className="mb-6">
          <div className="flex bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-1 border border-indigo-100">
            <button type="button" onClick={() => setIsCHAOnly(false)} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${!isCHAOnly ? 'bg-white text-indigo-700 shadow-md' : 'text-gray-500 hover:text-indigo-600'}`}>🚢 Freight Shipment</button>
            <button type="button" onClick={() => setIsCHAOnly(true)} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${isCHAOnly ? 'bg-white text-emerald-700 shadow-md' : 'text-gray-500 hover:text-emerald-600'}`}>🛃 CHA Only Bill</button>
          </div>
          <p className="text-[11px] text-indigo-400 mt-2 text-center"><Info size={11} className="inline mr-1" />{isCHAOnly ? 'CHA bills are for customs clearance only.' : 'Freight shipments include full logistics.'}</p>
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

          {!isCHAOnly && (
            <div className="p-6 border-b border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
              <div className="flex items-center gap-2 mb-1"><Hash size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Reference Details</h3></div>
              <p className="text-[11px] text-indigo-400 mb-4">Unique identification for this shipment</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Reference Number <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <div className="relative flex-1"><input type="text" name="refNo" value={formData.refNo} onChange={handleChange} disabled={isEditMode} className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} ${getFieldClass('refNo')} ${isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''}`} /></div>
                    {!isEditMode && <button type="button" onClick={() => setFormData(prev => ({ ...prev, refNo: generateRefNo() }))} className="px-3 py-2.5 bg-gradient-to-r from-indigo-100 to-blue-100 hover:from-indigo-200 hover:to-blue-200 rounded-lg text-xs font-medium text-indigo-600 flex items-center gap-1"><Sparkles size={14} />Auto</button>}
                  </div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Enquiry Date</label>
                  <div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="date" name="enquiryDate" value={formData.enquiryDate} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div>
                </div>
              </div>
            </div>
          )}

          {!isCHAOnly && (
            <div className="p-6 border-b border-indigo-100">
              <div className="flex items-center gap-2 mb-1"><Ship size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Shipment Details</h3></div>
              <p className="text-[11px] text-indigo-400 mb-4">Transport mode and cargo information</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Number of Packages</label><div className="relative"><Box size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="number" name="noOfPackages" value={formData.noOfPackages} onChange={handleChange} min="1" className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Transport Mode</label>
                  <div className="flex gap-2">
                    <select name="mode" value={TRANSPORT_MODES.includes(formData.mode) ? formData.mode : ''} onChange={handleChange} className={`flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} bg-white`}><option value="">Select mode...</option>{TRANSPORT_MODES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    <input type="text" name="mode" value={!TRANSPORT_MODES.includes(formData.mode) ? formData.mode : ''} onChange={handleChange} placeholder="Or type..." className={`w-1/3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Import / Export</label>
                  <div className="flex gap-2">
                    <select name="importExport" value={IMPORT_EXPORT_TYPES.includes(formData.importExport) ? formData.importExport : ''} onChange={handleChange} className={`flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} bg-white`}><option value="">Select type...</option>{IMPORT_EXPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    <input type="text" name="importExport" value={!IMPORT_EXPORT_TYPES.includes(formData.importExport) ? formData.importExport : ''} onChange={handleChange} placeholder="Or type..." className={`w-1/3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {isCHAOnly && (
            <>
              <div className="p-6 border-b border-emerald-100 bg-gradient-to-br from-white to-emerald-50/30">
                <div className="flex items-center gap-2 mb-1"><Building2 size={16} className="text-emerald-500" /><h3 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">Parties Involved</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Consignee Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" /><input type="text" name="consigneeName" value={formData.consigneeName} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${getFieldClass('consigneeName')}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Shipper Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" /><input type="text" name="shipperName" value={formData.shipperName} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${getFieldClass('shipperName')}`} /></div></div>
                </div>
              </div>
              <div className="p-6 border-b border-emerald-100">
                <div className="flex items-center gap-2 mb-1"><Globe size={16} className="text-emerald-500" /><h3 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">Agent Information</h3></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Agent / Forwarder</label><div className="relative"><Anchor size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" /><input type="text" name="agent" value={formData.agent} onChange={handleChange} className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div></div>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-1"><FileCheck size={16} className="text-emerald-500" /><h3 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">CHA Bill Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Import / Export</label><div className="flex gap-2"><select name="importExport" value={IMPORT_EXPORT_TYPES.includes(formData.importExport) ? formData.importExport : ''} onChange={handleChange} className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"><option value="">Select type...</option>{IMPORT_EXPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select><input type="text" name="importExport" value={!IMPORT_EXPORT_TYPES.includes(formData.importExport) ? formData.importExport : ''} onChange={handleChange} placeholder="Or type..." className="w-1/3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Transport Mode</label><div className="flex gap-2"><select name="mode" value={TRANSPORT_MODES.includes(formData.mode) ? formData.mode : ''} onChange={handleChange} className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"><option value="">Select mode...</option>{TRANSPORT_MODES.map(t => <option key={t} value={t}>{t}</option>)}</select><input type="text" name="mode" value={!TRANSPORT_MODES.includes(formData.mode) ? formData.mode : ''} onChange={handleChange} placeholder="Or type..." className="w-1/3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">HAWB No</label><div className="relative"><Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" /><input type="text" name="hawb" value={formData.hawb} onChange={handleChange} className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">MAWB No</label><div className="relative"><Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" /><input type="text" name="mawb" value={formData.mawb} onChange={handleChange} className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">HAWB / MAWB Date</label><div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" /><input type="date" name="awbDate" value={formData.awbDate} onChange={handleChange} className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">No of Packages</label><div className="relative"><Box size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" /><input type="number" name="noOfPackages" value={formData.noOfPackages} onChange={handleChange} min="1" className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Package Weight (kg)</label><div className="relative"><Weight size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" /><input type="number" name="weight" value={formData.weight} onChange={handleChange} step="0.01" className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div></div>
                </div>
              </div>
            </>
          )}

          {!isCHAOnly && (
            <>
              <div className="p-6 border-b border-indigo-100">
                <div className="flex items-center gap-2 mb-1"><Building2 size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Parties Involved</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Consignee Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="text" name="consigneeName" value={formData.consigneeName} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${getFieldClass('consigneeName')}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Shipper Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="text" name="shipperName" value={formData.shipperName} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${getFieldClass('shipperName')}`} /></div></div>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-1"><Globe size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Agent Information</h3></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Agent / Forwarder</label><div className="relative"><Anchor size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="text" name="agent" value={formData.agent} onChange={handleChange} className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" /></div></div>
              </div>
            </>
          )}

          <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-t border-indigo-100 flex items-center justify-between">
            <p className="text-xs text-gray-500"><span className="text-red-500">*</span> Required fields</p>
            <div className="flex gap-3">
              <Link to="/" className="px-5 py-2.5 border border-indigo-200 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors">Cancel</Link>
              <button type="submit" disabled={loading} className={`px-6 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg ${isCHAOnly && !isEditMode ? 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-emerald-200' : 'bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-200'}`}>
                {loading ? <><Loader2 size={16} className="animate-spin" />Saving...</> : <>{isEditMode ? <Pencil size={16} /> : isCHAOnly ? <FileCheck size={16} /> : <Ship size={16} />}{isEditMode ? 'Update Shipment' : isCHAOnly ? 'Create CHA Bill' : 'Create Shipment'}</>}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}