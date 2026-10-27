import { useState, useRef, useEffect, useId } from 'react'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useSocket } from '../App'
import {
  ArrowLeft, Package, Ship, FileCheck, Receipt, CheckCircle2, Clock, Truck, Plane, FileText,
  ClipboardCheck, ClipboardList, Banknote, Send, MapPin, Barcode, Calendar, User, DollarSign,
  Anchor, Check, Printer, Pencil, MapPinned, FileSignature, ArrowUpDown, Scale, Mail, Loader2,
  ChevronDown, Box, Zap, Users2, AlertCircle, RotateCcw
} from 'lucide-react'

const STAGE_OPTIONS = ['Enquiry', 'Rates Requested', 'Quoted', 'Nomination', 'Draft', 'Pre-alerts', 'Checklist', 'BOE', 'OOC', 'POD', 'Invoice', 'Cancelled']
// Must match VALID_MANUAL_STATUSES in freightForwarding.controller.js exactly
const STATUS_DROPDOWN_OPTIONS = [
  'ENQUIRY', 'RATES_REQUESTED', 'RATES_ADDED', 'NOMINATED', 'BOOKED', 'PICKUP_DONE', 'SCHEDULED', 'DRAFT', 'PRE_ALERTS', 'AWB_GENERATED',
  'CHECKLIST_APPROVED', 'BOE_FILED', 'SB_FILED', 'DO_COLLECTED', 'OOC_DONE', 'LEO_DONE', 'GATE_PASS',
  'HAND_OVER', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT', 'CANCELLED'
]
const CANCEL_REASONS = ['Price too high', 'No response from customer', 'Went to a competitor', 'Cargo not ready', 'Customer postponed', 'Agent rate not workable', 'Duplicate enquiry', 'Other']
// what to do for each step (used by the "Next step" guide button): which tab, and what to fill
const NEXT_STEP_HELP = {
  RATES_REQUESTED: { tab: null, text: 'Send the rate request' },
  PICKUP_DONE: { tab: 'freight', text: 'fill Pickup Date' },
  AWB_GENERATED: { tab: 'freight', text: 'fill MAWB / HAWB' },
  DO_COLLECTED: { tab: 'accounts', text: 'fill DO Collection Date' },
  DELIVERED: { tab: 'freight', text: 'fill Delivery Date' },
  INVOICE_GENERATED: { tab: 'accounts', text: 'fill Invoice No & Date' },
  INVOICE_SENT: { tab: 'accounts', text: 'fill Invoice Sending Date' },
}
const TRANSPORT_MODES = ['Air', 'Sea FCL', 'Sea LCL', 'Courier']
const TRANSPORT_MODE_OPTIONS = ['Air', 'Sea', 'Courier']
const IMPORT_EXPORT_OPTIONS = ['Import', 'Export']
const COUNTRY_PORTS = ['SINGAPORE', 'MALAYSIA', 'CHINA', 'HONG KONG', 'JAPAN', 'SOUTH KOREA', 'TAIWAN', 'THAILAND', 'VIETNAM', 'INDONESIA', 'USA', 'UK', 'GERMANY', 'NETHERLANDS', 'FRANCE', 'ITALY', 'SPAIN', 'UAE', 'SAUDI ARABIA', 'AUSTRALIA']
const INDIA_PORTS = ['BANGALORE', 'CHENNAI', 'MUMBAI', 'DELHI', 'HYDERABAD', 'KOLKATA', 'AHMEDABAD', 'PUNE', 'COCHIN', 'TUTICORIN', 'VISAKHAPATNAM', 'MUNDRA', 'NHAVA SHEVA', 'KATTUPALLI', 'ENNORE']
const TERMS_OPTIONS = ['EXW', 'FOB', 'FCA', 'CIF', 'DDP', 'DAP', 'DAT', 'CPT', 'CIP', 'FAS', 'CFR']
const PORT_LOCATIONS = ['SIN', 'INBLR4', 'INMAA4', 'INBOM4', 'INDEA4', 'INHYD4', 'INCCU4', 'INAMD4', 'INPNQ4', 'INCOK4', 'INTUT4', 'INVTZ4', 'INMUN4', 'INNSV4', 'INKAT4', 'INENR4']
const VEHICLE_TYPES = ['10ft', '20ft', '32ft', '40ft']
const PACKAGE_TYPES = ['Box / Carton', 'Envelope / Document', 'Parcel', 'Pallet', 'Crate', 'Bag / Sack', 'Drum / Barrel', 'Tube', 'Container', 'Wooden Box', 'Plastic Bin', 'Roll', 'Bundle', 'Cargo Package', 'Freight Package']

const SECTION_TO_STATUS = {
  rates: 'RATES_ADDED', nomination: 'NOMINATED', booking: 'BOOKED', schedule: 'SCHEDULED', awb: 'AWB_GENERATED',
  checklist: 'CHECKLIST_APPROVED', boe: 'BOE_FILED', do: 'DO_COLLECTED', ooc: 'OOC_DONE', gatepass: 'GATE_PASS',
  pod: 'DELIVERED', leo: 'LEO_DONE', handover: 'HAND_OVER', shippingbill: 'SB_FILED', invoice: 'INVOICE_GENERATED', invoiceSend: 'INVOICE_SENT',
}

const FULL_STEPS = [
  {s:'ENQUIRY',l:'Enquiry',d:'Initial request',i:ClipboardList},{s:'RATES_REQUESTED',l:'Rates Requested',d:'Agents asked for rates',i:Send},{s:'RATES_ADDED',l:'Rates',d:'Pricing added',i:DollarSign},{s:'NOMINATED',l:'Nominated',d:'Agent assigned',i:User},
  {s:'BOOKED',l:'Booked',d:'Confirmed with carrier',i:Calendar},{s:'PICKUP_DONE',l:'Pickup',d:'Cargo picked up',i:Truck},{s:'SCHEDULED',l:'Scheduled',d:'ETD/ETA set',i:Clock},{s:'DRAFT',l:'Draft',d:'Draft stage reached',i:FileSignature,optional:true},{s:'PRE_ALERTS',l:'Pre-Alerts',d:'Pre-alerts sent',i:Mail},
  {s:'CHECKLIST_APPROVED',l:'Checklist',d:'Customs checklist done',i:ClipboardCheck},{s:'BOE_FILED',l:'BOE',d:'Bill of Entry filed',i:FileText},{s:'DO_COLLECTED',l:'DO',d:'Delivery Order collected',i:FileCheck},
  {s:'OOC_DONE',l:'OOC',d:'Out of Charge',i:CheckCircle2},{s:'GATE_PASS',l:'Gate Pass',d:'Customs gate cleared',i:Truck},{s:'DELIVERED',l:'Delivered',d:'Cargo delivered',i:MapPin},
  {s:'INVOICE_GENERATED',l:'Invoice',d:'Invoice created',i:Banknote},{s:'INVOICE_SENT',l:'Sent',d:'Invoice dispatched',i:Send}
]
const CHA_IMPORT_STEPS = [
  {s:'ENQUIRY',l:'Enquiry',d:'Initial request',i:ClipboardList},
  {s:'CHECKLIST_APPROVED',l:'Checklist',d:'Checklist done',i:ClipboardCheck},{s:'BOE_FILED',l:'BOE',d:'BOE filed',i:FileText},{s:'DO_COLLECTED',l:'DO',d:'DO collected',i:FileCheck},
  {s:'OOC_DONE',l:'OOC',d:'Out of Charge',i:CheckCircle2},{s:'GATE_PASS',l:'Gate Pass',d:'Gate cleared',i:Truck},{s:'DELIVERED',l:'Delivered',d:'Delivered',i:MapPin},
  {s:'INVOICE_GENERATED',l:'Invoice',d:'Invoice created',i:Banknote},{s:'INVOICE_SENT',l:'Sent',d:'Invoice sent',i:Send}
]
const CHA_EXPORT_STEPS = [
  {s:'ENQUIRY',l:'Enquiry',d:'Initial request',i:ClipboardList},
  {s:'CHECKLIST_APPROVED',l:'Checklist',d:'Checklist done',i:ClipboardCheck},{s:'SB_FILED',l:'Shipping Bill',d:'SB filed',i:FileText},
  {s:'LEO_DONE',l:'LEO',d:'LEO Done',i:CheckCircle2},{s:'HAND_OVER',l:'Hand Over',d:'Hand Over',i:Truck},{s:'DELIVERED',l:'Delivered',d:'Delivered',i:MapPin},
  {s:'INVOICE_GENERATED',l:'Invoice',d:'Invoice created',i:Banknote},{s:'INVOICE_SENT',l:'Sent',d:'Invoice sent',i:Send}
]
const TRANSPORT_STEPS = [
  {s:'ENQUIRY',l:'Enquiry',d:'Created',i:ClipboardList},
  {s:'DELIVERED',l:'Delivered',d:'Delivered',i:MapPin},
  {s:'INVOICE_GENERATED',l:'Invoice',d:'Invoice created',i:Banknote},{s:'INVOICE_SENT',l:'Sent',d:'Invoice sent',i:Send}
]
const DO_RELEASE_STEPS = [
  {s:'ENQUIRY',l:'Enquiry',d:'Created',i:ClipboardList},
  {s:'DO_COLLECTED',l:'DO Collected',d:'DO Released',i:FileCheck},
  {s:'INVOICE_GENERATED',l:'Invoice',d:'Invoice created',i:Banknote},{s:'INVOICE_SENT',l:'Sent',d:'Invoice sent',i:Send}
]
// Steps for FF Only shipments
const FF_ONLY_STEPS = [
  {s:'ENQUIRY',l:'Enquiry',d:'Created',i:ClipboardList},
  {s:'RATES_REQUESTED',l:'Rates Requested',d:'Agents asked for rates',i:Send},
  {s:'PICKUP_DONE',l:'Pickup',d:'Cargo picked up',i:Truck},
  {s:'AWB_GENERATED',l:'AWB',d:'AWB Generated',i:Barcode},
  {s:'DO_COLLECTED',l:'DO Collected',d:'DO Released',i:FileCheck},
  {s:'INVOICE_GENERATED',l:'Invoice',d:'Invoice created',i:Banknote},{s:'INVOICE_SENT',l:'Sent',d:'Invoice sent',i:Send}
]

function InlineField({ value, onSave, type = 'text', placeholder = '—', className = '', options = null }) {
  const [editing, setEditing] = useState(false); const [val, setVal] = useState(value || ''); const inputRef = useRef(null)
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])
  useEffect(() => { setVal(value || '') }, [value])
  const save = () => { setEditing(false); if (val !== (value || '')) onSave(val) }
  const editClass = 'h-10 w-full px-2.5 border border-[var(--input-focus)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)]'
  if (editing) {
    if (options) return <select ref={inputRef} value={val} onChange={e => setVal(e.target.value)} onBlur={save} className={editClass}><option value="">Select...</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
    return <input ref={inputRef} type={type} value={val} onChange={e => setVal(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value || ''); setEditing(false) } }} className={editClass} step={type === 'number' ? '0.01' : undefined} />
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={e => { if (e.key === 'Enter') setEditing(true) }}
      className={`cursor-pointer group flex items-center gap-1.5 min-h-[28px] rounded-md ${className}`}
    >
      <span className={value ? 'text-sm font-medium text-[var(--text-primary)]' : 'text-sm text-[var(--text-muted)] italic'}>{value || placeholder}</span>
      <Pencil size={12} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] flex-shrink-0" />
    </div>
  )
}

