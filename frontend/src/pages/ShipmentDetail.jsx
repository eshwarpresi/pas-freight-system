import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  ArrowLeft, Package, Ship, FileCheck, Receipt, CheckCircle2, Clock, Truck, Plane, FileText,
  ClipboardCheck, ClipboardList, Banknote, Send, MapPin, Barcode, Calendar, User, Hash,
  Weight, DollarSign, Anchor, Copy, Check, Printer, Flag, MessageSquare, Pencil
} from 'lucide-react'

const STAGE_OPTIONS = ['Draft', 'Created', 'Confirmed', 'Booked', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold']
const STAGE_COLORS = {
  'Draft': 'bg-gray-100 text-gray-700', 'Created': 'bg-blue-100 text-blue-700', 'Confirmed': 'bg-amber-100 text-amber-700',
  'Booked': 'bg-purple-100 text-purple-700', 'Scheduled': 'bg-cyan-100 text-cyan-700', 'In Progress': 'bg-yellow-100 text-yellow-700',
  'Completed': 'bg-green-100 text-green-700', 'Cancelled': 'bg-red-100 text-red-700', 'On Hold': 'bg-orange-100 text-orange-700',
}

function InlineField({ value, onSave, type = 'text', placeholder = '—', className = '', options = null }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value || '')
  const inputRef = useRef(null)
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])
  useEffect(() => { setVal(value || '') }, [value])
  const save = () => { setEditing(false); if (val !== (value || '')) onSave(val) }
  if (editing) {
    if (options) return <select ref={inputRef} value={val} onChange={e => setVal(e.target.value)} onBlur={save} className="border border-blue-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"><option value="">Select...</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
    return <input ref={inputRef} type={type} value={val} onChange={e => setVal(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value || ''); setEditing(false) } }} className="border border-blue-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full" step={type === 'number' ? '0.01' : undefined} />
  }
  return <div onClick={() => setEditing(true)} className={`cursor-pointer group flex items-center gap-1 ${className}`}><span className={value ? '' : 'text-gray-400 italic'}>{value || placeholder}</span><Pencil size={10} className="text-gray-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" /></div>
}

