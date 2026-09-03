import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  ArrowLeft, Hash, Calendar, Box, User, Anchor, 
  Ship, Sparkles, Loader2, Building2, Globe, AlertCircle,
  FileCheck, ArrowUpDown, Barcode, Weight, Info, Pencil, Eye, Scale, Mail, Truck, MapPin, ClipboardList, FileText, Plus, RotateCcw
} from 'lucide-react'

const DRAFT_KEY = 'pas_shipment_draft'
const IMPORT_EXPORT_TYPES = ['Import', 'Export']
const TRANSPORT_MODES = ['Air', 'Sea FCL', 'Sea LCL', 'Courier']
const VEHICLE_TYPES = ['10ft', '20ft', '32ft', '40ft']
const PACKAGE_TYPES = ['Box / Carton', 'Envelope / Document', 'Parcel', 'Pallet', 'Crate', 'Bag / Sack', 'Drum / Barrel', 'Tube', 'Container', 'Wooden Box', 'Plastic Bin', 'Roll', 'Bundle', 'Cargo Package', 'Freight Package']
const TRANSPORT_MODE_OPTIONS = ['Air', 'Sea', 'Courier']

export default function CreateShipment() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [shipmentMode, setShipmentMode] = useState(() => {
    const modeParam = searchParams.get('mode')
    if (modeParam && ['freight', 'cha-import', 'cha-export', 'transport', 'do-release', 'ff-only'].includes(modeParam)) {
      return modeParam
    }
    return 'freight'
  })
  const [isEditMode, setIsEditMode] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loadingShipment, setLoadingShipment] = useState(false)
  const [returnPage, setReturnPage] = useState(1)
  const [returnSearch, setReturnSearch] = useState('')
  const [returnStatus, setReturnStatus] = useState('')
  const [returnType, setReturnType] = useState('')

  // ─── REFERENCE PREFIX AUTO-GENERATION (NEW) ───
  // One shared global counter behind the scenes — RE2602, then PIPE2603,
  // then SI2604, no matter which prefix is picked next. Employees can
  // also add brand-new prefixes on the fly (e.g. typing "PIPE" the first
  // time it's needed).
  const [prefixes, setPrefixes] = useState([])
  const [selectedPrefix, setSelectedPrefix] = useState('')
  const [newPrefixInput, setNewPrefixInput] = useState('')
  const [generatingRef, setGeneratingRef] = useState(false)
  const [addingPrefix, setAddingPrefix] = useState(false)
  const [showManagePrefixes, setShowManagePrefixes] = useState(false)
  const [editingCode, setEditingCode] = useState(null)
  const [editingValue, setEditingValue] = useState('')
  const [showRefHelp, setShowRefHelp] = useState(false)
  const [showFirstTimeGuide, setShowFirstTimeGuide] = useState(() => {
    try { return localStorage.getItem('pas_ref_guide_seen') !== 'true' } catch { return false }
  })

  // ─── EMPLOYEE INITIALS (NEW) ───
  // Same idea as prefixes — a managed list anyone can add/edit/delete.
  // Picking one tags the generated number, e.g. PIPE2604-GJ.
  const [initialsList, setInitialsList] = useState([])
  const [selectedInitials, setSelectedInitials] = useState('')
  const [newInitialInput, setNewInitialInput] = useState('')
  const [addingInitial, setAddingInitial] = useState(false)
  const [showManageInitials, setShowManageInitials] = useState(false)
  const [editingInitialCode, setEditingInitialCode] = useState(null)
  const [editingInitialValue, setEditingInitialValue] = useState('')

  useEffect(() => {
    api.get('/freight/reference-initials')
      .then(res => setInitialsList(res.data?.data || []))
      .catch(() => {})
  }, [])

  const handleAddInitial = async () => {
    const code = newInitialInput.trim().toUpperCase()
    if (!code) return
    setAddingInitial(true)
    try {
      const res = await api.post('/freight/reference-initials', { code })
      const added = res.data?.data
      setInitialsList(prev => {
        if (prev.find(p => p.code === added.code)) return prev
        return [...prev, added].sort((a, b) => a.code.localeCompare(b.code))
      })
      setNewInitialInput('')
      addToast(`Initials "${added.code}" added`, 'success')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to add initials', 'error')
    } finally {
      setAddingInitial(false)
    }
  }

  const handleDeleteInitial = async (code) => {
    if (!window.confirm(`Delete initials "${code}"?`)) return
    try {
      await api.delete(`/freight/reference-initials/${code}`)
      setInitialsList(prev => prev.filter(p => p.code !== code))
      if (selectedInitials === code) setSelectedInitials('')
      addToast(`Initials "${code}" deleted`, 'success')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to delete initials', 'error')
    }
  }

  const startEditInitial = (code) => {
    setEditingInitialCode(code)
    setEditingInitialValue(code)
  }

  const cancelEditInitial = () => {
    setEditingInitialCode(null)
    setEditingInitialValue('')
  }

  const saveEditInitial = async (oldCode) => {
    const newCode = editingInitialValue.trim().toUpperCase()
    if (!newCode || newCode === oldCode) { cancelEditInitial(); return }
    try {
      const res = await api.put(`/freight/reference-initials/${oldCode}`, { newCode })
      const updated = res.data?.data
      setInitialsList(prev =>
        prev.map(p => (p.code === oldCode ? updated : p)).sort((a, b) => a.code.localeCompare(b.code))
      )
      if (selectedInitials === oldCode) setSelectedInitials(updated.code)
      addToast(`Renamed to "${updated.code}"`, 'success')
      cancelEditInitial()
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to rename initials', 'error')
    }
  }

  const dismissFirstTimeGuide = () => {
    setShowFirstTimeGuide(false)
    try { localStorage.setItem('pas_ref_guide_seen', 'true') } catch {}
  }

  useEffect(() => {
    api.get('/freight/reference-prefixes')
      .then(res => setPrefixes(res.data?.data || []))
      .catch(() => {})
  }, [])

  const handleGenerateRef = async () => {
    if (!selectedPrefix) { addToast('Select a prefix first', 'warning'); return }
    if (!selectedInitials) { addToast('Select your initials first', 'warning'); return }
    setGeneratingRef(true)
    try {
      const res = await api.post('/freight/reference-number/generate', { prefix: selectedPrefix, initials: selectedInitials })
      const refNo = res.data?.data?.refNo
      setFormData(prev => ({ ...prev, refNo }))
      addToast(`Generated ${refNo}`, 'success')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to generate reference number', 'error')
    } finally {
      setGeneratingRef(false)
    }
  }

  // ─── RESET REFERENCE COUNTER (NEW) ───
  // Resets the shared global counter back to 2602. Only affects the
  // NEXT auto-generated number — every existing shipment and reference
  // number already saved stays exactly as it is.
  const handleResetCounter = async () => {
    if (!window.confirm('Reset the shipment reference counter to 2602? This only affects future auto-generated numbers — nothing existing changes.')) return
    try {
      await api.post('/freight/reference-number/reset', { value: 2602 })
      addToast('Reference counter reset to 2602', 'success')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to reset counter', 'error')
    }
  }

  const handleAddPrefix = async () => {
    const code = newPrefixInput.trim().toUpperCase()
    if (!code) return
    setAddingPrefix(true)
    try {
      const res = await api.post('/freight/reference-prefixes', { code })
      const added = res.data?.data
      setPrefixes(prev => {
        if (prev.find(p => p.code === added.code)) return prev
        return [...prev, added].sort((a, b) => a.code.localeCompare(b.code))
      })
      setNewPrefixInput('')
      addToast(`Prefix "${added.code}" added`, 'success')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to add prefix', 'error')
    } finally {
      setAddingPrefix(false)
    }
  }

  const handleDeletePrefix = async (code) => {
    if (!window.confirm(`Delete prefix "${code}"? Reference numbers already generated with it are not affected.`)) return
    try {
      await api.delete(`/freight/reference-prefixes/${code}`)
      setPrefixes(prev => prev.filter(p => p.code !== code))
      if (selectedPrefix === code) setSelectedPrefix('')
      addToast(`Prefix "${code}" deleted`, 'success')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to delete prefix', 'error')
    }
  }

  const startEditPrefix = (code) => {
    setEditingCode(code)
    setEditingValue(code)
  }

  const cancelEditPrefix = () => {
    setEditingCode(null)
    setEditingValue('')
  }

  const saveEditPrefix = async (oldCode) => {
    const newCode = editingValue.trim().toUpperCase()
    if (!newCode || newCode === oldCode) { cancelEditPrefix(); return }
    try {
      const res = await api.put(`/freight/reference-prefixes/${oldCode}`, { newCode })
      const updated = res.data?.data
      setPrefixes(prev =>
        prev.map(p => (p.code === oldCode ? updated : p)).sort((a, b) => a.code.localeCompare(b.code))
      )
      if (selectedPrefix === oldCode) setSelectedPrefix(updated.code)
      addToast(`Renamed to "${updated.code}"`, 'success')
      cancelEditPrefix()
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to rename prefix', 'error')
    }
  }

  const isCHA = shipmentMode === 'cha-import' || shipmentMode === 'cha-export'
  const isCHAExport = shipmentMode === 'cha-export'
  const isTransport = shipmentMode === 'transport'
  const isDORelease = shipmentMode === 'do-release'
  const isFFOnly = shipmentMode === 'ff-only'

  const generateRefNo = () => {
    const date = new Date()
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
    if (isTransport) return `TRP-${y}${m}${d}-${rand}`
    if (isDORelease) return `DOR-${y}${m}${d}-${rand}`
    if (isFFOnly) return `FFO-${y}${m}${d}-${rand}`
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
      customerName: '', vehicleType: '', noOfContainers: '', packageType: '',
      fromLocation: '', toLocation: '', deliveryDate: '',
      transportMode: '',
      chaName: ''
    }
  })

  // ─── AUTO-SAVE DRAFT (NEW) ───
  // Saves the form — including a just-generated reference number — to
  // this browser's local storage on every change. If the page refreshes
  // or the tab is accidentally closed before submitting, reopening
  // Create Shipment restores exactly where they left off, so a generated
  // number is never silently lost to a refresh.
  useEffect(() => {
    if (isEditMode) return // don't clobber draft storage while editing an existing shipment
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(formData)) } catch {}
  }, [formData, isEditMode])

  useEffect(() => {
    const editParam = searchParams.get('edit')
    if (editParam) {
      setIsEditMode(true)
      setEditId(editParam)
      setReturnPage(parseInt(searchParams.get('page')) || 1)
      setReturnSearch(searchParams.get('search') || '')
      setReturnStatus(searchParams.get('status') || '')
      setReturnType(searchParams.get('type') || '')
      loadShipmentForEdit(editParam)
    }
  }, [searchParams])

  const loadShipmentForEdit = async (id) => {
    setLoadingShipment(true)
    try {
      const res = await api.get(`/freight/shipments/${id}`)
      const s = res.data.data
      const ff = s.freightForwarding || {}
      
      let mode = 'freight'
      if (s.shipmentType === 'CHA Only') mode = s.importExport === 'Export' ? 'cha-export' : 'cha-import'
      else if (s.shipmentType === 'Transport') mode = 'transport'
      else if (s.shipmentType === 'DO Release') mode = 'do-release'
      else if (s.shipmentType === 'FF Only') mode = 'ff-only'
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
        customerName: ff.customerName || '',
        vehicleType: ff.vehicleType || '',
        noOfContainers: ff.noOfContainers || '',
        packageType: ff.packageType || '',
        fromLocation: ff.fromLocation || '',
        toLocation: ff.toLocation || '',
        deliveryDate: ff.deliveryDate ? new Date(ff.deliveryDate).toISOString().split('T')[0] : '',
        transportMode: s.shipmentType === 'Transport' ? s.shipmentType : '',
        chaName: ff.agent || ''
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
    if (isTransport) {
      if (!formData.customerName.trim()) newErrors.customerName = 'Customer name is required'
      if (!formData.fromLocation.trim()) newErrors.fromLocation = 'From location is required'
      if (!formData.toLocation.trim()) newErrors.toLocation = 'To location is required'
    } else if (isDORelease) {
      if (!formData.mawb.trim()) newErrors.mawb = 'MAWB No is required'
      if (!formData.customerName.trim()) newErrors.customerName = 'Customer name is required'
    } else {
      if (!formData.consigneeName.trim()) newErrors.consigneeName = 'Consignee name is required'
      if (!formData.shipperName.trim()) newErrors.shipperName = 'Shipper name is required'
      if (!isCHA && !isEditMode && !formData.refNo.trim()) newErrors.refNo = 'Reference number is required'
    }
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) { addToast('Please fix the validation errors', 'warning'); return false }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const shipmentTypeVal = isFFOnly ? 'FF Only' : isDORelease ? 'DO Release' : isTransport ? 'Transport' : (isCHA ? 'CHA Only' : (formData.mode || ''))
      const importExportVal = isCHAExport ? 'Export' : (isCHA ? 'Import' : (formData.importExport || ''))

      if (isEditMode) {
        const updatePromises = []
        updatePromises.push(api.put(`/freight/shipments/${editId}/refno`, { refNo: formData.refNo }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/rates`, { 
          enquiryDate: formData.enquiryDate || null, noOfPackages: formData.noOfPackages ? parseInt(formData.noOfPackages) : null,
          weight: formData.weight ? parseFloat(formData.weight) : undefined, grossWeight: formData.grossWeight ? parseFloat(formData.grossWeight) : undefined,
          notificationEmail: formData.notificationEmail || null,
          customerName: formData.customerName || null,
          vehicleType: formData.vehicleType || null,
          noOfContainers: formData.noOfContainers ? parseInt(formData.noOfContainers) : null,
          packageType: formData.packageType || null,
          fromLocation: formData.fromLocation || null,
          toLocation: formData.toLocation || null,
          deliveryDate: formData.deliveryDate || null
        }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/shipmenttype`, { shipmentType: shipmentTypeVal }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/importexport`, { importExport: importExportVal }))
        if (isDORelease) {
          updatePromises.push(api.put(`/freight/shipments/${editId}/awb`, { hawb: formData.hawb || '', mawb: formData.mawb || '', awbDate: formData.awbDate || null }))
          updatePromises.push(api.put(`/freight/shipments/${editId}/agent`, { agent: formData.chaName }))
        }
        if (!isTransport && !isDORelease) {
          updatePromises.push(api.put(`/freight/shipments/${editId}/awb`, { hawb: formData.hawb || '', mawb: formData.mawb || '', awbDate: formData.awbDate || null }))
          updatePromises.push(api.put(`/freight/shipments/${editId}/consignee`, { consigneeName: formData.consigneeName }))
          updatePromises.push(api.put(`/freight/shipments/${editId}/shipper`, { shipperName: formData.shipperName }))
          updatePromises.push(api.put(`/freight/shipments/${editId}/agent`, { agent: formData.agent }))
        }
        await Promise.all(updatePromises)
        addToast('Shipment updated successfully!', 'success')
        queryClient.removeQueries({ queryKey: ['shipment', editId] })
        queryClient.removeQueries({ queryKey: ['shipments'] })
        const returnParams = new URLSearchParams()
        if (returnPage > 1) returnParams.set('page', returnPage)
        if (returnSearch) returnParams.set('search', returnSearch)
        if (returnStatus) returnParams.set('status', returnStatus)
        if (returnType) returnParams.set('type', returnType)
        const queryString = returnParams.toString()
        setTimeout(() => { window.location.href = `/#/shipment/${editId}?t=${Date.now()}${queryString ? '&' + queryString : ''}` }, 300)
      } else {
        const submitData = { 
          ...formData, refNo: formData.refNo || generateRefNo(),
          enquiryDate: formData.enquiryDate || new Date().toISOString().split('T')[0],
          noOfPackages: formData.noOfPackages ? parseInt(formData.noOfPackages) : null,
          weight: formData.weight ? parseFloat(formData.weight) : null,
          grossWeight: formData.grossWeight ? parseFloat(formData.grossWeight) : null,
          shipmentType: shipmentTypeVal, importExport: importExportVal,
          customerName: formData.customerName || null,
          vehicleType: formData.vehicleType || null,
          noOfContainers: formData.noOfContainers ? parseInt(formData.noOfContainers) : null,
          packageType: formData.packageType || null,
          deliveryDate: formData.deliveryDate || null,
          fromLocation: formData.fromLocation || null,
          toLocation: formData.toLocation || null,
          hawb: formData.hawb || null,
          mawb: formData.mawb || null,
          agent: isDORelease ? formData.chaName : formData.agent
        }
        const response = await api.post('/freight/shipments', submitData)
        localStorage.removeItem(DRAFT_KEY)
        addToast(isFFOnly ? 'FF Only shipment created!' : isDORelease ? 'DO Release created!' : isTransport ? 'Transport shipment created!' : isCHA ? 'CHA Bill created successfully!' : 'Shipment created successfully!', 'success')
        if (isTransport) {
          setTimeout(() => navigate(`/shipment/${response.data.data.id}?tab=accounts`), 500)
        } else if (isDORelease) {
          setTimeout(() => navigate(`/shipment/${response.data.data.id}?tab=accounts`), 500)
        } else if (isFFOnly) {
          setTimeout(() => navigate(`/shipment/${response.data.data.id}`), 500)
        } else {
          setTimeout(() => navigate(`/shipment/${response.data.data.id}${isCHA ? '?tab=customs' : ''}`), 500)
        }
      }
    } catch (err) { addToast(err.response?.data?.message || 'Failed to save', 'error') }
    finally { setLoading(false) }
  }

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
    setFormData({ refNo: '', enquiryDate: new Date().toISOString().split('T')[0], noOfPackages: '', consigneeName: '', shipperName: '', agent: '', importExport: '', mode: '', hawb: '', mawb: '', awbDate: '', weight: '', grossWeight: '', notificationEmail: '', customerName: '', vehicleType: '', noOfContainers: '', packageType: '', fromLocation: '', toLocation: '', deliveryDate: '', transportMode: '', chaName: '' })
    setErrors({}); setTouched({})
  }

  const hasDraft = !isEditMode && localStorage.getItem(DRAFT_KEY)
  const getFieldClass = (name) => errors[name] && touched[name] ? 'border-red-400 bg-red-50' : touched[name] && formData[name] && !errors[name] ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300'
  const focusRing = isFFOnly ? 'focus:ring-purple-500 focus:border-purple-500' : isDORelease ? 'focus:ring-teal-500 focus:border-teal-500' : isTransport ? 'focus:ring-sky-500 focus:border-sky-500' : isCHA ? (isCHAExport ? 'focus:ring-amber-500 focus:border-amber-500' : 'focus:ring-emerald-500 focus:border-emerald-500') : 'focus:ring-indigo-500 focus:border-indigo-500'
  const accentText = isFFOnly ? 'text-purple-400' : isDORelease ? 'text-teal-400' : isTransport ? 'text-sky-400' : isCHAExport ? 'text-amber-400' : isCHA ? 'text-emerald-400' : 'text-indigo-400'
  const inputClass = `w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`
  const accentBg = isFFOnly ? 'from-purple-400 to-indigo-500' : isDORelease ? 'from-teal-400 to-emerald-500' : isTransport ? 'from-sky-400 to-blue-500' : isCHAExport ? 'from-amber-400 to-orange-500' : isCHA ? 'from-emerald-400 to-green-500' : 'from-indigo-500 to-blue-600'

  // ─── PREFIX PICKER UI (NEW) — dropdown + Generate button + manage panel ───
  const renderPrefixPicker = (theme) => {
    const selectClass = `flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 ${focusRing}`
    return (
      <div className="mt-2 space-y-2">
        <div className="relative">
          {/* Game-style spotlight — pulsing glow + bouncing arrow, shown once, */}
          {/* disappears the moment the employee actually picks a prefix.      */}
          {showFirstTimeGuide && (
            <>
              <div className="absolute -top-7 left-2 flex flex-col items-center z-10 pointer-events-none">
                <span className="text-[11px] font-semibold text-indigo-600 bg-white px-2 py-0.5 rounded-full shadow-md border border-indigo-200 whitespace-nowrap">
                  👆 Pick prefix + initials to start
                </span>
                <span className="text-indigo-500 text-sm leading-none animate-bounce">▼</span>
              </div>
              <div className="absolute inset-0 rounded-lg ring-4 ring-indigo-400/60 animate-pulse pointer-events-none" />
            </>
          )}

          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => setShowRefHelp((v) => !v)}
              className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-500 flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
              title="How does this work?"
            >
              i
            </button>
            <select
              value={selectedPrefix}
              onChange={(e) => { setSelectedPrefix(e.target.value); if (e.target.value && selectedInitials) dismissFirstTimeGuide() }}
              className={selectClass}
            >
              <option value="">Select prefix (RE, SI, PIPE...)</option>
              {prefixes.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}
            </select>
            <select
              value={selectedInitials}
              onChange={(e) => { setSelectedInitials(e.target.value); if (e.target.value && selectedPrefix) dismissFirstTimeGuide() }}
              className="w-24 px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 flex-shrink-0"
            >
              <option value="">Initials</option>
              {initialsList.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}
            </select>
            <button
              type="button"
              onClick={() => { handleGenerateRef(); dismissFirstTimeGuide() }}
              disabled={generatingRef || !selectedPrefix || !selectedInitials}
              className={`px-3 py-2 bg-gradient-to-r ${theme} rounded-lg text-xs font-medium text-white flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap`}
            >
              {generatingRef ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate
            </button>
            <button
              type="button"
              onClick={handleResetCounter}
              className="p-2 border border-gray-300 text-gray-400 hover:text-red-600 hover:border-red-300 rounded-lg flex-shrink-0"
              title="Reset counter to 2602"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {showRefHelp && (
          <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-600 space-y-1">
            <p><strong>1.</strong> Pick a prefix from the dropdown (e.g. RE)</p>
            <p><strong>2.</strong> Pick your initials (e.g. GJ)</p>
            <p><strong>3.</strong> Click <strong>Generate</strong> — the number fills in automatically (e.g. RE2602-GJ)</p>
            <p><strong>4.</strong> Don't see your prefix or initials? Open "Manage" below to add them</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowManagePrefixes((v) => !v)}
            className="text-[11px] text-gray-500 hover:text-gray-700 underline"
          >
            {showManagePrefixes ? 'Hide prefix list' : 'Manage prefixes'}
          </button>
          <button
            type="button"
            onClick={() => setShowManageInitials((v) => !v)}
            className="text-[11px] text-gray-500 hover:text-gray-700 underline"
          >
            {showManageInitials ? 'Hide initials list' : 'Manage initials'}
          </button>
        </div>

        {showManageInitials && (
          <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/60">
            {initialsList.length === 0 && <p className="text-[11px] text-gray-400">No initials yet — add yours below.</p>}
            {initialsList.map((p) => (
              <div key={p.code} className="flex items-center gap-2">
                {editingInitialCode === p.code ? (
                  <>
                    <input
                      type="text"
                      value={editingInitialValue}
                      onChange={(e) => setEditingInitialValue(e.target.value)}
                      autoFocus
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                    />
                    <button type="button" onClick={() => saveEditInitial(p.code)} className="px-2 py-1.5 bg-emerald-500 text-white rounded-md text-[11px] font-medium">Save</button>
                    <button type="button" onClick={cancelEditInitial} className="px-2 py-1.5 border border-gray-300 text-gray-500 rounded-md text-[11px]">Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-xs font-semibold text-gray-700">{p.code}</span>
                    <button type="button" onClick={() => startEditInitial(p.code)} className="p-1.5 text-gray-400 hover:text-indigo-600" title="Edit"><Pencil size={13} /></button>
                    <button type="button" onClick={() => handleDeleteInitial(p.code)} className="p-1.5 text-gray-400 hover:text-red-600" title="Delete"><AlertCircle size={13} className="rotate-45" /></button>
                  </>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <input
                type="text"
                value={newInitialInput}
                onChange={(e) => setNewInitialInput(e.target.value)}
                placeholder="Your initials, e.g. GJ"
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs"
              />
              <button
                type="button"
                onClick={handleAddInitial}
                disabled={addingInitial || !newInitialInput.trim()}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-md text-[11px] font-medium flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
              >
                {addingInitial ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add
              </button>
            </div>
          </div>
        )}

        {showManagePrefixes && (
          <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/60">
            {prefixes.length === 0 && <p className="text-[11px] text-gray-400">No prefixes yet — add one below.</p>}
            {prefixes.map((p) => (
              <div key={p.code} className="flex items-center gap-2">
                {editingCode === p.code ? (
                  <>
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      autoFocus
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                    />
                    <button type="button" onClick={() => saveEditPrefix(p.code)} className="px-2 py-1.5 bg-emerald-500 text-white rounded-md text-[11px] font-medium">Save</button>
                    <button type="button" onClick={cancelEditPrefix} className="px-2 py-1.5 border border-gray-300 text-gray-500 rounded-md text-[11px]">Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-xs font-semibold text-gray-700">{p.code}</span>
                    <button type="button" onClick={() => startEditPrefix(p.code)} className="p-1.5 text-gray-400 hover:text-indigo-600" title="Edit"><Pencil size={13} /></button>
                    <button type="button" onClick={() => handleDeletePrefix(p.code)} className="p-1.5 text-gray-400 hover:text-red-600" title="Delete"><AlertCircle size={13} className="rotate-45" /></button>
                  </>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <input
                type="text"
                value={newPrefixInput}
                onChange={(e) => setNewPrefixInput(e.target.value)}
                placeholder="New prefix, e.g. PIPE"
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs"
              />
              <button
                type="button"
                onClick={handleAddPrefix}
                disabled={addingPrefix || !newPrefixInput.trim()}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-md text-[11px] font-medium flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
              >
                {addingPrefix ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

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
          <div className={`w-12 h-12 bg-gradient-to-br ${accentBg} rounded-xl flex items-center justify-center shadow-lg`}>
            {isEditMode ? <Pencil size={22} className="text-white" /> : isFFOnly ? <FileText size={22} className="text-white" /> : isDORelease ? <ClipboardList size={22} className="text-white" /> : isTransport ? <Truck size={22} className="text-white" /> : isCHA ? <FileCheck size={22} className="text-white" /> : <Ship size={22} className="text-white" />}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
              {isEditMode ? `Edit: ${formData.refNo}` : isFFOnly ? 'New FF Only Shipment' : isDORelease ? 'New DO Release' : isTransport ? 'New Transport Shipment' : isCHAExport ? 'New CHA Bill Export' : isCHA ? 'New CHA Bill Import' : 'New Freight Shipment'}
            </h2>
          </div>
          {isEditMode && <Link to={`/shipment/${editId}`} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-lg hover:from-indigo-600 hover:to-blue-700 text-sm font-medium shadow-lg"><Eye size={16} /> View Shipment</Link>}
        </div>
      </div>

      {!isEditMode && (
        <div className="mb-6">
          <div className="flex bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-1 border border-indigo-100 flex-wrap">
            <button type="button" onClick={() => setShipmentMode('ff-only')} className={`px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'ff-only' ? 'bg-white text-purple-700 shadow-md' : 'text-gray-500 hover:text-purple-600'}`}>📋 FF Only</button>
            <button type="button" onClick={() => setShipmentMode('freight')} className={`px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'freight' ? 'bg-white text-indigo-700 shadow-md' : 'text-gray-500 hover:text-indigo-600'}`}>🚢 Freight</button>
            <button type="button" onClick={() => setShipmentMode('cha-import')} className={`px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'cha-import' ? 'bg-white text-emerald-700 shadow-md' : 'text-gray-500 hover:text-emerald-600'}`}>🛃 CHA Import</button>
            <button type="button" onClick={() => setShipmentMode('cha-export')} className={`px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'cha-export' ? 'bg-white text-amber-700 shadow-md' : 'text-gray-500 hover:text-amber-600'}`}>📤 CHA Export</button>
            <button type="button" onClick={() => setShipmentMode('transport')} className={`px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'transport' ? 'bg-white text-sky-700 shadow-md' : 'text-gray-500 hover:text-sky-600'}`}>🚛 Transport</button>
            <button type="button" onClick={() => setShipmentMode('do-release')} className={`px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${shipmentMode === 'do-release' ? 'bg-white text-teal-700 shadow-md' : 'text-gray-500 hover:text-teal-600'}`}>📋 DO Release</button>
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

          {/* FF ONLY — same as FREIGHT form */}
          {isFFOnly && (
            <>
              <div className="p-6 border-b border-purple-100 bg-gradient-to-br from-white to-purple-50/30">
                <div className="flex items-center gap-2 mb-1"><Hash size={16} className="text-purple-500" /><h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wider">Reference Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Reference Number <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      <div className="relative flex-1"><input type="text" name="refNo" value={formData.refNo} onChange={handleChange} placeholder="Generate below or type manually" className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} ${getFieldClass('refNo')}`} /></div>
                    </div>
                    {!isEditMode && renderPrefixPicker('from-purple-500 to-indigo-500')}
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Enquiry Date</label>
                    <div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" /><input type="date" name="enquiryDate" value={formData.enquiryDate} onChange={handleChange} className={`w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} /></div>
                  </div>
                </div>
              </div>
              <div className="p-6 border-b border-purple-100">
                <div className="flex items-center gap-2 mb-1"><Ship size={16} className="text-purple-500" /><h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wider">Shipment Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Number of Packages</label><div className="relative"><Box size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" /><input type="number" name="noOfPackages" value={formData.noOfPackages} onChange={handleChange} min="1" className={`${inputClass} ${getFieldClass('noOfPackages')}`} /></div></div>
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
              <div className="p-6 border-b border-purple-100">
                <div className="flex items-center gap-2 mb-1"><Building2 size={16} className="text-purple-500" /><h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wider">Parties Involved</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Consignee Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" /><input type="text" name="consigneeName" value={formData.consigneeName} onChange={handleChange} className={`${inputClass} ${getFieldClass('consigneeName')}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Shipper Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" /><input type="text" name="shipperName" value={formData.shipperName} onChange={handleChange} className={`${inputClass} ${getFieldClass('shipperName')}`} /></div></div>
                </div>
              </div>
              <div className="p-6 border-b border-purple-100">
                <div className="flex items-center gap-2 mb-1"><Globe size={16} className="text-purple-500" /><h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wider">Agent Information</h3></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Agent / Forwarder</label><div className="relative"><Anchor size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" /><input type="text" name="agent" value={formData.agent} onChange={handleChange} className={`${inputClass}`} /></div></div>
              </div>
              <div className="p-6 border-b border-purple-100">
                <div className="flex items-center gap-2 mb-1"><Scale size={16} className="text-purple-500" /><h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wider">Weight Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Gross Weight (kg)</label><div className="relative"><Scale size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" /><input type="number" name="grossWeight" value={formData.grossWeight} onChange={handleChange} step="0.01" className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Chargeable Weight (kg)</label><div className="relative"><Weight size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" /><input type="number" name="weight" value={formData.weight} onChange={handleChange} step="0.01" className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">No of Packages</label><div className="relative"><Box size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" /><input type="number" name="noOfPackages" value={formData.noOfPackages} onChange={handleChange} min="1" className={`${inputClass}`} /></div></div>
                </div>
              </div>
              <div className="p-6 border-b border-amber-100 bg-gradient-to-br from-amber-50/30 to-yellow-50/30">
                <div className="flex items-center gap-2 mb-1"><Mail size={16} className="text-amber-500" /><h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Client Notification</h3></div>
                <p className="text-[11px] text-amber-500 mb-4">Client will receive automatic email updates on key status changes</p>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Notification Email</label><div className="relative"><Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" /><input type="email" name="notificationEmail" value={formData.notificationEmail} onChange={handleChange} placeholder="client@example.com" className={`${inputClass.replace(focusRing, 'focus:ring-amber-500 focus:border-amber-500')}`} /></div></div>
              </div>
            </>
          )}

          {/* DO RELEASE FORM */}
          {isDORelease && (
            <>
              <div className="p-6 border-b border-teal-100 bg-gradient-to-br from-white to-teal-50/30">
                <div className="flex items-center gap-2 mb-1"><Hash size={16} className="text-teal-500" /><h3 className="text-sm font-semibold text-teal-700 uppercase tracking-wider">Reference Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">DO Ref No</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1"><Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400" /><input type="text" name="refNo" value={formData.refNo} onChange={handleChange} placeholder="DOR-2026..." className={`${inputClass}`} /></div>
                      {!isEditMode && <button type="button" onClick={() => setFormData(prev => ({ ...prev, refNo: generateRefNo() }))} className="px-3 py-2.5 bg-gradient-to-r from-teal-100 to-emerald-100 rounded-lg text-xs font-medium text-teal-600 flex items-center gap-1"><Sparkles size={14} />Auto</button>}
                    </div>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
                    <div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400" /><input type="date" name="enquiryDate" value={formData.enquiryDate} onChange={handleChange} className={`${inputClass}`} /></div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-b border-teal-100">
                <div className="flex items-center gap-2 mb-1"><ClipboardList size={16} className="text-teal-500" /><h3 className="text-sm font-semibold text-teal-700 uppercase tracking-wider">DO Release Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">MAWB No <span className="text-red-500">*</span></label>
                    <div className="relative"><Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400" /><input type="text" name="mawb" value={formData.mawb} onChange={handleChange} placeholder="MAWB number" className={`${inputClass} ${getFieldClass('mawb')}`} /></div>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">HAWB No</label>
                    <div className="relative"><Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400" /><input type="text" name="hawb" value={formData.hawb} onChange={handleChange} placeholder="HAWB number" className={`${inputClass}`} /></div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">CHA Name</label>
                    <div className="relative"><Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400" /><input type="text" name="chaName" value={formData.chaName} onChange={handleChange} placeholder="CHA agent name" className={`${inputClass}`} /></div>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Customer Name <span className="text-red-500">*</span></label>
                    <div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400" /><input type="text" name="customerName" value={formData.customerName} onChange={handleChange} placeholder="Customer name" className={`${inputClass} ${getFieldClass('customerName')}`} /></div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-b border-amber-100 bg-gradient-to-br from-amber-50/30 to-yellow-50/30">
                <div className="flex items-center gap-2 mb-1"><Mail size={16} className="text-amber-500" /><h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Client Notification</h3></div>
                <p className="text-[11px] text-amber-500 mb-4">Client will receive automatic email updates on key status changes</p>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Notification Email</label><div className="relative"><Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" /><input type="email" name="notificationEmail" value={formData.notificationEmail} onChange={handleChange} placeholder="client@example.com" className={`${inputClass.replace(focusRing, 'focus:ring-amber-500 focus:border-amber-500')}`} /></div></div>
              </div>
            </>
          )}

          {/* FREIGHT SHIPMENT */}
          {shipmentMode === 'freight' && (
            <>
              <div className="p-6 border-b border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
                <div className="flex items-center gap-2 mb-1"><Hash size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Reference Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Reference Number <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      <div className="relative flex-1"><input type="text" name="refNo" value={formData.refNo} onChange={handleChange} placeholder="Generate below or type manually" className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} ${getFieldClass('refNo')}`} /></div>
                    </div>
                    {!isEditMode && renderPrefixPicker('from-indigo-500 to-blue-500')}
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
                <div className="flex items-center gap-2 mb-1"><Scale size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Weight Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Gross Weight (kg)</label><div className="relative"><Scale size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="number" name="grossWeight" value={formData.grossWeight} onChange={handleChange} step="0.01" className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Chargeable Weight (kg)</label><div className="relative"><Weight size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="number" name="weight" value={formData.weight} onChange={handleChange} step="0.01" className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">No of Packages</label><div className="relative"><Box size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" /><input type="number" name="noOfPackages" value={formData.noOfPackages} onChange={handleChange} min="1" className={`${inputClass}`} /></div></div>
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

          {/* TRANSPORT SHIPMENT */}
          {isTransport && (
            <>
              <div className="p-6 border-b border-sky-100 bg-gradient-to-br from-white to-sky-50/30">
                <div className="flex items-center gap-2 mb-1"><Truck size={16} className="text-sky-500" /><h3 className="text-sm font-semibold text-sky-700 uppercase tracking-wider">Reference Details</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Vehicle No</label>
                    <div className="relative"><Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400" /><input type="text" name="refNo" value={formData.refNo} onChange={handleChange} placeholder="KA-01-AB-1234" className={`${inputClass}`} /></div>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
                    <div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400" /><input type="date" name="enquiryDate" value={formData.enquiryDate} onChange={handleChange} className={`${inputClass}`} /></div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-b border-sky-100">
                <div className="flex items-center gap-2 mb-1"><User size={16} className="text-sky-500" /><h3 className="text-sm font-semibold text-sky-700 uppercase tracking-wider">Customer Details</h3></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Customer Name <span className="text-red-500">*</span></label><div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400" /><input type="text" name="customerName" value={formData.customerName} onChange={handleChange} placeholder="Customer name" className={`${inputClass} ${getFieldClass('customerName')}`} /></div></div>
              </div>

              <div className="p-6 border-b border-sky-100">
                <div className="flex items-center gap-2 mb-1"><Ship size={16} className="text-sky-500" /><h3 className="text-sm font-semibold text-sky-700 uppercase tracking-wider">Transport Details</h3></div>
                <div className="mb-4"><label className="block text-sm font-medium text-gray-700 mb-1.5">Transport Mode</label>
                  <div className="flex gap-2">
                    <select name="transportMode" value={TRANSPORT_MODE_OPTIONS.includes(formData.transportMode) ? formData.transportMode : ''} onChange={handleChange} className={`flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} bg-white`}><option value="">Select mode...</option>{TRANSPORT_MODE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    <input type="text" name="transportMode" value={!TRANSPORT_MODE_OPTIONS.includes(formData.transportMode) ? formData.transportMode : ''} onChange={handleChange} placeholder="Or type..." className={`w-1/3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Vehicle Type</label>
                    <div className="flex gap-2">
                      <select name="vehicleType" value={VEHICLE_TYPES.includes(formData.vehicleType) ? formData.vehicleType : ''} onChange={handleChange} className={`flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} bg-white`}><option value="">Select...</option>{VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                      <input type="text" name="vehicleType" value={!VEHICLE_TYPES.includes(formData.vehicleType) ? formData.vehicleType : ''} onChange={handleChange} placeholder="Or type..." className={`w-1/3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} />
                    </div>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">No of Containers</label><div className="relative"><Box size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400" /><input type="number" name="noOfContainers" value={formData.noOfContainers} onChange={handleChange} min="1" className={`${inputClass}`} /></div></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Package Type</label>
                  <div className="flex gap-2">
                    <select name="packageType" value={PACKAGE_TYPES.includes(formData.packageType) ? formData.packageType : ''} onChange={handleChange} className={`flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing} bg-white`}><option value="">Select...</option>{PACKAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    <input type="text" name="packageType" value={!PACKAGE_TYPES.includes(formData.packageType) ? formData.packageType : ''} onChange={handleChange} placeholder="Or type..." className={`w-1/3 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusRing}`} />
                  </div>
                </div>
              </div>

              <div className="p-6 border-b border-sky-100">
                <div className="flex items-center gap-2 mb-1"><MapPin size={16} className="text-sky-500" /><h3 className="text-sm font-semibold text-sky-700 uppercase tracking-wider">Route & Delivery</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">From <span className="text-red-500">*</span></label><div className="relative"><MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400" /><input type="text" name="fromLocation" value={formData.fromLocation} onChange={handleChange} placeholder="Origin" className={`${inputClass} ${getFieldClass('fromLocation')}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">To <span className="text-red-500">*</span></label><div className="relative"><MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400" /><input type="text" name="toLocation" value={formData.toLocation} onChange={handleChange} placeholder="Destination" className={`${inputClass} ${getFieldClass('toLocation')}`} /></div></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Delivery Date</label><div className="relative"><Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400" /><input type="date" name="deliveryDate" value={formData.deliveryDate} onChange={handleChange} className={`${inputClass}`} /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Weight (kg)</label><div className="relative"><Scale size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400" /><input type="number" name="weight" value={formData.weight} onChange={handleChange} step="0.01" className={`${inputClass}`} /></div></div>
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
              <button type="submit" disabled={loading} className={`px-6 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg ${isFFOnly ? 'bg-gradient-to-r from-purple-500 to-indigo-600 shadow-purple-200' : isDORelease ? 'bg-gradient-to-r from-teal-500 to-emerald-600 shadow-teal-200' : isTransport ? 'bg-gradient-to-r from-sky-500 to-blue-600 shadow-sky-200' : isCHAExport && !isEditMode ? 'bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-200' : isCHA && !isEditMode ? 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-emerald-200' : 'bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-200'}`}>
                {loading ? <><Loader2 size={16} className="animate-spin" />Saving...</> : <>{isEditMode ? <Pencil size={16} /> : isFFOnly ? <FileText size={16} /> : isDORelease ? <ClipboardList size={16} /> : isTransport ? <Truck size={16} /> : isCHA ? <FileCheck size={16} /> : <Ship size={16} />}{isEditMode ? 'Update Shipment' : isFFOnly ? 'Create FF Only' : isDORelease ? 'Create DO Release' : isTransport ? 'Create Transport' : isCHAExport ? 'Create CHA Export Bill' : isCHA ? 'Create CHA Import Bill' : 'Create Shipment'}</>}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}