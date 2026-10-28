import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useSocket } from '../App'
import { 
  ArrowLeft, Hash, Calendar, Box, User, Anchor, 
  Ship, Sparkles, Loader2, Building2, Globe, AlertCircle,
  FileCheck, ArrowUpDown, Barcode, Weight, Info, Pencil, Eye, Scale, Mail, Truck, MapPin, ClipboardList, FileText, Plus, X,
  CheckCircle2, Search, Copy, Zap
} from 'lucide-react'

const DRAFT_KEY = 'pas_shipment_draft'
const QUICK_KEY = 'pas_create_quick'
const LAST_PREFIX_KEY = 'pas_last_prefix'
const LAST_INITIALS_KEY = 'pas_last_initials'
const IMPORT_EXPORT_TYPES = ['Import', 'Export']
const TRANSPORT_MODES = ['Air', 'Sea FCL', 'Sea LCL', 'Courier']
const VEHICLE_TYPES = ['10ft', '20ft', '32ft', '40ft']
const PACKAGE_TYPES = ['Box / Carton', 'Envelope / Document', 'Parcel', 'Pallet', 'Crate', 'Bag / Sack', 'Drum / Barrel', 'Tube', 'Container', 'Wooden Box', 'Plastic Bin', 'Roll', 'Bundle', 'Cargo Package', 'Freight Package']
const TRANSPORT_MODE_OPTIONS = ['Air', 'Sea', 'Courier']
// ✅ NEW — standard shipping container type/size codes
const CONTAINER_TYPES = ['1x20GP', '1x20FR', '1x20RF', '1x20OT', '1x40HQ', '1x40FR', '1x40RF', '1x40OT']
// ✅ NEW — Route Details, only used in the standard Freight section.
// Same lists as ShipmentDetail.jsx's Route Details editor, kept in sync
// so a value picked here looks identical once you're on the detail page.
const COUNTRY_PORTS = ['SINGAPORE', 'MALAYSIA', 'CHINA', 'HONG KONG', 'JAPAN', 'SOUTH KOREA', 'TAIWAN', 'THAILAND', 'VIETNAM', 'INDONESIA', 'USA', 'UK', 'GERMANY', 'NETHERLANDS', 'FRANCE', 'ITALY', 'SPAIN', 'UAE', 'SAUDI ARABIA', 'AUSTRALIA']
const INDIA_PORTS = ['BANGALORE', 'CHENNAI', 'MUMBAI', 'DELHI', 'HYDERABAD', 'KOLKATA', 'AHMEDABAD', 'PUNE', 'COCHIN', 'TUTICORIN', 'VISAKHAPATNAM', 'MUNDRA', 'NHAVA SHEVA', 'KATTUPALLI', 'ENNORE']
const TERMS_OPTIONS = ['EXW', 'FOB', 'FCA', 'CIF', 'DDP', 'DAP', 'DAT', 'CPT', 'CIP', 'FAS', 'CFR']
const PORT_LOCATIONS = ['SIN', 'INBLR4', 'INMAA4', 'INBOM4', 'INDEA4', 'INHYD4', 'INCCU4', 'INAMD4', 'INPNQ4', 'INCOK4', 'INTUT4', 'INVTZ4', 'INMUN4', 'INNSV4', 'INKAT4', 'INENR4']

// A shipment that is already finished or cancelled is not worth warning about.
const CLOSED_STATUSES = ['CANCELLED', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT']

const MODE_CARDS = [
  { key: 'ff-only', icon: '📋', label: 'FF Only' },
  { key: 'freight', icon: '🚢', label: 'Freight' },
  { key: 'cha-import', icon: '🛃', label: 'CHA Import' },
  { key: 'cha-export', icon: '📤', label: 'CHA Export' },
  { key: 'transport', icon: '🚛', label: 'Transport' },
  { key: 'do-release', icon: '📑', label: 'DO Release' },
]

const INPUT = 'w-full h-11 px-3.5 rounded-xl border-[1.5px] border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:bg-[var(--bg-primary)] focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-colors'
const INPUT_ERROR = 'border-rose-400 bg-rose-50 dark:bg-rose-500/10'

function readLocal(key, fallback = '') {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, value) } catch { /* private mode: the choice just isn't remembered */ }
}

const todayISO = () => new Date().toISOString().split('T')[0]

// Every field the form can hold. Used for a fresh form, "Clear draft" and "Create another".
function blankForm() {
  return {
    refNo: '', enquiryDate: todayISO(),
    noOfPackages: '', consigneeName: '', shipperName: '', agent: '',
    importExport: '', mode: '',
    hawb: '', mawb: '', awbDate: '', weight: '', grossWeight: '',
    notificationEmail: '',
    customerName: '', vehicleType: '', noOfContainers: '', containerType: '', packageType: '',
    fromLocation: '', toLocation: '', deliveryDate: '',
    transportMode: '',
    chaName: '',
    terms: '', portLocation: '', cbm: '', commodityName: '', preAlertsSentDate: '', doCollectionDate: '', autoEmailEnabled: false
  }
}

// "Create another": keep who the customer is and what is moving where, drop what is specific to one job.
function keepForNext(d) {
  return {
    ...blankForm(),
    consigneeName: d.consigneeName, shipperName: d.shipperName, agent: d.agent, customerName: d.customerName,
    mode: d.mode, importExport: d.importExport, fromLocation: d.fromLocation, toLocation: d.toLocation,
    terms: d.terms, portLocation: d.portLocation, commodityName: d.commodityName, containerType: d.containerType,
    packageType: d.packageType, vehicleType: d.vehicleType, transportMode: d.transportMode, chaName: d.chaName,
    notificationEmail: d.notificationEmail, autoEmailEnabled: d.autoEmailEnabled,
  }
}

// A draft only counts as "unfinished work" if the person actually typed something.
function draftHasContent(d) {
  if (!d || typeof d !== 'object') return false
  return ['refNo', 'consigneeName', 'shipperName', 'customerName', 'agent', 'mawb', 'hawb', 'fromLocation', 'toLocation', 'commodityName', 'noOfPackages', 'grossWeight', 'weight', 'notificationEmail']
    .some((k) => String(d[k] || '').trim() !== '')
}

// ─── PASTE-THE-ENQUIRY READER (NEW) ───
// Looks through a pasted email or WhatsApp message for the things a form needs:
// packages, weight, terms, mode, route and so on. It only suggests: nothing goes
// into the form until the person presses Apply, so a wrong guess costs one click.
const FOUND_LABELS = {
  consigneeName: 'Consignee', shipperName: 'Shipper', fromLocation: 'From', toLocation: 'To', mode: 'Mode',
  importExport: 'Import / Export', noOfPackages: 'Packages', grossWeight: 'Weight (kg)', cbm: 'CBM', terms: 'Terms', commodityName: 'Commodity',
}

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

function parseEnquiry(raw, knownNames) {
  const original = String(raw || '')
  const text = original.replace(/\s+/g, ' ').trim()
  const found = {}
  if (!text) return found

  const packages = text.match(/(\d[\d,]*)\s*(?:x\s*)?(?:cartons?|ctns?|boxes|box|packages?|pkgs?|pallets?|crates?|drums?|bags?|pieces|pcs)\b/i)
  if (packages) found.noOfPackages = packages[1].replace(/,/g, '')

  const kg = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:kgs?|kilograms?|kilos?)\b/i)
  if (kg) found.grossWeight = kg[1].replace(/,/g, '')

  const cbm = text.match(/(\d+(?:\.\d+)?)\s*cbm\b/i)
  if (cbm) found.cbm = cbm[1]

  const terms = TERMS_OPTIONS.find((t) => new RegExp(`\\b${t}\\b`).test(original))
  if (terms) found.terms = terms

  const mode = text.match(/\b(by air|air ?freight|air|sea ?fcl|fcl|sea ?lcl|lcl|courier)\b/i)
  if (mode) {
    const m = mode[1].toLowerCase().replace(/\s+/g, '')
    if (m.includes('air')) found.mode = 'Air'
    else if (m.includes('fcl')) found.mode = 'Sea FCL'
    else if (m.includes('lcl')) found.mode = 'Sea LCL'
    else if (m.includes('courier')) found.mode = 'Courier'
  }

  const ie = text.match(/\b(import|export)\b/i)
  if (ie) found.importExport = titleCase(ie[1])

  let route = text.match(/\bfrom\s+([A-Za-z][A-Za-z .'-]{1,30}?)\s+to\s+([A-Za-z][A-Za-z .'-]{1,30}?)(?=\s+(?:by|via|for|on|with|approx|about|around|fob|cif|exw|ddp|dap|fca)\b|\s+\d|[,.;:!?]|$)/i)
  if (!route) route = text.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) to ([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/)
  if (route) {
    found.fromLocation = route[1].trim().toUpperCase()
    found.toLocation = route[2].trim().toUpperCase()
  }

  const commodity = original.match(/commodity\s*[:\-]\s*([^,.;\n|]{3,50})/i) || text.match(/\bof\s+([a-z][a-z &,-]{2,40}?)\s+from\b/i)
  if (commodity) found.commodityName = titleCase(commodity[1].trim())

  const consignee = original.match(/(?:consignee|customer|company|client)(?:\s+name)?\s*[:\-]\s*([^,.;\n|]{3,60})/i)
  if (consignee) {
    found.consigneeName = consignee[1].trim()
  } else {
    const lower = text.toLowerCase()
    const known = (knownNames || [])
      .filter((n) => n && n.length >= 4 && lower.includes(n.toLowerCase()))
      .sort((a, b) => b.length - a.length)[0]
    if (known) found.consigneeName = known
  }
  const shipper = original.match(/shipper\s*[:\-]\s*([^,.;\n|]{3,60})/i)
  if (shipper) found.shipperName = shipper[1].trim()

  return found
}