const asText = (v) => (v === null || v === undefined ? '' : String(v))

const maskDate = (raw) => {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`
}

const toISODate = (text) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text)
  if (!m) return null
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  if (year < 1990 || year > 2100) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

const flowFields = () => Array.from(document.querySelectorAll('[data-flow]')).filter(el => !el.disabled && el.offsetParent !== null)

function moveFlow(from, step) {
  const list = flowFields()
  const at = list.indexOf(from)
  if (at < 0) return
  const next = list[at + step]
  if (next) {
    next.focus()
    next.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return
  }
  window.dispatchEvent(new CustomEvent('flow-edge', { detail: step }))
}

function SaveMark({ state, className = '' }) {
  return (
    <span className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${className}`}>
      {state === 'saving' && <Loader2 size={14} className="animate-spin text-[var(--text-secondary)]" />}
      {state === 'saved' && <Check size={14} className="text-[var(--route)]" />}
      {state === 'error' && <AlertCircle size={14} className="text-red-500" />}
    </span>
  )
}

function useSavedFade(state, setState) {
  useEffect(() => {
    if (state !== 'saved') return
    const timer = setTimeout(() => setState('idle'), 1500)
    return () => clearTimeout(timer)
  }, [state, setState])
}

const fieldTone = (state) => state === 'error'
  ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/20'
  : state === 'saved'
    ? 'border-[var(--route)] focus:border-[var(--input-focus)]'
    : 'border-[var(--input-border)] focus:border-[var(--input-focus)]'

const labelClass = 'block text-[13px] font-semibold text-[var(--text-secondary)] mb-1.5'
const inputBase = 'w-full h-11 sm:h-[42px] px-3 border rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] outline-none'

function FieldNote({ state, note }) {
  if (state !== 'error' || !note) return null
  return <p role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{note}</p>
}

function PartyField({ label, value, onSave, type }) {
  const [val, setVal] = useState(asText(value))
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [state, setState] = useState('idle')
  const inputRef = useRef(null)
  const valRef = useRef(asText(value))
  const savedRef = useRef(asText(value))
  const loadedRef = useRef(false)
  const loadingRef = useRef(false)
  const inputId = useId()

  useSavedFade(state, setState)

  useEffect(() => {
    savedRef.current = asText(value)
    if (document.activeElement !== inputRef.current) {
      valRef.current = asText(value)
      setVal(asText(value))
    }
  }, [value])

  const update = (next) => { valRef.current = next; setVal(next) }

  const loadOptions = () => {
    if (loadedRef.current || loadingRef.current) return
    loadingRef.current = true
    api.get('/freight/party-names', { params: { type } })
      .then(res => { setOptions((res.data?.data || []).map(p => p.name)); loadedRef.current = true })
      .catch(() => {})
      .finally(() => { loadingRef.current = false })
  }

  const commit = async (text) => {
    const next = (text !== undefined ? text : valRef.current).trim()
    setOpen(false)
    setActive(-1)
    if (next === savedRef.current) return
    const previous = savedRef.current
    savedRef.current = next
    setState('saving')
    try {
      await onSave(next)
      setState('saved')
    } catch {
      savedRef.current = previous
      setState('error')
      return
    }
    if (next && loadedRef.current && !options.some(o => o.toLowerCase() === next.toLowerCase())) {
      try { await api.post('/freight/party-names', { type, name: next }) } catch {}
    }
  }

  const term = val.trim().toLowerCase()
  const filtered = (term ? options.filter(o => o.toLowerCase().includes(term)) : options).slice(0, 20)

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const picked = open && active >= 0 && filtered[active] ? filtered[active] : valRef.current
      update(picked)
      commit(picked)
      moveFlow(e.currentTarget, e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      update(savedRef.current)
      setOpen(false)
      setActive(-1)
      setState('idle')
    }
  }

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>{label}</label>
      <div className="relative">
        <input
          id={inputId}
          ref={inputRef}
          data-flow=""
          type="text"
          autoComplete="off"
          value={val}
          onFocus={(e) => { loadOptions(); e.target.select() }}
          onChange={(e) => { update(e.target.value); setOpen(true); setActive(-1); if (state !== 'saving') setState('idle') }}
          onBlur={() => commit()}
          onKeyDown={onKeyDown}
          className={`${inputBase} pr-9 ${fieldTone(state)}`}
        />
        <SaveMark state={state} className="right-3" />
        {open && filtered.length > 0 && (
          <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-xl">
            {filtered.map((name, i) => (
              <button
                key={name}
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => { e.preventDefault(); update(name); commit(name) }}
                className={`w-full text-left px-3 min-h-[40px] text-sm text-[var(--text-primary)] border-b border-[var(--border-color)] last:border-0 ${i === active ? 'bg-[var(--nav-active-bg)]' : 'hover:bg-[var(--hover-bg)]'}`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      <FieldNote state={state} note="Could not save. Check your connection and try again." />
    </div>
  )
}

function ComboField({ label, value, options, onSave, placeholder = 'Select or type' }) {
  return <Field label={label} value={value} options={options} onSave={onSave} placeholder={placeholder} />
}

// Which team members have worked on each of the three teams for this shipment.
// A "—" means nobody on that team has acted on it yet, which is visible at a
// glance without opening a report.
const TEAM_DOT = { Freight: 'bg-[var(--route)]', Customs: 'bg-[var(--route)]', Accounts: 'bg-[var(--route)]' }

function HandledByBadge({ label, name }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)]">
      <span className={`w-2 h-2 rounded-full ${TEAM_DOT[label] || 'bg-gray-400'}`} />
      <span className="font-semibold">{label}</span>
      <span className="text-[var(--text-primary)]">{name || '—'}</span>
    </span>
  )
}