export default function ShipmentDetail() {
  const { id } = useParams()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState('freight')
  const [copied, setCopied] = useState(null)
  const queryClient = useQueryClient()

  const { data: shipment, isLoading, refetch } = useQuery({
    queryKey: ['shipment', id],
    queryFn: async () => { const r = await api.get(`/freight/shipments/${id}`); return r.data.data }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ section, data }) => {
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
    onSuccess: () => { addToast('Saved!', 'success'); refetch(); queryClient.invalidateQueries({ queryKey: ['shipments'] }) },
    onError: (e) => addToast(e.response?.data?.message || 'Failed', 'error')
  })

  const handlePrint = () => {
    const ff = shipment?.freightForwarding || {}; const cha = shipment?.cha || {}; const acc = shipment?.accounts || {}
    const pw = window.open('', '_blank', 'width=900,height=700')
    pw.document.write(`<html><head><title>${shipment.refNo}</title><style>body{font-family:Arial;padding:30px}.h{border-bottom:3px solid #1e40af}.h h1{color:#1e40af;font-size:22px}.r{font-size:18px;font-weight:bold}.s{margin:20px 0}.g{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.i{padding:6px 0}.i l{font-size:10px;color:#999}.i v{font-size:13px}@media print{body{padding:0}}</style></head><body><div class="h"><h1>PAS Freight Services</h1></div><div class="r">${shipment.refNo}</div><div class="s"><div class="i"><l>Consignee</l><v>${ff.consigneeName||'—'}</v></div><div class="i"><l>Shipper</l><v>${ff.shipperName||'—'}</v></div><div class="i"><l>Stage</l><v>${shipment.shipmentStage||'—'}</v></div></div><script>window.onload=function(){window.print()}</script></body></html>`)
    pw.document.close()
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
  const Fmt = d => d ? new Date(d).toLocaleDateString() : null

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3"><ArrowLeft size={15} />Back</Link>
        <div className="bg-white rounded-xl border p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><div className="flex items-center gap-3"><h1 className="text-xl font-bold">{shipment.refNo}</h1><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(shipment.currentStatus)}`}>{shipment.currentStatus.replace(/_/g,' ')}</span></div><p className="text-sm text-gray-500 mt-1">Created {new Date(shipment.createdAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p></div>
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"><Printer size={16} />Print</button>
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2"><Flag size={14} className="text-gray-400" /><span className="text-xs text-gray-500 font-medium">Stage:</span>
              <InlineField value={shipment.shipmentStage} options={STAGE_OPTIONS} onSave={v => updateMutation.mutate({ section: 'stage', data: { shipmentStage: v } })} className={shipment.shipmentStage ? `px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[shipment.shipmentStage] || ''}` : ''} placeholder="Set stage" />
            </div>
            <div className="flex items-center gap-2 flex-1"><MessageSquare size={14} className="text-gray-400" /><span className="text-xs text-gray-500 font-medium">Remarks:</span>
              <InlineField value={shipment.remarks} onSave={v => updateMutation.mutate({ section: 'remarks', data: { remarks: v } })} placeholder="Add remarks..." className="flex-1" />
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
          <Section title="Rates" icon={DollarSign}><div className="grid grid-cols-2 gap-3"><Field label="Selling Rate ($)" value={ff.sellingRate} onSave={v => updateMutation.mutate({ section: 'rates', data: { sellingRate: v } })} type="number" /><Field label="Weight (kg)" value={ff.weight} onSave={v => updateMutation.mutate({ section: 'rates', data: { weight: v } })} type="number" /></div></Section>
          <Section title="Nomination" icon={Calendar}><Field label="Nomination Date" value={Fmt(ff.nominationDate)} onSave={v => updateMutation.mutate({ section: 'nomination', data: { nominationDate: v } })} type="date" /></Section>
          <Section title="Booking" icon={Calendar}><Field label="Booking Date" value={Fmt(ff.bookingDate)} onSave={v => updateMutation.mutate({ section: 'booking', data: { bookingDate: v } })} type="date" /></Section>
          <Section title="Schedule" icon={Plane}><div className="grid grid-cols-2 gap-3"><Field label="ETD" value={Fmt(ff.etd)} onSave={v => updateMutation.mutate({ section: 'schedule', data: { etd: v } })} type="date" /><Field label="ETA" value={Fmt(ff.eta)} onSave={v => updateMutation.mutate({ section: 'schedule', data: { eta: v } })} type="date" /></div></Section>
          <Section title="AWB Details" icon={Barcode}><div className="grid grid-cols-3 gap-3"><Field label="MAWB" value={ff.mawb} onSave={v => updateMutation.mutate({ section: 'awb', data: { mawb: v } })} /><Field label="HAWB" value={ff.hawb} onSave={v => updateMutation.mutate({ section: 'awb', data: { hawb: v } })} /><Field label="AWB Date" value={Fmt(ff.awbDate)} onSave={v => updateMutation.mutate({ section: 'awb', data: { awbDate: v } })} type="date" /></div></Section>
        </div>}
        {activeTab==='cha'&&<div className="space-y-4">
          <Section title="Checklist" icon={ClipboardCheck}><div className="grid grid-cols-3 gap-3"><Field label="Job No" value={cha.jobNo} onSave={v => updateMutation.mutate({ section: 'checklist', data: { jobNo: v } })} /><Field label="Checklist Date" value={Fmt(cha.checklistDate)} onSave={v => updateMutation.mutate({ section: 'checklist', data: { checklistDate: v } })} type="date" /><Field label="Approval Date" value={Fmt(cha.checklistApprovalDate)} onSave={v => updateMutation.mutate({ section: 'checklist', data: { checklistApprovalDate: v } })} type="date" /></div></Section>
          <Section title="BOE" icon={FileText}><div className="grid grid-cols-2 gap-3"><Field label="BOE No" value={cha.boeNo} onSave={v => updateMutation.mutate({ section: 'boe', data: { boeNo: v } })} /><Field label="BOE Date" value={Fmt(cha.boeDate)} onSave={v => updateMutation.mutate({ section: 'boe', data: { boeDate: v } })} type="date" /></div></Section>
          <Section title="DO Collection" icon={FileCheck}><Field label="DO Date" value={Fmt(cha.doCollectionDate)} onSave={v => updateMutation.mutate({ section: 'do', data: { doCollectionDate: v } })} type="date" /></Section>
          <Section title="OOC" icon={CheckCircle2}><Field label="OOC Date" value={Fmt(cha.oocDate)} onSave={v => updateMutation.mutate({ section: 'ooc', data: { oocDate: v } })} type="date" /></Section>
          <Section title="Gate Pass" icon={Truck}><Field label="Gate Pass Date" value={Fmt(cha.gatePassDate)} onSave={v => updateMutation.mutate({ section: 'gatepass', data: { gatePassDate: v } })} type="date" /></Section>
          <Section title="POD (Delivery)" icon={MapPin}><div className="grid grid-cols-2 gap-3"><Field label="Delivery Date" value={Fmt(cha.deliveryDate)} onSave={v => updateMutation.mutate({ section: 'pod', data: { deliveryDate: v } })} type="date" /><Field label="Tracking No" value={cha.trackingNumber} onSave={v => updateMutation.mutate({ section: 'pod', data: { trackingNumber: v } })} /></div>{cha.trackingNumber&&<div className="flex items-center gap-2 p-2 bg-blue-50 rounded text-sm"><Barcode size={14} className="text-blue-600"/><span className="text-blue-700 font-mono text-xs">{cha.trackingNumber}</span><button onClick={()=>copyToClipboard(cha.trackingNumber,'t')} className="ml-auto text-blue-600">{copied==='t'?<Check size={14}/>:<Copy size={14}/>}</button></div>}</Section>
        </div>}
        {activeTab==='accounts'&&<div className="space-y-4">
          <Section title="Invoice" icon={Banknote}><div className="grid grid-cols-2 gap-3"><Field label="Invoice No" value={accounts.invoiceNumber} onSave={v => updateMutation.mutate({ section: 'invoice', data: { invoiceNumber: v } })} /><Field label="Invoice Date" value={Fmt(accounts.invoiceDate)} onSave={v => updateMutation.mutate({ section: 'invoice', data: { invoiceDate: v } })} type="date" /></div></Section>
          <Section title="Invoice Sending" icon={Send}><Field label="Sending Date" value={Fmt(accounts.sendingDate)} onSave={v => updateMutation.mutate({ section: 'invoiceSend', data: { sendingDate: v } })} type="date" /></Section>
        </div>}
        {activeTab==='history'&&<div><h3 className="text-base font-semibold mb-4">Status Timeline</h3>{shipment.statusHistory?.length>0?<div className="relative pl-6 border-l-2 border-blue-200 space-y-6">{[...shipment.statusHistory].reverse().map((h,i)=><div key={i} className="relative"><div className="absolute -left-[25px] w-3 h-3 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-200"/><div className="bg-gray-50 rounded-lg p-3 ml-2"><p className="text-sm font-semibold">{h.status.replace(/_/g,' ')}</p>{h.remarks&&<p className="text-xs text-gray-500 mt-0.5">{h.remarks}</p>}<p className="text-xs text-gray-400 mt-1">{new Date(h.createdAt).toLocaleString()}</p></div></div>)}</div>:<div className="text-center py-8 text-gray-500"><Clock size={32} className="mx-auto text-gray-300 mb-2"/><p className="text-sm">No history yet.</p></div>}</div>}
      </div>
    </div>
  )
}