// ─── SMALL UI PIECES ───
function Card({ id, icon: Icon, tone, title, subtitle, badge, children }) {
  return (
    <section id={`sec-${id}`} className="scroll-mt-24 bg-[var(--bg-primary)] rounded-3xl border border-[var(--border-color)] shadow-sm p-5 sm:p-6 mb-4">
      <div className="flex items-center gap-3 mb-5">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 ${tone}`}><Icon size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
          {subtitle && <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  )
}

function Badge({ kind }) {
  if (kind === 'done') return <span className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 whitespace-nowrap">✓ Done</span>
  if (kind === 'required') return <span className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 whitespace-nowrap">Required</span>
  return <span className="text-[11px] font-semibold text-[var(--text-muted)] whitespace-nowrap">optional</span>
}

function Field({ label, htmlFor, required, optional, error, hint, className = '', children }) {
  return (
    <div className={className} data-error={error ? 'true' : undefined}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--text-secondary)] mb-1.5">
          {label}
          {required && <span className="text-rose-500"> *</span>}
          {optional && <span className="ml-1.5 normal-case font-semibold text-[var(--text-muted)]">optional</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-[11px] text-[var(--text-muted)] mt-1">{hint}</p>}
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  )
}

function Input({ icon: Icon, name, error, className = '', ...rest }) {
  return (
    <div className="relative">
      {Icon && <Icon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />}
      <input id={name} name={name} className={`${INPUT} ${Icon ? 'pl-10' : ''} ${error ? INPUT_ERROR : ''} ${className}`} {...rest} />
    </div>
  )
}

// Tap-to-pick buttons for short lists, with an optional box for a value that isn't in the list.
function Chips({ options, value, onChange, custom, customPlaceholder = 'Other…', limit }) {
  const [showAll, setShowAll] = useState(false)
  const shown = limit && !showAll ? options.slice(0, limit) : options
  const inList = options.includes(value)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((o) => {
        const on = value === o
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? '' : o)}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-bold transition-all ${on ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-indigo-400'}`}>
            {o}
          </button>
        )
      })}
      {limit && options.length > limit && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-300 border border-dashed border-indigo-300 dark:border-indigo-500/40">
          {showAll ? 'Fewer' : `+${options.length - limit} more`}
        </button>
      )}
      {custom && (
        <input type="text" value={inList ? '' : (value || '')} onChange={(e) => onChange(e.target.value)} placeholder={customPlaceholder}
          className="w-28 h-9 px-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500" />
      )}
    </div>
  )
}

// A text box that suggests values as you type but still accepts anything.
function ComboInput({ name, listId, list, icon, error, ...rest }) {
  return (
    <>
      <Input icon={icon} name={name} list={listId} error={error} autoComplete="off" {...rest} />
      <datalist id={listId}>{list.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  )
}

// ─── PARTY AUTOCOMPLETE ───
// Searchable dropdown + free typing, shared by Consignee Name and Shipper Name
// (pass type="CONSIGNEE" or "SHIPPER"). Fetches the managed master list once,
// filters it as you type, and a name that isn't in the list yet is added to it
// automatically on blur, so the list grows on its own over time.
function PartyAutocomplete({ type, value, onChange, placeholder, inputClass }) {
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    api.get('/freight/party-names', { params: { type } })
      .then(res => setOptions((res.data?.data || []).map(p => p.name)))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [type])

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = value
    ? options.filter(o => o.toLowerCase().includes(value.toLowerCase())).slice(0, 30)
    : options.slice(0, 30)

  const commitNewNameIfNeeded = async () => {
    const trimmed = (value || '').trim()
    if (!trimmed) return
    if (options.some(o => o.toLowerCase() === trimmed.toLowerCase())) return
    try {
      await api.post('/freight/party-names', { type, name: trimmed })
      setOptions(prev => [...prev, trimmed])
    } catch {}
  }

  return (
    <div className="relative" ref={wrapRef}>
      <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] z-10 pointer-events-none" />
      <input
        type="text"
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={commitNewNameIfNeeded}
        placeholder={placeholder}
        className={inputClass}
        autoComplete="off"
      />
      {open && loaded && filtered.length > 0 && (
        <div className="absolute z-20 mt-1.5 w-full max-h-56 overflow-y-auto bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-xl">
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(name); setOpen(false) }}
              className="w-full text-left px-3.5 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] border-b border-[var(--border-color)] last:border-0"
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {open && loaded && filtered.length === 0 && value && (
        <div className="absolute z-20 mt-1.5 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-xl px-3.5 py-2.5 text-xs text-[var(--text-muted)] italic">
          No match. This will be saved as a new name
        </div>
      )}
    </div>
  )
}

// ─── CHARGEABLE WEIGHT CALCULATOR ───
// Standard freight dimensional-weight maths:
//   Air/Courier: Volumetric Weight (kg) = (L x W x H x Pieces) / 6000 (IATA standard;
//                some airlines use 5000, change the constant below if numbers look off).
//   Sea (FCL/LCL): 1 CBM = 1000 kg. Sizes are typed in cm and converted internally.
// Chargeable Weight is whichever is HIGHER: gross weight or volumetric weight.
const AIR_VOLUMETRIC_DIVISOR = 6000
const SEA_CBM_TO_KG = 1000

