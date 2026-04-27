import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import { ArrowLeft, Package, Ship, FileCheck, Receipt, Edit3, Save, X } from 'lucide-react'

export default function ShipmentDetail() {
  const { id } = useParams()
  const [shipment, setShipment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('freight')
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    fetchShipment()
  }, [id])

  const fetchShipment = async () => {
    try {
      const response = await api.get(`/freight/shipments/${id}`)
      setShipment(response.data.data)
    } catch (error) {
      console.error('Error fetching shipment:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (section) => {
    setEditing(section)
    setMessage(null)
    
    const ff = shipment?.freightForwarding || {}
    const cha = shipment?.cha || {}
    const accounts = shipment?.accounts || {}

    switch(section) {
      case 'rates':
        setFormData({ sellingRate: ff.sellingRate || '', weight: ff.weight || '' })
        break
      case 'nomination':
        setFormData({ nominationDate: ff.nominationDate ? ff.nominationDate.split('T')[0] : '' })
        break
      case 'booking':
        setFormData({ bookingDate: ff.bookingDate ? ff.bookingDate.split('T')[0] : '' })
        break
      case 'schedule':
        setFormData({ 
          etd: ff.etd ? ff.etd.split('T')[0] : '', 
          eta: ff.eta ? ff.eta.split('T')[0] : '' 
        })
        break
      case 'awb':
        setFormData({ 
          mawb: ff.mawb || '', 
          hawb: ff.hawb || '', 
          awbDate: ff.awbDate ? ff.awbDate.split('T')[0] : new Date().toISOString().split('T')[0] 
        })
        break
      case 'checklist':
        setFormData({ 
          jobNo: cha.jobNo || '', 
          checklistDate: cha.checklistDate ? cha.checklistDate.split('T')[0] : new Date().toISOString().split('T')[0],
          checklistApprovalDate: cha.checklistApprovalDate ? cha.checklistApprovalDate.split('T')[0] : '' 
        })
        break
      case 'boe':
        setFormData({ 
          boeNo: cha.boeNo || '', 
          boeDate: cha.boeDate ? cha.boeDate.split('T')[0] : '' 
        })
        break
      case 'do':
        setFormData({ doCollectionDate: cha.doCollectionDate ? cha.doCollectionDate.split('T')[0] : '' })
        break
      case 'ooc':
        setFormData({ oocDate: cha.oocDate ? cha.oocDate.split('T')[0] : '' })
        break
      case 'gatepass':
        setFormData({ gatePassDate: cha.gatePassDate ? cha.gatePassDate.split('T')[0] : '' })
        break
      case 'pod':
        setFormData({ 
          deliveryDate: cha.deliveryDate ? cha.deliveryDate.split('T')[0] : '', 
          trackingNumber: cha.trackingNumber || '' 
        })
        break
      case 'invoice':
        setFormData({ 
          invoiceNumber: accounts.invoiceNumber || '', 
          invoiceDate: accounts.invoiceDate ? accounts.invoiceDate.split('T')[0] : new Date().toISOString().split('T')[0] 
        })
        break
      case 'invoiceSend':
        setFormData({ sendingDate: accounts.sendingDate ? accounts.sendingDate.split('T')[0] : new Date().toISOString().split('T')[0] })
        break
      default:
        break
    }
  }

  const handleSave = async (section) => {
    setSaving(true)
    setMessage(null)

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

    try {
      const endpoint = endpoints[section]
      await api[endpoint.method](endpoint.url, formData)
      setMessage({ type: 'success', text: 'Updated successfully!' })
      setEditing(null)
      fetchShipment()
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Update failed' })
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const getStatusColor = (status) => {
    const colors = {
      'ENQUIRY': 'bg-yellow-100 text-yellow-800',
      'RATES_ADDED': 'bg-blue-100 text-blue-800',
      'BOOKED': 'bg-indigo-100 text-indigo-800',
      'AWB_GENERATED': 'bg-teal-100 text-teal-800',
      'DELIVERED': 'bg-green-200 text-green-900',
      'INVOICE_GENERATED': 'bg-orange-100 text-orange-800',
      'COMPLETED': 'bg-gray-200 text-gray-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!shipment) {
    return (
      <div className="text-center py-12">
        <Package size={48} className="mx-auto text-gray-300 mb-4" />
        <h3 className="text-lg font-medium text-gray-700">Shipment not found</h3>
        <Link to="/" className="text-blue-600 hover:underline mt-2 inline-block">Back to Dashboard</Link>
      </div>
    )
  }

  const ff = shipment.freightForwarding || {}
  const cha = shipment.cha || {}
  const accounts = shipment.accounts || {}

  const tabs = [
    { key: 'freight', label: 'Freight', icon: Ship },
    { key: 'cha', label: 'Customs', icon: FileCheck },
    { key: 'accounts', label: 'Accounts', icon: Receipt },
    { key: 'history', label: 'History', icon: Package },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft size={18} />
          <span>Back</span>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{shipment.refNo}</h2>
            <p className="text-gray-500 text-sm mt-1">Created: {new Date(shipment.createdAt).toLocaleDateString()}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(shipment.currentStatus)}`}>
            {shipment.currentStatus.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
                activeTab === tab.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        
        {/* FREIGHT FORWARDING TAB */}
        {activeTab === 'freight' && (
          <div className="space-y-6">
            <SectionHeader title="Rates" value={ff.sellingRate ? `$${ff.sellingRate} / ${ff.weight}kg` : 'Not set'} onEdit={() => handleEdit('rates')} />
            {editing === 'rates' && (
              <EditForm onSave={() => handleSave('rates')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="Selling Rate" name="sellingRate" value={formData.sellingRate} onChange={handleChange} type="number" />
                <FormField label="Weight (kg)" name="weight" value={formData.weight} onChange={handleChange} type="number" />
              </EditForm>
            )}

            <SectionHeader title="Nomination" value={ff.nominationDate ? new Date(ff.nominationDate).toLocaleDateString() : 'Not set'} onEdit={() => handleEdit('nomination')} />
            {editing === 'nomination' && (
              <EditForm onSave={() => handleSave('nomination')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="Nomination Date" name="nominationDate" value={formData.nominationDate} onChange={handleChange} type="date" />
              </EditForm>
            )}

            <SectionHeader title="Booking" value={ff.bookingDate ? new Date(ff.bookingDate).toLocaleDateString() : 'Not set'} onEdit={() => handleEdit('booking')} />
            {editing === 'booking' && (
              <EditForm onSave={() => handleSave('booking')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="Booking Date" name="bookingDate" value={formData.bookingDate} onChange={handleChange} type="date" />
              </EditForm>
            )}

            <SectionHeader title="Schedule" value={ff.etd ? `ETD: ${new Date(ff.etd).toLocaleDateString()} / ETA: ${new Date(ff.eta).toLocaleDateString()}` : 'Not set'} onEdit={() => handleEdit('schedule')} />
            {editing === 'schedule' && (
              <EditForm onSave={() => handleSave('schedule')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="ETD" name="etd" value={formData.etd} onChange={handleChange} type="date" />
                <FormField label="ETA" name="eta" value={formData.eta} onChange={handleChange} type="date" />
              </EditForm>
            )}

            <SectionHeader title="AWB Details" value={ff.mawb ? `MAWB: ${ff.mawb} / HAWB: ${ff.hawb}` : 'Not set'} onEdit={() => handleEdit('awb')} />
            {editing === 'awb' && (
              <EditForm onSave={() => handleSave('awb')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="MAWB / MBL" name="mawb" value={formData.mawb} onChange={handleChange} />
                <FormField label="HAWB / HBL" name="hawb" value={formData.hawb} onChange={handleChange} />
                <FormField label="AWB Date" name="awbDate" value={formData.awbDate} onChange={handleChange} type="date" />
              </EditForm>
            )}
          </div>
        )}

        {/* CHA TAB */}
        {activeTab === 'cha' && (
          <div className="space-y-6">
            <SectionHeader title="Checklist" value={cha.jobNo ? `Job: ${cha.jobNo}` : 'Not set'} onEdit={() => handleEdit('checklist')} />
            {editing === 'checklist' && (
              <EditForm onSave={() => handleSave('checklist')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="Job No" name="jobNo" value={formData.jobNo} onChange={handleChange} />
                <FormField label="Checklist Date" name="checklistDate" value={formData.checklistDate} onChange={handleChange} type="date" />
                <FormField label="Approval Date" name="checklistApprovalDate" value={formData.checklistApprovalDate} onChange={handleChange} type="date" />
              </EditForm>
            )}

            <SectionHeader title="BOE" value={cha.boeNo ? `BOE: ${cha.boeNo}` : 'Not set'} onEdit={() => handleEdit('boe')} />
            {editing === 'boe' && (
              <EditForm onSave={() => handleSave('boe')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="BOE Number" name="boeNo" value={formData.boeNo} onChange={handleChange} />
                <FormField label="BOE Date" name="boeDate" value={formData.boeDate} onChange={handleChange} type="date" />
              </EditForm>
            )}

            <SectionHeader title="DO Collection" value={cha.doCollectionDate ? new Date(cha.doCollectionDate).toLocaleDateString() : 'Not set'} onEdit={() => handleEdit('do')} />
            {editing === 'do' && (
              <EditForm onSave={() => handleSave('do')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="DO Collection Date" name="doCollectionDate" value={formData.doCollectionDate} onChange={handleChange} type="date" />
              </EditForm>
            )}

            <SectionHeader title="OOC" value={cha.oocDate ? new Date(cha.oocDate).toLocaleDateString() : 'Not set'} onEdit={() => handleEdit('ooc')} />
            {editing === 'ooc' && (
              <EditForm onSave={() => handleSave('ooc')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="OOC Date" name="oocDate" value={formData.oocDate} onChange={handleChange} type="date" />
              </EditForm>
            )}

            <SectionHeader title="Gate Pass" value={cha.gatePassDate ? new Date(cha.gatePassDate).toLocaleDateString() : 'Not set'} onEdit={() => handleEdit('gatepass')} />
            {editing === 'gatepass' && (
              <EditForm onSave={() => handleSave('gatepass')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="Gate Pass Date" name="gatePassDate" value={formData.gatePassDate} onChange={handleChange} type="date" />
              </EditForm>
            )}

            <SectionHeader title="POD (Delivery)" value={cha.deliveryDate ? `Delivered: ${new Date(cha.deliveryDate).toLocaleDateString()}` : 'Not set'} onEdit={() => handleEdit('pod')} />
            {editing === 'pod' && (
              <EditForm onSave={() => handleSave('pod')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="Delivery Date" name="deliveryDate" value={formData.deliveryDate} onChange={handleChange} type="date" />
                <FormField label="Tracking Number" name="trackingNumber" value={formData.trackingNumber} onChange={handleChange} />
              </EditForm>
            )}
          </div>
        )}

        {/* ACCOUNTS TAB */}
        {activeTab === 'accounts' && (
          <div className="space-y-6">
            <SectionHeader title="Invoice" value={accounts.invoiceNumber ? `Inv: ${accounts.invoiceNumber}` : 'Not set'} onEdit={() => handleEdit('invoice')} />
            {editing === 'invoice' && (
              <EditForm onSave={() => handleSave('invoice')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="Invoice Number" name="invoiceNumber" value={formData.invoiceNumber} onChange={handleChange} />
                <FormField label="Invoice Date" name="invoiceDate" value={formData.invoiceDate} onChange={handleChange} type="date" />
              </EditForm>
            )}

            <SectionHeader title="Invoice Sending" value={accounts.sendingDate ? `Sent: ${new Date(accounts.sendingDate).toLocaleDateString()}` : 'Not set'} onEdit={() => handleEdit('invoiceSend')} />
            {editing === 'invoiceSend' && (
              <EditForm onSave={() => handleSave('invoiceSend')} onCancel={() => setEditing(null)} saving={saving}>
                <FormField label="Sending Date" name="sendingDate" value={formData.sendingDate} onChange={handleChange} type="date" />
              </EditForm>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Status Timeline</h3>
            {shipment.statusHistory?.length > 0 ? (
              shipment.statusHistory.map((h, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{h.status.replace('_', ' ')}</p>
                    <p className="text-xs text-gray-500">{h.remarks}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(h.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No history yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Reusable Components
function SectionHeader({ title, value, onEdit }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div>
        <p className="text-sm font-medium text-gray-700">{title}</p>
        <p className="text-sm text-gray-500">{value}</p>
      </div>
      <button onClick={onEdit} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm">
        <Edit3 size={14} />
        Edit
      </button>
    </div>
  )
}

function EditForm({ children, onSave, onCancel, saving }) {
  return (
    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-3">
      {children}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          <Save size={14} />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onCancel} className="flex items-center gap-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  )
}

function FormField({ label, name, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        step={type === 'number' ? '0.01' : undefined}
      />
    </div>
  )
}