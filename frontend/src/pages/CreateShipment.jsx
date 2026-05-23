import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  ArrowLeft, Hash, Calendar, Box, User, Anchor, 
  Ship, Sparkles, Loader2, Building2, Globe, AlertCircle,
  FileCheck, ArrowUpDown, Barcode, Weight, Info, Pencil, Eye, Scale,
  FileText, Banknote, Send, ClipboardCheck, Truck
} from 'lucide-react'

const DRAFT_KEY = 'pas_shipment_draft'
const IMPORT_EXPORT_TYPES = ['Import', 'Export']
const EXPORT_ONLY = ['Export']
const TRANSPORT_MODES = ['Air', 'Sea FCL', 'Sea LCL', 'Courier']

export default function CreateShipment() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [shipmentMode, setShipmentMode] = useState('freight') // 'freight' | 'cha-import' | 'cha-export'
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
      notificationEmail: '',
      // CHA fields
      jobNo: '', checklistDate: '', checklistApprovalDate: '',
      sbNo: '', sbDate: '',
      leoDate: '', handOverDate: '',
      // Accounts
      invoiceNumber: '', invoiceDate: '', sendingDate: ''
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
      const cha = s.cha || {}
      const acc = s.accounts || {}
      
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
        notificationEmail: ff.notificationEmail || '',
        jobNo: cha.jobNo || '',
        checklistDate: cha.checklistDate ? new Date(cha.checklistDate).toISOString().split('T')[0] : '',
        checklistApprovalDate: cha.checklistApprovalDate ? new Date(cha.checklistApprovalDate).toISOString().split('T')[0] : '',
        sbNo: cha.sbNo || '',
        sbDate: cha.sbDate ? new Date(cha.sbDate).toISOString().split('T')[0] : '',
        leoDate: cha.leoDate ? new Date(cha.leoDate).toISOString().split('T')[0] : '',
        handOverDate: cha.handOverDate ? new Date(cha.handOverDate).toISOString().split('T')[0] : '',
        invoiceNumber: acc.invoiceNumber || '',
        invoiceDate: acc.invoiceDate ? new Date(acc.invoiceDate).toISOString().split('T')[0] : '',
        sendingDate: acc.sendingDate ? new Date(acc.sendingDate).toISOString().split('T')[0] : ''
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
          enquiryDate: formData.enquiryDate || null,
          noOfPackages: formData.noOfPackages ? parseInt(formData.noOfPackages) : null,
          weight: formData.weight ? parseFloat(formData.weight) : undefined,
          grossWeight: formData.grossWeight ? parseFloat(formData.grossWeight) : undefined,
          notificationEmail: formData.notificationEmail || null
        }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/shipmenttype`, { shipmentType: shipmentTypeVal }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/importexport`, { importExport: importExportVal }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/awb`, { hawb: formData.hawb || '', mawb: formData.mawb || '', awbDate: formData.awbDate || null }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/consignee`, { consigneeName: formData.consigneeName }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/shipper`, { shipperName: formData.shipperName }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/agent`, { agent: formData.agent }))
        
        // CHA fields
        if (isCHA) {
          updatePromises.push(api.put(`/cha/shipments/${editId}/checklist`, { 
            jobNo: formData.jobNo, checklistDate: formData.checklistDate || null, checklistApprovalDate: formData.checklistApprovalDate || null 
          }))
          if (isCHAExport) {
            updatePromises.push(api.put(`/cha/shipments/${editId}/shipping-bill`, { sbNo: formData.sbNo, sbDate: formData.sbDate || null }))
            updatePromises.push(api.put(`/cha/shipments/${editId}/leo`, { leoDate: formData.leoDate || null }))
            updatePromises.push(api.put(`/cha/shipments/${editId}/hand-over`, { handOverDate: formData.handOverDate || null }))
          }
        }
        // Accounts
        updatePromises.push(api.put(`/accounts/shipments/${editId}/invoice`, { invoiceNumber: formData.invoiceNumber, invoiceDate: formData.invoiceDate || null }))
        updatePromises.push(api.put(`/accounts/shipments/${editId}/invoice-send`, { sendingDate: formData.sendingDate || null }))

        await Promise.all(updatePromises)
        addToast('Shipment updated successfully!', 'success')
        queryClient.removeQueries({ queryKey: ['shipment', editId] })
        queryClient.removeQueries({ queryKey: ['shipments'] })
        setTimeout(() => { window.location.href = `/#/shipment/${editId}?t=${Date.now()}` }, 300)
      } else {
        const submitData = { 
          ...formData, 
          refNo: formData.refNo || generateRefNo(),
          enquiryDate: formData.enquiryDate || new Date().toISOString().split('T')[0],
          noOfPackages: formData.noOfPackages ? parseInt(formData.noOfPackages) : null,
          weight: formData.weight ? parseFloat(formData.weight) : null,
          grossWeight: formData.grossWeight ? parseFloat(formData.grossWeight) : null,
          shipmentType: shipmentTypeVal,
          importExport: importExportVal
        }
        const response = await api.post('/freight/shipments', submitData)
        const newId = response.data.data.id
        
        // After creating, update CHA and Accounts fields if applicable
        if (isCHA) {
          await api.put(`/cha/shipments/${newId}/checklist`, { 
            jobNo: formData.jobNo, checklistDate: formData.checklistDate || null, checklistApprovalDate: formData.checklistApprovalDate || null 
          })
          if (isCHAExport) {
            await api.put(`/cha/shipments/${newId}/shipping-bill`, { sbNo: formData.sbNo, sbDate: formData.sbDate || null })
            await api.put(`/cha/shipments/${newId}/leo`, { leoDate: formData.leoDate || null })
            await api.put(`/cha/shipments/${newId}/hand-over`, { handOverDate: formData.handOverDate || null })
          }
        }
        await api.put(`/accounts/shipments/${newId}/invoice`, { invoiceNumber: formData.invoiceNumber, invoiceDate: formData.invoiceDate || null })
        await api.put(`/accounts/shipments/${newId}/invoice-send`, { sendingDate: formData.sendingDate || null })
        
        localStorage.removeItem(DRAFT_KEY)
        addToast(isCHA ? 'CHA Bill created successfully!' : 'Shipment created successfully!', 'success')
        setTimeout(() => navigate(`/shipment/${newId}${isCHA ? '?tab=customs' : ''}`), 500)
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save', 'error')
    } finally { setLoading(false) }
  }

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
    setFormData({ refNo: '', enquiryDate: new Date().toISOString().split('T')[0], noOfPackages: '', consigneeName: '', shipperName: '', agent: '', importExport: '', mode: '', hawb: '', mawb: '', awbDate: '', weight: '', grossWeight: '', notificationEmail: '', jobNo: '', checklistDate: '', checklistApprovalDate: '', sbNo: '', sbDate: '', leoDate: '', handOverDate: '', invoiceNumber: '', invoiceDate: '', sendingDate: '' })
    setErrors({}); setTouched({})
    addToast('Draft cleared', 'info')
  }

  const hasDraft = !isEditMode && localStorage.getItem(DRAFT_KEY)
  const getFieldClass = (name) => errors[name] && touched[name] ? 'border-red-400 bg-red-50' : touched[name] && formData[name] && !errors[name] ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300'
  const focusRing = isCHA ? (isCHAExport ? 'focus:ring-amber-500 focus:border-amber-500' : 'focus:ring-emerald-500 focus:border-emerald-500') : 'focus:ring-indigo-500 focus:border-indigo-500'
  const accentColor = isCHAExport ? 'amber' : (isCHA ? 'emerald' : 'indigo')

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

  const InputField = ({ name, label, icon: Icon, required, type = 'text', placeholder = '' }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
      <div className="relative">
        {Icon && <Icon size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 text-${accentColor}-400`} />}
        <input type={type} name={name} value={formData[name]} onChange={handleChange} placeholder={placeholder}
          className={`w-full ${Icon ? 'pl-9' : 'pl-3'} pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} ${getFieldClass(name)}`} />
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-700 mb-4 transition-colors"><ArrowLeft size={15} /> Back to shipments</Link>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 bg-gradient-to-br ${isCHAExport ? 'from-amber-400 to-orange-500' : isCHA ? 'from-emerald-400 to-green-500' : 'from-indigo-500 to-blue-600'} rounded-xl flex items-center justify-center shadow-lg`}>
            {isEditMode ? <Pencil size={22} className="text-white" /> : isCHA ? <FileCheck size={22} className="text-white" /> : <Ship size={22} className="text-white" />}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
              {isEditMode ? `Edit: ${formData.refNo}` : isCHAExport ? 'New CHA Bill Export' : isCHA ? 'New CHA Bill Import' : 'New Freight Shipment'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEditMode ? 'Update shipment details' : isCHAExport ? 'Customs clearance - Export' : isCHA ? 'Customs clearance - Import' : 'Full freight forwarding shipment'}
            </p>
          </div>
          {isEditMode && (
            <Link to={`/shipment/${editId}`} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-lg hover:from-indigo-600 hover:to-blue-700 text-sm font-medium shadow-lg shadow-indigo-200">
              <Eye size={16} /> View Shipment
            </Link>
          )}
        </div>
      </div>

      {!isEditMode && (
        <div className="mb-6">
          <div className="flex bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-1 border border-indigo-100">
            <button type="button" onClick={() => setShipmentMode('freight')} className={`flex-1 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'freight' ? 'bg-white text-indigo-700 shadow-md' : 'text-gray-500 hover:text-indigo-600'}`}>🚢 Freight Shipment</button>
            <button type="button" onClick={() => setShipmentMode('cha-import')} className={`flex-1 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'cha-import' ? 'bg-white text-emerald-700 shadow-md' : 'text-gray-500 hover:text-emerald-600'}`}>🛃 CHA Bill Import</button>
            <button type="button" onClick={() => setShipmentMode('cha-export')} className={`flex-1 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'cha-export' ? 'bg-white text-amber-700 shadow-md' : 'text-gray-500 hover:text-amber-600'}`}>📤 CHA Bill Export</button>
          </div>
          <p className="text-[11px] text-indigo-400 mt-2 text-center"><Info size={11} className="inline mr-1" />{isCHAExport ? 'Customs clearance for exports' : isCHA ? 'Customs clearance for imports' : 'Full freight forwarding shipment'}</p>
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

          {/* ===== FREIGHT SHIPMENT FORM ===== */}
          {shipmentMode === 'freight' && (
            <>
              <div className="p-6 border-b border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
                <div className="flex items-center gap-2 mb-1"><Hash size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Reference Details</h3></div>
                <p className="text-[11px] text-indigo-400 mb-4">Unique identification for this shipment</p>
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
                  <InputField name="consigneeName" label="Consignee Name" icon={User} required />
                  <InputField name="shipperName" label="Shipper Name" icon={User} required />
                </div>
              </div>
              <div className="p-6 border-b border-indigo-100">
                <div className="flex items-center gap-2 mb-1"><Globe size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Agent Information</h3></div>
                <InputField name="agent" label="Agent / Forwarder" icon={Anchor} />
              </div>

              {/* AWB Details */}
              <div className="p-6 border-b border-indigo-100">
                <div className="flex items-center gap-2 mb-1"><Barcode size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">AWB Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <InputField name="hawb" label="HAWB No" icon={Barcode} />
                  <InputField name="mawb" label="MAWB No" icon={Barcode} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">AWB Date</label><div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="date" name="awbDate" value={formData.awbDate} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div></div>
                  <InputField name="weight" label="Package Weight (kg)" icon={Weight} type="number" />
                  <InputField name="grossWeight" label="Gross Weight (kg)" icon={Scale} type="number" />
                </div>
              </div>

              {/* Notification */}
              <div className="p-6 border-b border-amber-100 bg-gradient-to-br from-amber-50/30 to-yellow-50/30">
                <div className="flex items-center gap-2 mb-1"><Mail size={16} className="text-amber-500" /><h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Client Notification</h3></div>
                <p className="text-[11px] text-amber-500 mb-4">Client will receive automatic email updates on key status changes</p>
                <InputField name="notificationEmail" label="Notification Email" icon={Mail} type="email" placeholder="client@example.com" />
              </div>
            </>
          )}

          {/* ===== CHA IMPORT/EXPORT FORM ===== */}
          {isCHA && (
            <>
              {/* Parties - Shipper first for Export, Consignee first for Import */}
              <div className={`p-6 border-b ${isCHAExport ? 'border-amber-100 bg-gradient-to-br from-white to-amber-50/30' : 'border-emerald-100 bg-gradient-to-br from-white to-emerald-50/30'}`}>
                <div className="flex items-center gap-2 mb-1"><Building2 size={16} className={isCHAExport ? 'text-amber-500' : 'text-emerald-500'} /><h3 className={`text-sm font-semibold uppercase tracking-wider ${isCHAExport ? 'text-amber-700' : 'text-emerald-700'}`}>Parties Involved</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isCHAExport ? (
                    <>
                      <InputField name="shipperName" label="Shipper Name" icon={User} required />
                      <InputField name="consigneeName" label="Consignee Name" icon={User} required />
                    </>
                  ) : (
                    <>
                      <InputField name="consigneeName" label="Consignee Name" icon={User} required />
                      <InputField name="shipperName" label="Shipper Name" icon={User} required />
                    </>
                  )}
                </div>
              </div>
              <div className={`p-6 border-b ${isCHAExport ? 'border-amber-100' : 'border-emerald-100'}`}>
                <div className="flex items-center gap-2 mb-1"><Globe size={16} className={isCHAExport ? 'text-amber-500' : 'text-emerald-500'} /><h3 className={`text-sm font-semibold uppercase tracking-wider ${isCHAExport ? 'text-amber-700' : 'text-emerald-700'}`}>Agent Information</h3></div>
                <InputField name="agent" label="Agent / Forwarder" icon={Anchor} />
              </div>

              {/* CHA Bill Details */}
              <div className={`p-6 border-b ${isCHAExport ? 'border-amber-100' : 'border-emerald-100'}`}>
                <div className="flex items-center gap-2 mb-1"><FileCheck size={16} className={isCHAExport ? 'text-amber-500' : 'text-emerald-500'} /><h3 className={`text-sm font-semibold uppercase tracking-wider ${isCHAExport ? 'text-amber-700' : 'text-emerald-700'}`}>CHA Bill Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Import / Export</label>
                    <select name="importExport" value={isCHAExport ? 'Export' : 'Import'} onChange={handleChange} className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} bg-white`} disabled>
                      <option value="Import">Import</option>
                      <option value="Export">Export</option>
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
                  <InputField name="hawb" label="HAWB No" icon={Barcode} />
                  <InputField name="mawb" label="MAWB No" icon={Barcode} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">AWB Date</label><div className="relative"><Calendar size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isCHAExport ? 'text-amber-400' : 'text-emerald-400'}`} /><input type="date" name="awbDate" value={formData.awbDate} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div></div>
                  <InputField name="weight" label="Package Weight (kg)" icon={Weight} type="number" />
                  <InputField name="grossWeight" label="Gross Weight (kg)" icon={Scale} type="number" />
                </div>
              </div>

              {/* Customs Section */}
              <div className={`p-6 border-b ${isCHAExport ? 'border-amber-100' : 'border-emerald-100'}`}>
                <div className="flex items-center gap-2 mb-4"><ClipboardCheck size={16} className={isCHAExport ? 'text-amber-500' : 'text-emerald-500'} /><h3 className={`text-sm font-semibold uppercase tracking-wider ${isCHAExport ? 'text-amber-700' : 'text-emerald-700'}`}>Checklist</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InputField name="jobNo" label="Job No" />
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Checklist Date</label><div className="relative"><Calendar size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isCHAExport ? 'text-amber-400' : 'text-emerald-400'}`} /><input type="date" name="checklistDate" value={formData.checklistDate} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Approval Date</label><div className="relative"><Calendar size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isCHAExport ? 'text-amber-400' : 'text-emerald-400'}`} /><input type="date" name="checklistApprovalDate" value={formData.checklistApprovalDate} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div></div>
                </div>
              </div>

              {/* CHA Export specific fields */}
              {isCHAExport && (
                <>
                  <div className="p-6 border-b border-amber-100">
                    <div className="flex items-center gap-2 mb-4"><FileText size={16} className="text-amber-500" /><h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Shipping Bill</h3></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <InputField name="sbNo" label="SB No" />
                      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">SB Date</label><div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" /><input type="date" name="sbDate" value={formData.sbDate} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div></div>
                    </div>
                  </div>
                  <div className="p-6 border-b border-amber-100">
                    <div className="flex items-center gap-2 mb-4"><CheckCircle2 size={16} className="text-amber-500" /><h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">LEO</h3></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1.5">LEO Date</label><div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" /><input type="date" name="leoDate" value={formData.leoDate} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div></div>
                  </div>
                  <div className="p-6 border-b border-amber-100">
                    <div className="flex items-center gap-2 mb-4"><Truck size={16} className="text-amber-500" /><h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Hand Over</h3></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Hand Over Date</label><div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" /><input type="date" name="handOverDate" value={formData.handOverDate} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div></div>
                  </div>
                </>
              )}

              {/* Accounts Section */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-4"><Banknote size={16} className="text-gray-500" /><h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Invoice Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InputField name="invoiceNumber" label="Invoice No" />
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Invoice Date</label><div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="date" name="invoiceDate" value={formData.invoiceDate} onChange={handleChange} className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500" /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Sending Date</label><div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="date" name="sendingDate" value={formData.sendingDate} onChange={handleChange} className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500" /></div></div>
                </div>
              </div>

              {/* Notification */}
              <div className="p-6 border-b border-amber-100 bg-gradient-to-br from-amber-50/30 to-yellow-50/30">
                <div className="flex items-center gap-2 mb-1"><Mail size={16} className="text-amber-500" /><h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Client Notification</h3></div>
                <p className="text-[11px] text-amber-500 mb-4">Client will receive automatic email updates on key status changes</p>
                <InputField name="notificationEmail" label="Notification Email" icon={Mail} type="email" placeholder="client@example.com" />
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