import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  ArrowLeft, Package, Ship, FileCheck, Receipt, Edit3, Save, X,
  CheckCircle2, Clock, Truck, Plane, FileText, ClipboardCheck,
  ClipboardList, Banknote, Send, MapPin, Barcode, Calendar, User,
  Hash, Weight, DollarSign, Anchor, Copy, Check, Printer,
  Flag, MessageSquare
} from 'lucide-react'

const STAGE_OPTIONS = ['Draft', 'Created', 'Confirmed', 'Booked', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold']

const STAGE_COLORS = {
  'Draft': 'bg-gray-100 text-gray-700',
  'Created': 'bg-blue-100 text-blue-700',
  'Confirmed': 'bg-amber-100 text-amber-700',
  'Booked': 'bg-purple-100 text-purple-700',
  'Scheduled': 'bg-cyan-100 text-cyan-700',
  'In Progress': 'bg-yellow-100 text-yellow-700',
  'Completed': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-red-100 text-red-700',
  'On Hold': 'bg-orange-100 text-orange-700',
}

export default function ShipmentDetail() {
  const { id } = useParams()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState('freight')
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(null)
  const [editStage, setEditStage] = useState(false)
  const [editRemarks, setEditRemarks] = useState(false)
  const [stageVal, setStageVal] = useState('')
  const [remarksVal, setRemarksVal] = useState('')
  const queryClient = useQueryClient()

  const { data: shipment, isLoading, refetch } = useQuery({
    queryKey: ['shipment', id],
    queryFn: async () => { const r = await api.get(`/freight/shipments/${id}`); return r.data.data }
  })

  const updateMutation = useMutation({
    mutationFn: ({ section, data }) => {
      const eps = {
        rates: { u: `/freight/shipments/${id}/rates`, m: 'put' }, nomination: { u: `/freight/shipments/${id}/nomination`, m: 'put' },
        booking: { u: `/freight/shipments/${id}/booking`, m: 'put' }, schedule: { u: `/freight/shipments/${id}/schedule`, m: 'put' },
        awb: { u: `/freight/shipments/${id}/awb`, m: 'put' }, checklist: { u: `/cha/shipments/${id}/checklist`, m: 'put' },
        boe: { u: `/cha/shipments/${id}/boe`, m: 'put' }, do: { u: `/cha/shipments/${id}/do-collection`, m: 'put' },
        ooc: { u: `/cha/shipments/${id}/ooc`, m: 'put' }, gatepass: { u: `/cha/shipments/${id}/gate-pass`, m: 'put' },
        pod: { u: `/cha/shipments/${id}/pod`, m: 'put' }, invoice: { u: `/accounts/shipments/${id}/invoice`, m: 'put' },
        invoiceSend: { u: `/accounts/shipments/${id}/invoice-send`, m: 'put' }, stage: { u: `/freight/shipments/${id}/stage`, m: 'put' },
        remarks: { u: `/freight/shipments/${id}/remarks`, m: 'put' },
      }
      return api[eps[section].m](eps[section].u, data)
    },
    onSuccess: () => { addToast('Updated!', 'success'); setEditing(null); setEditStage(false); setEditRemarks(false); refetch(); queryClient.invalidateQueries({ queryKey: ['shipments'] }) },
    onError: (e) => addToast(e.response?.data?.message || 'Failed', 'error')
  })

  const handleSaveStage = () => { updateMutation.mutate({ section: 'stage', data: { shipmentStage: stageVal } }) }
  const handleSaveRemarks = () => { updateMutation.mutate({ section: 'remarks', data: { remarks: remarksVal } }) }

  const handlePrint = () => {
    const ff = shipment?.freightForwarding || {}; const cha = shipment?.cha || {}; const acc = shipment?.accounts || {}
    const fmt = d => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
    const pw = window.open('', '_blank', 'width=900,height=700')
    pw.document.write(`<html><head><title>${shipment.refNo}</title><style>body{font-family:Arial;padding:30px}.h{border-bottom:3px solid #1e40af;padding-bottom:15px}.h h1{color:#1e40af;font-size:22px}.r{font-size:18px;font-weight:bold;color:#1e40af}.s{margin-bottom:25px}.g{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.i{padding:8px 0;border-bottom:1px solid #eee}.i l{font-size:10px;color:#999}.i v{font-size:13px;font-weight:500}@media print{body{padding:0}}</style></head><body><div class="h"><h1>PAS Freight Services</h1></div><div class="r">${shipment.refNo}</div><div class="s"><h2>Freight</h2><div class="g"><div class="i"><l>Consignee</l><v>${ff.consigneeName||'—'}</v></div><div class="i"><l>Shipper</l><v>${ff.shipperName||'—'}</v></div><div class="i"><l>Agent</l><v>${ff.agent||'—'}</v></div><div class="i"><l>Packages</l><v>${ff.noOfPackages||'—'}</v></div><div class="i"><l>Stage</l><v>${shipment.shipmentStage||'—'}</v></div><div class="i"><l>Remarks</l><v>${shipment.remarks||'—'}</v></div></div></div><script>window.onload=function(){window.print()}</script></body></html>`)
    pw.document.close()
  }

  const handleEdit = (section) => {
    setEditing(section)
    const ff = shipment?.freightForwarding || {}; const cha = shipment?.cha || {}; const acc = shipment?.accounts || {}
    const d = {
      rates: { sellingRate: ff.sellingRate || '', weight: ff.weight || '' },
      nomination: { nominationDate: ff.nominationDate?.split('T')[0] || '' },
      booking: { bookingDate: ff.bookingDate?.split('T')[0] || '' },
      schedule: { etd: ff.etd?.split('T')[0] || '', eta: ff.eta?.split('T')[0] || '' },
      awb: { mawb: ff.mawb || '', hawb: ff.hawb || '', awbDate: ff.awbDate?.split('T')[0] || new Date().toISOString().split('T')[0] },
      checklist: { jobNo: cha.jobNo || '', checklistDate: cha.checklistDate?.split('T')[0] || new Date().toISOString().split('T')[0], checklistApprovalDate: cha.checklistApprovalDate?.split('T')[0] || '' },
      boe: { boeNo: cha.boeNo || '', boeDate: cha.boeDate?.split('T')[0] || '' }, do: { doCollectionDate: cha.doCollectionDate?.split('T')[0] || '' },
      ooc: { oocDate: cha.oocDate?.split('T')[0] || '' }, gatepass: { gatePassDate: cha.gatePassDate?.split('T')[0] || '' },
      pod: { deliveryDate: cha.deliveryDate?.split('T')[0] || '', trackingNumber: cha.trackingNumber || '' },
      invoice: { invoiceNumber: acc.invoiceNumber || '', invoiceDate: acc.invoiceDate?.split('T')[0] || new Date().toISOString().split('T')[0] },
      invoiceSend: { sendingDate: acc.sendingDate?.split('T')[0] || new Date().toISOString().split('T')[0] },
    }
    setFormData(d[section] || {})
  }

  const handleSave = (section) => {
    const cd = {}; Object.entries(formData).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) cd[k] = v })
    setSaving(true); updateMutation.mutate({ section, data: cd }, { onSettled: () => setSaving(false) })
  }

  const copyToClipboard = (text, key) => { navigator.clipboard.writeText(text); setCopied(key); addToast('Copied!', 'info'); setTimeout(() => setCopied(null), 2000) }

  const getStatusBadge = (s) => {
    const b = {'ENQUIRY':'bg-amber-50 text-amber-700 border-amber-200','RATES_ADDED':'bg-sky-50 text-sky-700 border-sky-200','NOMINATED':'bg-violet-50 text-violet-700 border-violet-200','BOOKED':'bg-indigo-50 text-indigo-700 border-indigo-200','SCHEDULED':'bg-cyan-50 text-cyan-700 border-cyan-200','AWB_GENERATED':'bg-teal-50 text-teal-700 border-teal-200','CHECKLIST_APPROVED':'bg-emerald-50 text-emerald-700 border-emerald-200','BOE_FILED':'bg-lime-50 text-lime-700 border-lime-200','DO_COLLECTED':'bg-green-50 text-green-700 border-green-200','OOC_DONE':'bg-blue-50 text-blue-700 border-blue-200','GATE_PASS':'bg-purple-50 text-purple-700 border-purple-200','DELIVERED':'bg-green-100 text-green-800 border-green-300','INVOICE_GENERATED':'bg-orange-50 text-orange-700 border-orange-200','INVOICE_SENT':'bg-rose-50 text-rose-700 border-rose-200','COMPLETED':'bg-gray-100 text-gray-700 border-gray-300'}
    return b[s]||'bg-gray-50 text-gray-600 border-gray-200'
  }

  const steps = [{s:'ENQUIRY',l:'Enquiry',i:ClipboardList},{s:'RATES_ADDED',l:'Rates',i:DollarSign},{s:'NOMINATED',l:'Nominated',i:User},{s:'BOOKED',l:'Booked',i:Calendar},{s:'SCHEDULED',l:'Scheduled',i:Clock},{s:'AWB_GENERATED',l:'AWB',i:Barcode},{s:'CHECKLIST_APPROVED',l:'Checklist',i:ClipboardCheck},{s:'BOE_FILED',l:'BOE',i:FileText},{s:'DO_COLLECTED',l:'DO',i:FileCheck},{s:'OOC_DONE',l:'OOC',i:CheckCircle2},{s:'GATE_PASS',l:'Gate Pass',i:Truck},{s:'DELIVERED',l:'Delivered',i:MapPin},{s:'INVOICE_GENERATED',l:'Invoice',i:Banknote},{s:'INVOICE_SENT',l:'Sent',i:Send}]
  const cur = steps.findIndex(s => s.s === shipment?.currentStatus)

  if (isLoading) return <div className="flex items-center justify-center h-96"><div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!shipment) return <div className="text-center py-16"><Package size={56} className="mx-auto text-gray-300 mb-4" /><h3 className="text-lg font-semibold text-gray-700">Shipment not found</h3><Link to="/" className="inline-flex items-center gap-1 mt-4 text-blue-600"><ArrowLeft size={14} />Back</Link></div>

  const ff = shipment.freightForwarding || {}; const cha = shipment.cha || {}; const accounts = shipment.accounts || {}

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3"><ArrowLeft size={15} />Back</Link>
        <div className="bg-white rounded-xl border p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><div className="flex items-center gap-3"><h1 className="text-xl font-bold">{shipment.refNo}</h1><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(shipment.currentStatus)}`}>{shipment.currentStatus.replace(/_/g,' ')}</span></div><p className="text-sm text-gray-500 mt-1">Created {new Date(shipment.createdAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p></div>
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"><Printer size={16} />Print</button>
          </div>

          {/* SHIPMENT STAGE + REMARKS ROW */}
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-gray-100">
            {/* Stage */}
            <div className="flex items-center gap-2">
              <Flag size={14} className="text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">Stage:</span>
              {editStage ? (
                <div className="flex items-center gap-2">
                  <select value={stageVal} onChange={e => setStageVal(e.target.value)} className="border rounded px-2 py-1 text-xs">
                    <option value="">Select...</option>
                    {STAGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <button onClick={handleSaveStage} className="text-green-600 hover:text-green-800"><Check size={14} /></button>
                  <button onClick={() => setEditStage(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
              ) : (
                <button onClick={() => { setStageVal(shipment.shipmentStage || ''); setEditStage(true) }}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${shipment.shipmentStage ? STAGE_COLORS[shipment.shipmentStage] || 'bg-gray-100' : 'text-gray-400 italic'}`}>
                  {shipment.shipmentStage || 'Set stage'}
                </button>
              )}
            </div>

            {/* Remarks */}
            <div className="flex items-center gap-2 flex-1">
              <MessageSquare size={14} className="text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">Remarks:</span>
              {editRemarks ? (
                <div className="flex items-center gap-2 flex-1">
                  <input value={remarksVal} onChange={e => setRemarksVal(e.target.value)} placeholder="Add remarks..." className="flex-1 border rounded px-2 py-1 text-xs" autoFocus />
                  <button onClick={handleSaveRemarks} className="text-green-600 hover:text-green-800"><Check size={14} /></button>
                  <button onClick={() => setEditRemarks(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
              ) : (
                <button onClick={() => { setRemarksVal(shipment.remarks || ''); setEditRemarks(true) }}
                  className="text-xs text-gray-600 hover:text-blue-600 truncate max-w-[300px]">
                  {shipment.remarks || 'Add remarks...'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 overflow-x-auto"><div className="flex items-center gap-0 min-w-max">
        {steps.map((step,i)=>{const Icon=step.i;const done=i<=cur;const now=i===cur;return <div key={step.s} className="flex items-center"><div className={`flex flex-col items-center ${done?'opacity-100':'opacity-40'}`}><div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${now?'border-blue-500 bg-blue-50 scale-110':done?'border-green-500 bg-green-50':'border-gray-300 bg-white'}`}>{done?<CheckCircle2 size={16} className="text-green-600"/>:<Icon size={16} className="text-gray-400"/>}</div><span className={`text-[10px] mt-1.5 font-medium whitespace-nowrap ${now?'text-blue-600':'text-gray-500'}`}>{step.l}</span></div>{i<steps.length-1&&<div className={`w-8 h-0.5 mx-0.5 mt-[-16px] ${i<cur?'bg-green-400':'bg-gray-200'}`}/>}</div>})}
      </div></div>

      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {[{k:'freight',l:'Freight',i:Ship},{k:'cha',l:'Customs',i:FileCheck},{k:'accounts',l:'Accounts',i:Receipt},{k:'history',l:'Timeline',i:Clock}].map(t=>{const Icon=t.i;return <button key={t.k} onClick={()=>setActiveTab(t.k)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium flex-1 justify-center ${activeTab===t.k?'bg-white text-blue-600 shadow-sm':'text-gray-500'}`}><Icon size={16}/><span className="hidden sm:inline">{t.l}</span></button>})}
      </div>

      <div className="bg-white rounded-xl border p-6">
        {activeTab==='freight'&&<div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"><C icon={User} l="Consignee" v={ff.consigneeName}/><C icon={User} l="Shipper" v={ff.shipperName}/><C icon={Anchor} l="Agent" v={ff.agent}/><C icon={Package} l="Packages" v={ff.noOfPackages}/></div>
          <E title="Rates" value={ff.sellingRate?`$${ff.sellingRate} / ${ff.weight}kg`:null} onEdit={()=>handleEdit('rates')}>{editing==='rates'&&<F onSave={()=>handleSave('rates')} onCancel={()=>setEditing(null)} saving={saving}><FF icon={DollarSign} label="Selling Rate" n="sellingRate" v={formData.sellingRate||''} oc={v=>setFormData({...formData,sellingRate:v})} t="number"/><FF icon={Weight} label="Weight (kg)" n="weight" v={formData.weight||''} oc={v=>setFormData({...formData,weight:v})} t="number"/></F>}</E>
          <E title="Nomination" value={ff.nominationDate?new Date(ff.nominationDate).toLocaleDateString():null} onEdit={()=>handleEdit('nomination')}>{editing==='nomination'&&<F onSave={()=>handleSave('nomination')} onCancel={()=>setEditing(null)} saving={saving}><FF icon={Calendar} label="Nomination Date" n="nominationDate" v={formData.nominationDate||''} oc={v=>setFormData({...formData,nominationDate:v})} t="date"/></F>}</E>
          <E title="Booking" value={ff.bookingDate?new Date(ff.bookingDate).toLocaleDateString():null} onEdit={()=>handleEdit('booking')}>{editing==='booking'&&<F onSave={()=>handleSave('booking')} onCancel={()=>setEditing(null)} saving={saving}><FF icon={Calendar} label="Booking Date" n="bookingDate" v={formData.bookingDate||''} oc={v=>setFormData({...formData,bookingDate:v})} t="date"/></F>}</E>
          <E title="Schedule" value={ff.etd?`ETD: ${new Date(ff.etd).toLocaleDateString()} | ETA: ${new Date(ff.eta).toLocaleDateString()}`:null} onEdit={()=>handleEdit('schedule')}>{editing==='schedule'&&<F onSave={()=>handleSave('schedule')} onCancel={()=>setEditing(null)} saving={saving}><FF icon={Plane} label="ETD" n="etd" v={formData.etd||''} oc={v=>setFormData({...formData,etd:v})} t="date"/><FF icon={Plane} label="ETA" n="eta" v={formData.eta||''} oc={v=>setFormData({...formData,eta:v})} t="date"/></F>}</E>
          <E title="AWB Details" value={ff.mawb?`MAWB: ${ff.mawb} / HAWB: ${ff.hawb}`:null} onEdit={()=>handleEdit('awb')}>{editing==='awb'&&<F onSave={()=>handleSave('awb')} onCancel={()=>setEditing(null)} saving={saving}><FF icon={Barcode} label="MAWB" n="mawb" v={formData.mawb||''} oc={v=>setFormData({...formData,mawb:v})}/><FF icon={Barcode} label="HAWB" n="hawb" v={formData.hawb||''} oc={v=>setFormData({...formData,hawb:v})}/><FF icon={Calendar} label="AWB Date" n="awbDate" v={formData.awbDate||''} oc={v=>setFormData({...formData,awbDate:v})} t="date"/></F>}</E>
        </div>}
        {activeTab==='cha'&&<div className="space-y-4">{['checklist','boe','do','ooc','gatepass','pod'].map(s=><E key={s} title={s==='pod'?'POD':s==='do'?'DO Collection':s==='gatepass'?'Gate Pass':s.toUpperCase()} value={s==='checklist'?(cha.jobNo?`Job: ${cha.jobNo}`:null):s==='boe'?(cha.boeNo?`BOE: ${cha.boeNo}`:null):s==='do'?(cha.doCollectionDate?new Date(cha.doCollectionDate).toLocaleDateString():null):s==='ooc'?(cha.oocDate?new Date(cha.oocDate).toLocaleDateString():null):s==='gatepass'?(cha.gatePassDate?new Date(cha.gatePassDate).toLocaleDateString():null):cha.deliveryDate?`Delivered: ${new Date(cha.deliveryDate).toLocaleDateString()}`:null} onEdit={()=>handleEdit(s)}>{editing===s&&<F onSave={()=>handleSave(s)} onCancel={()=>setEditing(null)} saving={saving}>{s==='checklist'&&<><FF icon={Hash} label="Job No" n="jobNo" v={formData.jobNo||''} oc={v=>setFormData({...formData,jobNo:v})}/><FF icon={Calendar} label="Checklist Date" n="checklistDate" v={formData.checklistDate||''} oc={v=>setFormData({...formData,checklistDate:v})} t="date"/><FF icon={CheckCircle2} label="Approval Date" n="checklistApprovalDate" v={formData.checklistApprovalDate||''} oc={v=>setFormData({...formData,checklistApprovalDate:v})} t="date"/></>}{s==='boe'&&<><FF icon={FileText} label="BOE No" n="boeNo" v={formData.boeNo||''} oc={v=>setFormData({...formData,boeNo:v})}/><FF icon={Calendar} label="BOE Date" n="boeDate" v={formData.boeDate||''} oc={v=>setFormData({...formData,boeDate:v})} t="date"/></>}{s==='do'&&<FF icon={Calendar} label="DO Date" n="doCollectionDate" v={formData.doCollectionDate||''} oc={v=>setFormData({...formData,doCollectionDate:v})} t="date"/>}{s==='ooc'&&<FF icon={Calendar} label="OOC Date" n="oocDate" v={formData.oocDate||''} oc={v=>setFormData({...formData,oocDate:v})} t="date"/>}{s==='gatepass'&&<FF icon={Calendar} label="Gate Pass Date" n="gatePassDate" v={formData.gatePassDate||''} oc={v=>setFormData({...formData,gatePassDate:v})} t="date"/>}{s==='pod'&&<><FF icon={Calendar} label="Delivery Date" n="deliveryDate" v={formData.deliveryDate||''} oc={v=>setFormData({...formData,deliveryDate:v})} t="date"/><FF icon={Barcode} label="Tracking No" n="trackingNumber" v={formData.trackingNumber||''} oc={v=>setFormData({...formData,trackingNumber:v})}/></>}</F>}</E>)}</div>}
        {activeTab==='accounts'&&<div className="space-y-4"><E title="Invoice" value={accounts.invoiceNumber?`Inv: ${accounts.invoiceNumber}`:null} onEdit={()=>handleEdit('invoice')}>{editing==='invoice'&&<F onSave={()=>handleSave('invoice')} onCancel={()=>setEditing(null)} saving={saving}><FF icon={Hash} label="Invoice No" n="invoiceNumber" v={formData.invoiceNumber||''} oc={v=>setFormData({...formData,invoiceNumber:v})}/><FF icon={Calendar} label="Invoice Date" n="invoiceDate" v={formData.invoiceDate||''} oc={v=>setFormData({...formData,invoiceDate:v})} t="date"/></F>}</E><E title="Invoice Sending" value={accounts.sendingDate?`Sent: ${new Date(accounts.sendingDate).toLocaleDateString()}`:null} onEdit={()=>handleEdit('invoiceSend')}>{editing==='invoiceSend'&&<F onSave={()=>handleSave('invoiceSend')} onCancel={()=>setEditing(null)} saving={saving}><FF icon={Send} label="Sending Date" n="sendingDate" v={formData.sendingDate||''} oc={v=>setFormData({...formData,sendingDate:v})} t="date"/></F>}</E></div>}
        {activeTab==='history'&&<div><h3 className="text-base font-semibold mb-4">Status Timeline</h3>{shipment.statusHistory?.length>0?<div className="relative pl-6 border-l-2 border-blue-200 space-y-6">{[...shipment.statusHistory].reverse().map((h,i)=><div key={i} className="relative"><div className="absolute -left-[25px] w-3 h-3 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-200"/><div className="bg-gray-50 rounded-lg p-3 ml-2"><p className="text-sm font-semibold">{h.status.replace(/_/g,' ')}</p>{h.remarks&&<p className="text-xs text-gray-500 mt-0.5">{h.remarks}</p>}<p className="text-xs text-gray-400 mt-1">{new Date(h.createdAt).toLocaleString()}</p></div></div>)}</div>:<div className="text-center py-8 text-gray-500"><Clock size={32} className="mx-auto text-gray-300 mb-2"/><p className="text-sm">No history yet.</p></div>}</div>}
      </div>
    </div>
  )
}

function C({icon:I,label:l,value:v}){return <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><I size={16} className="text-gray-400 flex-shrink-0"/><div className="min-w-0"><p className="text-xs text-gray-500">{l}</p><p className="text-sm font-medium text-gray-800 truncate">{v||'—'}</p></div></div>}
function E({title:t,value:v,onEdit:oe,children:c}){return <div className="border border-gray-200 rounded-xl overflow-hidden"><div className="flex items-center justify-between p-4 bg-gray-50/50"><div><p className="text-sm font-medium text-gray-700">{t}</p>{v&&<p className="text-sm text-gray-500 mt-0.5">{v}</p>}{!v&&<p className="text-xs text-gray-400 italic">Not set</p>}</div><button onClick={oe} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg"><Edit3 size={12}/>Edit</button></div>{c}</div>}
function F({children:c,onSave:os,onCancel:oc,saving:s}){return <div className="p-4 bg-blue-50/50 border-t border-blue-100 space-y-3"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{c}</div><div className="flex gap-2 pt-1"><button onClick={os} disabled={s} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"><Save size={14}/>{s?'Saving...':'Save'}</button><button onClick={oc} className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"><X size={14}/>Cancel</button></div></div>}
function FF({icon:II,label:l,name:n,value:v,onChange:oc2,type:t='text'}){return <div><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label><div className="relative">{II&&<II size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>}<input type={t} name={n} value={v} onChange={e=>oc2(e.target.value)} className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${II?'pl-9':''}`} step={t==='number'?'0.01':undefined}/></div></div>}