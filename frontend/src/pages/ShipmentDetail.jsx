import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { 
  ArrowLeft, Package, Ship, FileCheck, Receipt, CheckCircle2, Clock, Truck, Plane, FileText,
  ClipboardCheck, ClipboardList, Banknote, Send, MapPin, Barcode, Calendar, User, Hash,
  Weight, DollarSign, Anchor, Copy, Check, Printer, Flag, MessageSquare, Pencil,
  MapPinned, Navigation, FileSignature, Luggage, ArrowUpDown, Info, Scale
} from 'lucide-react'

const STAGE_OPTIONS = ['Draft', 'Created', 'Confirmed', 'Booked', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold']
const STAGE_COLORS = {
  'Draft': 'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-800', 'Created': 'bg-gradient-to-r from-blue-400 to-blue-300 text-blue-900', 'Confirmed': 'bg-gradient-to-r from-amber-400 to-amber-300 text-amber-900',
  'Booked': 'bg-gradient-to-r from-purple-400 to-purple-300 text-purple-900', 'Scheduled': 'bg-gradient-to-r from-cyan-400 to-cyan-300 text-cyan-900', 'In Progress': 'bg-gradient-to-r from-yellow-400 to-yellow-300 text-yellow-900',
  'Completed': 'bg-gradient-to-r from-emerald-400 to-emerald-300 text-emerald-900', 'Cancelled': 'bg-gradient-to-r from-red-400 to-red-300 text-red-900', 'On Hold': 'bg-gradient-to-r from-orange-400 to-orange-300 text-orange-900',
}
const TRANSPORT_MODES = ['Air', 'Sea FCL', 'Sea LCL', 'Courier']
const IMPORT_EXPORT_OPTIONS = ['Import', 'Export']
const COUNTRY_PORTS = ['SINGAPORE', 'MALAYSIA', 'CHINA', 'HONG KONG', 'JAPAN', 'SOUTH KOREA', 'TAIWAN', 'THAILAND', 'VIETNAM', 'INDONESIA', 'USA', 'UK', 'GERMANY', 'NETHERLANDS', 'FRANCE', 'ITALY', 'SPAIN', 'UAE', 'SAUDI ARABIA', 'AUSTRALIA']
const INDIA_PORTS = ['BANGALORE', 'CHENNAI', 'MUMBAI', 'DELHI', 'HYDERABAD', 'KOLKATA', 'AHMEDABAD', 'PUNE', 'COCHIN', 'TUTICORIN', 'VISAKHAPATNAM', 'MUNDRA', 'NHAVA SHEVA', 'KATTUPALLI', 'ENNORE']
const TERMS_OPTIONS = ['EXW', 'FOB', 'FCA', 'CIF', 'DDP', 'DAP', 'DAT', 'CPT', 'CIP', 'FAS', 'CFR']
const PORT_LOCATIONS = ['SIN', 'INBLR4', 'INMAA4', 'INBOM4', 'INDEA4', 'INHYD4', 'INCCU4', 'INAMD4', 'INPNQ4', 'INCOK4', 'INTUT4', 'INVTZ4', 'INMUN4', 'INNSV4', 'INKAT4', 'INENR4']

const FULL_STEPS = [
  {s:'ENQUIRY',l:'Enquiry',d:'Initial request',i:ClipboardList},{s:'RATES_ADDED',l:'Rates',d:'Pricing added',i:DollarSign},{s:'NOMINATED',l:'Nominated',d:'Agent assigned',i:User},
  {s:'BOOKED',l:'Booked',d:'Confirmed with carrier',i:Calendar},{s:'SCHEDULED',l:'Scheduled',d:'ETD/ETA set',i:Clock},{s:'AWB_GENERATED',l:'AWB',d:'Air Waybill created',i:Barcode},
  {s:'CHECKLIST_APPROVED',l:'Checklist',d:'Customs checklist done',i:ClipboardCheck},{s:'BOE_FILED',l:'BOE',d:'Bill of Entry filed',i:FileText},{s:'DO_COLLECTED',l:'DO',d:'Delivery Order collected',i:FileCheck},
  {s:'OOC_DONE',l:'OOC',d:'Out of Charge',i:CheckCircle2},{s:'GATE_PASS',l:'Gate Pass',d:'Customs gate cleared',i:Truck},{s:'DELIVERED',l:'Delivered',d:'Cargo delivered',i:MapPin},
  {s:'INVOICE_GENERATED',l:'Invoice',d:'Invoice created',i:Banknote},{s:'INVOICE_SENT',l:'Sent',d:'Invoice dispatched',i:Send}
]
const CHA_STEPS = [
  {s:'ENQUIRY',l:'Enquiry',d:'Initial request',i:ClipboardList},
  {s:'CHECKLIST_APPROVED',l:'Checklist',d:'Customs checklist done',i:ClipboardCheck},{s:'BOE_FILED',l:'BOE',d:'Bill of Entry filed',i:FileText},{s:'DO_COLLECTED',l:'DO',d:'Delivery Order collected',i:FileCheck},
  {s:'OOC_DONE',l:'OOC',d:'Out of Charge',i:CheckCircle2},{s:'GATE_PASS',l:'Gate Pass',d:'Customs gate cleared',i:Truck},{s:'DELIVERED',l:'Delivered',d:'Cargo delivered',i:MapPin},
  {s:'INVOICE_GENERATED',l:'Invoice',d:'Invoice created',i:Banknote},{s:'INVOICE_SENT',l:'Sent',d:'Invoice dispatched',i:Send}
]

function InlineField({ value, onSave, type = 'text', placeholder = '—', className = '', options = null }) {
  const [editing, setEditing] = useState(false); const [val, setVal] = useState(value || ''); const inputRef = useRef(null)
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])
  useEffect(() => { setVal(value || '') }, [value])
  const save = () => { setEditing(false); if (val !== (value || '')) onSave(val) }
  if (editing) {
    if (options) return <select ref={inputRef} value={val} onChange={e => setVal(e.target.value)} onBlur={save} className="border border-indigo-300 rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-indigo-500 w-full"><option value="">Select...</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
    return <input ref={inputRef} type={type} value={val} onChange={e => setVal(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value || ''); setEditing(false) } }} className="border border-indigo-300 rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-indigo-500 w-full" step={type === 'number' ? '0.01' : undefined} />
  }
  return <div onClick={() => setEditing(true)} className={`cursor-pointer group flex items-center gap-1 ${className}`}><span className={value ? '' : 'text-gray-400 italic'}>{value || placeholder}</span><Pencil size={10} className="text-gray-300 group-hover:text-indigo-500 opacity-0 group-hover:opacity-100" /></div>
}

