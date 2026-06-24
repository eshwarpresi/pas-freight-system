import React, { useState, useRef, useEffect } from 'react'
import api from '../lib/api'
import { Upload, FileText, Download, RefreshCw, Search, FileUp, X, Image, Copy, CheckCircle2, Eye, EyeOff } from 'lucide-react'

export default function ChecklistScanner() {
  var [file, setFile] = useState(null)
  var [scanning, setScanning] = useState(false)
  var [formData, setFormData] = useState(null)
  var [rawText, setRawText] = useState('')
  var [downloading, setDownloading] = useState(false)
  var [shipmentType, setShipmentType] = useState('')
  var [logo, setLogo] = useState(null)
  var [showRawPanel, setShowRawPanel] = useState(true)
  var [copied, setCopied] = useState(false)
  var fileInputRef = useRef(null)

  useEffect(function() {
    var savedLogo = localStorage.getItem('pas_checklist_logo')
    if (savedLogo) setLogo(savedLogo)
  }, [])

  function handleDrop(e) { e.preventDefault(); var f = e.dataTransfer.files[0]; if (f && (f.type === 'application/pdf' || f.name.endsWith('.pdf'))) setFile(f) }
  function handleDragOver(e) { e.preventDefault() }
  function handleFileSelect(e) { var f = e.target.files[0]; if (f) setFile(f) }
  function handleLogoUpload(e) {
    var f = e.target.files[0]; if (!f) return
    var reader = new FileReader()
    reader.onload = function(event) { setLogo(event.target.result); localStorage.setItem('pas_checklist_logo', event.target.result) }
    reader.readAsDataURL(f)
  }

  async function handleScan() {
    if (!file) return; setScanning(true)
    try {
      var fd = new FormData(); fd.append('checklist', file)
      var res = await api.post('/checklist/scan', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setFormData(res.data.data); setRawText(res.data.rawText || '')
      setShowRawPanel(true)
    } catch (err) { alert('Failed to scan PDF.') }
    setScanning(false)
  }

  function updateField(field, value) {
    setFormData(function(prev) { var u = {}; for (var k in prev) u[k] = prev[k]; u[field] = value; return u })
  }

  function copyRawText() {
    navigator.clipboard.writeText(rawText).then(function() {
      setCopied(true); setTimeout(function() { setCopied(false) }, 2000)
    })
  }

  function handleDownload() {
    setDownloading(true)
    var style = document.createElement('style')
    style.id = 'pdf-print-style'
    style.textContent = '@media print{@page{size:A4;margin:6mm 8mm}body{visibility:hidden!important;background:#fff!important}#checklist-print,#checklist-print *{visibility:visible!important}#checklist-print{position:absolute;left:0;top:0;width:100%;background:#fff!important;font-family:"Segoe UI",Arial,sans-serif!important;color:#0a0a1a!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.watermark-img{position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;opacity:0.04!important;z-index:0!important;pointer-events:none!important;width:160mm!important;height:230mm!important;object-fit:contain!important}.print-header-table{width:100%!important;border-collapse:collapse!important;margin-bottom:4mm!important}.print-header-table td{border:2pt solid #0a0a1a!important;padding:3mm!important;text-align:center!important;vertical-align:middle!important}.print-brand{font-size:13pt!important;font-weight:900!important;color:#0a0a1a!important;letter-spacing:1pt!important}.print-addr{font-size:7pt!important;color:#333!important;line-height:1.4!important}.print-gst{font-size:7pt!important;font-weight:700!important;color:#0a0a1a!important}.print-st-label{font-size:6pt!important;font-weight:700!important;text-transform:uppercase!important}.print-st-select{width:100%!important;padding:3pt!important;border:1pt solid #0a0a1a!important;font-size:8pt!important;font-weight:700!important;text-align:center!important;background:#fff!important}.print-st-badge{padding:2pt 8pt!important;background:#0a0a1a!important;color:#fff!important;font-size:7pt!important;font-weight:700!important;margin-top:2mm!important;display:inline-block!important}.print-title{background:#0a0a1a!important;color:#fff!important;text-align:center!important;padding:2mm!important;margin-bottom:3mm!important;font-size:10pt!important;font-weight:900!important;letter-spacing:3pt!important;text-transform:uppercase!important}.print-title-sub{font-size:6pt!important;opacity:0.8!important;font-weight:400!important;letter-spacing:0!important}.print-row{display:flex!important;border-bottom:0.5pt solid #ddd!important;padding:3pt 0!important;align-items:center!important;min-height:22pt!important}.print-row-label{font-size:7pt!important;font-weight:700!important;color:#555!important;text-transform:uppercase!important;width:30%!important;flex-shrink:0!important}.print-row-value{font-size:9pt!important;font-weight:600!important;color:#0a0a1a!important;flex:1!important;word-wrap:break-word!important}.print-row-date-label{font-size:6pt!important;font-weight:700!important;color:#555!important;width:8%!important;text-align:right!important;padding-right:4pt!important}.print-row-date-value{font-size:8pt!important;font-weight:600!important;color:#444!important;width:16%!important}.print-input{border:none!important;background:transparent!important;width:100%!important;font-size:inherit!important;font-weight:inherit!important;color:inherit!important;outline:none!important;padding:2pt 0!important;font-family:inherit!important;word-wrap:break-word!important}.print-footer{text-align:center!important;font-size:6pt!important;color:#999!important;margin-top:6mm!important}}'
    document.head.appendChild(style)
    window.print()
    setTimeout(function() { var el = document.getElementById('pdf-print-style'); if(el) el.remove(); setDownloading(false) }, 500)
  }

  function handleReset() { setFile(null); setFormData(null); setRawText(''); setShipmentType(''); if (fileInputRef.current) fileInputRef.current.value = '' }

  var F = function(key) { return (formData[key] || '') }
  var U = function(key) { return function(e) { updateField(key, e.target.value) } }
  var IN = function(key, cls) { return React.createElement('input', { type: 'text', value: F(key), onChange: U(key), className: cls || 'print-input', style: { border: 'none', background: 'transparent', width: '100%', fontSize: 'inherit', fontWeight: '600', color: '#0a0a1a', outline: 'none', padding: '4px 0', fontFamily: 'inherit' } }) }

  var SF = function(label, key) {
    var val = F(key)
    return React.createElement('div', { className: 'mb-2' },
      React.createElement('label', { className: 'text-[10px] font-bold uppercase tracking-wider mb-1 block', style: { color: '#666' } }, label),
      React.createElement('input', {
        type: 'text', value: val, onChange: U(key),
        placeholder: 'Enter ' + label.toLowerCase(),
        className: 'w-full px-3 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400',
        style: { borderColor: val ? '#10b981' : '#e5e7eb', color: '#0a0a1a', background: val ? '#f0fdf4' : '#fff' }
      }),
      val ? React.createElement('span', { className: 'text-[9px] text-emerald-600 font-semibold mt-0.5 block' }, '✓ Auto-detected') : React.createElement('span', { className: 'text-[9px] text-amber-500 font-semibold mt-0.5 block' }, '⚠ Manual entry needed')
    )
  }

  var PR = function(label, key) {
    return React.createElement('div', { className: 'print-row' },
      React.createElement('div', { className: 'print-row-label' }, label),
      React.createElement('div', { className: 'print-row-value' }, IN(key))
    )
  }
  var PRD = function(label, key, dateKey) {
    return React.createElement('div', { className: 'print-row' },
      React.createElement('div', { className: 'print-row-label' }, label),
      React.createElement('div', { className: 'print-row-value' }, IN(key)),
      React.createElement('div', { className: 'print-row-date-label' }, 'DATE'),
      React.createElement('div', { className: 'print-row-date-value' }, IN(dateKey))
    )
  }

  return React.createElement('div', { className: 'space-y-4' },
    // HEADER
    React.createElement('div', { className: 'flex items-center justify-between gap-4 print:hidden' },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('div', { className: 'w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg' }, React.createElement(FileUp, { size: 18, className: 'text-white' })),
        React.createElement('div', null, React.createElement('h1', { className: 'text-2xl font-bold', style: { color: 'var(--text-primary)' } }, 'Scan & Fill Checklist'))
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('label', { className: 'px-3 py-2 glass border rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-2', style: { borderColor: 'var(--border-color)' } }, React.createElement(Image, { size: 14 }), logo ? 'Logo ✓' : 'Add Logo', React.createElement('input', { type: 'file', accept: 'image/*', onChange: handleLogoUpload, style: { display: 'none' } })),
        formData ? React.createElement('button', { onClick: handleReset, className: 'px-3 py-2 glass border rounded-lg text-xs font-semibold', style: { borderColor: 'var(--border-color)' } }, 'Clear') : null,
        formData ? React.createElement('button', { onClick: handleDownload, className: 'px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-lg flex items-center gap-2' }, React.createElement(Download, { size: 14 }), 'Print PDF') : null
      )
    ),

    !formData ? React.createElement('div', {
      className: 'glass rounded-xl border-2 border-dashed p-16 text-center cursor-pointer print:hidden',
      style: { borderColor: file ? '#6366f1' : 'var(--border-color)', minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
      onDrop: handleDrop, onDragOver: handleDragOver, onClick: function() { fileInputRef.current && fileInputRef.current.click() }
    },
      React.createElement('input', { ref: fileInputRef, type: 'file', accept: '.pdf', onChange: handleFileSelect, style: { display: 'none' } }),
      file ? React.createElement(React.Fragment, null,
        React.createElement(FileText, { size: 48, className: 'text-indigo-500 mb-4' }),
        React.createElement('p', { className: 'text-base font-semibold', style: { color: 'var(--text-primary)' } }, file.name),
        React.createElement('button', { onClick: function(e) { e.stopPropagation(); handleScan() }, disabled: scanning, className: 'mt-4 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-xl flex items-center gap-2' },
          scanning ? React.createElement(RefreshCw, { size: 16, className: 'animate-spin' }) : React.createElement(Search, { size: 16 }), scanning ? 'Scanning...' : 'Scan Checklist')
      ) : React.createElement(React.Fragment, null,
        React.createElement(Upload, { size: 48, className: 'text-indigo-400 mb-4' }),
        React.createElement('p', { className: 'text-lg font-bold', style: { color: 'var(--text-primary)' } }, 'Drop PDF Checklist Here'),
        React.createElement('p', { className: 'text-sm mt-2', style: { color: 'var(--text-muted)' } }, 'or click to browse')
      )
    ) : null,

    formData ? React.createElement('div', { className: 'print:hidden' },
      // SHIPMENT TYPE + RAW TEXT TOGGLE
      React.createElement('div', { className: 'flex items-center gap-3 mb-4 flex-wrap' },
        React.createElement('div', { className: 'px-3 py-1.5 rounded-full text-xs font-bold', style: { background: '#dbeafe', color: '#1e40af' } }, 'Shipment Type'),
        React.createElement('select', { value: shipmentType, onChange: function(e) { setShipmentType(e.target.value) }, className: 'px-3 py-2 border rounded-lg text-sm font-semibold' },
          React.createElement('option', { value: '' }, '-- Select --'),
          React.createElement('option', { value: 'Air' }, '✈ Air'), React.createElement('option', { value: 'Sea FCL' }, '🚢 Sea FCL'),
          React.createElement('option', { value: 'Sea LCL' }, '🚢 Sea LCL'), React.createElement('option', { value: 'Local Transport' }, '🚛 Local Transport')
        ),
        React.createElement('button', { onClick: function() { setShowRawPanel(!showRawPanel) }, className: 'px-3 py-2 glass border rounded-lg text-xs font-semibold flex items-center gap-2', style: { borderColor: 'var(--border-color)' } },
          showRawPanel ? React.createElement(EyeOff, { size: 14 }) : React.createElement(Eye, { size: 14 }),
          showRawPanel ? 'Hide Raw Text' : 'Show Raw Text'
        )
      ),

      // FORM + RAW TEXT SIDE BY SIDE
      React.createElement('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-4' },
        // LEFT: FORM FIELDS
        React.createElement('div', { className: 'space-y-1', style: { maxHeight: '80vh', overflow: 'auto', paddingRight: '8px' } },
          SF('Reference Number', 'referenceNumber'),
          SF('Job Order No', 'jobOrderNo'), SF('Job Order Date', 'jobOrderDate'),
          SF('BOE/SB Number', 'boeSbNo'), SF('BOE/SB Date', 'boeSbDate'),
          SF('Shipment Mode', 'shipmentMode'), SF('Location / Filing Port', 'location'),
          SF('Importer Name', 'importerName'), SF('Exporter Name', 'exporterName'), SF('Supplier Name', 'supplierName'),
          SF('MAWB / MBL Number', 'mawbMblNo'), SF('MAWB / MBL Date', 'mawbMblDate'),
          SF('HAWB / HBL Number', 'hawbHblNo'), SF('HAWB / HBL Date', 'hawbHblDate'),
          SF('Number of Packages', 'noOfPackages'), SF('Gross Weight', 'grossWeight'),
          SF('Port of Discharge', 'portOfDischarge'), SF('Port of Destination', 'portOfDestination'),
          SF('Invoice Number', 'invoiceNo'), SF('Invoice Date', 'invoiceDate'),
          SF('Invoice Value / Currency', 'billingCurrency'), SF('Freight Charges', 'billNo'), SF('Exchange Rate', 'billDate'),
          SF('CHA / Agent', 'agentDebitNote'), SF('Delivery Order Date', 'deliveryOrderDate'),
          SF('OCC Date', 'occDate'), SF('Gate Pass Date', 'gatePassDate'),
          SF('Marks & Nos', 'remarks'), SF('GSTIN / Additional Info', 'additionalRemarks')
        ),
        // RIGHT: RAW TEXT PANEL
        showRawPanel ? React.createElement('div', { className: 'glass rounded-xl border p-4', style: { borderColor: 'var(--glass-border)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' } },
          React.createElement('div', { className: 'flex items-center justify-between mb-3' },
            React.createElement('h3', { className: 'text-sm font-bold', style: { color: 'var(--text-primary)' } }, '📄 Extracted Raw Text'),
            React.createElement('button', { onClick: copyRawText, className: 'px-3 py-1.5 glass border rounded-lg text-xs font-semibold flex items-center gap-1.5', style: { borderColor: 'var(--border-color)' } },
              copied ? React.createElement(CheckCircle2, { size: 12, className: 'text-emerald-500' }) : React.createElement(Copy, { size: 12 }),
              copied ? 'Copied!' : 'Copy All'
            )
          ),
          React.createElement('div', { className: 'flex-1 overflow-auto rounded-lg p-3', style: { background: '#f8f9fa', fontSize: '12px', lineHeight: '1.6', color: '#333', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid #e5e7eb' } }, rawText || 'No text extracted'),
          React.createElement('p', { className: 'text-[10px] mt-2', style: { color: 'var(--text-muted)' } }, '💡 Tip: Copy values from the raw text and paste into empty fields on the left.')
        ) : null
      ),

      // PRINT LAYOUT
      React.createElement('div', { id: 'checklist-print', className: 'hidden print:block', style: { background: '#fff', maxWidth: '190mm', margin: '0 auto', fontFamily: '"Segoe UI", Arial, sans-serif', color: '#0a0a1a', padding: '0', position: 'relative' } },
        logo ? React.createElement('img', { src: logo, className: 'watermark-img', style: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: '0.04', zIndex: '0', pointerEvents: 'none', width: '160mm', height: '230mm', objectFit: 'contain' } }) : null,
        React.createElement('div', { style: { position: 'relative', zIndex: '1' } },
          React.createElement('table', { className: 'print-header-table' },
            React.createElement('tbody', null,
              React.createElement('tr', null,
                React.createElement('td', { style: { width: '20%' } }, logo ? React.createElement('img', { src: logo, alt: 'Logo', style: { maxWidth: '100%', maxHeight: '18mm', objectFit: 'contain' } }) : React.createElement('div', { className: 'print-brand', style: { fontSize: '18pt' } }, 'PAS')),
                React.createElement('td', null, React.createElement('div', { className: 'print-brand' }, 'PAS FREIGHT SERVICES PVT LTD'), React.createElement('div', { className: 'print-addr' }, 'Site No 171, 1st Floor, 7th Block, Arkavathy Layout, Jakkur, Bengaluru - 560064'), React.createElement('div', { className: 'print-gst' }, 'GST No: 29AALCP2369R1ZD')),
                React.createElement('td', { style: { width: '16%' } }, React.createElement('div', { className: 'print-st-label', style: { marginBottom: '2mm' } }, 'Shipment Type'), React.createElement('select', { value: shipmentType, onChange: function(e) { setShipmentType(e.target.value) }, className: 'print-st-select' }, React.createElement('option', { value: '' }, '-- Select --'), React.createElement('option', { value: 'Air' }, 'AIR'), React.createElement('option', { value: 'Sea FCL' }, 'SEA FCL'), React.createElement('option', { value: 'Sea LCL' }, 'SEA LCL'), React.createElement('option', { value: 'Local Transport' }, 'LOCAL TRANSPORT')), shipmentType ? React.createElement('div', { className: 'print-st-badge' }, shipmentType) : null)
              )
            )
          ),
          React.createElement('div', { className: 'print-title' }, 'CHECKLIST REPORT', React.createElement('div', { className: 'print-title-sub' }, 'Date: ' + new Date().toLocaleDateString() + ' | Ref: ' + F('referenceNumber'))),
          PR('REFERENCE NUMBER', 'referenceNumber'), PRD('JOB ORDER NO', 'jobOrderNo', 'jobOrderDate'),
          PRD('BOE/SB NUMBER', 'boeSbNo', 'boeSbDate'), PR('SHIPMENT MODE', 'shipmentMode'),
          PR('LOCATION / FILING PORT', 'location'), PR('IMPORTER NAME', 'importerName'),
          PR('EXPORTER NAME', 'exporterName'), PR('SUPPLIER NAME', 'supplierName'),
          PRD('MAWB / MBL NUMBER', 'mawbMblNo', 'mawbMblDate'), PRD('HAWB / HBL NUMBER', 'hawbHblNo', 'hawbHblDate'),
          PR('NUMBER OF PACKAGES', 'noOfPackages'), PR('GROSS WEIGHT', 'grossWeight'),
          PR('PORT OF DISCHARGE', 'portOfDischarge'), PR('PORT OF DESTINATION', 'portOfDestination'),
          PRD('INVOICE NUMBER', 'invoiceNo', 'invoiceDate'), PR('INVOICE VALUE / CURRENCY', 'billingCurrency'),
          PR('FREIGHT CHARGES', 'billNo'), PR('EXCHANGE RATE', 'billDate'),
          PR('CHA / AGENT', 'agentDebitNote'), PR('DELIVERY ORDER DATE', 'deliveryOrderDate'),
          PR('OCC DATE', 'occDate'), PR('GATE PASS DATE', 'gatePassDate'),
          PR('MARKS & NOS', 'remarks'), PR('GSTIN / ADDITIONAL INFO', 'additionalRemarks'),
          React.createElement('div', { className: 'print-footer' }, 'PAS Freight Services Pvt Ltd • ' + new Date().toLocaleDateString() + ' • Generated by PAS Checklist Scanner')
        )
      )
    ) : null
  )
}