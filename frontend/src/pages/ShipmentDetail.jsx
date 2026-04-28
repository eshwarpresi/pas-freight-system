import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  ArrowLeft, Package, Ship, FileCheck, Receipt, Edit3, Save, X,
  CheckCircle2, Clock, Truck, Plane, FileText, ClipboardCheck,
  ClipboardList, Banknote, Send, MapPin, Barcode, Calendar, User,
  Hash, Weight, DollarSign, Anchor, Copy, Check, Printer
} from 'lucide-react'

export default function ShipmentDetail() {
  const { id } = useParams()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState('freight')
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(null)
  const queryClient = useQueryClient()

  const { data: shipment, isLoading, refetch } = useQuery({
    queryKey: ['shipment', id],
    queryFn: async () => {
      const res = await api.get(`/freight/shipments/${id}`)
      return res.data.data
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ section, data }) => {
      const endpoints = {
        rates: { url: `/freight/shipments/${id}/rates`, method: 'put' },
        nomination: { url: `/freight/shipments/${id}/nomination`, method: 'put' },
        booking: { url: `/freight/shipments/${id}/booking`, method: 'put' },
        schedule: { url: `/freight/shipments/${id}/schedule`, method: 'put' },
        awb: { url: `/freight/shipments/${id}/awb`, method: 'put' },
        checklist: { url: `/cha/shipments/${id}/checklist`, method: 'put' },
        boe: { url: `/cha/shipments/${id}/boe`, method: 'put' },
        do: { url: `/cha/shipments/${id}/do-collection`, method: 'put' },
        ooc: { url: `/cha/shipments/${id}/ooc`, method: 'put' },
        gatepass: { url: `/cha/shipments/${id}/gate-pass`, method: 'put' },
        pod: { url: `/cha/shipments/${id}/pod`, method: 'put' },
        invoice: { url: `/accounts/shipments/${id}/invoice`, method: 'put' },
        invoiceSend: { url: `/accounts/shipments/${id}/invoice-send`, method: 'put' },
      }
      return api[endpoints[section].method](endpoints[section].url, data)
    },
    onSuccess: () => {
      addToast('Updated successfully!', 'success')
      setEditing(null)
      refetch()
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
    },
    onError: (err) => {
      addToast(err.response?.data?.message || 'Update failed', 'error')
    }
  })

  const handlePrint = () => {
    const ff = shipment?.freightForwarding || {}
    const cha = shipment?.cha || {}
    const acc = shipment?.accounts || {}
    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    printWindow.document.write(`
      <html>
        <head>
          <title>${shipment.refNo} - PAS Freight</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #1a1a1a; }
            .header { border-bottom: 3px solid #1e40af; padding-bottom: 15px; margin-bottom: 25px; }
            .header h1 { color: #1e40af; margin: 0; font-size: 22px; }
            .header p { margin: 3px 0; color: #666; font-size: 13px; }
            .ref { font-size: 18px; font-weight: bold; color: #1e40af; margin: 10px 0; }
            .status { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; background: #dbeafe; color: #1e40af; }
            .section { margin-bottom: 25px; }
            .section h2 { font-size: 15px; color: #1e40af; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
            .item { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
            .item label { font-size: 10px; color: #9ca3af; display: block; text-transform: uppercase; }
            .item span { font-size: 13px; color: #1f2937; font-weight: 500; }
            .footer { margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 11px; color: #9ca3af; text-align: center; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🚢 PAS Freight Services Pvt Ltd</h1>
            <p>Shipment Details Report</p>
            <p>Generated: ${new Date().toLocaleString()}</p>
          </div>
          <div class="ref">${shipment.refNo} <span class="status">${shipment.currentStatus.replace(/_/g, ' ')}</span></div>
          
          <div class="section">
            <h2>📦 Freight Forwarding</h2>
            <div class="grid">
              <div class="item"><label>Consignee</label><span>${ff.consigneeName || '—'}</span></div>
              <div class="item"><label>Shipper</label><span>${ff.shipperName || '—'}</span></div>
              <div class="item"><label>Agent</label><span>${ff.agent || '—'}</span></div>
              <div class="item"><label>Packages</label><span>${ff.noOfPackages || '—'}</span></div>
              <div class="item"><label>Selling Rate</label><span>${ff.sellingRate ? '$' + ff.sellingRate : '—'}</span></div>
              <div class="item"><label>Weight</label><span>${ff.weight ? ff.weight + ' kg' : '—'}</span></div>
              <div class="item"><label>Booking Date</label><span>${fmt(ff.bookingDate)}</span></div>
              <div class="item"><label>ETD</label><span>${fmt(ff.etd)}</span></div>
              <div class="item"><label>ETA</label><span>${fmt(ff.eta)}</span></div>
              <div class="item"><label>MAWB</label><span>${ff.mawb || '—'}</span></div>
              <div class="item"><label>HAWB</label><span>${ff.hawb || '—'}</span></div>
              <div class="item"><label>AWB Date</label><span>${fmt(ff.awbDate)}</span></div>
            </div>
          </div>

          <div class="section">
            <h2>🛃 Customs Clearance (CHA)</h2>
            <div class="grid">
              <div class="item"><label>Job No</label><span>${cha.jobNo || '—'}</span></div>
              <div class="item"><label>Checklist Date</label><span>${fmt(cha.checklistDate)}</span></div>
              <div class="item"><label>BOE No</label><span>${cha.boeNo || '—'}</span></div>
              <div class="item"><label>BOE Date</label><span>${fmt(cha.boeDate)}</span></div>
              <div class="item"><label>DO Collection</label><span>${fmt(cha.doCollectionDate)}</span></div>
              <div class="item"><label>OOC Date</label><span>${fmt(cha.oocDate)}</span></div>
              <div class="item"><label>Gate Pass</label><span>${fmt(cha.gatePassDate)}</span></div>
              <div class="item"><label>Delivery Date</label><span>${fmt(cha.deliveryDate)}</span></div>
              <div class="item"><label>Tracking No</label><span>${cha.trackingNumber || '—'}</span></div>
            </div>
          </div>

          <div class="section">
            <h2>💰 Accounts</h2>
            <div class="grid">
              <div class="item"><label>Invoice No</label><span>${acc.invoiceNumber || '—'}</span></div>
              <div class="item"><label>Invoice Date</label><span>${fmt(acc.invoiceDate)}</span></div>
              <div class="item"><label>Sending Date</label><span>${fmt(acc.sendingDate)}</span></div>
            </div>
          </div>

          <div class="footer">© 2026 PAS Freight Services Pvt Ltd | This is a computer-generated document.</div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleEdit = (section) => {
    setEditing(section)
    const ff = shipment?.freightForwarding || {}
    const cha = shipment?.cha || {}
    const acc = shipment?.accounts || {}
    const defaults = {
      rates: { sellingRate: ff.sellingRate || '', weight: ff.weight || '' },
      nomination: { nominationDate: ff.nominationDate?.split('T')[0] || '' },
      booking: { bookingDate: ff.bookingDate?.split('T')[0] || '' },
      schedule: { etd: ff.etd?.split('T')[0] || '', eta: ff.eta?.split('T')[0] || '' },
      awb: { mawb: ff.mawb || '', hawb: ff.hawb || '', awbDate: ff.awbDate?.split('T')[0] || new Date().toISOString().split('T')[0] },
      checklist: { jobNo: cha.jobNo || '', checklistDate: cha.checklistDate?.split('T')[0] || new Date().toISOString().split('T')[0], checklistApprovalDate: cha.checklistApprovalDate?.split('T')[0] || '' },
      boe: { boeNo: cha.boeNo || '', boeDate: cha.boeDate?.split('T')[0] || '' },
      do: { doCollectionDate: cha.doCollectionDate?.split('T')[0] || '' },
      ooc: { oocDate: cha.oocDate?.split('T')[0] || '' },
      gatepass: { gatePassDate: cha.gatePassDate?.split('T')[0] || '' },
      pod: { deliveryDate: cha.deliveryDate?.split('T')[0] || '', trackingNumber: cha.trackingNumber || '' },
      invoice: { invoiceNumber: acc.invoiceNumber || '', invoiceDate: acc.invoiceDate?.split('T')[0] || new Date().toISOString().split('T')[0] },
      invoiceSend: { sendingDate: acc.sendingDate?.split('T')[0] || new Date().toISOString().split('T')[0] },
    }
    setFormData(defaults[section] || {})
  }

  const handleSave = (section) => {
    setSaving(true)
    updateMutation.mutate({ section, data: formData }, { onSettled: () => setSaving(false) })
  }

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    addToast('Copied to clipboard!', 'info')
    setTimeout(() => setCopied(null), 2000)
  }

  const getStatusBadge = (status) => {
    const badges = {
      'ENQUIRY': 'bg-amber-50 text-amber-700 border-amber-200', 'RATES_ADDED': 'bg-sky-50 text-sky-700 border-sky-200',
      'NOMINATED': 'bg-violet-50 text-violet-700 border-violet-200', 'BOOKED': 'bg-indigo-50 text-indigo-700 border-indigo-200',
      'SCHEDULED': 'bg-cyan-50 text-cyan-700 border-cyan-200', 'AWB_GENERATED': 'bg-teal-50 text-teal-700 border-teal-200',
      'CHECKLIST_APPROVED': 'bg-emerald-50 text-emerald-700 border-emerald-200', 'BOE_FILED': 'bg-lime-50 text-lime-700 border-lime-200',
      'DO_COLLECTED': 'bg-green-50 text-green-700 border-green-200', 'OOC_DONE': 'bg-blue-50 text-blue-700 border-blue-200',
      'GATE_PASS': 'bg-purple-50 text-purple-700 border-purple-200', 'DELIVERED': 'bg-green-100 text-green-800 border-green-300',
      'INVOICE_GENERATED': 'bg-orange-50 text-orange-700 border-orange-200', 'INVOICE_SENT': 'bg-rose-50 text-rose-700 border-rose-200',
      'COMPLETED': 'bg-gray-100 text-gray-700 border-gray-300',
    }
    return badges[status] || 'bg-gray-50 text-gray-600 border-gray-200'
  }

  const progressSteps = [
    { status: 'ENQUIRY', label: 'Enquiry', icon: ClipboardList }, { status: 'RATES_ADDED', label: 'Rates', icon: DollarSign },
    { status: 'NOMINATED', label: 'Nominated', icon: User }, { status: 'BOOKED', label: 'Booked', icon: Calendar },
    { status: 'SCHEDULED', label: 'Scheduled', icon: Clock }, { status: 'AWB_GENERATED', label: 'AWB', icon: Barcode },
    { status: 'CHECKLIST_APPROVED', label: 'Checklist', icon: ClipboardCheck }, { status: 'BOE_FILED', label: 'BOE', icon: FileText },
    { status: 'DO_COLLECTED', label: 'DO', icon: FileCheck }, { status: 'OOC_DONE', label: 'OOC', icon: CheckCircle2 },
    { status: 'GATE_PASS', label: 'Gate Pass', icon: Truck }, { status: 'DELIVERED', label: 'Delivered', icon: MapPin },
    { status: 'INVOICE_GENERATED', label: 'Invoice', icon: Banknote }, { status: 'INVOICE_SENT', label: 'Sent', icon: Send },
  ]

  const currentStepIndex = progressSteps.findIndex(s => s.status === shipment?.currentStatus)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!shipment) {
    return (
      <div className="text-center py-16">
        <Package size={56} className="mx-auto text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">Shipment not found</h3>
        <Link to="/" className="inline-flex items-center gap-1 mt-4 text-blue-600"><ArrowLeft size={14} /> Back</Link>
      </div>
    )
  }

  const ff = shipment.freightForwarding || {}
  const cha = shipment.cha || {}
  const accounts = shipment.accounts || {}

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft size={15} /> Back to shipments
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{shipment.refNo}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(shipment.currentStatus)}`}>
                {shipment.currentStatus.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Created {new Date(shipment.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          {/* PRINT BUTTON */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors shadow-sm"
          >
            <Printer size={16} />
            Print Shipment
          </button>
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-0 min-w-max">
          {progressSteps.map((step, i) => {
            const Icon = step.icon
            const isCompleted = i <= currentStepIndex
            const isCurrent = i === currentStepIndex
            return (
              <div key={step.status} className="flex items-center">
                <div className={`flex flex-col items-center ${isCompleted ? 'opacity-100' : 'opacity-40'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                    isCurrent ? 'border-blue-500 bg-blue-50 scale-110' : isCompleted ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'
                  }`}>
                    {isCompleted ? <CheckCircle2 size={16} className="text-green-600" /> : <Icon size={16} className="text-gray-400" />}
                  </div>
                  <span className={`text-[10px] mt-1.5 font-medium whitespace-nowrap ${isCurrent ? 'text-blue-600' : 'text-gray-500'}`}>{step.label}</span>
                </div>
                {i < progressSteps.length - 1 && <div className={`w-8 h-0.5 mx-0.5 mt-[-16px] ${i < currentStepIndex ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {[{ key: 'freight', label: 'Freight', icon: Ship }, { key: 'cha', label: 'Customs', icon: FileCheck }, { key: 'accounts', label: 'Accounts', icon: Receipt }, { key: 'history', label: 'Timeline', icon: Clock }].map((tab) => {
          const Icon = tab.icon
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${activeTab === tab.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon size={16} /> <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        {activeTab === 'freight' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <InfoCard icon={User} label="Consignee" value={ff.consigneeName} />
              <InfoCard icon={User} label="Shipper" value={ff.shipperName} />
              <InfoCard icon={Anchor} label="Agent" value={ff.agent} />
              <InfoCard icon={Package} label="Packages" value={ff.noOfPackages} />
            </div>
            <EditableSection title="Rates" value={ff.sellingRate ? `$${ff.sellingRate} / ${ff.weight}kg` : null} onEdit={() => handleEdit('rates')}>
              {editing === 'rates' && <EditForm onSave={() => handleSave('rates')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField icon={DollarSign} label="Selling Rate" name="sellingRate" value={formData.sellingRate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="number" />
                <FormField icon={Weight} label="Weight (kg)" name="weight" value={formData.weight} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="number" />
              </EditForm>}
            </EditableSection>
            <EditableSection title="Nomination" value={ff.nominationDate ? new Date(ff.nominationDate).toLocaleDateString() : null} onEdit={() => handleEdit('nomination')}>
              {editing === 'nomination' && <EditForm onSave={() => handleSave('nomination')} onCancel={() => setEditing(null)} saving={saving}><FormField icon={Calendar} label="Nomination Date" name="nominationDate" value={formData.nominationDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" /></EditForm>}
            </EditableSection>
            <EditableSection title="Booking" value={ff.bookingDate ? new Date(ff.bookingDate).toLocaleDateString() : null} onEdit={() => handleEdit('booking')}>
              {editing === 'booking' && <EditForm onSave={() => handleSave('booking')} onCancel={() => setEditing(null)} saving={saving}><FormField icon={Calendar} label="Booking Date" name="bookingDate" value={formData.bookingDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" /></EditForm>}
            </EditableSection>
            <EditableSection title="Schedule" value={ff.etd ? `ETD: ${new Date(ff.etd).toLocaleDateString()} | ETA: ${new Date(ff.eta).toLocaleDateString()}` : null} onEdit={() => handleEdit('schedule')}>
              {editing === 'schedule' && <EditForm onSave={() => handleSave('schedule')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField icon={Plane} label="ETD" name="etd" value={formData.etd} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />
                <FormField icon={Plane} label="ETA" name="eta" value={formData.eta} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />
              </EditForm>}
            </EditableSection>
            <EditableSection title="AWB Details" value={ff.mawb ? `MAWB: ${ff.mawb} / HAWB: ${ff.hawb}` : null} onEdit={() => handleEdit('awb')}>
              {editing === 'awb' && <EditForm onSave={() => handleSave('awb')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField icon={Barcode} label="MAWB / MBL" name="mawb" value={formData.mawb} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} />
                <FormField icon={Barcode} label="HAWB / HBL" name="hawb" value={formData.hawb} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} />
                <FormField icon={Calendar} label="AWB Date" name="awbDate" value={formData.awbDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />
              </EditForm>}
            </EditableSection>
          </div>
        )}

        {activeTab === 'cha' && (
          <div className="space-y-4">
            {['checklist','boe','do','ooc','gatepass','pod'].map(section => (
              <EditableSection key={section} title={section === 'pod' ? 'POD (Delivery)' : section === 'do' ? 'DO Collection' : section === 'gatepass' ? 'Gate Pass' : section.toUpperCase()} 
                value={
                  section === 'checklist' ? (cha.jobNo ? `Job: ${cha.jobNo}` : null) :
                  section === 'boe' ? (cha.boeNo ? `BOE: ${cha.boeNo}` : null) :
                  section === 'do' ? (cha.doCollectionDate ? new Date(cha.doCollectionDate).toLocaleDateString() : null) :
                  section === 'ooc' ? (cha.oocDate ? new Date(cha.oocDate).toLocaleDateString() : null) :
                  section === 'gatepass' ? (cha.gatePassDate ? new Date(cha.gatePassDate).toLocaleDateString() : null) :
                  cha.deliveryDate ? `Delivered: ${new Date(cha.deliveryDate).toLocaleDateString()}` : null
                } onEdit={() => handleEdit(section)}>
                {editing === section && <EditForm onSave={() => handleSave(section)} onCancel={() => setEditing(null)} saving={saving}>
                  {section === 'checklist' && <>
                    <FormField icon={Hash} label="Job No" name="jobNo" value={formData.jobNo} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} />
                    <FormField icon={Calendar} label="Checklist Date" name="checklistDate" value={formData.checklistDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />
                    <FormField icon={CheckCircle2} label="Approval Date" name="checklistApprovalDate" value={formData.checklistApprovalDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />
                  </>}
                  {section === 'boe' && <>
                    <FormField icon={FileText} label="BOE Number" name="boeNo" value={formData.boeNo} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} />
                    <FormField icon={Calendar} label="BOE Date" name="boeDate" value={formData.boeDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />
                  </>}
                  {section === 'do' && <FormField icon={Calendar} label="DO Collection Date" name="doCollectionDate" value={formData.doCollectionDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />}
                  {section === 'ooc' && <FormField icon={Calendar} label="OOC Date" name="oocDate" value={formData.oocDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />}
                  {section === 'gatepass' && <FormField icon={Calendar} label="Gate Pass Date" name="gatePassDate" value={formData.gatePassDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />}
                  {section === 'pod' && <>
                    <FormField icon={Calendar} label="Delivery Date" name="deliveryDate" value={formData.deliveryDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />
                    <FormField icon={Barcode} label="Tracking Number" name="trackingNumber" value={formData.trackingNumber} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} />
                  </>}
                </EditForm>}
              </EditableSection>
            ))}
            {cha.trackingNumber && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-sm">
                <Barcode size={16} className="text-blue-600" />
                <span className="text-blue-700 font-mono">{cha.trackingNumber}</span>
                <button onClick={() => copyToClipboard(cha.trackingNumber, 'tracking')} className="ml-auto text-blue-600 hover:text-blue-800">
                  {copied === 'tracking' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'accounts' && (
          <div className="space-y-4">
            <EditableSection title="Invoice" value={accounts.invoiceNumber ? `Inv: ${accounts.invoiceNumber}` : null} onEdit={() => handleEdit('invoice')}>
              {editing === 'invoice' && <EditForm onSave={() => handleSave('invoice')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField icon={Hash} label="Invoice Number" name="invoiceNumber" value={formData.invoiceNumber} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} />
                <FormField icon={Calendar} label="Invoice Date" name="invoiceDate" value={formData.invoiceDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />
              </EditForm>}
            </EditableSection>
            <EditableSection title="Invoice Sending" value={accounts.sendingDate ? `Sent: ${new Date(accounts.sendingDate).toLocaleDateString()}` : null} onEdit={() => handleEdit('invoiceSend')}>
              {editing === 'invoiceSend' && <EditForm onSave={() => handleSave('invoiceSend')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField icon={Send} label="Sending Date" name="sendingDate" value={formData.sendingDate} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />
              </EditForm>}
            </EditableSection>
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-4">Status Timeline</h3>
            {shipment.statusHistory?.length > 0 ? (
              <div className="relative pl-6 border-l-2 border-blue-200 space-y-6">
                {[...shipment.statusHistory].reverse().map((h, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-200" />
                    <div className="bg-gray-50 rounded-lg p-3 ml-2">
                      <p className="text-sm font-semibold text-gray-800">{h.status.replace(/_/g, ' ')}</p>
                      {h.remarks && <p className="text-xs text-gray-500 mt-0.5">{h.remarks}</p>}
                      <p className="text-xs text-gray-400 mt-1">{new Date(h.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500"><Clock size={32} className="mx-auto text-gray-300 mb-2" /><p className="text-sm">No history recorded yet.</p></div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Icon size={16} className="text-gray-400 flex-shrink-0" /><div className="min-w-0"><p className="text-xs text-gray-500">{label}</p><p className="text-sm font-medium text-gray-800 truncate">{value || '—'}</p></div></div>
}

function EditableSection({ title, value, onEdit, children }) {
  return <div className="border border-gray-200 rounded-xl overflow-hidden"><div className="flex items-center justify-between p-4 bg-gray-50/50"><div><p className="text-sm font-medium text-gray-700">{title}</p>{value && <p className="text-sm text-gray-500 mt-0.5">{value}</p>}{!value && <p className="text-xs text-gray-400 italic">Not set</p>}</div><button onClick={onEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit3 size={12} /> Edit</button></div>{children}</div>
}

function EditForm({ children, onSave, onCancel, saving }) {
  return <div className="p-4 bg-blue-50/50 border-t border-blue-100 space-y-3 animate-in"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div><div className="flex gap-2 pt-1"><button onClick={onSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"><Save size={14} /> {saving ? 'Saving...' : 'Save'}</button><button onClick={onCancel} className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"><X size={14} /> Cancel</button></div></div>
}

function FormField({ icon: Icon, label, name, value, onChange, type = 'text' }) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label><div className="relative">{Icon && <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />}<input type={type} name={name} value={value} onChange={onChange} className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${Icon ? 'pl-9' : ''}`} step={type === 'number' ? '0.01' : undefined} /></div></div>
}