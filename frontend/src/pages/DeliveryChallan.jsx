// frontend/src/pages/DeliveryChallan.jsx
//
// NEW FILE — standalone feature page. Does not read or write any shipment
// data, does not touch any existing page/component.
//
// Flow:
//   1. User uploads a Bill of Entry (BOE) PDF
//   2. Backend (/api/delivery-challan/scan) extracts key fields
//   3. User reviews / edits the fields in this page
//   4. "Generate & Download PDF" calls /api/delivery-challan/generate
//      and downloads the formatted Delivery Challan

import { useState, useRef } from 'react'
import { FileUp, Loader2, Download, RotateCcw, CheckCircle2, FileText } from 'lucide-react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

const EMPTY_FIELDS = {
  marksNos: '',
  noOfPkgs: '',
  grossWeight: '',
  beNo: '',
  beDate: '',
  mawbHawbNo: '',
  descriptionOfGoods: 'AS PER BOE AND INVOICE'
}

export default function DeliveryChallan() {
  const { addToast } = useToast()
  const fileInputRef = useRef(null)

  const [selectedFile, setSelectedFile] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [fields, setFields] = useState(EMPTY_FIELDS)
  const [accuracy, setAccuracy] = useState(null)
  const [scanned, setScanned] = useState(false)

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      addToast('Please upload a PDF file', 'error')
      return
    }
    setSelectedFile(file)
    setScanned(false)
    setAccuracy(null)
  }

  const handleScan = async () => {
    if (!selectedFile) {
      addToast('Please choose a BOE PDF first', 'error')
      return
    }
    setScanning(true)
    try {
      const formData = new FormData()
      formData.append('boeFile', selectedFile)

      const res = await api.post('/delivery-challan/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const data = res.data?.data || {}
      setFields({ ...EMPTY_FIELDS, ...data })
      setAccuracy(res.data?.accuracy ?? null)
      setScanned(true)
      addToast('BOE scanned — please review the fields below', 'success')
    } catch (err) {
      console.error(err)
      addToast(err.response?.data?.message || 'Failed to scan BOE PDF', 'error')
    } finally {
      setScanning(false)
    }
  }

  const handleFieldChange = (key, value) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await api.post('/delivery-challan/generate', fields, {
        responseType: 'blob'
      })

      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Delivery-Challan.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      addToast('Delivery Challan downloaded', 'success')
    } catch (err) {
      console.error(err)
      addToast('Failed to generate PDF', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleReset = () => {
    setSelectedFile(null)
    setFields(EMPTY_FIELDS)
    setScanned(false)
    setAccuracy(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <FileText size={22} className="text-orange-500" />
          Delivery Challan
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Upload a Bill of Entry (BOE) PDF to auto-fill a Delivery Challan, review the details, then download.
        </p>
      </div>

      {/* ── UPLOAD CARD ── */}
      <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
        <label className="block text-sm font-semibold text-[var(--text-primary)] mb-3">
          Bill of Entry (BOE) PDF
        </label>

        <div className="flex items-center gap-3">
          <label className="flex-1 flex items-center gap-3 px-4 py-3 border-2 border-dashed border-[var(--border-color)] rounded-lg cursor-pointer hover:border-orange-400 transition-colors">
            <FileUp size={18} className="text-orange-500 flex-shrink-0" />
            <span className="text-sm text-[var(--text-secondary)] truncate">
              {selectedFile ? selectedFile.name : 'Click to choose a PDF file'}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>

          <button
            onClick={handleScan}
            disabled={!selectedFile || scanning}
            className="px-4 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
            {scanning ? 'Scanning...' : 'Scan BOE'}
          </button>
        </div>

        {scanned && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
            <CheckCircle2 size={14} />
            <span>Fields extracted{accuracy !== null ? ` — ~${accuracy}% confidence` : ''}. Please verify below before generating.</span>
          </div>
        )}
      </div>

      {/* ── EDITABLE FIELDS CARD ── */}
      <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Challan Details</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Marks & No's" value={fields.marksNos} onChange={(v) => handleFieldChange('marksNos', v)} />
          <Field label="No of Packages" value={fields.noOfPkgs} onChange={(v) => handleFieldChange('noOfPkgs', v)} placeholder="e.g. 5" />
          <Field label="Gross Weight (KGS)" value={fields.grossWeight} onChange={(v) => handleFieldChange('grossWeight', v)} placeholder="e.g. 120" />
          <Field label="BE No" value={fields.beNo} onChange={(v) => handleFieldChange('beNo', v)} />
          <Field label="BE Date" value={fields.beDate} onChange={(v) => handleFieldChange('beDate', v)} placeholder="DD-MM-YYYY" />
          <Field label="MAWB / HAWB No" value={fields.mawbHawbNo} onChange={(v) => handleFieldChange('mawbHawbNo', v)} />
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Description of Goods</label>
          <textarea
            value={fields.descriptionOfGoods}
            onChange={(e) => handleFieldChange('descriptionOfGoods', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      </div>

      {/* ── ACTIONS ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-5 py-3 bg-[var(--brand-indigo,#4f46e5)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-opacity"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {generating ? 'Generating...' : 'Generate & Download PDF'}
        </button>

        <button
          onClick={handleReset}
          className="px-4 py-3 border border-[var(--border-color)] text-[var(--text-secondary)] text-sm font-medium rounded-lg flex items-center gap-2 hover:bg-[var(--bg-secondary)] transition-colors"
        >
          <RotateCcw size={15} /> Reset
        </button>
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-4">
        This tool only generates a document for download — it does not save anything to any shipment record.
      </p>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{label}</label>
      <input
        type="text"
        value={value || ''}
        placeholder={placeholder || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
    </div>
  )
}