function ComboField({ label, value, options, onSave, placeholder = 'Custom...' }) {
  const isInOptions = options.includes(value || '')
  return (
    <div>
      <label className="block text-xs text-indigo-400 mb-1">{label}</label>
      <div className="flex gap-2">
        <div className="flex-1"><InlineField value={isInOptions ? value : ''} options={options} onSave={onSave} placeholder="Select" /></div>
        <div className="flex-1"><InlineField value={!isInOptions ? value : ''} onSave={onSave} placeholder={placeholder} /></div>
      </div>
    </div>
  )
}

export default function ShipmentDetail() {
  const { id } = useParams(); const [searchParams] = useSearchParams(); const { addToast } = useToast(); const [copied, setCopied] = useState(null); const queryClient = useQueryClient()
  const [initialTabSet, setInitialTabSet] = useState(false)
  const [activeTab, setActiveTab] = useState('freight')
  
  const { data: shipment, isLoading } = useQuery({
    queryKey: ['shipment', id],
    queryFn: async () => { 
      const r = await api.get(`/freight/shipments/${id}`, { params: { _t: Date.now() } }); 
      return r.data.data 
    },
    staleTime: 0,
    gcTime: 0,
  })

  const isCHAOnly = shipment?.shipmentType === 'CHA Only'
  const steps = isCHAOnly ? CHA_STEPS : FULL_STEPS
  const cur = steps.findIndex(s => s.s === shipment?.currentStatus)

  useEffect(() => {
    if (shipment && !initialTabSet) {
      const tabParam = searchParams.get('tab')
      if (tabParam && ['freight', 'cha', 'accounts', 'history'].includes(tabParam)) {
        setActiveTab(tabParam)
      } else if (shipment.shipmentType === 'CHA Only') {
        setActiveTab('cha')
      }
      setInitialTabSet(true)
    }
  }, [shipment, initialTabSet, searchParams])

  const updateMutation = useMutation({
    mutationFn: async ({ section, data }) => {
      const eps = {
        rates:{u:`/freight/shipments/${id}/rates`,m:'put'},cbm:{u:`/freight/shipments/${id}/cbm`,m:'put'},nomination:{u:`/freight/shipments/${id}/nomination`,m:'put'},booking:{u:`/freight/shipments/${id}/booking`,m:'put'},schedule:{u:`/freight/shipments/${id}/schedule`,m:'put'},awb:{u:`/freight/shipments/${id}/awb`,m:'put'},checklist:{u:`/cha/shipments/${id}/checklist`,m:'put'},boe:{u:`/cha/shipments/${id}/boe`,m:'put'},do:{u:`/cha/shipments/${id}/do-collection`,m:'put'},ooc:{u:`/cha/shipments/${id}/ooc`,m:'put'},gatepass:{u:`/cha/shipments/${id}/gate-pass`,m:'put'},pod:{u:`/cha/shipments/${id}/pod`,m:'put'},invoice:{u:`/accounts/shipments/${id}/invoice`,m:'put'},invoiceSend:{u:`/accounts/shipments/${id}/invoice-send`,m:'put'},stage:{u:`/freight/shipments/${id}/stage`,m:'put'},remarks:{u:`/freight/shipments/${id}/remarks`,m:'put'},fromlocation:{u:`/freight/shipments/${id}/fromlocation`,m:'put'},tolocation:{u:`/freight/shipments/${id}/tolocation`,m:'put'},terms:{u:`/freight/shipments/${id}/terms`,m:'put'},portlocation:{u:`/freight/shipments/${id}/portlocation`,m:'put'},shipmenttype:{u:`/freight/shipments/${id}/shipmenttype`,m:'put'},importexport:{u:`/freight/shipments/${id}/importexport`,m:'put'}
      }
      return api[eps[section].m](eps[section].u, data)
    },
    onSuccess: () => {
      addToast('Saved!', 'success');
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipment', id] });
    },
    onError: (e) => addToast(e.response?.data?.message || 'Failed', 'error')
  })

  const handlePrint = () => {
    const ff = shipment?.freightForwarding || {}; const cha = shipment?.cha || {}; const acc = shipment?.accounts || {}
    const fmd = d => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
    const pw = window.open('', '_blank', 'width=900,height=700')
    pw.document.write(`<!DOCTYPE html><html><head><title>${shipment.refNo} - PAS Freight</title><style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial;padding:40px;color:#1a1a1a;max-width:900px;margin:auto}
      .header{border-bottom:3px solid #4f46e5;padding-bottom:15px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
      .header h1{color:#4f46e5;font-size:22px}.header p{color:#666;font-size:12px}
      .ref-box{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding:10px 15px;background:#eef2ff;border-radius:8px}
      .ref{font-size:20px;font-weight:bold;color:#4f46e5}.stage{font-size:12px;padding:3px 12px;border-radius:20px;background:#e0e7ff;color:#4f46e5;font-weight:bold}
      .section{margin-bottom:20px}.section h2{font-size:14px;color:#4f46e5;border-bottom:2px solid #e5e7eb;padding-bottom:5px;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px}
      .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.item{padding:6px 0;border-bottom:1px solid #f3f4f6}.item label{font-size:9px;color:#9ca3af;display:block;text-transform:uppercase}.item span{font-size:13px;color:#1f2937;font-weight:500}
      .remarks-box{margin-top:10px;padding:10px;background:#fffbeb;border-left:3px solid #f59e0b;font-size:12px}.footer{margin-top:30px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:10px;color:#9ca3af;text-align:center}
      @media print{body{padding:20px}}</style></head><body>
      <div class="header"><div><h1>🚢 PAS Freight Services Pvt Ltd</h1><p>Shipment Details Report</p></div><p>${new Date().toLocaleDateString()}</p></div>
      <div class="ref-box"><div class="ref">${shipment.refNo}</div><div class="stage">${shipment.currentStatus.replace(/_/g,' ')}</div></div>
      ${shipment.shipmentType?`<p style="margin-bottom:15px"><strong>Transport Mode:</strong> ${shipment.shipmentType}</p>`:''}
      ${shipment.importExport?`<p style="margin-bottom:15px"><strong>Import/Export:</strong> ${shipment.importExport}</p>`:''}
      ${shipment.shipmentStage?`<p style="margin-bottom:15px"><strong>Stage:</strong> ${shipment.shipmentStage}</p>`:''}
      <div class="section"><h2>📦 Freight Forwarding</h2><div class="grid">
      <div class="item"><label>Consignee</label><span>${ff.consigneeName||'—'}</span></div><div class="item"><label>Shipper</label><span>${ff.shipperName||'—'}</span></div><div class="item"><label>From</label><span>${ff.fromLocation||'—'}</span></div><div class="item"><label>To</label><span>${ff.toLocation||'—'}</span></div><div class="item"><label>Terms</label><span>${ff.terms||'—'}</span></div><div class="item"><label>Port Location</label><span>${ff.portLocation||'—'}</span></div><div class="item"><label>Agent</label><span>${ff.agent||'—'}</span></div><div class="item"><label>Packages</label><span>${ff.noOfPackages||'—'}</span></div><div class="item"><label>Gross Weight</label><span>${ff.grossWeight?ff.grossWeight+' kg':'—'}</span></div><div class="item"><label>Chargeable Weight</label><span>${ff.weight?ff.weight+' kg':'—'}</span></div><div class="item"><label>CBM</label><span>${ff.cbm||'—'}</span></div><div class="item"><label>Booking Date</label><span>${fmd(ff.bookingDate)}</span></div><div class="item"><label>ETD</label><span>${fmd(ff.etd)}</span></div><div class="item"><label>ETA</label><span>${fmd(ff.eta)}</span></div><div class="item"><label>MAWB</label><span>${ff.mawb||'—'}</span></div><div class="item"><label>HAWB</label><span>${ff.hawb||'—'}</span></div><div class="item"><label>AWB Date</label><span>${fmd(ff.awbDate)}</span></div></div></div>
      <div class="section"><h2>🛃 Customs Clearance</h2><div class="grid">
      <div class="item"><label>Job No</label><span>${cha.jobNo||'—'}</span></div><div class="item"><label>Checklist Date</label><span>${fmd(cha.checklistDate)}</span></div><div class="item"><label>BOE No</label><span>${cha.boeNo||'—'}</span></div><div class="item"><label>BOE Date</label><span>${fmd(cha.boeDate)}</span></div><div class="item"><label>DO Collection</label><span>${fmd(cha.doCollectionDate)}</span></div><div class="item"><label>OOC Date</label><span>${fmd(cha.oocDate)}</span></div><div class="item"><label>Gate Pass</label><span>${fmd(cha.gatePassDate)}</span></div><div class="item"><label>Delivery Date</label><span>${fmd(cha.deliveryDate)}</span></div><div class="item"><label>Tracking No</label><span>${cha.trackingNumber||'—'}</span></div></div></div>
      <div class="section"><h2>💰 Accounts</h2><div class="grid"><div class="item"><label>Invoice No</label><span>${acc.invoiceNumber||'—'}</span></div><div class="item"><label>Invoice Date</label><span>${fmd(acc.invoiceDate)}</span></div><div class="item"><label>Sending Date</label><span>${fmd(acc.sendingDate)}</span></div></div></div>
      ${shipment.remarks?`<div class="remarks-box"><strong>Remarks:</strong> ${shipment.remarks}</div>`:''}
      <div class="footer">© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd</div><script>window.onload=function(){window.print()}</script></body></html>`)
    pw.document.close()
  }

  const getStatusBadge = (s) => { const b = {'ENQUIRY':'bg-gradient-to-r from-amber-400 to-amber-300 text-amber-900 border-amber-300','RATES_ADDED':'bg-gradient-to-r from-sky-400 to-sky-300 text-sky-900 border-sky-300','NOMINATED':'bg-gradient-to-r from-violet-400 to-violet-300 text-violet-900 border-violet-300','BOOKED':'bg-gradient-to-r from-indigo-400 to-indigo-300 text-indigo-900 border-indigo-300','SCHEDULED':'bg-gradient-to-r from-cyan-400 to-cyan-300 text-cyan-900 border-cyan-300','AWB_GENERATED':'bg-gradient-to-r from-teal-400 to-teal-300 text-teal-900 border-teal-300','CHECKLIST_APPROVED':'bg-gradient-to-r from-emerald-400 to-emerald-300 text-emerald-900 border-emerald-300','BOE_FILED':'bg-gradient-to-r from-lime-400 to-lime-300 text-lime-900 border-lime-300','DO_COLLECTED':'bg-gradient-to-r from-green-400 to-green-300 text-green-900 border-green-300','OOC_DONE':'bg-gradient-to-r from-sky-500 to-sky-400 text-sky-900 border-sky-400','GATE_PASS':'bg-gradient-to-r from-purple-400 to-purple-300 text-purple-900 border-purple-300','DELIVERED':'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white border-emerald-400','INVOICE_GENERATED':'bg-gradient-to-r from-orange-400 to-orange-300 text-orange-900 border-orange-300','INVOICE_SENT':'bg-gradient-to-r from-rose-400 to-rose-300 text-rose-900 border-rose-300','COMPLETED':'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-800 border-gray-300'}; return b[s]||'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-700 border-gray-300' }

  if (isLoading) return <div className="flex items-center justify-center h-96"><div className="w-12 h-12 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
  if (!shipment) return <div className="text-center py-16"><div className="w-16 h-16 bg-gradient-to-br from-indigo-400 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><Package size={32} className="text-white"/></div><h3 className="text-lg font-semibold text-gray-800">Shipment not found</h3><Link to="/" className="inline-flex items-center gap-1 mt-4 text-indigo-600"><ArrowLeft size={14} />Back</Link></div>
  const ff = shipment.freightForwarding || {}; const cha = shipment.cha || {}; const accounts = shipment.accounts || {}; const Fmt = d => d ? new Date(d).toLocaleDateString() : null

  const tabs = [
    ...(!isCHAOnly ? [{ k: 'freight', l: 'Freight Forwarding', i: Ship }] : []),
    { k: 'cha', l: 'Customs Clearance', i: FileCheck },
    { k: 'accounts', l: 'Accounts', i: Receipt },
    { k: 'history', l: 'Status Timeline', i: Clock }
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div><Link to="/" className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-700 mb-3"><ArrowLeft size={15} />Back to shipments</Link>
        <div className="bg-gradient-to-br from-white to-indigo-50/30 rounded-xl border border-indigo-100 p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">{shipment.refNo}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(shipment.currentStatus)}`}>{shipment.currentStatus.replace(/_/g,' ')}</span>
                {isCHAOnly && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-emerald-500 to-green-500 text-white border border-emerald-400">CHA Only</span>}
              </div>
              <p className="text-sm text-gray-500 mt-1">Created {new Date(shipment.createdAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/create?edit=${shipment.id}`} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-lg hover:from-amber-500 hover:to-orange-600 text-sm font-medium shadow-lg shadow-amber-200"><Pencil size={16} />Edit</Link>
              <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-600 hover:to-teal-600 text-sm font-medium shadow-lg shadow-emerald-200"><Printer size={16} />Print</button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-indigo-100">
            <div className="flex items-center gap-2"><Luggage size={14} className="text-indigo-400" /><span className="text-xs text-indigo-500 font-medium">Transport Mode:</span><InlineField value={shipment.shipmentType} options={TRANSPORT_MODES} onSave={v => updateMutation.mutate({ section: 'shipmenttype', data: { shipmentType: v } })} placeholder="Set mode" /></div>
            <div className="flex items-center gap-2"><ArrowUpDown size={14} className="text-indigo-400" /><span className="text-xs text-indigo-500 font-medium">Import/Export:</span><InlineField value={shipment.importExport} options={IMPORT_EXPORT_OPTIONS} onSave={v => updateMutation.mutate({ section: 'importexport', data: { importExport: v } })} placeholder="Set I/E" /></div>
            <div className="flex items-center gap-2"><Flag size={14} className="text-indigo-400" /><span className="text-xs text-indigo-500 font-medium">Stage:</span>
              <div className="flex items-center gap-1">
                <InlineField value={STAGE_OPTIONS.includes(shipment.shipmentStage) ? shipment.shipmentStage : ''} options={STAGE_OPTIONS} onSave={v => updateMutation.mutate({ section: 'stage', data: { shipmentStage: v } })} className={shipment.shipmentStage && STAGE_COLORS[shipment.shipmentStage] ? `px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[shipment.shipmentStage]}` : ''} placeholder="Select" />
                <InlineField value={!STAGE_OPTIONS.includes(shipment.shipmentStage || '') ? shipment.shipmentStage : ''} onSave={v => updateMutation.mutate({ section: 'stage', data: { shipmentStage: v } })} placeholder="Custom..." />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-1"><MessageSquare size={14} className="text-indigo-400" /><span className="text-xs text-indigo-500 font-medium">Remarks:</span><InlineField value={shipment.remarks} onSave={v => updateMutation.mutate({ section: 'remarks', data: { remarks: v } })} placeholder="Add remarks..." className="flex-1" /></div>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border border-indigo-100 p-5 overflow-x-auto shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">{isCHAOnly ? 'CHA Workflow' : 'Shipment Workflow'}</span>
          <span className="text-[10px] text-indigo-400 flex items-center gap-1"><Info size={11} /> {isCHAOnly ? 'Customs clearance only' : 'Full freight + customs'}</span>
        </div>
        <div className="flex items-center gap-0 min-w-max mt-1">
          {steps.map((step, i) => {
            const Icon = step.i; const done = i <= cur; const now = i === cur
            return (
              <div key={step.s} className="flex items-center">
                <div className={`flex flex-col items-center ${done ? 'opacity-100' : 'opacity-40'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${now ? 'border-indigo-500 bg-indigo-50 scale-110 shadow-md shadow-indigo-200' : done ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-white'}`} title={step.d}>
                    {done ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Icon size={16} className="text-gray-400" />}
                  </div>
                  <span className={`text-[10px] mt-1.5 font-medium whitespace-nowrap ${now ? 'text-indigo-600' : 'text-gray-500'}`}>{step.l}</span>
                </div>
                {i < steps.length - 1 && <div className={`w-8 h-0.5 mx-0.5 mt-[-16px] ${i < cur ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-indigo-50 justify-center">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-300" /><span className="text-[10px] text-gray-500">Completed</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-indigo-500 shadow-sm shadow-indigo-300" /><span className="text-[10px] text-gray-500">Current</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-gray-300" /><span className="text-[10px] text-gray-500">Pending</span></div>
        </div>
      </div>
      
      <div className="hidden sm:flex bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-1 gap-1 border border-indigo-100">
        {tabs.map(t=>{const Icon=t.i;return <button key={t.k} onClick={()=>setActiveTab(t.k)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium flex-1 justify-center transition-all ${activeTab===t.k?'bg-white text-indigo-600 shadow-md':'text-gray-500 hover:text-indigo-500'}`}><Icon size={16}/><span>{t.l}</span></button>})}
      </div>
      <div className="sm:hidden flex bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-1 gap-1 overflow-x-auto border border-indigo-100">
        {tabs.map(t=>{const Icon=t.i;return <button key={t.k} onClick={()=>setActiveTab(t.k)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${activeTab===t.k?'bg-white text-indigo-600 shadow-md':'text-gray-500'}`}><Icon size={14}/>{t.l}</button>})}
      </div>

      <div className="bg-white rounded-xl border border-indigo-100 p-4 sm:p-6 shadow-sm">
        {activeTab==='freight'&&<div className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"><C icon={User} l="Consignee" v={ff.consigneeName}/><C icon={User} l="Shipper" v={ff.shipperName}/><C icon={MapPinned} l="From" v={ff.fromLocation}/><C icon={Navigation} l="To" v={ff.toLocation}/><C icon={FileSignature} l="Terms" v={ff.terms}/><C icon={Anchor} l="Agent" v={ff.agent}/><C icon={Package} l="Packages" v={ff.noOfPackages}/></div>
          <Section title="Route Details" icon={MapPinned}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ComboField label="From (Origin)" value={ff.fromLocation} options={COUNTRY_PORTS} onSave={v => updateMutation.mutate({ section: 'fromlocation', data: { fromLocation: v } })} placeholder="Custom country/port..." />
              <ComboField label="To (Destination)" value={ff.toLocation} options={INDIA_PORTS} onSave={v => updateMutation.mutate({ section: 'tolocation', data: { toLocation: v } })} placeholder="Custom city/port..." />
              <ComboField label="Terms" value={ff.terms} options={TERMS_OPTIONS} onSave={v => updateMutation.mutate({ section: 'terms', data: { terms: v } })} placeholder="Custom terms..." />
              <ComboField label="Port Location" value={ff.portLocation} options={PORT_LOCATIONS} onSave={v => updateMutation.mutate({ section: 'portlocation', data: { portLocation: v } })} placeholder="Custom port code..." />
            </div>
          </Section>
          <Section title="Weight Details" icon={Scale}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Gross Weight (kg)" value={ff.grossWeight} onSave={v => updateMutation.mutate({ section: 'rates', data: { grossWeight: v } })} type="number" />
              <Field label="Chargeable Weight (kg)" value={ff.weight} onSave={v => updateMutation.mutate({ section: 'rates', data: { weight: v } })} type="number" />
              <Field label="CBM" value={ff.cbm} onSave={v => updateMutation.mutate({ section: 'cbm', data: { cbm: v } })} type="number" />
            </div>
          </Section>
          <Section title="Nomination" icon={Calendar}><Field label="Nomination Date" value={Fmt(ff.nominationDate)} onSave={v => updateMutation.mutate({ section: 'nomination', data: { nominationDate: v } })} type="date" /></Section>
          <Section title="Booking" icon={Calendar}><Field label="Booking Date" value={Fmt(ff.bookingDate)} onSave={v => updateMutation.mutate({ section: 'booking', data: { bookingDate: v } })} type="date" /></Section>
          <Section title="Schedule" icon={Plane}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="ETD" value={Fmt(ff.etd)} onSave={v => updateMutation.mutate({ section: 'schedule', data: { etd: v } })} type="date" /><Field label="ETA" value={Fmt(ff.eta)} onSave={v => updateMutation.mutate({ section: 'schedule', data: { eta: v } })} type="date" /></div></Section>
          <Section title="AWB Details" icon={Barcode}><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Field label="MAWB" value={ff.mawb} onSave={v => updateMutation.mutate({ section: 'awb', data: { mawb: v } })} /><Field label="HAWB" value={ff.hawb} onSave={v => updateMutation.mutate({ section: 'awb', data: { hawb: v } })} /><Field label="AWB Date" value={Fmt(ff.awbDate)} onSave={v => updateMutation.mutate({ section: 'awb', data: { awbDate: v } })} type="date" /></div></Section></div>}
        {activeTab==='cha'&&<div className="space-y-4"><Section title="Checklist" icon={ClipboardCheck}><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Field label="Job No" value={cha.jobNo} onSave={v => updateMutation.mutate({ section: 'checklist', data: { jobNo: v } })} /><Field label="Checklist Date" value={Fmt(cha.checklistDate)} onSave={v => updateMutation.mutate({ section: 'checklist', data: { checklistDate: v } })} type="date" /><Field label="Approval Date" value={Fmt(cha.checklistApprovalDate)} onSave={v => updateMutation.mutate({ section: 'checklist', data: { checklistApprovalDate: v } })} type="date" /></div></Section><Section title="BOE" icon={FileText}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="BOE No" value={cha.boeNo} onSave={v => updateMutation.mutate({ section: 'boe', data: { boeNo: v } })} /><Field label="BOE Date" value={Fmt(cha.boeDate)} onSave={v => updateMutation.mutate({ section: 'boe', data: { boeDate: v } })} type="date" /></div></Section><Section title="DO Collection" icon={FileCheck}><Field label="DO Date" value={Fmt(cha.doCollectionDate)} onSave={v => updateMutation.mutate({ section: 'do', data: { doCollectionDate: v } })} type="date" /></Section><Section title="OOC" icon={CheckCircle2}><Field label="OOC Date" value={Fmt(cha.oocDate)} onSave={v => updateMutation.mutate({ section: 'ooc', data: { oocDate: v } })} type="date" /></Section><Section title="Gate Pass" icon={Truck}><Field label="Gate Pass Date" value={Fmt(cha.gatePassDate)} onSave={v => updateMutation.mutate({ section: 'gatepass', data: { gatePassDate: v } })} type="date" /></Section><Section title="POD (Delivery)" icon={MapPin}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="Delivery Date" value={Fmt(cha.deliveryDate)} onSave={v => updateMutation.mutate({ section: 'pod', data: { deliveryDate: v } })} type="date" /><Field label="Tracking No" value={cha.trackingNumber} onSave={v => updateMutation.mutate({ section: 'pod', data: { trackingNumber: v } })} /></div></Section></div>}
        {activeTab==='accounts'&&<div className="space-y-4"><Section title="Invoice" icon={Banknote}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="Invoice No" value={accounts.invoiceNumber} onSave={v => updateMutation.mutate({ section: 'invoice', data: { invoiceNumber: v } })} /><Field label="Invoice Date" value={Fmt(accounts.invoiceDate)} onSave={v => updateMutation.mutate({ section: 'invoice', data: { invoiceDate: v } })} type="date" /></div></Section><Section title="Invoice Sending" icon={Send}><Field label="Sending Date" value={Fmt(accounts.sendingDate)} onSave={v => updateMutation.mutate({ section: 'invoiceSend', data: { sendingDate: v } })} type="date" /></Section></div>}
        {activeTab==='history'&&<div><h3 className="text-base font-semibold mb-4 text-indigo-700">Status Timeline</h3>{shipment.statusHistory?.length>0?<div className="relative pl-6 border-l-2 border-indigo-200 space-y-6">{[...shipment.statusHistory].reverse().map((h,i)=><div key={i} className="relative"><div className="absolute -left-[25px] w-3 h-3 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 border-2 border-white ring-2 ring-indigo-200 shadow-sm"/><div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg p-3 ml-2 border border-indigo-100"><p className="text-sm font-semibold text-indigo-700">{h.status.replace(/_/g,' ')}</p>{h.remarks&&<p className="text-xs text-gray-500 mt-0.5">{h.remarks}</p>}<p className="text-xs text-gray-400 mt-1">{new Date(h.createdAt).toLocaleString()}</p></div></div>)}</div>:<div className="text-center py-8 text-gray-500"><Clock size={32} className="mx-auto text-gray-300 mb-2"/><p className="text-sm">No status changes recorded yet.</p></div>}</div>}
      </div>
    </div>
  )
}

function C({icon:I,label:l,value:v}){return <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-100"><I size={16} className="text-indigo-400 flex-shrink-0"/><div className="min-w-0"><p className="text-xs text-indigo-400">{l}</p><p className="text-sm font-medium text-gray-800 truncate">{v||'—'}</p></div></div>}
function Section({ title, icon: Icon, children }) { return <div className="border border-indigo-100 rounded-xl overflow-hidden shadow-sm"><div className="flex items-center gap-2 p-4 bg-gradient-to-r from-indigo-50 to-blue-50/50 border-b border-indigo-100"><Icon size={14} className="text-indigo-400" /><p className="text-sm font-semibold text-indigo-600">{title}</p></div><div className="p-4">{children}</div></div> }
function Field({ label, value, onSave, type = 'text' }) {
  const [editing, setEditing] = useState(false); const [val, setVal] = useState(value || ''); const inputRef = useRef(null)
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])
  useEffect(() => { setVal(value || '') }, [value])
  const save = () => { setEditing(false); if (val !== (value || '')) onSave(val) }
  return <div><label className="block text-xs text-indigo-400 mb-1">{label}</label>{editing ? (
    <input ref={inputRef} type={type} value={val} onChange={e => setVal(e.target.value)} onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value || ''); setEditing(false) } }}
      className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white" step={type === 'number' ? '0.01' : undefined} />
  ) : (
    <div onClick={() => setEditing(true)} className="w-full px-3 py-2 border border-indigo-100 rounded-lg text-sm cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors flex items-center justify-between group">
      <span className={value ? 'font-medium text-gray-800' : 'text-gray-400 italic'}>{value || 'Not set'}</span>
      <Pencil size={10} className="text-gray-300 group-hover:text-indigo-500 opacity-0 group-hover:opacity-100" />
    </div>
  )}</div>
}