// Everyone who has logged an action on this shipment, including handoffs
// (one person starts Customs, another finishes it). The three badges above
// only show who was first on each team. Comes from `contributors`, worked out
// by the backend from the shipment's full status history.
function EveryoneInvolved({ contributors }) {
  if (!contributors || contributors.length === 0) return null
  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }
  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users2 size={16} className="text-[var(--text-secondary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Everyone involved</h3>
        <span className="text-xs text-[var(--text-muted)]">({contributors.length} {contributors.length === 1 ? 'person' : 'people'})</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {contributors.map((c) => (
          <div key={c.name} className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
            <div className="w-7 h-7 rounded-full bg-[var(--bg-primary)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-primary)] text-xs font-bold flex-shrink-0">
              {c.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{c.name}</p>
              <p className="text-[11px] text-[var(--text-secondary)] leading-tight">{c.actionCount} {c.actionCount === 1 ? 'action' : 'actions'} · last {timeAgo(c.lastAction)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// Step completion check. The workflow stepper must not mark a step done just
// because it sits before the shipment's current status: the status can jump
// straight to INVOICE_GENERATED when someone fills in only the invoice. So each
// step is checked against its own field data, and a skipped step shows as
// missing (red) whatever the status says.
//
// Setting the Stage to "Quoted" or later also satisfies the Rates step, even
// with no number typed in. Reaching Quoted means the rates were worked out with
// the customer, whether or not they were ever entered here.
function isStageAtOrPastQuoted(shipmentStage) {
  if (shipmentStage === 'Cancelled') return false // Cancelled sits last in the list for the dropdown but is not further along in the real workflow
  const idx = STAGE_OPTIONS.indexOf(shipmentStage)
  const quotedIdx = STAGE_OPTIONS.indexOf('Quoted')
  return idx !== -1 && idx >= quotedIdx
}

// Draft has no date field of its own — it is marked done once the shipment's Stage is
// set to Draft or anything after it (Cancelled doesn't count as "after").
function isStageAtOrPastDraft(shipmentStage) {
  if (shipmentStage === 'Cancelled') return false
  const idx = STAGE_OPTIONS.indexOf(shipmentStage)
  return idx !== -1 && idx >= STAGE_OPTIONS.indexOf('Draft')
}

function isStepComplete(statusKey, ff, cha, accounts, shipmentStage) {
  switch (statusKey) {
    case 'ENQUIRY': return true
    case 'RATES_REQUESTED': { if (shipmentStage === 'Cancelled') return false; const i = STAGE_OPTIONS.indexOf(shipmentStage); return i !== -1 && i >= STAGE_OPTIONS.indexOf('Rates Requested') }
    case 'RATES_ADDED': return !!(ff.weight || ff.grossWeight || ff.sellingRate) || isStageAtOrPastQuoted(shipmentStage)
    case 'NOMINATED': return !!ff.nominationDate
    case 'BOOKED': return !!ff.bookingDate
    case 'PICKUP_DONE': return !!ff.pickupDate
    case 'SCHEDULED': return !!(ff.etd || ff.eta)
    case 'AWB_GENERATED': return !!(ff.mawb || ff.hawb)
    case 'DRAFT': return isStageAtOrPastDraft(shipmentStage)
    case 'PRE_ALERTS': return !!ff.preAlertsSentDate
    case 'CHECKLIST_APPROVED': return !!cha.checklistDate
    case 'BOE_FILED': return !!cha.boeNo
    case 'DO_COLLECTED': return !!cha.doCollectionDate
    case 'OOC_DONE': return !!cha.oocDate
    case 'GATE_PASS': return !!cha.gatePassDate
    case 'DELIVERED': return !!cha.deliveryDate
    case 'SB_FILED': return !!cha.sbNo
    case 'LEO_DONE': return !!cha.leoDate
    case 'HAND_OVER': return !!cha.handOverDate
    case 'INVOICE_GENERATED': return !!(accounts.invoiceNumber && accounts.invoiceDate)
    case 'INVOICE_SENT': return !!accounts.sendingDate
    default: return true
  }
}

// Maps an update mutation's `section` key to the slug of the Section it lives
// in, so after saving we know which block to scroll back to next time. Keys
// with no Section (the header quick-edit fields) are left out.
const SECTION_KEY_TO_SLUG = {
  rates: 'weight-details', cbm: 'weight-details',
  nomination: 'nomination', booking: 'booking', schedule: 'schedule', awb: 'awb-details',
  checklist: 'checklist', boe: 'boe', do: 'do-collection', ooc: 'ooc', gatepass: 'gate-pass',
  pod: 'pod-delivery', leo: 'leo', handover: 'hand-over', shippingbill: 'shipping-bill',
  invoice: 'invoice', invoiceSend: 'invoice-sending',
  fromlocation: 'route-details', tolocation: 'route-details', terms: 'route-details', portlocation: 'route-details',
  notificationemail: 'notification-settings',
}

// "What is still missing" for the completeness panel. Lists every required
// field that is still empty, with the same labels as the fields on the page.
// Must match the required-field lists in the backend (isArchiveEligible in the
// controllers). Notification Email is not required.
const isBlank = (v) => v === null || v === undefined || v === ''
const missingOf = (pairs) => pairs.filter(([, v]) => isBlank(v)).map(([label]) => label)
function getCompletenessSections(sh) {
  const ff = sh.freightForwarding || {}
  const cha = sh.cha || {}
  const acc = sh.accounts || {}
  const simple = ['Transport', 'DO Release', 'FF Only'].includes(sh.shipmentType)
  const chaOnly = sh.shipmentType === 'CHA Only'
  const isExport = sh.importExport === 'Export'
  const section = (title, tab, pairs) => ({ title, tab, total: pairs.length, missing: missingOf(pairs) })
  const sections = []
  if (!simple && !chaOnly) {
    sections.push(section('Freight', 'freight', [
      ['Consignee Name', ff.consigneeName], ['Shipper Name', ff.shipperName],
      ['Gross Weight', ff.grossWeight], ['Chargeable Weight', ff.weight],
      ['Nomination Date', ff.nominationDate], ['Booking Date', ff.bookingDate], ['Pickup Date', ff.pickupDate],
      ['ETD', ff.etd], ['ETA', ff.eta],
      ['MAWB', ff.mawb], ['HAWB', ff.hawb], ['AWB Date', ff.awbDate],
      ['Pre-Alerts Sent On', ff.preAlertsSentDate], ['DO Collection Date', cha.doCollectionDate]
    ]))
  }
  if (!simple) {
    sections.push(section('Customs', 'cha', [
      ['Job No', cha.jobNo], ['Checklist Date', cha.checklistDate], ['Approval Date', cha.checklistApprovalDate],
      ...(isExport
        ? [['SB No', cha.sbNo], ['SB Date', cha.sbDate], ['LEO Date', cha.leoDate], ['Hand Over Date', cha.handOverDate]]
        : [['BOE No', cha.boeNo], ['BOE Date', cha.boeDate], ['OOC Date', cha.oocDate], ['Gate Pass Date', cha.gatePassDate], ['Delivery Date', cha.deliveryDate]]),
      ['Tracking No', cha.trackingNumber]
    ]))
  }
  sections.push(section('Invoice', 'accounts', [
    ['Invoice No', acc.invoiceNumber], ['Invoice Date', acc.invoiceDate], ['Sending Date', acc.sendingDate]
  ]))
  return sections
}

const TAB_NAMES = { freight: 'Freight tab', cha: 'Customs tab', accounts: 'Accounts tab' }

function CompletenessPanel({ shipment, sections, onOpenTab }) {
  if (!shipment || shipment.currentStatus === 'CANCELLED') return null
  if (shipment.isArchived) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-3">
        <CheckCircle2 size={18} className="text-[var(--route)] shrink-0" />
        <span className="text-sm font-medium text-[var(--text-primary)]">All required fields are complete. This shipment is in the Archive.</span>
      </div>
    )
  }
  const totalMissing = sections.reduce((n, sec) => n + sec.missing.length, 0)
  if (totalMissing === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-3">
        <CheckCircle2 size={18} className="text-[var(--route)] shrink-0" />
        <span className="text-sm font-medium text-[var(--text-primary)]">Every required field is filled in. This shipment moves to the Archive automatically.</span>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-[var(--border-color)] border-l-4 border-l-[var(--route)] bg-[var(--bg-primary)] px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle size={18} className="text-[var(--route)] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{totalMissing} required field{totalMissing === 1 ? '' : 's'} still empty</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">This shipment moves to the Archive automatically as soon as they are filled in.</p>
        </div>
      </div>
      {sections.filter((sec) => sec.missing.length > 0).map((sec) => (
        <div key={sec.title} className="mt-3 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => onOpenTab(sec.tab)} className="text-xs font-semibold text-[var(--text-primary)] mr-1 underline underline-offset-2 decoration-[var(--route)] decoration-2">
            {sec.title} <span className="font-normal text-[var(--text-secondary)] no-underline">({TAB_NAMES[sec.tab]})</span>
          </button>
          {sec.missing.map((label) => (
            <span key={label} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)]">{label}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function ShipmentDetail() {
  const { id } = useParams(); const [searchParams] = useSearchParams(); const { addToast } = useToast(); const queryClient = useQueryClient()
  const navigate = useNavigate()
  const socket = useSocket()
  const [initialTabSet, setInitialTabSet] = useState(false)
  const [activeTab, setActiveTab] = useState('freight')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showEmailDropdown, setShowEmailDropdown] = useState(false)
  const [showTypeSwitcher, setShowTypeSwitcher] = useState(false)
  // Wake the mailer when the page opens so it is ready by the time Rate request is pressed
  const MAILER_URL = (import.meta.env.VITE_MAILER_URL || 'https://pasfreight-mailer.onrender.com').replace(/\/$/, '')
  const [rateBusy, setRateBusy] = useState(false)
  const [cancelAsk, setCancelAsk] = useState(null) // { section, data } waiting for a cancel reason
  const [cancelReason, setCancelReason] = useState('')
  const [cancelNote, setCancelNote] = useState('')
  const [reactivating, setReactivating] = useState(false)
  const [reopening, setReopening] = useState(false)
  useEffect(() => { try { new Image().src = `${MAILER_URL}/api/rate/ping?t=${Date.now()}` } catch {} }, [])
  const [liveEditBy, setLiveEditBy] = useState(null)

  // Back returns to wherever the user came from (Overview with a search or
  // filter applied, Team Overview, ...). navigate(-1) restores that page's URL
  // including its query params. Falls back to "/" when there is no history,
  // e.g. a deep link opened directly.
  const goBack = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1)
    else navigate('/')
  }

  const { data: shipment, isLoading } = useQuery({
    queryKey: ['shipment', id],
    queryFn: async () => { const r = await api.get(`/freight/shipments/${id}`, { params: { _t: Date.now() } }); return r.data.data },
    staleTime: 0, gcTime: 0,
  })

  useEffect(() => {
    if (!socket || !id) return
    const handleStatusUpdate = (data) => {
      if (data.id === id) { addToast(`Status changed to: ${data.status}`, 'info'); queryClient.invalidateQueries({ queryKey: ['shipment', id] }); queryClient.invalidateQueries({ queryKey: ['shipments'] }) }
    }
    const handleUpdate = (data) => {
      if (data.id === id) { setLiveEditBy(data.user || 'Someone'); setTimeout(() => setLiveEditBy(null), 3000); queryClient.invalidateQueries({ queryKey: ['shipment', id] }) }
    }
    socket.on('shipment:statusUpdate', handleStatusUpdate)
    socket.on('shipment:update', handleUpdate)
    return () => { socket.off('shipment:statusUpdate', handleStatusUpdate); socket.off('shipment:update', handleUpdate) }
  }, [socket, id, queryClient, addToast])

  const isTransport = shipment?.shipmentType === 'Transport'
  const isCHAOnly = shipment?.shipmentType === 'CHA Only'
  const isCHAExport = isCHAOnly && shipment?.importExport === 'Export'
  const isDORelease = shipment?.shipmentType === 'DO Release'
  const isFFOnly = shipment?.shipmentType === 'FF Only'
  // The plain "Freight" type (full Freight -> Customs -> Accounts pipeline, Import
  // or Export), as distinct from CHA Only / FF Only / Transport / DO Release. A
  // few fields (Commodity Name, Pre-Alerts, DO Collection under Freight) apply
  // only here.
  const isStandardFreight = !isTransport && !isDORelease && !isFFOnly && !isCHAOnly
  const steps = isFFOnly ? FF_ONLY_STEPS : isDORelease ? DO_RELEASE_STEPS : isTransport ? TRANSPORT_STEPS : isCHAOnly ? (isCHAExport ? CHA_EXPORT_STEPS : CHA_IMPORT_STEPS) : FULL_STEPS
  const curStored = steps.findIndex(s => s.s === shipment?.currentStatus)
  // If the saved status isn't one of this mode's steps (e.g. an older Freight shipment still
  // marked "AWB Generated"), fall back to the furthest step actually completed.
  const cur = curStored !== -1 ? curStored : steps.reduce((last, st, i) => (isStepComplete(st.s, shipment?.freightForwarding || {}, shipment?.cha || {}, shipment?.accounts || {}, shipment?.shipmentStage) ? i : last), 0)

  const statusOpts = (isFFOnly || isDORelease) ? [...steps.map(st => st.s), 'CANCELLED'] : STATUS_DROPDOWN_OPTIONS

  useEffect(() => {
    if (shipment && !initialTabSet) {
      const tabParam = searchParams.get('tab')
      // "Continue where I left off": when the URL does not say which tab to open
      // (a notification linking straight to Accounts does), restore the tab last
      // open for this shipment. Falls back to the type-based default.
      let lastTab = null
      try { lastTab = localStorage.getItem(`pas_last_tab_${id}`) } catch {}
      if (tabParam && ['freight', 'cha', 'accounts', 'history'].includes(tabParam)) setActiveTab(tabParam)
      else if (lastTab && ['freight', 'cha', 'accounts', 'history', 'do-release'].includes(lastTab)) setActiveTab(lastTab)
      else if (shipment.shipmentType === 'CHA Only') setActiveTab('cha')
      else if (shipment.shipmentType === 'Transport') setActiveTab('accounts')
      else if (shipment.shipmentType === 'DO Release') setActiveTab('accounts')
      else if (shipment.shipmentType === 'FF Only') setActiveTab('freight')
      setInitialTabSet(true)
    }
  }, [shipment, initialTabSet, searchParams, id])

  // "Continue where I left off", field level: once the right tab is showing,
  // scroll to the Section the last save touched and ring it briefly. Runs once
  // per visit (the stored slug is consumed straight away).
  useEffect(() => {
    if (!initialTabSet) return
    let slug = null
    try { slug = localStorage.getItem(`pas_last_field_${id}`) } catch {}
    if (!slug) return
    try { localStorage.removeItem(`pas_last_field_${id}`) } catch {}
    const timer = setTimeout(() => {
      const el = document.getElementById(`section-${slug}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-4', 'ring-amber-400', 'dark:ring-amber-500', 'ring-offset-2')
      setTimeout(() => el.classList.remove('ring-4', 'ring-amber-400', 'dark:ring-amber-500', 'ring-offset-2'), 2200)
    }, 250) // small delay so the tab's content has actually mounted first
    return () => clearTimeout(timer)
  }, [initialTabSet, activeTab, id])

  // Remember the active tab per shipment so reopening resumes here.
  useEffect(() => {
    if (!initialTabSet) return // don't persist the very first programmatic set on load
    try { localStorage.setItem(`pas_last_tab_${id}`, activeTab) } catch {}
  }, [activeTab, initialTabSet, id])

  const focusAfterSwitch = useRef(null)
  const flowTabs = isDORelease ? ['do-release', 'accounts'] : (isTransport || isFFOnly) ? ['freight', 'accounts'] : ['freight', 'cha', 'accounts']
  const flowKey = flowTabs.join('|')

  useEffect(() => {
    const onEdge = (e) => {
      const at = flowTabs.indexOf(activeTab)
      const next = at < 0 ? null : flowTabs[at + e.detail]
      if (!next) return
      focusAfterSwitch.current = e.detail > 0 ? 'first' : 'last'
      setActiveTab(next)
    }
    window.addEventListener('flow-edge', onEdge)
    return () => window.removeEventListener('flow-edge', onEdge)
  }, [activeTab, flowKey])

  useEffect(() => {
    const where = focusAfterSwitch.current
    if (!where) return
    focusAfterSwitch.current = null
    const fields = flowFields()
    const target = where === 'first' ? fields[0] : fields[fields.length - 1]
    if (target) target.focus()
  }, [activeTab])

  const updateMutation = useMutation({
    mutationFn: async ({ section, data }) => {
      const eps = {
        rates:{u:`/freight/shipments/${id}/rates`,m:'put'},cbm:{u:`/freight/shipments/${id}/cbm`,m:'put'},consignee:{u:`/freight/shipments/${id}/consignee`,m:'put'},shipper:{u:`/freight/shipments/${id}/shipper`,m:'put'},nomination:{u:`/freight/shipments/${id}/nomination`,m:'put'},booking:{u:`/freight/shipments/${id}/booking`,m:'put'},pickup:{u:`/freight/shipments/${id}/pickup`,m:'put'},schedule:{u:`/freight/shipments/${id}/schedule`,m:'put'},awb:{u:`/freight/shipments/${id}/awb`,m:'put'},checklist:{u:`/cha/shipments/${id}/checklist`,m:'put'},boe:{u:`/cha/shipments/${id}/boe`,m:'put'},do:{u:`/cha/shipments/${id}/do-collection`,m:'put'},ooc:{u:`/cha/shipments/${id}/ooc`,m:'put'},gatepass:{u:`/cha/shipments/${id}/gate-pass`,m:'put'},pod:{u:`/cha/shipments/${id}/pod`,m:'put'},leo:{u:`/cha/shipments/${id}/leo`,m:'put'},handover:{u:`/cha/shipments/${id}/hand-over`,m:'put'},shippingbill:{u:`/cha/shipments/${id}/shipping-bill`,m:'put'},invoice:{u:`/accounts/shipments/${id}/invoice`,m:'put'},invoiceSend:{u:`/accounts/shipments/${id}/invoice-send`,m:'put'},stage:{u:`/freight/shipments/${id}/stage`,m:'put'},status:{u:`/freight/shipments/${id}/status`,m:'put'},remarks:{u:`/freight/shipments/${id}/remarks`,m:'put'},fromlocation:{u:`/freight/shipments/${id}/fromlocation`,m:'put'},tolocation:{u:`/freight/shipments/${id}/tolocation`,m:'put'},terms:{u:`/freight/shipments/${id}/terms`,m:'put'},portlocation:{u:`/freight/shipments/${id}/portlocation`,m:'put'},shipmenttype:{u:`/freight/shipments/${id}/shipmenttype`,m:'put'},importexport:{u:`/freight/shipments/${id}/importexport`,m:'put'},notificationemail:{u:`/freight/shipments/${id}/rates`,m:'put'}
      }
      return api[eps[section].m](eps[section].u, data)
    },
    onSuccess: (response, variables) => {
      const updatedShipment = response?.data?.data
      if (!variables.quiet) addToast('Saved!', 'success')
      if (updatedShipment) { queryClient.setQueryData(['shipment', id], updatedShipment) }
      else { queryClient.invalidateQueries({ queryKey: ['shipment', id] }) }
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
      queryClient.invalidateQueries({ queryKey: ['shipments-total-stats'] })
      // Remember which section this save touched, so reopening scrolls back to it
      const slug = SECTION_KEY_TO_SLUG[variables.section]
      if (slug) { try { localStorage.setItem(`pas_last_field_${id}`, slug) } catch {} }
      if (socket && shipment) {
        socket.emit('shipment:updated', { id, refNo: shipment.refNo, user: shipment.createdByName || 'Someone' })
        const newStatus = SECTION_TO_STATUS[variables.section]
        if (newStatus) { socket.emit('shipment:statusChanged', { id, refNo: shipment.refNo, status: newStatus.replace(/_/g, ' ') }) }
      }
    },
    onError: (e) => addToast(e.response?.data?.message || 'Failed', 'error')
  })

  const saveQueue = useRef(Promise.resolve())
  const saveField = ({ section, data }) => {
    const run = () => updateMutation.mutateAsync({ section, data, quiet: true })
    const result = saveQueue.current.then(run)
    saveQueue.current = result.catch(() => {})
    return result
  }

  const saveStageStatus = (section, data) => {
    const cancelling = data.status === 'CANCELLED'
    if (cancelling && shipment?.currentStatus !== 'CANCELLED') { setCancelReason(''); setCancelNote(''); setCancelAsk({ section, data }); return }
    updateMutation.mutate({ section, data })
  }
  const confirmCancel = () => {
    if (!cancelAsk) return
    const reason = [cancelReason, cancelNote.trim()].filter(Boolean).join(' — ')
    updateMutation.mutate({ section: cancelAsk.section, data: { ...cancelAsk.data, reason } })
    setCancelAsk(null)
  }
  // Bring a cancelled shipment back: stage -> Enquiry, status -> the furthest step really completed
  const handleReactivate = async () => {
    setReactivating(true)
    try {
      if (shipment.shipmentStage === 'Cancelled') await api.put(`/freight/shipments/${id}/stage`, { shipmentStage: 'Enquiry' })
      const ffx = shipment.freightForwarding || {}, chax = shipment.cha || {}, accx = shipment.accounts || {}
      let best = steps[0].s
      steps.forEach(st => { if (isStepComplete(st.s, ffx, chax, accx, 'Enquiry')) best = st.s })
      await api.put(`/freight/shipments/${id}/status`, { status: best })
      addToast('Shipment reactivated', 'success')
      queryClient.invalidateQueries({ queryKey: ['shipment', id] }); queryClient.invalidateQueries({ queryKey: ['shipments'] })
    } catch (e) { addToast(e.response?.data?.message || 'Could not reactivate', 'error') }
    finally { setReactivating(false) }
  }

  // Restart the 5-day enquiry timer (an enquiry that timed out, or one that is about to)
  const handleReopen = async () => {
    setReopening(true)
    try {
      await api.put(`/freight/shipments/${id}/reopen`)
      addToast('Enquiry reopened. The 5-day timer has started again', 'success')
      queryClient.invalidateQueries({ queryKey: ['shipment', id] }); queryClient.invalidateQueries({ queryKey: ['shipments'] }); queryClient.invalidateQueries({ queryKey: ['shipments-full-stats'] })
    } catch (e) { addToast(e.response?.data?.message || 'Could not reopen', 'error') }
    finally { setReopening(false) }
  }
  const askCancelEnquiry = () => { setCancelReason(''); setCancelNote(''); setCancelAsk({ section: 'status', data: { status: 'CANCELLED' } }) }
  // why it was cancelled, taken from the history entry written when it was cancelled
  const cancelledEntry = (shipment?.statusHistory || []).find(h => h.status === 'CANCELLED')
  const cancelledWhy = (/Reason:\s*(.*)$/i.exec(cancelledEntry?.remarks || '') || [])[1] || ''

  const handleSendTestEmail = async () => {
    const ff = shipment?.freightForwarding || {}
    if (!ff.notificationEmail) { addToast('Please set a notification email first', 'warning'); return }
    setSendingEmail(true); setShowEmailDropdown(false)
    try { await api.put(`/freight/shipments/${id}/rates`, { notificationEmail: ff.notificationEmail }); addToast('Test email sent!', 'success') }
    catch (err) { addToast('Failed to send test email', 'error') }
    finally { setSendingEmail(false) }
  }

  const handleOpenGmail = () => {
    const ff = shipment?.freightForwarding || {}
    if (!ff.notificationEmail) { addToast('Please set a notification email first', 'warning'); return }
    setShowEmailDropdown(false)
    const subject = encodeURIComponent(`Shipment Update: ${shipment.refNo} - ${shipment.currentStatus.replace(/_/g, ' ')}`)
    const body = encodeURIComponent(`Reference: ${shipment.refNo}\nStatus: ${shipment.currentStatus.replace(/_/g, ' ')}\nCustomer: ${ff.customerName || 'N/A'}\nVehicle: ${ff.vehicleType || 'N/A'}\n\nView details: ${window.location.href}`)
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${ff.notificationEmail}&su=${subject}&body=${body}`, '_blank')
  }

  // Change shipment type: fixes a shipment created under the wrong category
  // without deleting and starting over. Everything already entered is kept in the
  // same underlying fields whatever the type; switching only changes which tabs
  // and fields are shown and recalculates the workflow status for the new type.
  const TYPE_SWITCH_OPTIONS = [
    { label: 'Freight', shipmentType: 'Air', importExport: shipment?.importExport || 'Import' },
    { label: 'FF Only', shipmentType: 'FF Only', importExport: shipment?.importExport || 'Import' },
    { label: 'CHA Import', shipmentType: 'CHA Only', importExport: 'Import' },
    { label: 'CHA Export', shipmentType: 'CHA Only', importExport: 'Export' },
    { label: 'Transport', shipmentType: 'Transport', importExport: null },
    { label: 'DO Release', shipmentType: 'DO Release', importExport: null },
  ]
  const handleSwitchType = (option) => {
    setShowTypeSwitcher(false)
    if (!window.confirm(`Switch this shipment from its current type to "${option.label}"?\n\nFields specific to the current type will be hidden but NOT deleted — you can switch back later if needed. Data already entered (Consignee, Shipper, weights, dates, etc.) stays intact.`)) return
    updateMutation.mutate({ section: 'shipmenttype', data: { shipmentType: option.shipmentType } })
    if (option.importExport) {
      setTimeout(() => updateMutation.mutate({ section: 'importexport', data: { importExport: option.importExport } }), 300)
    }
  }

  const handlePrint = () => {
    const ff = shipment?.freightForwarding || {}; const cha = shipment?.cha || {}; const acc = shipment?.accounts || {}
    const fmd = d => { if (!d) return '—'; const dt = new Date(d); const dd = String(dt.getDate()).padStart(2,'0'); const mm = String(dt.getMonth()+1).padStart(2,'0'); const yyyy = dt.getFullYear(); return `${dd}-${mm}-${yyyy}` }
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
      <div class="header"><div><h1>PAS Freight Services Pvt Ltd</h1><p>Shipment Details Report</p></div><p>${fmd(new Date())}</p></div>
      <div class="ref-box"><div class="ref">${shipment.refNo}</div><div class="stage">${shipment.currentStatus.replace(/_/g,' ')}</div></div>
      ${isDORelease ? `
      <div class="section"><h2>DO Release Details</h2><div class="grid">
      <div class="item"><label>MAWB</label><span>${ff.mawb||'—'}</span></div><div class="item"><label>HAWB</label><span>${ff.hawb||'—'}</span></div><div class="item"><label>CHA Name</label><span>${ff.agent||'—'}</span></div><div class="item"><label>Customer</label><span>${ff.customerName||'—'}</span></div></div></div>
      ` : isTransport ? `
      <div class="section"><h2>Transport Details</h2><div class="grid">
      <div class="item"><label>Customer</label><span>${ff.customerName||'—'}</span></div><div class="item"><label>Vehicle</label><span>${ff.vehicleType||'—'}</span></div><div class="item"><label>Containers</label><span>${ff.noOfContainers||'—'}</span></div><div class="item"><label>Package</label><span>${ff.packageType||'—'}</span></div><div class="item"><label>From</label><span>${ff.fromLocation||'—'}</span></div><div class="item"><label>To</label><span>${ff.toLocation||'—'}</span></div><div class="item"><label>Delivery</label><span>${fmd(ff.deliveryDate)}</span></div></div></div>
      ` : `
      <div class="section"><h2>Freight Forwarding</h2><div class="grid">
      <div class="item"><label>Consignee</label><span>${ff.consigneeName||'—'}</span></div><div class="item"><label>Shipper</label><span>${ff.shipperName||'—'}</span></div><div class="item"><label>From</label><span>${ff.fromLocation||'—'}</span></div><div class="item"><label>To</label><span>${ff.toLocation||'—'}</span></div><div class="item"><label>Terms</label><span>${ff.terms||'—'}</span></div><div class="item"><label>Port Location</label><span>${ff.portLocation||'—'}</span></div><div class="item"><label>Agent</label><span>${ff.agent||'—'}</span></div><div class="item"><label>Packages</label><span>${ff.noOfPackages||'—'}</span></div><div class="item"><label>Gross Weight</label><span>${ff.grossWeight?ff.grossWeight+' kg':'—'}</span></div><div class="item"><label>Chargeable Weight</label><span>${ff.weight?ff.weight+' kg':'—'}</span></div><div class="item"><label>CBM</label><span>${ff.cbm||'—'}</span></div><div class="item"><label>Booking Date</label><span>${fmd(ff.bookingDate)}</span></div><div class="item"><label>ETD</label><span>${fmd(ff.etd)}</span></div><div class="item"><label>ETA</label><span>${fmd(ff.eta)}</span></div><div class="item"><label>MAWB</label><span>${ff.mawb||'—'}</span></div><div class="item"><label>HAWB</label><span>${ff.hawb||'—'}</span></div><div class="item"><label>AWB Date</label><span>${fmd(ff.awbDate)}</span></div></div></div>
      <div class="section"><h2>Customs Clearance</h2><div class="grid">
      ${isCHAExport ? `
      <div class="item"><label>Job No</label><span>${cha.jobNo||'—'}</span></div><div class="item"><label>Checklist Date</label><span>${fmd(cha.checklistDate)}</span></div><div class="item"><label>SB No</label><span>${cha.sbNo||'—'}</span></div><div class="item"><label>SB Date</label><span>${fmd(cha.sbDate)}</span></div><div class="item"><label>LEO Date</label><span>${fmd(cha.leoDate)}</span></div><div class="item"><label>Hand Over</label><span>${fmd(cha.handOverDate)}</span></div>
      ` : `
      <div class="item"><label>Job No</label><span>${cha.jobNo||'—'}</span></div><div class="item"><label>Checklist Date</label><span>${fmd(cha.checklistDate)}</span></div><div class="item"><label>BOE No</label><span>${cha.boeNo||'—'}</span></div><div class="item"><label>BOE Date</label><span>${fmd(cha.boeDate)}</span></div><div class="item"><label>DO Collection</label><span>${fmd(cha.doCollectionDate)}</span></div><div class="item"><label>OOC Date</label><span>${fmd(cha.oocDate)}</span></div><div class="item"><label>Gate Pass</label><span>${fmd(cha.gatePassDate)}</span></div><div class="item"><label>Delivery Date</label><span>${fmd(cha.deliveryDate)}</span></div><div class="item"><label>Tracking No</label><span>${cha.trackingNumber||'—'}</span></div>
      `}
      </div></div>
      `}
      <div class="section"><h2>Accounts</h2><div class="grid"><div class="item"><label>Invoice No</label><span>${acc.invoiceNumber||'—'}</span></div><div class="item"><label>Invoice Date</label><span>${fmd(acc.invoiceDate)}</span></div><div class="item"><label>Sending Date</label><span>${fmd(acc.sendingDate)}</span></div></div></div>
      ${shipment.remarks?`<div class="remarks-box"><strong>Remarks:</strong> ${shipment.remarks}</div>`:''}
      <div class="footer">© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd</div><script>window.onload=function(){window.print()}</script></body></html>`)
    pw.document.close()
  }

  const stepperRef = useRef(null)
  const curStepRef = useRef(null)
  const actionsRef = useRef(null)
  const hasShipment = !!shipment

  // A long workflow scrolls sideways on a phone, so bring the current step into view.
  useEffect(() => {
    const box = stepperRef.current
    const step = curStepRef.current
    if (!box || !step) return
    box.scrollLeft = Math.max(0, step.offsetLeft - box.clientWidth / 2 + step.offsetWidth / 2)
  }, [hasShipment, shipment?.currentStatus, shipment?.shipmentType])

  // Close the Send Email / Change Type menus on an outside click or Escape.
  useEffect(() => {
    if (!showEmailDropdown && !showTypeSwitcher) return
    const close = () => { setShowEmailDropdown(false); setShowTypeSwitcher(false) }
    const onDown = (e) => { if (actionsRef.current && !actionsRef.current.contains(e.target)) close() }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [showEmailDropdown, showTypeSwitcher])

  useEffect(() => {
    if (!cancelAsk) return
    const onKey = (e) => { if (e.key === 'Escape') setCancelAsk(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cancelAsk])

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-4" aria-busy="true" aria-label="Loading shipment">
        <div className="skeleton h-36 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-72 rounded-2xl" />
      </div>
    )
  }
  if (!shipment) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-2xl flex items-center justify-center mx-auto mb-4"><Package size={30} /></div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Shipment not found</h3>
        <button onClick={goBack} className="btn btn-secondary mt-4"><ArrowLeft size={16} />Back</button>
      </div>
    )
  }
  const ff = shipment.freightForwarding || {}; const cha = shipment.cha || {}; const accounts = shipment.accounts || {};
  // <input type="date"> needs ISO format (2026-09-24) to fill in. The locale
  // format would break it, so take the date part of the ISO string.
  const Fmt = d => d ? new Date(d).toISOString().split('T')[0] : null

  // Rate request: asks the mailer to prepare the enquiry mail for this
  // shipment, then opens the review screen.
  const openRateRequest = async () => {
    if (rateBusy) return
    const win = window.open('', '_blank') // opened right away so the browser does not block it
    if (win) win.document.write('<p style="font-family:system-ui;padding:24px">Preparing your rate request…</p>')
    setRateBusy(true)
    try {
      const r = await api.post(`/rate-request/${id}/draft`, {}, { timeout: 60000 })
      const url = r.data?.data?.url
      if (!url) throw new Error('No link returned')
      if (win) win.location.href = url; else window.location.href = url
    } catch (e) {
      if (win) win.close()
      addToast(e?.response?.data?.message || 'Could not prepare the rate request. Please try again.', 'error')
    } finally { setRateBusy(false) }
  }

  const tabs = [
    { k: 'freight', l: 'Freight Forwarding', short: 'Freight', i: Ship },
    ...(!isTransport && !isDORelease && !isFFOnly ? [{ k: 'cha', l: 'Customs Clearance', short: 'Customs', i: FileCheck }] : []),
    ...(isDORelease ? [{ k: 'do-release', l: 'DO Release', short: 'DO Release', i: ClipboardList }] : []),
    { k: 'accounts', l: 'Accounts', short: 'Accounts', i: Receipt },
    { k: 'history', l: 'Status Timeline', short: 'Timeline', i: Clock }
  ]

  const sections = getCompletenessSections(shipment)
  const tabCount = (key) => sections.find((sec) => sec.tab === key)
  const stepsDone = steps.filter(st => isStepComplete(st.s, ff, cha, accounts, shipment.shipmentStage)).length
  const statusText = shipment.currentStatus.replace(/_/g, ' ')
  const typeLabel = isFFOnly ? 'FF Only' : isDORelease ? 'DO Release' : isTransport ? 'Transport' : isCHAOnly ? (isCHAExport ? 'CHA Export' : 'CHA Import') : null
  const partyName = ff.consigneeName || ff.customerName
  const created = toDDMMYYYY(new Date(shipment.createdAt).toISOString().split('T')[0])
  const workflowName = isFFOnly ? 'FF Only workflow' : isDORelease ? 'DO Release workflow' : isTransport ? 'Transport workflow' : isCHAOnly ? (isCHAExport ? 'CHA Export workflow' : 'CHA Import workflow') : 'Shipment workflow'
  const docTitle = isFFOnly ? 'Freight forwarding file' : isDORelease ? 'DO release' : isTransport ? 'Transport note' : isCHAOnly ? 'Customs file' : /sea/i.test(shipment.shipmentType || '') ? 'Sea waybill' : 'Air waybill'
  const daysOpen = Math.max(0, Math.floor((Date.now() - new Date(shipment.createdAt).getTime()) / 86400000))
  const etaShort = ff.eta ? new Date(ff.eta).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'
  const missingTotal = sections.reduce((n, sec) => n + sec.missing.length, 0)
  const actionBtn = 'btn btn-secondary min-h-[44px] sm:min-h-[40px] px-3 sm:px-4'
  const menuClass = 'absolute right-0 top-full mt-1 w-56 bg-[var(--bg-primary)] rounded-xl shadow-xl border border-[var(--border-color)] z-30 py-1 animate-scale-in'
  const menuItem = 'w-full text-left px-4 min-h-[44px] text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] flex items-center gap-2 disabled:opacity-50'
  const metaLabel = 'text-xs font-semibold text-[var(--text-secondary)] mb-1'

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <section className="card relative">
        <div className="flex items-start justify-between gap-4 rounded-t-2xl bg-[var(--route)] text-[var(--on-route)] px-4 sm:px-6 py-4">
          <div className="flex items-start gap-2 min-w-0">
            <button onClick={goBack} aria-label="Back to shipments" title="Back to shipments" className="w-11 h-11 -ml-2 -mt-1 flex items-center justify-center rounded-lg hover:bg-white/15 flex-shrink-0"><ArrowLeft size={20} /></button>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-80">PAS Freight Services · {docTitle}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{shipment.refNo}</h1>
                <span className="tag uppercase tracking-wide !text-[11px] bg-white/20 border border-white/30">{statusText}</span>
                {typeLabel && <span className="tag !text-[11px] bg-white/20 border border-white/30">{typeLabel}</span>}
                {liveEditBy && (
                  <span className="tag !text-[11px] bg-white/20 border border-white/30 animate-pulse"><Zap size={11} /> {liveEditBy} is editing...</span>
                )}
              </div>
              <p className="text-sm opacity-90 mt-1">{partyName ? `${partyName} · ` : ''}Created {created}</p>
            </div>
          </div>
          <div aria-hidden="true" className="hidden sm:block h-12 w-48 rounded-sm opacity-90 flex-shrink-0 self-center" style={{ backgroundImage: 'repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 4px, currentColor 4px 5px, transparent 5px 8px, currentColor 8px 11px, transparent 11px 12px)' }} />
        </div>

        {(ff.fromLocation || ff.toLocation) && (
          <div className="relative px-4 sm:px-8 pt-6 pb-4">
            <RouteArc from={ff.fromLocation} to={ff.toLocation} etd={toDDMMYYYY(Fmt(ff.etd))} eta={toDDMMYYYY(Fmt(ff.eta))} mode={isTransport ? 'Transport' : shipment.shipmentType} percent={steps.length > 1 ? (stepsDone / steps.length) * 100 : 0} stamp={statusText} />
          </div>
        )}

        <div aria-hidden="true" className="relative h-7 overflow-hidden">
          <span className="absolute left-4 right-4 top-1/2 border-t-[3px] border-dotted border-[var(--route-line)]" />
          <span className="absolute -left-3.5 top-0 w-7 h-7 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-color)]" />
          <span className="absolute -right-3.5 top-0 w-7 h-7 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-color)]" />
        </div>

        <div className="px-4 sm:px-6 pt-2 pb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[var(--route-line)] bg-[var(--route-soft)] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Workflow</p>
            <p className="text-2xl font-bold text-[var(--text-primary)] mt-0.5">{stepsDone} <span className="text-base font-semibold text-[var(--text-secondary)]">/ {steps.length}</span></p>
          </div>
          <div className="rounded-xl border border-[var(--route-line)] bg-[var(--route-soft)] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Days open</p>
            <p className="text-2xl font-bold text-[var(--text-primary)] mt-0.5">{daysOpen}</p>
          </div>
          <div className="rounded-xl border border-[var(--route-line)] bg-[var(--route-soft)] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">ETA</p>
            <p className="text-2xl font-bold text-[var(--text-primary)] mt-0.5">{etaShort}</p>
          </div>
          <div className={`rounded-xl border px-4 py-3 ${missingTotal > 0 ? 'border-orange-300 dark:border-orange-500/40 bg-[var(--accent-soft)]' : 'border-[var(--route-line)] bg-[var(--route-soft)]'}`}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Required fields missing</p>
            <p className="text-2xl font-bold text-[var(--text-primary)] mt-0.5">{missingTotal}</p>
          </div>
        </div>

        <div className="px-4 sm:px-6 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          <div>
            <p className={metaLabel}>Status</p>
            <InlineField
              value={STATUS_DROPDOWN_OPTIONS.includes(shipment.currentStatus) ? shipment.currentStatus.replace(/_/g, ' ') : shipment.currentStatus?.replace(/_/g, ' ')}
              options={statusOpts.map(s => s.replace(/_/g, ' '))}
              onSave={v => saveStageStatus('status', { status: v.replace(/ /g, '_') })}
              className={shipment.currentStatus === 'CANCELLED' ? 'px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' : ''}
              placeholder="Select"
            />
          </div>
          {!isTransport && !isFFOnly && !isDORelease && (
            <>
              <div><p className={metaLabel}>Transport mode</p><InlineField value={shipment.shipmentType} options={TRANSPORT_MODES} onSave={v => updateMutation.mutate({ section: 'shipmenttype', data: { shipmentType: v } })} placeholder="Set mode" /></div>
              <div><p className={metaLabel}>Import / Export</p><InlineField value={shipment.importExport} options={IMPORT_EXPORT_OPTIONS} onSave={v => updateMutation.mutate({ section: 'importexport', data: { importExport: v } })} placeholder="Set import or export" /></div>
            </>
          )}
          {isTransport && (
            <>
              <div><p className={metaLabel}>Vehicle</p><InlineField value={ff.vehicleType} options={VEHICLE_TYPES} onSave={v => updateMutation.mutate({ section: 'rates', data: { vehicleType: v } })} placeholder="Set vehicle" /></div>
              <div><p className={metaLabel}>Customer</p><InlineField value={ff.customerName} onSave={v => updateMutation.mutate({ section: 'rates', data: { customerName: v } })} placeholder="Set customer" /></div>
            </>
          )}
          <div className="sm:col-span-2 lg:col-span-1"><p className={metaLabel}>Remarks</p><InlineField value={shipment.remarks} onSave={v => updateMutation.mutate({ section: 'remarks', data: { remarks: v } })} placeholder="Add remarks..." /></div>
          <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)] mr-1">Handled by</span>
            <HandledByBadge label="Freight" name={(shipment.teamContributors?.FREIGHT || []).join(', ')} />
            <HandledByBadge label="Customs" name={(shipment.teamContributors?.CUSTOMS || []).join(', ')} />
            <HandledByBadge label="Accounts" name={(shipment.teamContributors?.ACCOUNTS || []).join(', ')} />
            {(isFFOnly || isDORelease) && shipment.currentStatus !== 'CANCELLED' && steps[cur + 1] && (() => {
              const nx = steps[cur + 1]; const help = NEXT_STEP_HELP[nx.s]
              return (
                <button onClick={() => { if (nx.s === 'RATES_REQUESTED') openRateRequest(); else if (help?.tab) { setActiveTab(isDORelease && help.tab === 'freight' ? 'do-release' : (isDORelease && nx.s === 'DO_COLLECTED' ? 'do-release' : help.tab)); window.scrollTo({ top: 420, behavior: 'smooth' }) } }}
                  title={`Next step: ${nx.l}`} className="btn btn-accent min-h-[44px] sm:min-h-[36px] !text-xs ml-auto">
                  Next: {nx.l}{help ? ` — ${help.text}` : ''} →
                </button>
              )
            })()}
          </div>
        </div>

        <div ref={actionsRef} className="rounded-b-2xl border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {sections.map((sec) => (
              <span key={sec.title} className="tag !text-xs bg-[var(--route-soft)] text-[var(--route-ink)] border border-[var(--route-line)]">{sec.title} {sec.total - sec.missing.length}/{sec.total}</span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isTransport && !isDORelease && !isCHAOnly && (
              <button onClick={openRateRequest} disabled={rateBusy} title="Prepare the enquiry mail to agents. You review it before it is sent" className="btn btn-accent min-h-[44px] sm:min-h-[40px]">
                {rateBusy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Rate request
              </button>
            )}
            <Link to={`/create?edit=${shipment.id}`} aria-label="Edit shipment" title="Edit shipment" className={actionBtn}><Pencil size={16} /></Link>
            <button onClick={handlePrint} aria-label="Print" title="Print" className={actionBtn}><Printer size={16} /></button>
            <div className="relative">
              <button onClick={() => { setShowEmailDropdown(!showEmailDropdown); setShowTypeSwitcher(false) }} aria-label="Send email" aria-expanded={showEmailDropdown} title="Send email" className={actionBtn}><Mail size={16} /><span className="hidden sm:inline">Email</span><ChevronDown size={14} /></button>
              {showEmailDropdown && (
                <div className={menuClass}>
                  <button onClick={handleSendTestEmail} disabled={sendingEmail} className={menuItem}>{sendingEmail ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="text-[var(--route)]" />}{sendingEmail ? 'Sending...' : 'Send via System'}</button>
                  <button onClick={handleOpenGmail} className={menuItem}><svg width="14" height="14" viewBox="0 0 24 24" fill="#ea4335"><path d="M24 4.5v15c0 .85-.65 1.5-1.5 1.5H21V7.387l-9 6.463-9-6.463V21H1.5C.649 21 0 20.35 0 19.5v-15c0-.425.162-.8.431-1.068A1.485 1.485 0 011.5 3H2l10 7.25L22 3h.5c.425 0 .8.162 1.069.432.27.268.431.643.431 1.068z"/></svg>Open in Gmail</button>
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => { setShowTypeSwitcher(!showTypeSwitcher); setShowEmailDropdown(false) }} aria-label="Change type" aria-expanded={showTypeSwitcher} title="Change type" className={actionBtn}><ArrowUpDown size={16} /><span className="hidden sm:inline">Change Type</span><ChevronDown size={14} /></button>
              {showTypeSwitcher && (
                <div className={menuClass}>
                  {TYPE_SWITCH_OPTIONS.map((opt) => (
                    <button key={opt.label} onClick={() => handleSwitchType(opt)} className={menuItem}>{opt.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Cancel reason: asked whenever someone cancels, so lost enquiries can be learned from */}
      {cancelAsk && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-backdrop p-0 sm:p-4" onClick={() => setCancelAsk(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-2xl w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
            <h3 id="cancel-title" className="text-lg font-semibold text-[var(--text-primary)] mb-1">Cancel this shipment?</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">Tell us why. It is saved in the history and remarks. You can reactivate it any time.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {CANCEL_REASONS.map(r => (
                <button key={r} onClick={() => setCancelReason(r)} aria-pressed={cancelReason === r} className={`px-3.5 min-h-[40px] rounded-full text-sm font-medium border ${cancelReason === r ? 'bg-red-600 text-white border-red-600' : 'border-[var(--input-border)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'}`}>{r}</button>
              ))}
            </div>
            <input value={cancelNote} onChange={e => setCancelNote(e.target.value)} placeholder="Add a note (optional)" className={`${inputBase} border-[var(--input-border)] focus:border-[var(--input-focus)] mb-5`} />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button onClick={() => setCancelAsk(null)} className="btn btn-secondary min-h-[44px]">Keep shipment</button>
              <button onClick={confirmCancel} disabled={!cancelReason && !cancelNote.trim()} className="btn min-h-[44px] bg-red-600 text-white hover:bg-red-700">Cancel shipment</button>
            </div>
          </div>
        </div>
      )}

      {/* Enquiry timer: a plain enquiry with no progress moves to Cancelled after 5 days */}
      {shipment.currentStatus === 'ENQUIRY' && shipment.enquiryStale && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[var(--border-color)] border-l-4 border-l-red-500 bg-[var(--bg-primary)] p-4">
          <div className="flex items-start gap-3 flex-1">
            <AlertCircle size={22} className="text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Cancelled: no progress for 5 days</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Nothing was filled in for 5 days, so this enquiry moved to Cancelled. Reopen it if the customer is still interested.</p>
            </div>
          </div>
          <button onClick={handleReopen} disabled={reopening} className="btn btn-primary min-h-[44px]">
            {reopening ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Reopen
          </button>
        </div>
      )}
      {shipment.currentStatus === 'ENQUIRY' && !shipment.enquiryStale && shipment.enquiryAgeDays >= 2 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[var(--border-color)] border-l-4 border-l-[var(--route)] bg-[var(--bg-primary)] p-4">
          <div className="flex items-start gap-3 flex-1">
            <Clock size={22} className="text-[var(--text-primary)] shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{shipment.enquiryDaysLeft} day{shipment.enquiryDaysLeft === 1 ? '' : 's'} left before this enquiry is cancelled</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">It has been at Enquiry for {shipment.enquiryAgeDays} days with no rates. Ask for rates, or cancel it with a reason.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isTransport && !isDORelease && !isCHAOnly && (
              <button onClick={openRateRequest} disabled={rateBusy} className="btn btn-accent min-h-[44px]"><Send size={16} /> Rate request</button>
            )}
            <button onClick={askCancelEnquiry} className="btn btn-secondary min-h-[44px]">Cancel enquiry</button>
          </div>
        </div>
      )}

      {shipment.currentStatus === 'CANCELLED' && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[var(--border-color)] border-l-4 border-l-[var(--route)] bg-[var(--bg-primary)] p-4">
          <div className="flex items-start gap-3 flex-1">
            <AlertCircle size={22} className="text-[var(--text-primary)] shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">This shipment has been cancelled{cancelledWhy ? `: ${cancelledWhy}` : ''}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Click Reactivate, or change the Status above, to bring it back. Progress already made is kept.</p>
            </div>
          </div>
          <button onClick={handleReactivate} disabled={reactivating} className="btn btn-primary min-h-[44px]">
            {reactivating ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Reactivate
          </button>
        </div>
      )}

      <EveryoneInvolved contributors={shipment.contributors} />

      <CompletenessPanel shipment={shipment} sections={sections} onOpenTab={setActiveTab} />

      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{workflowName}</h2>
          <span className="text-xs font-semibold text-[var(--text-secondary)]">{stepsDone} of {steps.length} steps done</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--border-color)] mb-4" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={stepsDone}>
          <div className="h-1.5 rounded-full bg-[var(--route)]" style={{ width: `${steps.length ? Math.round((stepsDone / steps.length) * 100) : 0}%` }} />
        </div>
        <div ref={stepperRef} className="relative overflow-x-auto pb-2">
          <div className="flex items-start min-w-max">
            {steps.map((step, i) => {
              const Icon = step.i
              const complete = isStepComplete(step.s, ff, cha, accounts, shipment.shipmentStage)
              const now = i === cur
              const missing = !complete && i <= cur && !step.optional
              const circle = missing
                ? 'border-dashed border-[var(--text-primary)] bg-[var(--bg-primary)]'
                : now
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] ring-4 ring-orange-500/20'
                  : complete
                    ? 'border-[var(--route)] bg-[var(--route)]'
                    : 'border-[var(--input-border)] bg-[var(--bg-primary)]'
              const label = missing
                ? 'text-[var(--text-primary)] font-semibold'
                : now
                  ? 'text-[var(--text-primary)] font-bold'
                  : 'text-[var(--text-secondary)] font-medium'
              return (
                <div key={step.s} ref={now ? curStepRef : undefined} className="flex items-start">
                  <div className={`flex flex-col items-center w-[64px] ${complete || missing || now ? '' : 'opacity-60'}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${circle}`} title={missing ? `${step.d} — not filled in yet` : step.d}>
                      {missing
                        ? <AlertCircle size={16} className="text-[var(--text-primary)]" />
                        : complete
                          ? <Check size={16} strokeWidth={3} className="text-[var(--on-route)]" />
                          : <Icon size={16} className={now ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />}
                    </div>
                    <span className={`text-[11px] mt-1.5 text-center leading-tight ${label}`}>{step.l}</span>
                  </div>
                  {i < steps.length - 1 && <div className={`h-0.5 w-4 mt-[17px] ${complete ? 'bg-[var(--route)]' : 'bg-[var(--border-color)]'}`} />}
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-x-4 gap-y-1 mt-2 pt-3 border-t border-[var(--border-color)] flex-wrap text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--route)]" />Completed</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />Current</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border border-dashed border-[var(--text-primary)]" />Missing</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--input-border)]" />Not yet reached</span>
        </div>
      </section>

      <div role="tablist" aria-label="Shipment sections" className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 pt-1 bg-[var(--bg-secondary)]">
        <div className="flex gap-1.5 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.i
            const active = activeTab === t.k
            const count = tabCount(t.k)
            const done = count ? count.total - count.missing.length : 0
            return (
              <button key={t.k} role="tab" aria-selected={active} onClick={() => setActiveTab(t.k)}
                className={`flex items-center gap-2 px-4 min-h-[46px] rounded-t-xl text-sm font-semibold whitespace-nowrap flex-shrink-0 border border-b-0 ${active ? 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)] shadow-[inset_0_3px_0_var(--accent)] relative z-10 -mb-px' : 'bg-[var(--bg-tertiary)] border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                <Icon size={16} />
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.l}</span>
                {count && (
                  <span className={`px-1.5 rounded-full text-[11px] font-bold leading-5 ${count.missing.length === 0 ? 'bg-[var(--route)] text-[var(--on-route)]' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)]'}`}>{done}/{count.total}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card rounded-tl-none p-4 sm:p-6 -mt-px">
        {activeTab !== 'history' && (
          <p className="mb-4 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><Pencil size={13} className="shrink-0" />Type a value and press Enter. It saves by itself and moves to the next field. Shift + Enter goes back.</p>
        )}
        {/* FREIGHT TAB */}
        {activeTab==='freight'&&!isTransport&&!isDORelease&&<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start"><div className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"><C icon={FileSignature} l="Terms" v={ff.terms}/><C icon={Anchor} l="Agent" v={ff.agent}/><C icon={Package} l="Packages" v={ff.noOfPackages}/>{isStandardFreight && <C icon={Box} l="Commodity" v={ff.commodityName}/>}</div>
          <Section title="Parties Involved" icon={User}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PartyField label="Consignee Name" value={ff.consigneeName} type="CONSIGNEE" onSave={v => saveField({ section: 'consignee', data: { consigneeName: v } })} />
            <PartyField label="Shipper Name" value={ff.shipperName} type="SHIPPER" onSave={v => saveField({ section: 'shipper', data: { shipperName: v } })} />
          </div></Section>
          <Section title="Notification Settings" icon={Mail}><Field label="Notification Email" value={ff.notificationEmail} onSave={v => saveField({ section: 'notificationemail', data: { notificationEmail: v } })} type="email" placeholder="email@example.com" /></Section>
          {!isStandardFreight && <Section wide title="Route Details" icon={MapPinned}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><ComboField label="From (Origin)" value={ff.fromLocation} options={COUNTRY_PORTS} onSave={v => saveField({ section: 'fromlocation', data: { fromLocation: v } })} placeholder="Custom country/port..." /><ComboField label="To (Destination)" value={ff.toLocation} options={INDIA_PORTS} onSave={v => saveField({ section: 'tolocation', data: { toLocation: v } })} placeholder="Custom city/port..." /><ComboField label="Terms" value={ff.terms} options={TERMS_OPTIONS} onSave={v => saveField({ section: 'terms', data: { terms: v } })} placeholder="Custom terms..." /><ComboField label="Port Location" value={ff.portLocation} options={PORT_LOCATIONS} onSave={v => saveField({ section: 'portlocation', data: { portLocation: v } })} placeholder="Custom port code..." /></div></Section>}
          <Section wide={!isStandardFreight} title="Weight Details" icon={Scale}><div className={`grid grid-cols-1 ${isStandardFreight ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}><Field label="Gross Weight (kg)" value={ff.grossWeight} onSave={v => saveField({ section: 'rates', data: { grossWeight: v } })} type="number" /><Field label="Chargeable Weight (kg)" value={ff.weight} onSave={v => saveField({ section: 'rates', data: { weight: v } })} type="number" />{!isStandardFreight && <Field label="CBM" value={ff.cbm} onSave={v => saveField({ section: 'cbm', data: { cbm: v } })} type="number" />}</div></Section>
          <Section title="Nomination" icon={Calendar}><Field label="Nomination Date" value={Fmt(ff.nominationDate)} onSave={v => saveField({ section: 'nomination', data: { nominationDate: v } })} type="date" /></Section>
          <Section title="Booking" icon={Calendar}><Field label="Booking Date" value={Fmt(ff.bookingDate)} onSave={v => saveField({ section: 'booking', data: { bookingDate: v } })} type="date" /></Section>
          <Section title="Pickup" icon={Truck}><Field label="Pickup Date" value={Fmt(ff.pickupDate)} onSave={v => saveField({ section: 'pickup', data: { pickupDate: v } })} type="date" /></Section>
          <Section title="Schedule" icon={Plane}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="ETD" value={Fmt(ff.etd)} onSave={v => saveField({ section: 'schedule', data: { etd: v } })} type="date" /><Field label="ETA" value={Fmt(ff.eta)} onSave={v => saveField({ section: 'schedule', data: { eta: v } })} type="date" /></div></Section>
          <Section title="AWB Details" icon={Barcode}><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Field label="MAWB" value={ff.mawb} onSave={v => saveField({ section: 'awb', data: { mawb: v } })} /><Field label="HAWB" value={ff.hawb} onSave={v => saveField({ section: 'awb', data: { hawb: v } })} /><Field label="AWB Date" value={Fmt(ff.awbDate)} onSave={v => saveField({ section: 'awb', data: { awbDate: v } })} type="date" /></div></Section>
          {isStandardFreight && <Section title="Pre-Alerts & DO Collection" icon={ClipboardList}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="Pre-Alerts Sent On" value={Fmt(ff.preAlertsSentDate)} onSave={v => saveField({ section: 'rates', data: { preAlertsSentDate: v } })} type="date" /><Field label="DO Collection Date" value={Fmt(cha.doCollectionDate)} onSave={v => saveField({ section: 'do', data: { doCollectionDate: v } })} type="date" /></div></Section>}
          </div>}

        {/* DO RELEASE TAB */}
        {isDORelease && activeTab==='do-release'&&<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          <Section wide title="DO Release Details" icon={ClipboardList}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="MAWB No" value={ff.mawb} onSave={v => saveField({ section: 'awb', data: { mawb: v } })} />
              <Field label="HAWB No" value={ff.hawb} onSave={v => saveField({ section: 'awb', data: { hawb: v } })} />
              <Field label="CHA Name" value={ff.agent} onSave={v => saveField({ section: 'rates', data: { agent: v } })} />
              <Field label="Customer Name" value={ff.customerName} onSave={v => saveField({ section: 'rates', data: { customerName: v } })} />
            </div>
          </Section>
          <Section title="DO Collection" icon={FileCheck}>
            <Field label="DO Collection Date" value={Fmt(cha.doCollectionDate)} onSave={v => saveField({ section: 'do', data: { doCollectionDate: v } })} type="date" />
          </Section>
          <Section title="Notification Settings" icon={Mail}>
            <Field label="Notification Email" value={ff.notificationEmail} onSave={v => saveField({ section: 'rates', data: { notificationEmail: v } })} type="email" placeholder="email@example.com" />
          </Section>
        </div>}

        {/* TRANSPORT TAB */}
        {isTransport && activeTab==='freight'&&<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          <Section wide title="Transport Details" icon={Truck}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComboField label="Transport Mode" value={ff.transportMode} options={TRANSPORT_MODE_OPTIONS} onSave={v => saveField({ section: 'rates', data: { transportMode: v } })} placeholder="Custom mode..." />
              <ComboField label="Vehicle Type" value={ff.vehicleType} options={VEHICLE_TYPES} onSave={v => saveField({ section: 'rates', data: { vehicleType: v } })} placeholder="Custom type..." />
              <Field label="No of Containers" value={ff.noOfContainers} onSave={v => saveField({ section: 'rates', data: { noOfContainers: v } })} type="number" />
              <ComboField label="Package Type" value={ff.packageType} options={PACKAGE_TYPES} onSave={v => saveField({ section: 'rates', data: { packageType: v } })} placeholder="Custom package..." />
              <Field label="Weight (kg)" value={ff.weight} onSave={v => saveField({ section: 'rates', data: { weight: v } })} type="number" />
              <Field label="Customer Name" value={ff.customerName} onSave={v => saveField({ section: 'rates', data: { customerName: v } })} />
            </div>
          </Section>
          <Section wide title="Route & Delivery" icon={MapPinned}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="From" value={ff.fromLocation} onSave={v => saveField({ section: 'fromlocation', data: { fromLocation: v } })} />
              <Field label="To" value={ff.toLocation} onSave={v => saveField({ section: 'tolocation', data: { toLocation: v } })} />
              <Field label="Delivery Date" value={Fmt(ff.deliveryDate)} onSave={v => saveField({ section: 'rates', data: { deliveryDate: v } })} type="date" />
            </div>
          </Section>
          <Section title="Notification Settings" icon={Mail}>
            <Field label="Notification Email" value={ff.notificationEmail} onSave={v => saveField({ section: 'rates', data: { notificationEmail: v } })} type="email" placeholder="email@example.com" />
          </Section>
        </div>}

        {/* CUSTOMS TAB */}
        {activeTab==='cha'&&!isTransport&&!isDORelease&&!isFFOnly&&<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          <Section wide title="Checklist" icon={ClipboardCheck}><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Field label="Job No" value={cha.jobNo} onSave={v => saveField({ section: 'checklist', data: { jobNo: v } })} /><Field label="Checklist Date" value={Fmt(cha.checklistDate)} onSave={v => saveField({ section: 'checklist', data: { checklistDate: v } })} type="date" /><Field label="Approval Date" value={Fmt(cha.checklistApprovalDate)} onSave={v => saveField({ section: 'checklist', data: { checklistApprovalDate: v } })} type="date" /></div></Section>
          {!isCHAExport && (<>
            <Section title="BOE" icon={FileText}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="BOE No" value={cha.boeNo} onSave={v => saveField({ section: 'boe', data: { boeNo: v } })} /><Field label="BOE Date" value={Fmt(cha.boeDate)} onSave={v => saveField({ section: 'boe', data: { boeDate: v } })} type="date" /></div></Section>
            {!isStandardFreight && <Section title="DO Collection" icon={FileCheck}><Field label="DO Date" value={Fmt(cha.doCollectionDate)} onSave={v => saveField({ section: 'do', data: { doCollectionDate: v } })} type="date" /></Section>}
            <Section title="OOC" icon={CheckCircle2}><Field label="OOC Date" value={Fmt(cha.oocDate)} onSave={v => saveField({ section: 'ooc', data: { oocDate: v } })} type="date" /></Section>
            <Section title="Gate Pass" icon={Truck}><Field label="Gate Pass Date" value={Fmt(cha.gatePassDate)} onSave={v => saveField({ section: 'gatepass', data: { gatePassDate: v } })} type="date" /></Section>
            <Section title="POD (Delivery)" icon={MapPin}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="Delivery Date" value={Fmt(cha.deliveryDate)} onSave={v => saveField({ section: 'pod', data: { deliveryDate: v } })} type="date" /><Field label="Tracking No" value={cha.trackingNumber} onSave={v => saveField({ section: 'pod', data: { trackingNumber: v } })} /></div></Section>
          </>)}
          {isCHAExport && (<>
            <Section title="Shipping Bill" icon={FileText}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="SB No" value={cha.sbNo} onSave={v => saveField({ section: 'shippingbill', data: { sbNo: v } })} /><Field label="SB Date" value={Fmt(cha.sbDate)} onSave={v => saveField({ section: 'shippingbill', data: { sbDate: v } })} type="date" /></div></Section>
            <Section title="LEO" icon={CheckCircle2}><Field label="LEO Date" value={Fmt(cha.leoDate)} onSave={v => saveField({ section: 'leo', data: { leoDate: v } })} type="date" /></Section>
            <Section title="Hand Over" icon={Truck}><Field label="Hand Over Date" value={Fmt(cha.handOverDate)} onSave={v => saveField({ section: 'handover', data: { handOverDate: v } })} type="date" /></Section>
          </>)}
        </div>}

        {/* ACCOUNTS TAB */}
        {activeTab==='accounts'&&<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {isFFOnly && <Section title="DO Collection" icon={FileCheck}><Field label="DO Date" value={Fmt(cha.doCollectionDate)} onSave={v => saveField({ section: 'do', data: { doCollectionDate: v } })} type="date" /></Section>}
          <Section title="Invoice" icon={Banknote}><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="Invoice No" value={accounts.invoiceNumber} onSave={v => saveField({ section: 'invoice', data: { invoiceNumber: v } })} /><Field label="Invoice Date" value={Fmt(accounts.invoiceDate)} onSave={v => saveField({ section: 'invoice', data: { invoiceDate: v } })} type="date" /></div></Section><Section title="Invoice Sending" icon={Send}><Field label="Sending Date" value={Fmt(accounts.sendingDate)} onSave={v => saveField({ section: 'invoiceSend', data: { sendingDate: v } })} type="date" /></Section></div>}

        {activeTab==='history'&&<div>
          <h3 className="text-base font-semibold mb-4 text-[var(--text-primary)]">Status Timeline</h3>
          {shipment.statusHistory?.length>0
            ? <ol className="relative ml-2 border-l-2 border-[var(--border-color)] space-y-5">
                {[...shipment.statusHistory].reverse().map((h,i)=>(
                  <li key={i} className="relative pl-6">
                    <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-[var(--bg-primary)] ${i === 0 ? 'bg-[var(--accent)] ring-4 ring-orange-500/20' : 'bg-[var(--input-border)]'}`} />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{h.status.replace(/_/g,' ')}</p>
                    {h.remarks&&<p className="text-sm text-[var(--text-secondary)] mt-0.5">{h.remarks}</p>}
                    <p className="text-xs text-[var(--text-muted)] mt-1">{new Date(h.createdAt).toLocaleString()}</p>
                  </li>
                ))}
              </ol>
            : <div className="text-center py-10 text-[var(--text-secondary)]"><Clock size={30} className="mx-auto text-[var(--text-muted)] mb-2"/><p className="text-sm">No status changes recorded yet.</p></div>}
        </div>}
      </div>
    </div>
  )
}

// Waybill route: origin and destination with a flight-path arc between them.
// The solid part of the arc and the vehicle icon show how far along the
// workflow the shipment is.
function RouteArc({ from, to, etd, eta, mode, percent, stamp }) {
  const Icon = mode === 'Transport' ? Truck : /sea/i.test(mode || '') ? Ship : Plane
  const t = Math.min(1, Math.max(0, percent / 100))
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
  const p0 = [8, 92], p1 = [300, -46], p2 = [592, 92]
  const q0 = lerp(p0, p1, t), q1 = lerp(p1, p2, t), at = lerp(q0, q1, t)
  const end = (label, place, date, dateLabel, right) => (
    <div className={`min-w-0 ${right ? 'text-right order-2 sm:order-3' : 'order-1'}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--route-ink)]">{label}</p>
      <p className="text-2xl sm:text-4xl font-black tracking-tight text-[var(--text-primary)] truncate">{place || '—'}</p>
      {date && <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">{dateLabel} {date}</p>}
    </div>
  )
  return (
    <div className="grid grid-cols-2 sm:grid-cols-[1fr_minmax(160px,2.2fr)_1fr] items-center gap-x-3 gap-y-2 sm:gap-6">
      {end('Origin', from, etd, 'ETD', false)}
      <div className="relative h-20 sm:h-24 col-span-2 sm:col-span-1 order-3 sm:order-2" role="img" aria-label={`Route from ${from || 'origin'} to ${to || 'destination'}, ${Math.round(percent)} percent of the workflow done`}>
        <svg viewBox="0 0 600 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          <path d={`M${p0} Q${p1} ${p2}`} fill="none" stroke="var(--route-line)" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {t > 0 && <path d={`M${p0} Q${q0} ${at}`} fill="none" stroke="var(--route)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        <span className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-[var(--route)]" style={{ left: '1.3%', top: '92%' }} />
        <span className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-[3px] border-[var(--route)] bg-[var(--bg-primary)]" style={{ left: '98.7%', top: '92%' }} />
        <span className="absolute -ml-[18px] -mt-[18px] w-9 h-9 rounded-full bg-[var(--accent)] text-[var(--on-accent)] flex items-center justify-center shadow-md ring-4 ring-[var(--bg-primary)]" style={{ left: `${(at[0] / 600) * 100}%`, top: `${at[1]}%` }}>
          <Icon size={16} />
        </span>
        <span aria-hidden="true" className="hidden sm:block absolute left-1/2 bottom-0 -translate-x-1/2 -rotate-6 whitespace-nowrap border-[3px] border-[var(--accent)] text-[var(--accent)] rounded-md px-3 py-0.5 text-sm font-black uppercase tracking-[0.2em] opacity-90">{stamp}</span>
      </div>
      {end('Destination', to, eta, 'ETA', true)}
    </div>
  )
}

function C({ icon: I, l, v }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <span className="w-9 h-9 rounded-lg bg-[var(--route-soft)] text-[var(--route)] flex items-center justify-center flex-shrink-0"><I size={16} /></span>
      <div className="min-w-0">
        <p className="text-xs text-[var(--text-secondary)]">{l}</p>
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{v || '—'}</p>
      </div>
    </div>
  )
}
function slugifyTitle(title) { return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }
function Section({ title, icon: Icon, children, wide = false }) {
  return (
    <div id={`section-${slugifyTitle(title)}`} className={`border border-[var(--border-color)] rounded-2xl bg-[var(--bg-primary)] p-4 ${wide ? 'md:col-span-2 lg:col-span-3' : ''}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] mb-3">
        <span className="w-7 h-7 rounded-lg bg-[var(--route-soft)] text-[var(--route)] flex items-center justify-center"><Icon size={15} /></span>
        {title}
      </h3>
      <div className={wide ? '' : '[&>.grid]:grid-cols-1'}>{children}</div>
    </div>
  )
}
// Turns an ISO date (yyyy-mm-dd) into dd-mm-yyyy for display. The date input
// itself needs the ISO form to pre-fill and for its native picker to work, so
// the two have to stay separate.
function toDDMMYYYY(isoDate) {
  if (!isoDate) return null
  const parts = isoDate.split('-')
  if (parts.length !== 3) return isoDate
  const [y, m, d] = parts
  return `${d}-${m}-${y}`
}

function Field({ label, value, onSave, type = 'text', placeholder = 'Not set', options = null }) {
  const isDate = type === 'date'
  const shown = (v) => (isDate ? (toDDMMYYYY(asText(v)) || '') : asText(v))
  const [val, setVal] = useState(shown(value))
  const [state, setState] = useState('idle')
  const [note, setNote] = useState('')
  const inputRef = useRef(null)
  const pickerRef = useRef(null)
  const savedRef = useRef(asText(value))
  const listId = useId()
  const inputId = useId()

  useSavedFade(state, setState)

  useEffect(() => {
    savedRef.current = asText(value)
    if (document.activeElement !== inputRef.current) setVal(shown(value))
  }, [value])

  const commit = (text) => {
    const raw = (text !== undefined ? text : (inputRef.current ? inputRef.current.value : val)).trim()
    let next = raw
    if (isDate && raw !== '') {
      const iso = toISODate(raw)
      if (!iso) { setNote('That date does not exist. Type it as dd-mm-yyyy.'); setState('error'); return false }
      next = iso
    }
    if (next === savedRef.current) {
      if (state === 'error') setState('idle')
      return
    }
    const previous = savedRef.current
    savedRef.current = next
    setState('saving')
    Promise.resolve(onSave(next)).then(
      () => setState('saved'),
      () => { savedRef.current = previous; setNote('Could not save. Check your connection and try again.'); setState('error') }
    )
  }

  const openPicker = () => {
    const picker = pickerRef.current
    if (!picker) return
    try { picker.showPicker() } catch { picker.click() }
  }

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>{label}</label>
      <div className="relative">
        <input
          id={inputId}
          ref={inputRef}
          data-flow=""
          type={isDate ? 'text' : type}
          inputMode={isDate ? 'numeric' : undefined}
          autoComplete="off"
          list={options ? listId : undefined}
          value={val}
          placeholder={isDate ? 'dd-mm-yyyy' : placeholder}
          step={type === 'number' ? '0.01' : undefined}
          onFocus={(e) => e.target.select()}
          onChange={(e) => { setVal(isDate ? maskDate(e.target.value) : e.target.value); if (state !== 'saving') setState('idle') }}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (commit() === false) return
              moveFlow(e.currentTarget, e.shiftKey ? -1 : 1)
            } else if (e.key === 'Escape') {
              setVal(shown(savedRef.current))
              setState('idle')
            }
          }}
          className={`${inputBase} ${isDate ? 'pr-20' : 'pr-9'} ${fieldTone(state)}`}
        />
        <SaveMark state={state} className={isDate ? 'right-11' : 'right-3'} />
        {isDate && (
          <>
            <button type="button" tabIndex={-1} onClick={openPicker} aria-label={`Pick ${label} from calendar`} title="Pick from calendar" className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]">
              <Calendar size={16} />
            </button>
            <input
              ref={pickerRef}
              type="date"
              tabIndex={-1}
              aria-hidden="true"
              value={toISODate(val) || ''}
              onChange={(e) => { if (!e.target.value) return; const text = toDDMMYYYY(e.target.value); setVal(text); commit(text) }}
              className="absolute right-2 bottom-0 w-px h-px opacity-0 pointer-events-none"
            />
          </>
        )}
        {options && <datalist id={listId}>{options.map(o => <option key={o} value={o} />)}</datalist>}
      </div>
      <FieldNote state={state} note={note} />
    </div>
  )
}