function C({icon:I,label:l,value:v}){return <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><I size={16} className="text-gray-400 flex-shrink-0"/><div className="min-w-0"><p className="text-xs text-gray-500">{l}</p><p className="text-sm font-medium text-gray-800 truncate">{v||'—'}</p></div></div>}
function Section({ title, icon: Icon, children }) { return <div className="border border-gray-200 rounded-xl overflow-hidden"><div className="flex items-center gap-2 p-4 bg-gray-50/50 border-b border-gray-100"><Icon size={14} className="text-gray-400" /><p className="text-sm font-medium text-gray-700">{title}</p></div><div className="p-4">{children}</div></div> }
function Field({ label, value, onSave, type = 'text' }) {
  const [editing, setEditing] = useState(false); const [val, setVal] = useState(value || ''); const inputRef = useRef(null)
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])
  useEffect(() => { setVal(value || '') }, [value])
  const save = () => { setEditing(false); if (val !== (value || '')) onSave(val) }
  return <div><label className="block text-xs text-gray-500 mb-1">{label}</label>{editing ? <input ref={inputRef} type={type} value={val} onChange={e => setVal(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value || ''); setEditing(false) } }} className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" step={type === 'number' ? '0.01' : undefined} /> : <div onClick={() => setEditing(true)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors flex items-center justify-between group"><span className={value ? 'font-medium text-gray-800' : 'text-gray-400 italic'}>{value || 'Not set'}</span><Pencil size={10} className="text-gray-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100" /></div>}</div>
}