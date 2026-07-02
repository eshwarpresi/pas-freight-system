import React, { useState, useRef, useEffect } from 'react'
import api from '../lib/api'
import { Upload, FileText, Download, RefreshCw, Search, FileUp, X, Image, Copy, CheckCircle2, Eye, EyeOff, Anchor, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export default function ChecklistScanner() {
  const [file, setFile] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [formData, setFormData] = useState(null)
  const [rawText, setRawText] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [shipmentType, setShipmentType] = useState('')
  const [logo, setLogo] = useState(null)
  const [showRawPanel, setShowRawPanel] = useState(true)
  const [copied, setCopied] = useState(false)
  const [isSeaChecked, setIsSeaChecked] = useState(false)
  const [isAirChecked, setIsAirChecked] = useState(false)
  const [detectedShipmentType, setDetectedShipmentType] = useState('')
  const fileInputRef = useRef(null)
  const pdfRef = useRef(null)

  const isSeaShipment = shipmentType === 'Sea FCL' || shipmentType === 'Sea LCL' || shipmentType === 'Sea'

  useEffect(() => {
    const savedLogo = localStorage.getItem('pas_checklist_logo')
    if (savedLogo) setLogo(savedLogo)
  }, [])

  const handleDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && (f.type === 'application/pdf' || f.name.endsWith('.pdf'))) setFile(f) }
  const handleDragOver = (e) => { e.preventDefault() }
  const handleFileSelect = (e) => { const f = e.target.files[0]; if (f) setFile(f) }
  const handleLogoUpload = (e) => {
    const f = e.target.files[0]; if (!f) return
    const reader = new FileReader()
    reader.onload = (event) => { setLogo(event.target.result); localStorage.setItem('pas_checklist_logo', event.target.result) }
    reader.readAsDataURL(f)
  }

  const handleScan = async () => {
    if (!file) return; setScanning(true)
    try {
      const fd = new FormData(); fd.append('checklist', file)
      const res = await api.post('/checklist/scan', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setFormData(res.data.data)
      setRawText(res.data.rawText || '')
      setShowRawPanel(true)
      
      if (res.data.data && res.data.data.shipmentType) {
        const detected = res.data.data.shipmentType
        setDetectedShipmentType(detected)
        if (detected === 'Sea') {
          setShipmentType('Sea FCL')
          setIsSeaChecked(true)
          setIsAirChecked(false)
        } else if (detected === 'Air') {
          setShipmentType('Air')
          setIsAirChecked(true)
          setIsSeaChecked(false)
        }
      }
    } catch (err) { alert('Failed to scan PDF.') }
    setScanning(false)
  }

  const updateField = (field, value) => {
    setFormData((prev) => { const u = { ...prev }; u[field] = value; return u })
  }

  const copyRawText = () => {
    navigator.clipboard.writeText(rawText).then(() => {
      setCopied(true); setTimeout(() => { setCopied(false) }, 2000)
    })
  }

  const handleDownload = async () => {
    if (!pdfRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(pdfRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 794,
        height: 1123,
        onclone: (clonedDoc) => {
          const element = clonedDoc.getElementById('checklist-print-content')
          if (element) {
            element.style.display = 'block'
          }
        }
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = 210
      // FIX: Changed const to let so we can reassign if needed
      let pdfHeight = (canvas.height * pdfWidth) / canvas.width
      if (pdfHeight > 297) pdfHeight = 297
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save('PAS_Checklist_' + (F('referenceNumber') || 'Report') + '.pdf')
    } catch (err) {
      console.error('PDF generation error:', err)
      alert('Failed to generate PDF. Please try again.')
    }
    setDownloading(false)
  }

  const handleReset = () => { setFile(null); setFormData(null); setRawText(''); setShipmentType(''); setIsSeaChecked(false); setIsAirChecked(false); setDetectedShipmentType(''); if (fileInputRef.current) fileInputRef.current.value = '' }

  const F = (key) => (formData && formData[key]) || ''
  const U = (key) => (e) => { updateField(key, e.target.value) }

  // ── SIMPLIFIED SF FUNCTION ──
  const SF = (label, key) => {
    const val = F(key)
    const isBoeSb = key === 'boeSbNo'
    const isBoeSbDate = key === 'boeSbDate'
    const hasBoeNo = F('boeSbNo')
    
    if (isBoeSbDate && !hasBoeNo) {
      return (
        <div className="mb-2">
          <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: '#666' }}>{label}</label>
          <input
            type="text"
            value=""
            onChange={U(key)}
            placeholder="Waiting for BOE/SB Number"
            className="w-full px-3 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400"
            style={{ borderColor: '#e5e7eb', color: '#9ca3af', background: '#f9fafb' }}
          />
          <span className="text-[9px] text-gray-400 font-semibold mt-0.5 block">⏳ Waiting for BOE/SB Number</span>
        </div>
      )
    }
    
    if (isBoeSb && !val) {
      return (
        <div className="mb-2">
          <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: '#666' }}>{label}</label>
          <input
            type="text"
            value={val}
            onChange={U(key)}
            placeholder="Will appear after filing"
            className="w-full px-3 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400"
            style={{ borderColor: '#e5e7eb', color: '#0a0a1a', background: '#fff' }}
          />
          <span className="text-[9px] text-gray-400 font-semibold mt-0.5 block">⏳ Not yet filed</span>
        </div>
      )
    }
    
    return (
      <div className="mb-2">
        <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: '#666' }}>{label}</label>
        <input
          type="text"
          value={val}
          onChange={U(key)}
          placeholder={'Enter ' + label.toLowerCase()}
          className="w-full px-3 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400"
          style={{ borderColor: val ? '#10b981' : '#e5e7eb', color: '#0a0a1a', background: val ? '#f0fdf4' : '#fff' }}
        />
        {val ? (
          <span className="text-[9px] text-emerald-600 font-semibold mt-0.5 block">✓ Auto-detected</span>
        ) : (
          <span className="text-[9px] text-amber-500 font-semibold mt-0.5 block">⚠ Manual entry needed</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
            <FileUp size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Scan & Fill Checklist</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="px-3 py-2 glass border rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-2" style={{ borderColor: 'var(--border-color)' }}>
            <Image size={14} /> {logo ? 'Logo ✓' : 'Add Logo'}
            <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
          </label>
          {formData ? (
            <button onClick={handleReset} className="px-3 py-2 glass border rounded-lg text-xs font-semibold" style={{ borderColor: 'var(--border-color)' }}>Clear</button>
          ) : null}
          {formData ? (
            <button onClick={handleDownload} disabled={downloading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors">
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {downloading ? 'Generating...' : 'Download PDF'}
            </button>
          ) : null}
        </div>
      </div>

      {!formData ? (
        <div
          className="glass rounded-xl border-2 border-dashed p-16 text-center cursor-pointer"
          style={{ borderColor: file ? '#6366f1' : 'var(--border-color)', minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => { fileInputRef.current && fileInputRef.current.click() }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
          {file ? (
            <>
              <FileText size={48} className="text-indigo-500 mb-4" />
              <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{file.name}</p>
              <button onClick={(e) => { e.stopPropagation(); handleScan() }} disabled={scanning} className="mt-4 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-xl flex items-center gap-2">
                {scanning ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                {scanning ? 'Scanning...' : 'Scan Checklist'}
              </button>
            </>
          ) : (
            <>
              <Upload size={48} className="text-indigo-400 mb-4" />
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Drop PDF Checklist Here</p>
              <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>or click to browse</p>
            </>
          )}
        </div>
      ) : null}

      {formData ? (
        <div>
          {/* SHIPMENT TYPE + TOGGLE */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: '#dbeafe', color: '#1e40af' }}>Shipment Type</div>
            <select
              value={shipmentType}
              onChange={(e) => {
                setShipmentType(e.target.value)
                if (e.target.value === 'Air') {
                  setIsAirChecked(true)
                  setIsSeaChecked(false)
                } else if (e.target.value === 'Sea FCL' || e.target.value === 'Sea LCL' || e.target.value === 'Sea') {
                  setIsSeaChecked(true)
                  setIsAirChecked(false)
                } else {
                  setIsAirChecked(false)
                  setIsSeaChecked(false)
                }
              }}
              className="px-3 py-2 border rounded-lg text-sm font-semibold"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--input-bg)' }}
            >
              <option value="">-- Select --</option>
              <option value="Air">✈ Air</option>
              <option value="Sea FCL">🚢 Sea FCL</option>
              <option value="Sea LCL">🚢 Sea LCL</option>
              <option value="Sea">🚢 Sea</option>
              <option value="Local Transport">🚛 Local Transport</option>
            </select>
            {detectedShipmentType ? (
              <span className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: '#d1fae5', color: '#065f46' }}>🔍 Detected: {detectedShipmentType}</span>
            ) : null}
            <button onClick={() => { setShowRawPanel(!showRawPanel) }} className="px-3 py-2 glass border rounded-lg text-xs font-semibold flex items-center gap-2" style={{ borderColor: 'var(--border-color)' }}>
              {showRawPanel ? <EyeOff size={14} /> : <Eye size={14} />}
              {showRawPanel ? 'Hide Raw Text' : 'Show Raw Text'}
            </button>
          </div>

          {/* FORM + RAW TEXT */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1" style={{ maxHeight: '80vh', overflow: 'auto', paddingRight: '8px' }}>
              {SF('Reference Number', 'referenceNumber')}
              {SF('Job Order No', 'jobOrderNo')}
              {SF('Job Order Date', 'jobOrderDate')}
              {SF('BOE/SB Number', 'boeSbNo')}
              {SF('BOE/SB Date', 'boeSbDate')}
              {SF('Shipment Mode', 'shipmentMode')}
              {SF('Location / Filing Port', 'location')}
              {SF('Importer Name', 'importerName')}
              {SF('Exporter Name', 'exporterName')}
              {SF('Supplier Name', 'supplierName')}
              {SF('MAWB / MBL Number', 'mawbMblNo')}
              {SF('MAWB / MBL Date', 'mawbMblDate')}
              {SF('HAWB / HBL Number', 'hawbHblNo')}
              {SF('HAWB / HBL Date', 'hawbHblDate')}
              {SF('Number of Packages', 'noOfPackages')}
              {SF('Gross Weight', 'grossWeight')}
              {SF('Port of Discharge', 'portOfDischarge')}
              {SF('Port of Destination', 'portOfDestination')}
              {SF('Invoice Number', 'invoiceNo')}
              {SF('Invoice Date', 'invoiceDate')}
              
              {isSeaShipment ? (
                <div className="mb-2 mt-3">
                  <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <Anchor size={14} style={{ color: '#1d4ed8' }} />
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#1d4ed8' }}>Sea Shipment Details</span>
                  </div>
                  {SF('Gateway IGM No', 'gatewayIgmNo')}
                  {SF('Gateway IGM Date', 'gatewayIgmDate')}
                  {SF('IGM No', 'igmNo')}
                  {SF('IGM Date', 'igmDate')}
                  {SF('Local IGM No', 'localIgmNo')}
                  {SF('Local IGM Date', 'localIgmDate')}
                  {SF('Container No', 'containerNo')}
                </div>
              ) : null}
              
              {SF('Delivery Order Date', 'deliveryOrderDate')}
              {SF('OCC Date', 'occDate')}
              {SF('Gate Pass Date', 'gatePassDate')}
              {SF('Marks & Nos', 'remarks')}
              {SF('GSTIN / Additional Info', 'additionalRemarks')}
            </div>
            {showRawPanel ? (
              <div className="glass rounded-xl border p-4" style={{ borderColor: 'var(--glass-border)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>📄 Extracted Raw Text</h3>
                  <button onClick={copyRawText} className="px-3 py-1.5 glass border rounded-lg text-xs font-semibold flex items-center gap-1.5" style={{ borderColor: 'var(--border-color)' }}>
                    {copied ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    {copied ? 'Copied!' : 'Copy All'}
                  </button>
                </div>
                <div className="flex-1 overflow-auto rounded-lg p-3" style={{ background: '#f8f9fa', fontSize: '12px', lineHeight: '1.6', color: '#333', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid #e5e7eb' }}>
                  {rawText || 'No text extracted'}
                </div>
                <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>💡 Tip: Copy values from the raw text and paste into empty fields on the left.</p>
              </div>
            ) : null}
          </div>

          {/* ─── PRINT LAYOUT ─── */}
          <div
            id="checklist-print-content"
            ref={pdfRef}
            style={{
              position: 'absolute',
              left: '-9999px',
              top: 0,
              width: '794px',
              height: '1123px',
              background: '#ffffff',
              fontFamily: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
              padding: '24px 32px',
              boxSizing: 'border-box',
              overflow: 'hidden'
            }}
          >
            {/* WATERMARK LOGO */}
            {logo ? (
              <img
                src={logo}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  opacity: 0.12,
                  zIndex: 0,
                  width: '500px',
                  height: 'auto',
                  maxHeight: '700px',
                  objectFit: 'contain',
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
              />
            ) : null}

            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* HEADER */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                  borderBottom: '3px solid #0a0a1a',
                  paddingBottom: '10px'
                }}
              >
                {/* LOGO LEFT */}
                <div
                  style={{
                    flexShrink: 0,
                    width: '80px',
                    height: '80px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt="PAS Logo"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '75px',
                        objectFit: 'contain',
                        display: 'block'
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        fontSize: '28px',
                        fontWeight: '900',
                        color: '#0a0a1a',
                        letterSpacing: '2px',
                        fontFamily: '"Inter", sans-serif'
                      }}
                    >
                      PAS
                    </div>
                  )}
                </div>

                {/* COMPANY DETAILS CENTER */}
                <div
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '0 10px'
                  }}
                >
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: '900',
                      color: '#0a0a1a',
                      letterSpacing: '1.5px',
                      fontFamily: '"Inter", sans-serif',
                      marginBottom: '3px',
                      textTransform: 'uppercase'
                    }}
                  >
                    PAS FREIGHT SERVICES PVT LTD
                  </div>
                  <div
                    style={{
                      fontSize: '9px',
                      color: '#4b5563',
                      lineHeight: '1.5',
                      fontWeight: '600',
                      letterSpacing: '0.5px',
                      fontFamily: '"Inter", sans-serif'
                    }}
                  >
                    SITE NO:171, ARKAVATHEY LAYOUT 7TH BLOCK, SY NO.90/3, JAKKUR-BDA, BANGALORE -560064
                  </div>
                  <div
                    style={{
                      fontSize: '9px',
                      color: '#4b5563',
                      lineHeight: '1.5',
                      fontWeight: '600',
                      letterSpacing: '0.5px',
                      fontFamily: '"Inter", sans-serif'
                    }}
                  >
                    LANDLINE: +91 80-43722701  |  WWW.PASFREIGHT.COM
                  </div>
                </div>

                {/* DATE ON RIGHT SIDE */}
                <div
                  style={{
                    flexShrink: 0,
                    textAlign: 'right',
                    paddingLeft: '10px',
                    borderLeft: '2px solid #e5e7eb'
                  }}
                >
                  <div
                    style={{
                      fontSize: '9px',
                      fontWeight: '700',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontFamily: '"Inter", sans-serif',
                      marginBottom: '2px'
                    }}
                  >
                    DATE
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: '800',
                      color: '#0a0a1a',
                      fontFamily: '"Inter", sans-serif'
                    }}
                  >
                    {new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              </div>

              {/* OFFICE DOCKET TITLE */}
              <div
                style={{
                  borderTop: '3px solid #0a0a1a',
                  borderBottom: '3px solid #0a0a1a',
                  padding: '8px 0',
                  marginBottom: '10px',
                  textAlign: 'center'
                }}
              >
                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: '900',
                    color: '#0a0a1a',
                    letterSpacing: '6px',
                    textTransform: 'uppercase',
                    fontFamily: '"Inter", sans-serif'
                  }}
                >
                  OFFICE DOCKET
                </div>
              </div>

              {/* REFERENCE NUMBER - FULL WIDTH */}
              <div
                style={{
                  display: 'flex',
                  borderBottom: '1.5px solid #e5e7eb',
                  padding: '4px 0',
                  alignItems: 'center',
                  marginBottom: '2px'
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: '900',
                    color: '#0a0a1a',
                    width: '160px',
                    flexShrink: 0,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    fontFamily: '"Inter", sans-serif'
                  }}
                >
                  REFERENCE NUMBER
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: '800',
                    color: '#0a0a1a',
                    flex: 1,
                    paddingLeft: '10px',
                    fontFamily: '"Inter", sans-serif'
                  }}
                >
                  {F('referenceNumber') || '_______________________'}
                </div>
              </div>

              {/* ALL FIELDS */}
              <div
                style={{
                  fontSize: '0',
                  fontFamily: '"Inter", sans-serif'
                }}
              >
                {(() => {
                  const rows = []
                  
                  const FieldRow = (label, value, dateLabel, dateValue) => {
                    const displayValue = value || '_______________________'
                    const displayDate = dateValue || '__________'
                    
                    rows.push(
                      <div
                        key={label + rows.length}
                        style={{
                          display: 'flex',
                          borderBottom: '0.8px solid #e5e7eb',
                          padding: '3.5px 0',
                          alignItems: 'center',
                          minHeight: '22px'
                        }}
                      >
                        <div
                          style={{
                            fontSize: '10px',
                            fontWeight: '900',
                            color: '#0a0a1a',
                            width: '145px',
                            flexShrink: 0,
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            fontFamily: '"Inter", sans-serif'
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: '800',
                            color: '#0a0a1a',
                            flex: 1,
                            paddingLeft: '8px',
                            fontFamily: '"Inter", sans-serif',
                            letterSpacing: '0.3px'
                          }}
                        >
                          {displayValue}
                        </div>
                        {dateLabel ? (
                          <div
                            style={{
                              fontSize: '9px',
                              fontWeight: '800',
                              color: '#6b7280',
                              marginLeft: '4px',
                              textTransform: 'uppercase',
                              fontFamily: '"Inter", sans-serif'
                            }}
                          >
                            {dateLabel}:
                          </div>
                        ) : null}
                        {dateLabel ? (
                          <div
                            style={{
                              fontSize: '10px',
                              fontWeight: '800',
                              color: '#0a0a1a',
                              marginLeft: '2px',
                              minWidth: '70px',
                              fontFamily: '"Inter", sans-serif'
                            }}
                          >
                            {displayDate}
                          </div>
                        ) : null}
                      </div>
                    )
                  }

                  const SectionTitle = (title) => {
                    rows.push(
                      <div
                        key={'section-' + title + rows.length}
                        style={{
                          background: '#0a0a1a',
                          color: '#ffffff',
                          textAlign: 'center',
                          padding: '4px 0',
                          margin: '4px 0',
                          fontSize: '10px',
                          fontWeight: '900',
                          letterSpacing: '3px',
                          textTransform: 'uppercase',
                          fontFamily: '"Inter", sans-serif'
                        }}
                      >
                        {title}
                      </div>
                    )
                  }

                  // ALL FIELDS IN EXACT ORDER
                  // Shipment Mode with checkboxes
                  rows.push(
                    <div
                      key="shipment-mode"
                      style={{
                        display: 'flex',
                        borderBottom: '0.8px solid #e5e7eb',
                        padding: '3.5px 0',
                        alignItems: 'center',
                        minHeight: '22px'
                      }}
                    >
                      <div
                        style={{
                          fontSize: '10px',
                          fontWeight: '900',
                          color: '#0a0a1a',
                          width: '145px',
                          flexShrink: 0,
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase',
                          fontFamily: '"Inter", sans-serif'
                        }}
                      >
                        SHIPMENT MODE
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '20px',
                          paddingLeft: '8px',
                          flex: 1
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '10px',
                            fontWeight: '900',
                            color: '#0a0a1a',
                            fontFamily: '"Inter", sans-serif'
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: '14px',
                              height: '14px',
                              border: '2px solid #0a0a1a',
                              background: isAirChecked ? '#0a0a1a' : 'transparent',
                              textAlign: 'center',
                              lineHeight: '12px',
                              fontSize: '9px',
                              color: isAirChecked ? '#ffffff' : '#0a0a1a'
                            }}
                          >
                            {isAirChecked ? '✓' : ''}
                          </span>
                          BY AIR
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '10px',
                            fontWeight: '900',
                            color: '#0a0a1a',
                            fontFamily: '"Inter", sans-serif'
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: '14px',
                              height: '14px',
                              border: '2px solid #0a0a1a',
                              background: isSeaChecked ? '#0a0a1a' : 'transparent',
                              textAlign: 'center',
                              lineHeight: '12px',
                              fontSize: '9px',
                              color: isSeaChecked ? '#ffffff' : '#0a0a1a'
                            }}
                          >
                            {isSeaChecked ? '✓' : ''}
                          </span>
                          BY SEA
                        </div>
                      </div>
                    </div>
                  )

                  FieldRow('IMPORTER NAME', F('importerName'))
                  FieldRow('EXPORTER NAME', F('exporterName'))
                  FieldRow('SUPPLIER NAME', F('supplierName'))
                  FieldRow('LOCATION', F('location'))
                  FieldRow('JOB ORDER NO', F('jobOrderNo'), 'DATE', F('jobOrderDate'))
                  
                  // BOE/SB NUMBER - ONLY SHOW DATE IF NUMBER EXISTS
                  ;(() => {
                    const boeNo = F('boeSbNo')
                    const boeDate = F('boeSbDate')
                    FieldRow('BOE/SB NUMBER', boeNo, boeNo ? 'DATE' : null, boeNo ? boeDate : '')
                  })()
                  
                  FieldRow('MAWB/MBL NUMBER', F('mawbMblNo'), 'DATE', F('mawbMblDate'))
                  FieldRow('HAWB/HBL NUMBER', F('hawbHblNo'), 'DATE', F('hawbHblDate'))
                  FieldRow('NO OF PACKAGES', F('noOfPackages'))
                  FieldRow('GROSS WEIGHT', F('grossWeight'))
                  
                  if (isSeaShipment) {
                    FieldRow('IGM NUMBER & DT', F('igmNo'), 'DATE', F('igmDate'))
                    FieldRow('GATEWAY IGM', F('gatewayIgmNo'), 'DATE', F('gatewayIgmDate'))
                    FieldRow('LOCAL IGM', F('localIgmNo'), 'DATE', F('localIgmDate'))
                    FieldRow('CONTAINER NO', F('containerNo'))
                  }
                  
                  FieldRow('PORT OF DISCHARGE', F('portOfDischarge'))
                  FieldRow('PORT OF DESTINATION', F('portOfDestination'))
                  FieldRow('CARGO ARRIVAL NOTICE', '', 'DATE', '')
                  FieldRow('DELIVERY ORDER ISSUED DT', F('deliveryOrderDate'))
                  FieldRow('OCC DATE', F('occDate'))
                  FieldRow('GATE PASS DATE', F('gatePassDate'))
                  FieldRow('REMARKS / CONTAINER NO', F('remarks'))
                  
                  SectionTitle('FOR ACCOUNTS PURPOSE')
                  
                  FieldRow('AGENT DEBIT NOTE', 'PAS FREIGHT SERVICES')
                  FieldRow('BILLING CURRENCY', F('billingCurrency'))
                  FieldRow('BILL NUMBER', F('billNo'), 'DATE', F('billDate'))
                  FieldRow('BILL TO', F('billTo'))
                  FieldRow('DOCKET NUMBER', F('docketNo'), 'DATE', F('docketDate'))
                  FieldRow('REMARKS', '')
                  FieldRow('GSTIN', '29AALCP2369R1ZD')

                  return rows
                })()}
              </div>

              {/* FOOTER */}
              <div
                style={{
                  marginTop: '8px',
                  textAlign: 'center',
                  fontSize: '8px',
                  color: '#9ca3af',
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: '6px',
                  fontWeight: '700',
                  fontFamily: '"Inter", sans-serif',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase'
                }}
              >
                PAGE 1 OF 1  •  GENERATED BY PAS CHECKLIST SCANNER
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}