function WeightCalculator({ transportMode, grossWeight, onApply }) {
  const [open, setOpen] = useState(false)
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [pieces, setPieces] = useState('1')

  const isSea = transportMode === 'Sea FCL' || transportMode === 'Sea LCL'
  const L = parseFloat(length) || 0
  const W = parseFloat(width) || 0
  const H = parseFloat(height) || 0
  const P = parseFloat(pieces) || 1
  const cbm = (L * W * H * P) / 1000000
  const volumetric = isSea ? cbm * SEA_CBM_TO_KG : (L * W * H * P) / AIR_VOLUMETRIC_DIVISOR
  const actual = parseFloat(grossWeight) || 0
  const chargeable = Math.max(actual, volumetric)
  const hasInput = L > 0 && W > 0 && H > 0
  const small = 'w-full h-10 px-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500'

  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="inline-flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:underline">
        <Weight size={14} /> {open ? 'Hide the box-size calculator' : 'Work out chargeable weight from box size'}
      </button>
      {open && (
        <div className="mt-3 rounded-2xl bg-[var(--bg-secondary)] p-4">
          <p className="text-[11px] text-[var(--text-muted)] mb-3">
            {isSea ? 'Sea freight: 1 CBM = 1000 kg.' : `Air / courier: size ÷ ${AIR_VOLUMETRIC_DIVISOR} (IATA standard).`} Box size is for one piece, in cm.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
            <div><label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">Length</label><input type="number" min="0" value={length} onChange={e => setLength(e.target.value)} className={small} /></div>
            <div><label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">Width</label><input type="number" min="0" value={width} onChange={e => setWidth(e.target.value)} className={small} /></div>
            <div><label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">Height</label><input type="number" min="0" value={height} onChange={e => setHeight(e.target.value)} className={small} /></div>
            <div><label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">Pieces</label><input type="number" min="1" value={pieces} onChange={e => setPieces(e.target.value)} className={small} /></div>
            <div className="col-span-2 sm:col-span-1 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white px-3 py-2 min-h-[40px]">
              <p className="text-[10px] uppercase tracking-wide opacity-80">Chargeable</p>
              <p className="text-base font-extrabold leading-tight">{hasInput ? `${chargeable.toFixed(2)} kg` : '—'}</p>
            </div>
          </div>
          {hasInput && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--text-secondary)]">
              <span>CBM <b className="text-[var(--text-primary)]">{cbm.toFixed(3)}</b></span>
              <span>Volumetric <b className="text-[var(--text-primary)]">{volumetric.toFixed(2)} kg</b></span>
              <span>Gross <b className="text-[var(--text-primary)]">{actual.toFixed(2)} kg</b></span>
              <button type="button" onClick={() => onApply({ chargeableWeight: chargeable.toFixed(2), cbm: cbm.toFixed(3) })}
                className="ml-auto px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Use these values</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── LIVE PREVIEW ───
// Fills in as you type, so creating a shipment feels like watching it take shape.
// Hidden on smaller screens where there is no room for it.
function LivePreview({ refNo, who, tags, from, to, facts, checklist }) {
  return (
    <aside className="hidden xl:block sticky top-24 self-start">
      <div className="rounded-3xl bg-gradient-to-br from-[#141A4A] to-[#1E2A78] text-white p-6 shadow-2xl shadow-indigo-900/30">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-indigo-300">Live preview</p>
        <h3 className="text-2xl font-extrabold tracking-tight mt-1.5 truncate">{refNo || 'No reference yet'}</h3>
        <p className="text-sm text-indigo-100/80 truncate">{who || 'No customer yet'}</p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tags.map((t) => <span key={t} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/15">{t}</span>)}
          </div>
        )}
        {(from || to) && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3">
            <div className="min-w-0 flex-1"><p className="text-[10px] uppercase tracking-wider text-indigo-300">From</p><p className="text-sm font-bold truncate">{from || '—'}</p></div>
            <span className="text-orange-300 text-lg" aria-hidden="true">→</span>
            <div className="min-w-0 flex-1 text-right"><p className="text-[10px] uppercase tracking-wider text-indigo-300">To</p><p className="text-sm font-bold truncate">{to || '—'}</p></div>
          </div>
        )}
        {facts.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-indigo-300">{k}</p><p className="text-sm font-bold truncate">{v}</p></div>
            ))}
          </div>
        )}
        <div className="mt-5 pt-4 border-t border-white/15 space-y-2">
          {checklist.map((c) => (
            <div key={c.label} className="flex items-center gap-2.5 text-[13px]">
              <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${c.done ? 'bg-emerald-500 text-white' : 'bg-white/15 text-indigo-200'}`}>{c.done ? '✓' : '○'}</span>
              <span className={c.done ? 'text-white' : 'text-indigo-200/70'}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}



export default function CreateShipment() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const socket = useSocket()
  const [loading, setLoading] = useState(false)
  const [showWeightCalc, setShowWeightCalc] = useState(false)
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
  // Set when this form was started from "Create similar" on an existing shipment.
  const [copiedFrom, setCopiedFrom] = useState('')
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
  const [selectedPrefix, setSelectedPrefix] = useState(() => readLocal(LAST_PREFIX_KEY))
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
  const [selectedInitials, setSelectedInitials] = useState(() => readLocal(LAST_INITIALS_KEY))
  const [newInitialInput, setNewInitialInput] = useState('')
  const [addingInitial, setAddingInitial] = useState(false)
  const [showManageInitials, setShowManageInitials] = useState(false)
  const [editingInitialCode, setEditingInitialCode] = useState(null)
  const [editingInitialValue, setEditingInitialValue] = useState('')

  // ✅ CO-HANDLER (NEW) — an optional second employee who should also see
  // this shipment in their own "My Shipments".
  const [employees, setEmployees] = useState([])
  const [coHandlerId, setCoHandlerId] = useState('')

  useEffect(() => {
    api.get('/freight/employees')
      .then(res => setEmployees(res.data?.data || []))
      .catch(() => {})
  }, [])

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
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) return { ...blankForm(), ...JSON.parse(saved) }
    } catch {}
    return blankForm()
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
    } else if (searchParams.get('copy')) {
      // "Create similar": same customer, route and cargo, but a brand-new shipment.
      loadShipmentForEdit(searchParams.get('copy'), true)
    }
  }, [searchParams])

  const loadShipmentForEdit = async (id, asCopy = false) => {
    setLoadingShipment(true)
    try {
      const res = await api.get(`/freight/shipments/${id}`)
      const s = res.data.data
      const ff = s.freightForwarding || {}
      const cha = s.cha || {}
      
      let mode = 'freight'
      if (s.shipmentType === 'CHA Only') mode = s.importExport === 'Export' ? 'cha-export' : 'cha-import'
      else if (s.shipmentType === 'Transport') mode = 'transport'
      else if (s.shipmentType === 'DO Release') mode = 'do-release'
      else if (s.shipmentType === 'FF Only') mode = 'ff-only'
      setShipmentMode(mode)
      
      const loaded = {
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
        containerType: ff.containerType || '',
        packageType: ff.packageType || '',
        fromLocation: ff.fromLocation || '',
        toLocation: ff.toLocation || '',
        deliveryDate: ff.deliveryDate ? new Date(ff.deliveryDate).toISOString().split('T')[0] : '',
        transportMode: s.shipmentType === 'Transport' ? s.shipmentType : '',
        chaName: ff.agent || '',
        // ✅ NEW — Freight module only
        terms: ff.terms || '',
        portLocation: ff.portLocation || '',
        cbm: ff.cbm || '',
        commodityName: ff.commodityName || '',
        preAlertsSentDate: ff.preAlertsSentDate ? new Date(ff.preAlertsSentDate).toISOString().split('T')[0] : '',
        doCollectionDate: cha.doCollectionDate ? new Date(cha.doCollectionDate).toISOString().split('T')[0] : ''
      }

      if (asCopy) {
        // Keep who the customer is and what is moving where. Clear everything that
        // belongs to one particular job: the reference, dates, document numbers and weights.
        setFormData({
          ...loaded,
          refNo: '',
          enquiryDate: new Date().toISOString().split('T')[0],
          noOfPackages: '', weight: '', grossWeight: '', cbm: '',
          hawb: '', mawb: '', awbDate: '', deliveryDate: '',
          preAlertsSentDate: '', doCollectionDate: ''
        })
        setCopiedFrom(s.refNo || '')
      } else {
        setFormData(loaded)
      }
    } catch (err) {
      addToast(asCopy ? 'Could not load that shipment to copy' : 'Failed to load shipment for editing', 'error')
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
      if (!isCHA && !isEditMode && !formData.refNo.trim()) newErrors.refNo = 'Reference number is required'
    }
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) {
      addToast('Please fix the validation errors', 'warning')
      const el = document.getElementById(Object.keys(newErrors)[0])
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }) }
      return false
    }
    return true
  }

  // ─── DUPLICATE GUARD (NEW) ───
  // Before a NEW shipment is saved, the server compares every detail typed here (customer,
  // shipper, consignee, route, commodity, weights...) with recent open shipments. If one looks
  // like the same job, the person sees it first and decides: open the existing one, or create anyway.
  const [dupMatches, setDupMatches] = useState([])
  const [dupAsk, setDupAsk] = useState(false)
  const dupConfirmed = useRef(false)

  const findDuplicates = async () => {
    try {
      const res = await api.post('/freight/shipments/check-duplicate', {
        customerName: formData.customerName, shipperName: formData.shipperName, consigneeName: formData.consigneeName,
        fromLocation: formData.fromLocation, toLocation: formData.toLocation,
        commodityName: formData.commodityName, terms: formData.terms,
        noOfPackages: formData.noOfPackages, grossWeight: formData.grossWeight, weight: formData.weight, cbm: formData.cbm,
        shipmentType: isFFOnly ? 'FF Only' : isDORelease ? 'DO Release' : isTransport ? 'Transport' : (isCHA ? 'CHA Only' : (formData.mode || '')),
        importExport: isCHAExport ? 'Export' : (isCHA ? 'Import' : (formData.importExport || ''))
      })
      return res.data?.data || []
    } catch { return [] } // the check must never stop someone from saving
  }

  const createAnyway = () => {
    dupConfirmed.current = true
    setDupAsk(false)
    handleSubmit({ preventDefault() {} })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    if (!isEditMode && !dupConfirmed.current) {
      const found = await findDuplicates()
      if (found.length > 0) { setDupMatches(found); setDupAsk(true); setLoading(false); return }
    }
    dupConfirmed.current = false
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
          containerType: formData.containerType || null,
          packageType: formData.packageType || null,
          fromLocation: formData.fromLocation || null,
          toLocation: formData.toLocation || null,
          deliveryDate: formData.deliveryDate || null,
          // ✅ NEW — Freight module only
          cbm: formData.cbm ? parseFloat(formData.cbm) : undefined,
          commodityName: formData.commodityName || null,
          preAlertsSentDate: formData.preAlertsSentDate || null
        }))
        // ✅ NEW — Terms and Port Location go through their own dedicated
        // endpoints (matching how ShipmentDetail.jsx edits them), only
        // sent for the standard Freight type since that's the only mode
        // with these fields on this page.
        if (!isTransport && !isDORelease && !isCHA && !isFFOnly) {
          if (formData.terms) updatePromises.push(api.put(`/freight/shipments/${editId}/terms`, { terms: formData.terms }))
          if (formData.portLocation) updatePromises.push(api.put(`/freight/shipments/${editId}/portlocation`, { portLocation: formData.portLocation }))
          if (formData.doCollectionDate) updatePromises.push(api.put(`/cha/shipments/${editId}/do-collection`, { doCollectionDate: formData.doCollectionDate }))
        }
        updatePromises.push(api.put(`/freight/shipments/${editId}/shipmenttype`, { shipmentType: shipmentTypeVal }))
        updatePromises.push(api.put(`/freight/shipments/${editId}/importexport`, { importExport: importExportVal }))
        // ✅ FIX — only send AWB fields (and only fire the AWB update call)
        // when the user actually entered AWB info. Previously this always
        // sent hawb/mawb as empty strings, which the backend treats as
        // "AWB data present" and force-advances currentStatus to
        // AWB_GENERATED on every single edit, even for unrelated field
        // changes (consignee, weight, etc.) at any earlier stage.
        const awbData = {}
        if (formData.hawb) awbData.hawb = formData.hawb
        if (formData.mawb) awbData.mawb = formData.mawb
        if (formData.awbDate) awbData.awbDate = formData.awbDate
        const hasAwbData = Object.keys(awbData).length > 0

        if (isDORelease) {
          if (hasAwbData) updatePromises.push(api.put(`/freight/shipments/${editId}/awb`, awbData))
          updatePromises.push(api.put(`/freight/shipments/${editId}/agent`, { agent: formData.chaName }))
        }
        if (!isTransport && !isDORelease) {
          if (hasAwbData) updatePromises.push(api.put(`/freight/shipments/${editId}/awb`, awbData))
          updatePromises.push(api.put(`/freight/shipments/${editId}/consignee`, { consigneeName: formData.consigneeName }))
          updatePromises.push(api.put(`/freight/shipments/${editId}/shipper`, { shipperName: formData.shipperName }))
          updatePromises.push(api.put(`/freight/shipments/${editId}/agent`, { agent: formData.agent }))
        }
        await Promise.all(updatePromises)
        addToast('Shipment updated successfully!', 'success')
        // ✅ LIVE EVERYWHERE (NEW) — this edit path (the full Create/Edit
        // form, as opposed to inline field edits on the detail page) also
        // didn't broadcast anything before.
        if (socket) {
          socket.emit('shipment:updated', { id: editId, refNo: formData.refNo, user: 'Someone' })
        }
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
          coHandlerId: coHandlerId || null,
          enquiryDate: formData.enquiryDate || new Date().toISOString().split('T')[0],
          noOfPackages: formData.noOfPackages ? parseInt(formData.noOfPackages) : null,
          weight: formData.weight ? parseFloat(formData.weight) : null,
          grossWeight: formData.grossWeight ? parseFloat(formData.grossWeight) : null,
          shipmentType: shipmentTypeVal, importExport: importExportVal,
          customerName: formData.customerName || null,
          vehicleType: formData.vehicleType || null,
          noOfContainers: formData.noOfContainers ? parseInt(formData.noOfContainers) : null,
          containerType: formData.containerType || null,
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
        // ✅ LIVE EVERYWHERE — creating a shipment broadcasts too, so it shows up on
        // everyone else's Dashboard/Analytics/Pipeline without a refresh.
        if (socket) {
          socket.emit('shipment:created', { refNo: response.data.data.refNo, id: response.data.data.id })
        }
        queryClient.removeQueries({ queryKey: ['shipments'] })
        const newId = response.data.data.id
        const dest = (isTransport || isDORelease) ? `/shipment/${newId}?tab=accounts` : `/shipment/${newId}${isCHA ? '?tab=customs' : ''}`
        if (afterSave.current === 'another') {
          afterSave.current = ''
          startAnother()
          addToast(`${response.data.data.refNo} saved. Ready for the next one`, 'success')
        } else {
          setCreated({ id: newId, refNo: response.data.data.refNo, dest })
        }
      }
    } catch (err) { addToast(err.response?.data?.message || 'Failed to save', 'error') }
    finally { setLoading(false) }
  }

  // ─── NEW HELPERS FOR THE REDESIGNED PAGE ───
  // Quick create shows only the few fields that matter; everything else can be added later.
  const [quick, setQuick] = useState(() => readLocal(QUICK_KEY, 'false') === 'true')
  const full = isEditMode || !quick
  const toggleQuick = (v) => { setQuick(v); writeLocal(QUICK_KEY, String(v)) }

  const [draftRestored, setDraftRestored] = useState(() => {
    try { return draftHasContent(JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')) } catch { return false }
  })
  const [created, setCreated] = useState(null)       // set after a successful save: { id, refNo, dest }
  const afterSave = useRef('')                        // 'another' when "Save & create another" was pressed
  const formRef = useRef(null)

  // The one field that says who the customer is, which differs by mode.
  const primaryField = (isTransport || isDORelease) ? 'customerName' : isCHAExport ? 'shipperName' : 'consigneeName'
  const primaryValue = formData[primaryField] || ''

  const setField = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    setTouched(prev => ({ ...prev, [name]: true }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  // Recent customers: the last few this person worked with, one tap to reuse.
  const [recentShips, setRecentShips] = useState([])
  useEffect(() => {
    let on = true
    const load = async (mine) => {
      const res = await api.get('/freight/shipments', { params: { page: 1, limit: 40, isArchived: 'false', ...(mine ? { mine: 'true' } : {}) } })
      return res.data?.data || []
    }
    load(true).then(list => (list.length ? list : load(false))).then(list => { if (on) setRecentShips(list) }).catch(() => {})
    return () => { on = false }
  }, [])
  const recentNames = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const s of recentShips) {
      const ff = s.freightForwarding || {}
      const name = String((primaryField === 'customerName' ? ff.customerName : ff[primaryField]) || '').trim()
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      out.push(name)
      if (out.length >= 6) break
    }
    return out
  }, [recentShips, primaryField])

  // Warns while typing if this customer already has an open enquiry, before a duplicate is created.
  const [openMatches, setOpenMatches] = useState([])
  useEffect(() => {
    const name = primaryValue.trim()
    if (isEditMode || name.length < 3) { setOpenMatches([]); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/freight/shipments', { params: { search: name, limit: 6, page: 1, isArchived: 'false' } })
        if (cancelled) return
        const lower = name.toLowerCase()
        const list = (res.data?.data || []).filter((s) => {
          const ff = s.freightForwarding || {}
          const who = String(ff.consigneeName || ff.customerName || ff.shipperName || '').toLowerCase()
          const status = s.currentStatus || s.status
          return who && (who.includes(lower) || lower.includes(who)) && !CLOSED_STATUSES.includes(status) && s.refNo !== copiedFrom
        })
        setOpenMatches(list.slice(0, 3))
      } catch { if (!cancelled) setOpenMatches([]) }
    }, 600)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [primaryValue, isEditMode, copiedFrom])

  // "Same customer as before?": find an earlier shipment and start from a copy of it.
  const [cloneQuery, setCloneQuery] = useState('')
  const [cloneResults, setCloneResults] = useState([])
  useEffect(() => {
    const q = cloneQuery.trim()
    if (q.length < 2) { setCloneResults([]); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/freight/shipments', { params: { search: q, limit: 5, page: 1, isArchived: 'false' } })
        if (!cancelled) setCloneResults(res.data?.data || [])
      } catch { if (!cancelled) setCloneResults([]) }
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [cloneQuery])

  // Paste the enquiry: suggestions read from a pasted message.
  const [pasteText, setPasteText] = useState('')
  const [knownConsignees, setKnownConsignees] = useState([])
  useEffect(() => {
    api.get('/freight/party-names', { params: { type: 'CONSIGNEE' } })
      .then(res => setKnownConsignees((res.data?.data || []).map(p => p.name)))
      .catch(() => {})
  }, [])
  const allowedFound = isFFOnly
    ? ['consigneeName', 'shipperName', 'mode', 'importExport', 'noOfPackages', 'grossWeight', 'containerType']
    : isCHA
      ? ['consigneeName', 'shipperName', 'mode', 'grossWeight']
      : ['consigneeName', 'shipperName', 'mode', 'importExport', 'noOfPackages', 'grossWeight', 'cbm', 'terms', 'commodityName', 'fromLocation', 'toLocation']
  const foundFields = useMemo(() => {
    const all = parseEnquiry(pasteText, knownConsignees)
    return Object.fromEntries(Object.entries(all).filter(([k]) => allowedFound.includes(k)))
  }, [pasteText, knownConsignees, shipmentMode])
  const applyFound = () => {
    const keys = Object.keys(foundFields)
    if (keys.length === 0) return
    setFormData(prev => ({ ...prev, ...foundFields }))
    setPasteText('')
    addToast(`Filled ${keys.length} field${keys.length === 1 ? '' : 's'}. Please check them before saving`, 'success')
  }

  // Ctrl+Enter saves from anywhere on the page.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && formRef.current && !loading && !created && !dupAsk) {
        e.preventDefault()
        if (typeof formRef.current.requestSubmit === 'function') formRef.current.requestSubmit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, created, dupAsk])

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
    setFormData(blankForm())
    setErrors({}); setTouched({})
    setDraftRestored(false)
    setCopiedFrom('')
  }

  // Starts the next shipment for the same customer: details stay, job-specific fields are cleared.
  const startAnother = () => {
    setFormData(prev => keepForNext(prev))
    setErrors({}); setTouched({})
    setCreated(null)
    setCopiedFrom('')
    setPasteText('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copyCreatedDetails = async () => {
    const lines = [
      `Ref No: ${created?.refNo || ''}`,
      formData[primaryField] ? `${isTransport || isDORelease ? 'Customer' : isCHAExport ? 'Shipper' : 'Consignee'}: ${formData[primaryField]}` : '',
      formData.mode ? `Mode: ${formData.mode}` : '',
      formData.importExport ? `Import/Export: ${formData.importExport}` : '',
      (formData.fromLocation || formData.toLocation) ? `Route: ${formData.fromLocation || '—'} → ${formData.toLocation || '—'}` : '',
    ].filter(Boolean)
    try { await navigator.clipboard.writeText(lines.join('\n')); addToast('Details copied', 'success') }
    catch { addToast('Could not copy. Select the text and copy it instead', 'warning') }
  }

  const focusRing = 'focus:ring-indigo-500 focus:border-indigo-500'

  // ─── PREFIX / INITIALS PICKER ───
  // Tap a prefix, tap your initials, press Generate. The last choice is remembered on this browser.
  const chooseLast = (key, setter) => (code) => { setter(code); writeLocal(key, code); if (code && (key === LAST_PREFIX_KEY ? selectedInitials : selectedPrefix)) dismissFirstTimeGuide() }
  const pickPrefix = chooseLast(LAST_PREFIX_KEY, setSelectedPrefix)
  const pickInitials = chooseLast(LAST_INITIALS_KEY, setSelectedInitials)
  const canGenerate = prefixes.some(p => p.code === selectedPrefix) && initialsList.some(p => p.code === selectedInitials)

  const chipClass = (on) => `px-3.5 py-2 rounded-xl text-[13px] font-bold transition-all ${on ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-indigo-400'}`
  const manageInput = 'flex-1 min-w-0 px-2.5 py-1.5 border border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg text-xs'
  const manageBox = 'border border-[var(--border-color)] rounded-2xl p-3 space-y-2 bg-[var(--bg-secondary)]'

  const renderManagePanel = ({ list, editing, editValue, setEditValue, startEdit, cancelEdit, saveEdit, onDelete, newInput, setNewInput, onAdd, adding, emptyText, placeholder }) => (
    <div className={manageBox}>
      {list.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">{emptyText}</p>}
      {list.map((p) => (
        <div key={p.code} className="flex items-center gap-2">
          {editing === p.code ? (
            <>
              <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus className={manageInput} />
              <button type="button" onClick={() => saveEdit(p.code)} className="px-2.5 py-1.5 bg-emerald-500 text-white rounded-lg text-[11px] font-bold">Save</button>
              <button type="button" onClick={cancelEdit} className="px-2.5 py-1.5 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg text-[11px]">Cancel</button>
            </>
          ) : (
            <>
              <span className="flex-1 text-xs font-bold text-[var(--text-primary)]">{p.code}</span>
              <button type="button" onClick={() => startEdit(p.code)} className="p-1.5 text-[var(--text-muted)] hover:text-indigo-600" title="Rename"><Pencil size={13} /></button>
              <button type="button" onClick={() => onDelete(p.code)} className="p-1.5 text-[var(--text-muted)] hover:text-red-600" title="Delete"><AlertCircle size={13} className="rotate-45" /></button>
            </>
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-2 border-t border-[var(--border-color)]">
        <input type="text" value={newInput} onChange={(e) => setNewInput(e.target.value)} placeholder={placeholder} className={manageInput} />
        <button type="button" onClick={onAdd} disabled={adding || !newInput.trim()}
          className="px-3 py-1.5 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg text-[11px] font-bold flex items-center gap-1 disabled:opacity-50 whitespace-nowrap">
          {adding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add
        </button>
      </div>
    </div>
  )

  const renderRefPicker = () => (
    <div className="space-y-4 mb-5">
      {showFirstTimeGuide && (
        <div className="flex items-start gap-2 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 px-3.5 py-2.5 text-xs text-indigo-800 dark:text-indigo-200">
          <Info size={15} className="mt-0.5 flex-shrink-0" />
          <p className="flex-1"><b>How it works:</b> tap a prefix, tap your initials, then press Generate. Your choice is remembered for next time. Don't see yours? Use "Manage" to add it.</p>
          <button type="button" onClick={dismissFirstTimeGuide} aria-label="Got it" className="p-0.5"><X size={14} /></button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Prefix" className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {prefixes.length === 0 && <span className="text-xs text-[var(--text-muted)]">No prefixes yet. Add one with Manage.</span>}
            {prefixes.map(p => <button key={p.code} type="button" aria-pressed={selectedPrefix === p.code} onClick={() => pickPrefix(selectedPrefix === p.code ? '' : p.code)} className={chipClass(selectedPrefix === p.code)}>{p.code}</button>)}
            <button type="button" onClick={() => setShowManagePrefixes(v => !v)} className="px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-300 border border-dashed border-indigo-300 dark:border-indigo-500/40">{showManagePrefixes ? 'Close' : 'Manage'}</button>
          </div>
        </Field>
        <Field label="Your initials" className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {initialsList.length === 0 && <span className="text-xs text-[var(--text-muted)]">No initials yet. Add yours with Manage.</span>}
            {initialsList.map(p => <button key={p.code} type="button" aria-pressed={selectedInitials === p.code} onClick={() => pickInitials(selectedInitials === p.code ? '' : p.code)} className={chipClass(selectedInitials === p.code)}>{p.code}</button>)}
            <button type="button" onClick={() => setShowManageInitials(v => !v)} className="px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-300 border border-dashed border-indigo-300 dark:border-indigo-500/40">{showManageInitials ? 'Close' : 'Manage'}</button>
          </div>
        </Field>
      </div>
      {showManagePrefixes && renderManagePanel({
        list: prefixes, editing: editingCode, editValue: editingValue, setEditValue: setEditingValue,
        startEdit: startEditPrefix, cancelEdit: cancelEditPrefix, saveEdit: saveEditPrefix, onDelete: handleDeletePrefix,
        newInput: newPrefixInput, setNewInput: setNewPrefixInput, onAdd: handleAddPrefix, adding: addingPrefix,
        emptyText: 'No prefixes yet. Add one below.', placeholder: 'New prefix, e.g. PIPE',
      })}
      {showManageInitials && renderManagePanel({
        list: initialsList, editing: editingInitialCode, editValue: editingInitialValue, setEditValue: setEditingInitialValue,
        startEdit: startEditInitial, cancelEdit: cancelEditInitial, saveEdit: saveEditInitial, onDelete: handleDeleteInitial,
        newInput: newInitialInput, setNewInput: setNewInitialInput, onAdd: handleAddInitial, adding: addingInitial,
        emptyText: 'No initials yet. Add yours below.', placeholder: 'Your initials, e.g. GJ',
      })}
    </div>
  )

  const goTo = (id) => {
    const el = document.getElementById(`sec-${id}`)
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const modeName = MODE_CARDS.find(m => m.key === shipmentMode)?.label || 'Freight'
  const partyLabel = (isTransport || isDORelease) ? 'Customer' : isCHAExport ? 'Shipper' : 'Consignee'
  const exportDirection = formData.importExport === 'Export'
  const fromList = exportDirection ? INDIA_PORTS : COUNTRY_PORTS
  const toList = exportDirection ? COUNTRY_PORTS : INDIA_PORTS
  const swapRoute = () => setFormData(prev => ({ ...prev, fromLocation: prev.toLocation, toLocation: prev.fromLocation }))

  // ─── SECTIONS (drive the left list, the progress meter and the live preview) ───
  const sectionList = []
  if (!isCHA) sectionList.push({ id: 'reference', label: isTransport ? 'Vehicle' : 'Reference', done: !!formData.refNo })
  sectionList.push({ id: 'customer', label: partyLabel, done: !!primaryValue.trim() })
  if (isDORelease) sectionList.push({ id: 'release', label: 'DO details', done: !!(formData.mawb && formData.customerName) })
  else if (isTransport) sectionList.push({ id: 'shipment', label: 'Transport & route', done: !!(formData.fromLocation && formData.toLocation) })
  else if (isCHA) sectionList.push({ id: 'shipment', label: 'Bill details', done: !!formData.mode })
  else sectionList.push({ id: 'shipment', label: 'Shipment & route', done: !!(formData.mode && formData.importExport) })
  if (full && !isTransport && !isDORelease) sectionList.push({ id: 'cargo', label: 'Cargo & weight', done: !!(formData.grossWeight || formData.weight || formData.noOfPackages) })
  if (full) sectionList.push({ id: 'notify', label: 'Notify & team', done: !!formData.notificationEmail })
  const doneCount = sectionList.filter(s => s.done).length
  const percent = Math.round((doneCount / sectionList.length) * 100)

  const missingRequired = []
  if (!isEditMode && !isCHA && !isTransport && !isDORelease && !formData.refNo.trim()) missingRequired.push('Reference number')
  if (isTransport) {
    if (!formData.customerName.trim()) missingRequired.push('Customer')
    if (!formData.fromLocation.trim()) missingRequired.push('From')
    if (!formData.toLocation.trim()) missingRequired.push('To')
  }
  if (isDORelease) {
    if (!formData.mawb.trim()) missingRequired.push('MAWB No')
    if (!formData.customerName.trim()) missingRequired.push('Customer')
  }

  const previewTags = isTransport
    ? [formData.transportMode, formData.vehicleType].filter(Boolean)
    : isDORelease ? ['DO Release']
      : [isCHA ? `CHA ${isCHAExport ? 'Export' : 'Import'}` : (isFFOnly ? 'FF Only' : ''), formData.mode, isCHA ? '' : formData.importExport].filter(Boolean)
  const previewFacts = [
    ['Terms', formData.terms], ['Port', formData.portLocation],
    ['Packages', formData.noOfPackages],
    ['Weight', formData.weight ? `${formData.weight} kg` : formData.grossWeight ? `${formData.grossWeight} kg gross` : ''],
    ['CBM', formData.cbm], ['MAWB', isDORelease ? formData.mawb : ''],
  ].filter(([, v]) => v)

  const modeTitle = isEditMode ? `Edit: ${formData.refNo}` : isFFOnly ? 'New FF Only Shipment' : isDORelease ? 'New DO Release' : isTransport ? 'New Transport Shipment' : isCHAExport ? 'New CHA Bill Export' : isCHA ? 'New CHA Bill Import' : 'New Freight Shipment'
  const submitLabel = isEditMode ? 'Update Shipment' : isFFOnly ? 'Create FF Only' : isDORelease ? 'Create DO Release' : isTransport ? 'Create Transport' : isCHAExport ? 'Create CHA Export Bill' : isCHA ? 'Create CHA Import Bill' : 'Create Shipment'

  // ─── CARDS ───
  const referenceCard = !isCHA && (
    <Card id="reference" icon={Hash} tone="bg-indigo-500"
      title={isTransport ? 'Vehicle' : isDORelease ? 'DO reference' : 'Reference'}
      subtitle={isTransport ? 'Which vehicle, and which day' : isDORelease ? 'Type a DO reference, or use Auto' : isEditMode ? 'You can correct the number here' : 'Pick a prefix and your initials, then generate'}
      badge={formData.refNo ? <Badge kind="done" /> : (!isTransport && !isDORelease && !isEditMode ? <Badge kind="required" /> : <Badge kind="optional" />)}>
      {!isEditMode && !isTransport && !isDORelease && renderRefPicker()}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={isTransport ? 'Vehicle No' : isDORelease ? 'DO Ref No' : 'Reference number'} htmlFor="refNo" required={!isEditMode && !isTransport && !isDORelease} error={errors.refNo}>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <Input icon={Hash} name="refNo" value={formData.refNo} onChange={handleChange} error={errors.refNo} className="font-bold"
                placeholder={isTransport ? 'KA-01-AB-1234' : isDORelease ? 'DOR-2026…' : 'Generate, or type one'} />
            </div>
            {!isEditMode && !isTransport && !isDORelease && (
              <button type="button" onClick={() => { handleGenerateRef(); dismissFirstTimeGuide() }} disabled={generatingRef || !canGenerate}
                title={canGenerate ? 'Create the next reference number' : 'Pick a prefix and your initials first'}
                className="h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap">
                {generatingRef ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Generate
              </button>
            )}
            {!isEditMode && isDORelease && (
              <button type="button" onClick={() => setFormData(prev => ({ ...prev, refNo: generateRefNo() }))}
                className="h-11 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold flex items-center gap-1.5 whitespace-nowrap"><Sparkles size={15} /> Auto</button>
            )}
          </div>
        </Field>
        <Field label={isTransport || isDORelease ? 'Date' : 'Enquiry date'} htmlFor="enquiryDate">
          <Input icon={Calendar} type="date" name="enquiryDate" value={formData.enquiryDate} onChange={handleChange} />
        </Field>
      </div>
    </Card>
  )

  const customerCard = (
    <Card id="customer" icon={isTransport || isDORelease ? User : Building2} tone="bg-teal-500" title={isTransport || isDORelease ? 'Customer' : 'Parties'}
      subtitle={isTransport || isDORelease ? 'Who is this for?' : 'Start typing. Names you have used before appear as suggestions'}
      badge={primaryValue.trim() ? <Badge kind="done" /> : (isTransport || isDORelease ? <Badge kind="required" /> : <Badge kind="optional" />)}>
      <Field label={`${partyLabel} name`} htmlFor={primaryField} required={isTransport || isDORelease} error={errors.customerName && (isTransport || isDORelease) ? errors.customerName : ''}>
        {(isTransport || isDORelease)
          ? <Input icon={User} name="customerName" value={formData.customerName} onChange={handleChange} placeholder="Customer name" error={errors.customerName} />
          : <PartyAutocomplete type={isCHAExport ? 'SHIPPER' : 'CONSIGNEE'} value={formData[primaryField]} onChange={(v) => setField(primaryField, v)}
              placeholder="Search or type a new name…" inputClass={`${INPUT} pl-10`} />}
      </Field>

      {recentNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Recent</span>
          {recentNames.filter(n => n.toLowerCase() !== primaryValue.trim().toLowerCase()).map(n => (
            <button key={n} type="button" onClick={() => setField(primaryField, n)}
              className="px-3 py-1.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-secondary)] hover:border-indigo-400 max-w-[220px] truncate">{n}</button>
          ))}
        </div>
      )}

      {openMatches.length > 0 && (
        <div role="status" className="mt-3 flex items-start gap-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold">{primaryValue.trim()} already has {openMatches.length === 1 ? '1 open enquiry' : `${openMatches.length} open enquiries`}. Is this the same job?</p>
            {openMatches.map(s => (
              <p key={s.id} className="mt-0.5 truncate">
                <Link to={`/shipment/${s.id}`} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">{s.refNo}</Link>
                {' · '}{String(s.currentStatus || s.status || '').replace(/_/g, ' ').toLowerCase()}
                {s.createdByName ? ` · ${s.createdByName}` : ''}
                {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleDateString('en-GB')}` : ''}
              </p>
            ))}
          </div>
        </div>
      )}

      {!isTransport && !isDORelease && (full || isCHA) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Field label={isCHAExport ? 'Consignee name' : 'Shipper name'} optional>
            <PartyAutocomplete type={isCHAExport ? 'CONSIGNEE' : 'SHIPPER'} value={isCHAExport ? formData.consigneeName : formData.shipperName}
              onChange={(v) => setField(isCHAExport ? 'consigneeName' : 'shipperName', v)} placeholder="Search or type a new name…" inputClass={`${INPUT} pl-10`} />
          </Field>
          {full && (
            <Field label="Agent / forwarder" htmlFor="agent" optional>
              <Input icon={Anchor} name="agent" value={formData.agent} onChange={handleChange} placeholder="Agent name" />
            </Field>
          )}
        </div>
      )}
    </Card>
  )

  const releaseCard = isDORelease && (
    <Card id="release" icon={ClipboardList} tone="bg-teal-600" title="DO release details" subtitle="Air waybill numbers and the CHA handling it"
      badge={formData.mawb.trim() ? <Badge kind="done" /> : <Badge kind="required" />}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="MAWB No" htmlFor="mawb" required error={errors.mawb}>
          <Input icon={Barcode} name="mawb" value={formData.mawb} onChange={handleChange} placeholder="MAWB number" error={errors.mawb} />
        </Field>
        <Field label="HAWB No" htmlFor="hawb" optional>
          <Input icon={Barcode} name="hawb" value={formData.hawb} onChange={handleChange} placeholder="HAWB number" />
        </Field>
        <Field label="CHA name" htmlFor="chaName" optional className="md:col-span-2">
          <Input icon={Building2} name="chaName" value={formData.chaName} onChange={handleChange} placeholder="CHA agent name" />
        </Field>
      </div>
    </Card>
  )

  const transportCard = isTransport && (
    <Card id="shipment" icon={Truck} tone="bg-sky-500" title="Transport & route" subtitle="Vehicle, cargo and where it is going"
      badge={formData.fromLocation && formData.toLocation ? <Badge kind="done" /> : <Badge kind="required" />}>
      <Field label="Transport mode" className="mb-5">
        <Chips options={TRANSPORT_MODE_OPTIONS} value={formData.transportMode} onChange={(v) => setField('transportMode', v)} custom />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <Field label="From" htmlFor="fromLocation" required error={errors.fromLocation}>
          <Input icon={MapPin} name="fromLocation" value={formData.fromLocation} onChange={handleChange} placeholder="Origin" error={errors.fromLocation} />
        </Field>
        <button type="button" onClick={swapRoute} aria-label="Swap from and to" title="Swap from and to"
          className="hidden sm:flex w-11 h-11 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 items-center justify-center hover:bg-indigo-100"><ArrowUpDown size={17} className="rotate-90" /></button>
        <Field label="To" htmlFor="toLocation" required error={errors.toLocation}>
          <Input icon={MapPin} name="toLocation" value={formData.toLocation} onChange={handleChange} placeholder="Destination" error={errors.toLocation} />
        </Field>
      </div>
      {full && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            <Field label="Vehicle type"><Chips options={VEHICLE_TYPES} value={formData.vehicleType} onChange={(v) => setField('vehicleType', v)} custom /></Field>
            <Field label="No of containers" htmlFor="noOfContainers" optional><Input icon={Box} type="number" min="1" name="noOfContainers" value={formData.noOfContainers} onChange={handleChange} /></Field>
            <Field label="Package type" htmlFor="packageType" optional>
              <ComboInput icon={Box} name="packageType" listId="dl-package" list={PACKAGE_TYPES} value={formData.packageType} onChange={handleChange} placeholder="Box / Carton, Pallet…" />
            </Field>
            <Field label="Delivery date" htmlFor="deliveryDate" optional><Input icon={Calendar} type="date" name="deliveryDate" value={formData.deliveryDate} onChange={handleChange} /></Field>
            <Field label="Weight (kg)" htmlFor="weight" optional><Input icon={Scale} type="number" step="0.01" name="weight" value={formData.weight} onChange={handleChange} /></Field>
          </div>
        </>
      )}
    </Card>
  )

  const shipmentCard = !isTransport && !isDORelease && (
    <Card id="shipment" icon={isCHA ? FileCheck : isFFOnly ? FileText : Ship} tone="bg-orange-500"
      title={isCHA ? 'CHA bill details' : isFFOnly ? 'Shipment' : 'Shipment & route'}
      subtitle={isCHA ? 'How it is moving, and the air waybill numbers' : 'How is it moving, and where?'}
      badge={(isCHA ? formData.mode : (formData.mode && formData.importExport)) ? <Badge kind="done" /> : <Badge kind="optional" />}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Transport mode">
          <Chips options={TRANSPORT_MODES} value={formData.mode} onChange={(v) => setField('mode', v)} custom />
        </Field>
        {isCHA ? (
          <Field label="Import / Export">
            <span className="inline-flex px-3.5 py-2 rounded-xl text-[13px] font-bold bg-indigo-600 text-white">{isCHAExport ? 'Export' : 'Import'}</span>
          </Field>
        ) : (
          <Field label="Import / Export">
            <Chips options={IMPORT_EXPORT_TYPES} value={formData.importExport} onChange={(v) => setField('importExport', v)} custom />
          </Field>
        )}
      </div>

      {shipmentMode === 'freight' && full && (
        <>
          <Field label="Commodity" htmlFor="commodityName" optional className="mt-5">
            <Input icon={Box} name="commodityName" value={formData.commodityName} onChange={handleChange} placeholder="e.g. Electronic components" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end mt-5">
            <Field label="From (origin)" htmlFor="fromLocation" optional>
              <ComboInput icon={MapPin} name="fromLocation" listId="dl-from" list={fromList} value={formData.fromLocation} onChange={handleChange} placeholder="Country or port" />
            </Field>
            <button type="button" onClick={swapRoute} aria-label="Swap from and to" title="Swap from and to"
              className="hidden sm:flex w-11 h-11 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 items-center justify-center hover:bg-indigo-100"><ArrowUpDown size={17} className="rotate-90" /></button>
            <Field label="To (destination)" htmlFor="toLocation" optional>
              <ComboInput icon={MapPin} name="toLocation" listId="dl-to" list={toList} value={formData.toLocation} onChange={handleChange} placeholder="City or port" />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            <Field label="Terms"><Chips options={TERMS_OPTIONS} value={formData.terms} onChange={(v) => setField('terms', v)} custom limit={6} /></Field>
            <Field label="Port location" htmlFor="portLocation" optional>
              <ComboInput icon={Anchor} name="portLocation" listId="dl-port" list={PORT_LOCATIONS} value={formData.portLocation} onChange={handleChange} placeholder="e.g. INBLR4" />
            </Field>
          </div>
        </>
      )}

      {isCHA && full && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
          <Field label="HAWB No" htmlFor="hawb" optional><Input icon={Barcode} name="hawb" value={formData.hawb} onChange={handleChange} /></Field>
          <Field label="MAWB No" htmlFor="mawb" optional><Input icon={Barcode} name="mawb" value={formData.mawb} onChange={handleChange} /></Field>
          <Field label="AWB date" htmlFor="awbDate" optional><Input icon={Calendar} type="date" name="awbDate" value={formData.awbDate} onChange={handleChange} /></Field>
        </div>
      )}
    </Card>
  )

  const cargoCard = full && !isTransport && !isDORelease && (
    <Card id="cargo" icon={Scale} tone="bg-violet-500" title="Cargo & weight"
      subtitle={isCHA ? 'Weights for the bill' : 'Type the box size and the chargeable weight is worked out for you'}
      badge={(formData.grossWeight || formData.weight || formData.noOfPackages) ? <Badge kind="done" /> : <Badge kind="optional" />}>
      {isCHA ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Package weight (kg)" htmlFor="weight" optional><Input icon={Weight} type="number" step="0.01" name="weight" value={formData.weight} onChange={handleChange} /></Field>
          <Field label="Gross weight (kg)" htmlFor="grossWeight" optional><Input icon={Scale} type="number" step="0.01" name="grossWeight" value={formData.grossWeight} onChange={handleChange} /></Field>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Packages" htmlFor="noOfPackages" optional><Input icon={Box} type="number" min="1" name="noOfPackages" value={formData.noOfPackages} onChange={handleChange} /></Field>
            <Field label="Gross weight (kg)" htmlFor="grossWeight" optional><Input icon={Scale} type="number" step="0.01" name="grossWeight" value={formData.grossWeight} onChange={handleChange} /></Field>
            <Field label="Chargeable weight (kg)" htmlFor="weight" optional><Input icon={Weight} type="number" step="0.01" name="weight" value={formData.weight} onChange={handleChange} /></Field>
            {shipmentMode === 'freight' && (
              <Field label="CBM" htmlFor="cbm" optional><Input icon={Box} type="number" step="0.001" name="cbm" value={formData.cbm} onChange={handleChange} /></Field>
            )}
          </div>
          <Field label="Container type" optional className="mt-5">
            <Chips options={CONTAINER_TYPES} value={formData.containerType} onChange={(v) => setField('containerType', v)} custom limit={4} />
          </Field>
          <WeightCalculator transportMode={formData.mode} grossWeight={formData.grossWeight}
            onApply={({ chargeableWeight, cbm }) => {
              setFormData(prev => ({ ...prev, weight: chargeableWeight, cbm: prev.cbm || cbm }))
              addToast('Chargeable weight applied', 'success')
            }} />
        </>
      )}
    </Card>
  )

  const coHandler = employees.find(e => String(e.id) === String(coHandlerId))
  const notifyCard = full && (
    <Card id="notify" icon={Mail} tone="bg-amber-500" title="Notify & team" subtitle="Who else sees this, and who gets updates"
      badge={formData.notificationEmail ? <Badge kind="done" /> : <Badge kind="optional" />}>
      {!isEditMode && (
        <Field label="Handled by" className="mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full bg-[var(--bg-secondary)] text-[13px] font-bold text-[var(--text-secondary)]">
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-[10px] flex items-center justify-center">You</span>You
            </span>
            {coHandler && (
              <span className="inline-flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-full bg-[var(--bg-secondary)] text-[13px] font-bold text-[var(--text-secondary)]">
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white text-[10px] flex items-center justify-center">{(coHandler.name || coHandler.email || '?').charAt(0).toUpperCase()}</span>
                {coHandler.name || coHandler.email}
                <button type="button" onClick={() => setCoHandlerId('')} aria-label="Remove co-handler" className="p-0.5 rounded-full hover:bg-black/10"><X size={13} /></button>
              </span>
            )}
            {!coHandler && (
              <select value="" onChange={(e) => setCoHandlerId(e.target.value)} aria-label="Add a co-handler"
                className="h-9 px-3 rounded-full border border-dashed border-indigo-300 dark:border-indigo-500/40 bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-300 focus:outline-none">
                <option value="">＋ Add co-handler</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name || emp.email}</option>)}
              </select>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5">A co-handler also sees this shipment in their My Shipments.</p>
        </Field>
      )}
      <Field label="Customer notification email" htmlFor="notificationEmail" optional>
        <Input icon={Mail} type="email" name="notificationEmail" value={formData.notificationEmail} onChange={handleChange} placeholder="client@example.com" />
      </Field>
      {/* One-time choice made at creation: decides whether the 3 milestone emails (Enquiry Received, Freight Confirmed, Invoice Ready) go out automatically for this shipment. */}
      <label className="flex items-center gap-3 mt-4 cursor-pointer select-none rounded-2xl bg-[var(--bg-secondary)] px-4 py-3.5">
        <input type="checkbox" className="peer sr-only" checked={!!formData.autoEmailEnabled} onChange={(e) => setFormData(prev => ({ ...prev, autoEmailEnabled: e.target.checked }))} />
        <span className="relative w-11 h-6 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-600 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:ring-4 peer-focus-visible:ring-emerald-500/30 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-[var(--text-primary)]">Send automatic update emails to this customer</span>
          <span className="block text-xs text-[var(--text-muted)]">They get a message when the enquiry is received, freight is confirmed and the invoice is ready.</span>
        </span>
      </label>
    </Card>
  )

  if (loadingShipment) return (
    <div className="flex items-center justify-center h-96">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin shadow-lg" />
        <p className="text-sm text-indigo-500 font-medium">Loading shipment...</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-300 hover:underline mb-3"><ArrowLeft size={15} /> Back to shipments</Link>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] truncate">{modeTitle}</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{isEditMode ? 'Change what is different, then update.' : 'Fill in what you know. You can add the rest later from the shipment page.'}</p>
          </div>
          {isEditMode && <Link to={`/shipment/${editId}`} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-lg shadow-indigo-500/20"><Eye size={16} /> View shipment</Link>}
        </div>
        <div className="lg:hidden mt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] mb-1.5"><span>{doneCount} of {sectionList.length} sections</span><span>{percent}%</span></div>
          <div className="h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${percent}%` }} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_320px] gap-6 items-start">
        <aside className="hidden lg:block sticky top-24 self-start">
          <nav aria-label="Form sections" className="flex flex-col gap-1">
            {sectionList.map((s, i) => (
              <button key={s.id} type="button" onClick={() => goTo(s.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] transition-colors">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 ${s.done ? 'bg-emerald-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>{s.done ? '✓' : i + 1}</span>
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-5 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-4">
            <p className="text-[11px] opacity-80">Form complete</p>
            <p className="text-3xl font-extrabold leading-tight">{percent}%</p>
            <div className="h-1.5 rounded-full bg-white/25 mt-2 overflow-hidden"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${percent}%` }} /></div>
            <p className="text-[11px] opacity-90 mt-2.5">{missingRequired.length === 0 ? 'Everything required is filled in' : `Still needed: ${missingRequired.join(', ')}`}</p>
          </div>
        </aside>

        <div className="min-w-0">
          {!isEditMode && (
            <div role="tablist" aria-label="Shipment type" className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 mb-4">
              {MODE_CARDS.map(m => {
                const on = shipmentMode === m.key
                return (
                  <button key={m.key} type="button" role="tab" aria-selected={on} onClick={() => setShipmentMode(m.key)}
                    className={`rounded-2xl px-2 py-3 text-center border-[1.5px] transition-all ${on ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-200 shadow-lg shadow-indigo-500/15' : 'border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-indigo-300'}`}>
                    <span className="block text-2xl mb-0.5" aria-hidden="true">{m.icon}</span>
                    <span className="text-[12.5px] font-bold">{m.label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {!isEditMode && (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="inline-flex p-1 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)]">
                <button type="button" onClick={() => toggleQuick(true)} aria-pressed={quick} className={`px-4 py-2 rounded-xl text-[13px] font-bold flex items-center gap-1.5 ${quick ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30' : 'text-[var(--text-secondary)]'}`}><Zap size={14} /> Quick create</button>
                <button type="button" onClick={() => toggleQuick(false)} aria-pressed={!quick} className={`px-4 py-2 rounded-xl text-[13px] font-bold ${!quick ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30' : 'text-[var(--text-secondary)]'}`}>Full details</button>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{quick ? 'Only the essentials. Add the rest later from the shipment page.' : 'Every field for this shipment type.'}</p>
            </div>
          )}

          {!isEditMode && (
            <div className="mb-4 rounded-3xl border border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0"><Copy size={18} /></span>
                <div className="flex-1 min-w-[190px]">
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Same customer as before?</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300/80">Search an earlier shipment and start from a copy of it.</p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" />
                  <input type="text" value={cloneQuery} onChange={(e) => setCloneQuery(e.target.value)} placeholder="Customer name or reference…" aria-label="Search an earlier shipment to copy"
                    className="w-full h-10 pl-10 pr-3 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              {cloneResults.length > 0 && (
                <div className="mt-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] overflow-hidden">
                  {cloneResults.map(s => {
                    const ff = s.freightForwarding || {}
                    return (
                      <button key={s.id} type="button" onClick={() => { setCloneQuery(''); setCloneResults([]); navigate(`/create?copy=${s.id}`) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--hover-bg)] border-b border-[var(--border-color)] last:border-0">
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold text-[var(--text-primary)] truncate">{s.refNo}</span>
                          <span className="block text-xs text-[var(--text-muted)] truncate">{ff.consigneeName || ff.customerName || ff.shipperName || '—'}</span>
                        </span>
                        <span className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap">{[s.shipmentType, s.importExport].filter(Boolean).join(' · ')}</span>
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">Copy →</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {draftRestored && !isEditMode && !copiedFrom && !loading && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              <Sparkles size={15} className="flex-shrink-0" />
              <span className="flex-1 min-w-[200px]">Your unfinished draft was restored. Carry on where you left off.</span>
              <button type="button" onClick={clearDraft} className="text-xs font-bold underline underline-offset-2">Start fresh</button>
              <button type="button" onClick={() => setDraftRestored(false)} aria-label="Dismiss" className="p-0.5"><X size={14} /></button>
            </div>
          )}

          {copiedFrom && !isEditMode && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
              <Info size={18} className="mt-0.5 flex-shrink-0 text-indigo-500" />
              <div className="flex-1">
                <p className="font-bold">Copied from {copiedFrom}</p>
                <p className="opacity-80">Customer, route and cargo details are filled in. Weights, dates and AWB numbers were left blank. Generate a new reference number, change anything that is different, then save.</p>
              </div>
              <button type="button" onClick={() => setCopiedFrom('')} aria-label="Dismiss" className="p-1 rounded-md hover:bg-indigo-100 dark:hover:bg-white/10"><X size={16} /></button>
            </div>
          )}

          {!isEditMode && !isTransport && !isDORelease && (
            <div className="mb-4 rounded-3xl border-[1.5px] border-dashed border-orange-300 dark:border-orange-500/40 bg-gradient-to-br from-orange-50 to-rose-50 dark:from-orange-500/10 dark:to-rose-500/10 p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0"><Sparkles size={17} /></span>
                <div>
                  <p className="text-sm font-bold text-orange-900 dark:text-orange-200">Paste the enquiry and we'll fill the form</p>
                  <p className="text-xs text-orange-700 dark:text-orange-300/80">Paste an email or WhatsApp message. Check what was found, then apply.</p>
                </div>
              </div>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={3} aria-label="Pasted enquiry text"
                placeholder="e.g. Need a quote for 12 cartons of electronic components from Shenzhen to Bangalore by air, approx 340 kg, FOB."
                className="w-full rounded-2xl border border-orange-200 dark:border-orange-500/30 bg-white dark:bg-[var(--bg-primary)] px-3.5 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-orange-400 resize-y" />
              {pasteText.trim() && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {Object.keys(foundFields).length === 0
                    ? <span className="text-xs text-orange-800 dark:text-orange-200">Nothing recognised yet. Try including the route, weight or number of packages.</span>
                    : (
                      <>
                        {Object.entries(foundFields).map(([k, v]) => (
                          <span key={k} className="px-3 py-1.5 rounded-full bg-white dark:bg-[var(--bg-primary)] border border-orange-200 dark:border-orange-500/30 text-xs font-semibold text-orange-800 dark:text-orange-200">
                            {FOUND_LABELS[k] || k}<b className="ml-1.5 text-[var(--text-primary)]">{v}</b>
                          </span>
                        ))}
                        <button type="button" onClick={applyFound} className="ml-auto px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-md shadow-orange-500/25">Apply to form →</button>
                      </>
                    )}
                </div>
              )}
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit} noValidate>
            {referenceCard}
            {customerCard}
            {releaseCard}
            {transportCard}
            {shipmentCard}
            {cargoCard}
            {notifyCard}

            <div className="sticky bottom-[calc(60px+env(safe-area-inset-bottom))] lg:bottom-3 z-20 mt-2">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-xl px-4 py-3">
                <p className="hidden sm:block flex-1 text-xs text-[var(--text-muted)]">
                  {isEditMode ? 'Editing an existing shipment' : 'Draft saved automatically'} · <span className="text-rose-500">*</span> required
                </p>
                <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                  <Link to="/" className="h-11 px-3 sm:px-5 rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] text-sm font-bold flex items-center hover:bg-[var(--hover-bg)]">Cancel</Link>
                  {!isEditMode && (
                    <button type="button" disabled={loading} onClick={() => { afterSave.current = 'another'; if (formRef.current && formRef.current.requestSubmit) formRef.current.requestSubmit() }}
                      className="h-11 px-3 sm:px-4 rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] text-sm font-bold flex items-center gap-1.5 hover:bg-[var(--hover-bg)] disabled:opacity-50 whitespace-nowrap">
                      <Plus size={15} /> <span className="hidden sm:inline">Save &amp; create another</span><span className="sm:hidden">Another</span>
                    </button>
                  )}
                  <button type="submit" disabled={loading}
                    className="h-11 px-3 sm:px-5 flex-1 min-w-0 sm:flex-none justify-center rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-orange-500/30 disabled:opacity-60 whitespace-nowrap">
                    {loading ? <><Loader2 size={16} className="animate-spin" />Saving...</> : <>{submitLabel}<kbd className="hidden md:inline ml-1 px-1.5 py-0.5 rounded-md bg-white/25 text-[10px] font-bold">Ctrl ↵</kbd></>}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>

        <LivePreview refNo={formData.refNo} who={primaryValue} tags={previewTags} from={formData.fromLocation} to={formData.toLocation}
          facts={previewFacts} checklist={sectionList.map(s => ({ label: s.label, done: s.done }))} />
      </div>

      {dupAsk && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => { afterSave.current = ''; setDupAsk(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="dup-title" className="bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-2xl w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
            <h3 id="dup-title" className="text-lg font-bold text-[var(--text-primary)] mb-1">This looks like an existing shipment</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">The details match {dupMatches.length === 1 ? 'a shipment' : `${dupMatches.length} shipments`} already in the system. Check before creating another one.</p>
            <div className="space-y-2 mb-5">
              {dupMatches.map((m) => (
                <div key={m.id} className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link to={`/shipment/${m.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[var(--text-primary)] underline underline-offset-2">{m.refNo}</Link>
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">{m.score}% match</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{(m.status || '').replace(/_/g, ' ')} · created {new Date(m.createdAt).toLocaleDateString('en-GB')}{m.createdByName ? ` by ${m.createdByName}` : ''}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">Same: {m.matched.join(', ')}{m.differs.length ? `. Different: ${m.differs.join(', ')}` : ''}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button type="button" onClick={() => { afterSave.current = ''; setDupAsk(false) }} className="px-4 min-h-[44px] rounded-xl border border-[var(--border-color)] text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--hover-bg)]">Go back and check</button>
              <button type="button" onClick={createAnyway} className="px-4 min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">It is different, create anyway</button>
            </div>
          </div>
        </div>
      )}

      {created && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-[#0E1236]/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="created-title" className="w-full max-w-md rounded-3xl bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-2xl p-7 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/40"><CheckCircle2 size={34} /></div>
            <h3 id="created-title" className="text-xl font-extrabold text-[var(--text-primary)]">{created.refNo} created</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1.5 mb-6">{[formData[primaryField], formData.mode || formData.transportMode, formData.importExport].filter(Boolean).join(' · ') || 'Saved successfully'}</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" autoFocus onClick={() => navigate(created.dest)} className="col-span-2 h-12 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-lg shadow-orange-500/30">Open shipment →</button>
              <button type="button" onClick={startAnother} className="h-11 rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm font-bold hover:bg-[var(--hover-bg)]">Create another</button>
              <button type="button" onClick={copyCreatedDetails} className="h-11 rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm font-bold hover:bg-[var(--hover-bg)] flex items-center justify-center gap-1.5"><Copy size={14} /> Copy details</button>
            </div>
            <Link to="/" className="inline-block mt-4 text-xs font-semibold text-[var(--text-muted)] hover:underline">Back to all shipments</Link>
          </div>
        </div>
      )}
    </div>
  )
}