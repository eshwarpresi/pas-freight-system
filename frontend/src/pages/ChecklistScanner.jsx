import React, { useState, useRef, useEffect } from 'react'
import api from '../lib/api'
import {
  Upload, FileText, Download, RefreshCw, Search, FileUp,
  X, Image
} from 'lucide-react'

export default function ChecklistScanner() {
  var [file, setFile] = useState(null)
  var [scanning, setScanning] = useState(false)
  var [formData, setFormData] = useState(null)
  var [rawText, setRawText] = useState('')
  var [showRaw, setShowRaw] = useState(false)
  var [downloading, setDownloading] = useState(false)
  var [shipmentType, setShipmentType] = useState('')
  var [logo, setLogo] = useState(null)
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
    } catch (err) { alert('Failed to scan PDF.') }
    setScanning(false)
  }

  function updateField(field, value) {
    setFormData(function(prev) { var u = {}; for (var k in prev) u[k] = prev[k]; u[field] = value; return u })
  }

  function handleDownload() {
    setDownloading(true)
    var style = document.createElement('style')
    style.id = 'pdf-print-style'
    style.textContent = '@media print{@page{size:A4;margin:8mm 10mm}body{visibility:hidden!important;background:#fff!important}#checklist-print,#checklist-print *{visibility:visible!important}#checklist-print{position:absolute;left:0;top:0;width:100%;background:#fff!important;font-family:"Segoe UI",Arial,Helvetica,sans-serif!important;color:#1a1a2e!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.co-name{font-size:16pt!important;font-weight:900!important;color:#1a1a2e!important;letter-spacing:2pt!important}.co-addr{font-size:8pt!important;color:#444!important;line-height:1.6!important}.co-gst{font-size:8pt!important;font-weight:700!important;color:#1a1a2e!important}.st-label{font-size:7pt!important;font-weight:700!important;text-transform:uppercase!important;color:#1a1a2e!important}.st-select{width:100%!important;padding:4pt!important;border:1.5pt solid #1a1a2e!important;font-size:9pt!important;font-weight:700!important;text-align:center!important;background:#fff!important}.st-badge{padding:3pt 8pt!important;background:#1a1a2e!important;color:#fff!important;font-size:8pt!important;font-weight:700!important}.main-table{width:100%!important;border-collapse:collapse!important;margin-top:8pt!important}.main-table td{padding:5pt 8pt!important;border:1pt solid #ccc!important;font-size:9pt!important;vertical-align:middle!important}.main-table .lbl{background:#1a1a2e!important;color:#fff!important;font-weight:700!important;font-size:8pt!important;width:18%!important;white-space:nowrap!important}.main-table .val{width:15%!important}.main-table input{border:none!important;background:transparent!important;width:100%!important;font-size:9pt!important;color:#1a1a2e!important;font-weight:600!important;outline:none!important;padding:2pt 0!important;font-family:"Segoe UI",Arial,sans-serif!important}.main-table input::placeholder{color:#bbb!important}.sig-box{border:1.5pt solid #1a1a2e!important;padding:10pt 12pt!important;font-size:9pt!important}.sig-line{border-bottom:1pt solid #1a1a2e!important;width:60%!important;margin-top:20pt!important}.footer-text{text-align:center!important;font-size:7pt!important;color:#999!important;margin-top:10pt!important}}'
    document.head.appendChild(style)
    window.print()
    setTimeout(function() { var el = document.getElementById('pdf-print-style'); if(el) el.remove(); setDownloading(false) }, 500)
  }

  function handleReset() { setFile(null); setFormData(null); setRawText(''); setShipmentType(''); if (fileInputRef.current) fileInputRef.current.value = '' }

  function R(label1, key1, label2, key2, label3, key3) {
    return React.createElement('tr', null,
      React.createElement('td', { className: 'lbl' }, label1),
      React.createElement('td', { className: 'val' }, React.createElement('input', { type: 'text', value: (formData[key1] || ''), onChange: function(e) { updateField(key1, e.target.value) }, placeholder: '' })),
      React.createElement('td', { className: 'lbl' }, label2),
      React.createElement('td', { className: 'val' }, React.createElement('input', { type: 'text', value: (formData[key2] || ''), onChange: function(e) { updateField(key2, e.target.value) }, placeholder: '' })),
      React.createElement('td', { className: 'lbl' }, label3),
      React.createElement('td', { className: 'val' }, React.createElement('input', { type: 'text', value: (formData[key3] || ''), onChange: function(e) { updateField(key3, e.target.value) }, placeholder: '' }))
    )
  }

  function W(label1, key1, c1, label2, key2) {
    return React.createElement('tr', null,
      React.createElement('td', { className: 'lbl' }, label1),
      React.createElement('td', { colSpan: c1 || 5 }, React.createElement('input', { type: 'text', value: (formData[key1] || ''), onChange: function(e) { updateField(key1, e.target.value) }, placeholder: '' })),
      label2 ? React.createElement('td', { className: 'lbl' }, label2) : null,
      label2 ? React.createElement('td', { className: 'val' }, React.createElement('input', { type: 'text', value: (formData[key2] || ''), onChange: function(e) { updateField(key2, e.target.value) }, placeholder: '' })) : null
    )
  }

  return React.createElement('div', { className: 'space-y-6' },
    // SCREEN UI
    React.createElement('div', { className: 'flex items-center justify-between gap-4 print:hidden' },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('div', { className: 'w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg' }, React.createElement(FileUp, { size: 18, className: 'text-white' })),
        React.createElement('div', null,
          React.createElement('h1', { className: 'text-2xl font-bold', style: { color: 'var(--text-primary)' } }, 'Scan & Fill Checklist'),
          React.createElement('p', { className: 'text-xs', style: { color: 'var(--text-muted)' } }, 'Upload PDF → Auto-extract → Print')
        )
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('label', { className: 'px-3 py-2 glass border rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-2', style: { borderColor: 'var(--border-color)' } }, React.createElement(Image, { size: 14 }), logo ? 'Logo ✓' : 'Add Logo', React.createElement('input', { type: 'file', accept: 'image/*', onChange: handleLogoUpload, style: { display: 'none' } })),
        formData ? React.createElement('button', { onClick: handleReset, className: 'px-3 py-2 glass border rounded-lg text-xs font-semibold', style: { borderColor: 'var(--border-color)' } }, 'Clear') : null,
        formData ? React.createElement('button', { onClick: handleDownload, className: 'px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-lg flex items-center gap-2' }, React.createElement(Download, { size: 14 }), 'Print PDF') : null
      )
    ),

    !formData ? React.createElement('div', {
      className: 'glass rounded-xl border-2 border-dashed p-16 text-center cursor-pointer print:hidden',
      style: { borderColor: file ? '#6366f1' : 'var(--border-color)', minHeight: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
      onDrop: handleDrop, onDragOver: handleDragOver, onClick: function() { fileInputRef.current && fileInputRef.current.click() }
    },
      React.createElement('input', { ref: fileInputRef, type: 'file', accept: '.pdf', onChange: handleFileSelect, style: { display: 'none' } }),
      file ? React.createElement(React.Fragment, null,
        React.createElement(FileText, { size: 56, className: 'text-indigo-500 mb-4' }),
        React.createElement('p', { className: 'text-base font-semibold', style: { color: 'var(--text-primary)' } }, file.name),
        React.createElement('button', { onClick: function(e) { e.stopPropagation(); handleScan() }, disabled: scanning, className: 'mt-6 px-8 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-xl flex items-center gap-2' },
          scanning ? React.createElement(RefreshCw, { size: 18, className: 'animate-spin' }) : React.createElement(Search, { size: 18 }), scanning ? 'Scanning...' : 'Scan Checklist')
      ) : React.createElement(React.Fragment, null,
        React.createElement(Upload, { size: 56, className: 'text-indigo-400 mb-4' }),
        React.createElement('p', { className: 'text-lg font-bold', style: { color: 'var(--text-primary)' } }, 'Drop PDF Checklist Here'),
        React.createElement('p', { className: 'text-sm mt-2', style: { color: 'var(--text-muted)' } }, 'or click to browse')
      )
    ) : null,

    // ========== PRINT LAYOUT ==========
    formData ? React.createElement('div', { id: 'checklist-print', style: { background: '#fff', maxWidth: '190mm', margin: '0 auto', fontFamily: '"Segoe UI", Arial, Helvetica, sans-serif', color: '#1a1a2e', padding: '0' } },
      
      // HEADER
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', marginBottom: '6mm' } },
        React.createElement('tbody', null,
          React.createElement('tr', null,
            React.createElement('td', { style: { width: '22%', border: '2px solid #1a1a2e', padding: '3mm', textAlign: 'center', verticalAlign: 'middle' } },
              logo ? React.createElement('img', { src: logo, alt: 'Logo', style: { maxWidth: '100%', maxHeight: '20mm', objectFit: 'contain' } })
                : React.createElement('div', { className: 'co-name', style: { fontSize: '18pt' } }, 'PAS')
            ),
            React.createElement('td', { style: { border: '2px solid #1a1a2e', padding: '3mm', textAlign: 'center', verticalAlign: 'middle' } },
              React.createElement('div', { className: 'co-name' }, 'PAS FREIGHT SERVICES PVT LTD'),
              React.createElement('div', { className: 'co-addr' }, 'Site No 171, 1st Floor, 7th Block, Arkavathy Layout, Jakkur, Bengaluru - 560064'),
              React.createElement('div', { className: 'co-gst' }, 'GST No: 29AALCP2369R1ZD')
            ),
            React.createElement('td', { style: { width: '18%', border: '2px solid #1a1a2e', padding: '2mm', textAlign: 'center', verticalAlign: 'middle' } },
              React.createElement('div', { className: 'st-label', style: { marginBottom: '3mm' } }, 'Shipment Type'),
              React.createElement('select', { value: shipmentType, onChange: function(e) { setShipmentType(e.target.value) }, className: 'st-select' },
                React.createElement('option', { value: '' }, '-- Select --'),
                React.createElement('option', { value: 'Air' }, 'AIR'),
                React.createElement('option', { value: 'Sea FCL' }, 'SEA FCL'),
                React.createElement('option', { value: 'Sea LCL' }, 'SEA LCL'),
                React.createElement('option', { value: 'Local Transport' }, 'LOCAL TRANSPORT')
              ),
              shipmentType ? React.createElement('div', { className: 'st-badge', style: { marginTop: '3mm' } }, shipmentType) : null
            )
          )
        )
      ),

      // TITLE
      React.createElement('div', { style: { background: '#1a1a2e', color: '#fff', textAlign: 'center', padding: '4mm 0', marginBottom: '4mm' } },
        React.createElement('span', { style: { fontSize: '12pt', fontWeight: '900', letterSpacing: '4pt', textTransform: 'uppercase' } }, 'Checklist Report'),
        React.createElement('div', { style: { fontSize: '7pt', opacity: '0.8', marginTop: '1mm' } }, 'Date: ' + new Date().toLocaleDateString() + '  |  Ref: ' + (formData.referenceNumber || 'N/A'))
      ),

      // DATA TABLE
      React.createElement('table', { className: 'main-table' },
        React.createElement('tbody', null,
          R('Reference No', 'referenceNumber', 'Mode', 'shipmentMode', 'Location', 'location'),
          R('Job Order No', 'jobOrderNo', 'Job Date', 'jobOrderDate', 'BOE/SB No', 'boeSbNo'),
          R('BOE/SB Date', 'boeSbDate', 'Packages', 'noOfPackages', 'Gross Weight', 'grossWeight'),
          W('Importer', 'importerName', 5),
          W('Exporter', 'exporterName', 3, 'Supplier', 'supplierName'),
          R('MAWB/MBL No', 'mawbMblNo', 'MAWB Date', 'mawbMblDate', 'HAWB/HBL No', 'hawbHblNo'),
          R('HAWB/HBL Date', 'hawbHblDate', 'Port of Discharge', 'portOfDischarge', 'Dest Port', 'portOfDestination'),
          R('Filing Port', 'location', 'Invoice No', 'invoiceNo', 'Invoice Date', 'invoiceDate'),
          R('Invoice Value', 'billingCurrency', 'Freight', 'billNo', 'Exch Rate', 'billDate'),
          R('CHA/Agent', 'agentDebitNote', 'DO Date', 'deliveryOrderDate', 'OCC Date', 'occDate'),
          W('Marks & Nos', 'remarks', 3, 'Gate Pass', 'gatePassDate'),
          W('GSTIN / Additional Info', 'additionalRemarks', 5)
        )
      ),

      // SIGNATURES
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', marginTop: '6mm' } },
        React.createElement('tbody', null,
          React.createElement('tr', null,
            React.createElement('td', { className: 'sig-box', style: { width: '50%' } },
              React.createElement('div', { style: { fontWeight: '700', marginBottom: '8mm' } }, 'Prepared By:'),
              React.createElement('div', { className: 'sig-line' }),
              React.createElement('div', { style: { fontSize: '7pt', color: '#888', marginTop: '2pt' } }, 'Signature & Date')
            ),
            React.createElement('td', { className: 'sig-box', style: { width: '50%' } },
              React.createElement('div', { style: { fontWeight: '700', marginBottom: '8mm', textAlign: 'right' } }, 'Authorized Signatory:'),
              React.createElement('div', { className: 'sig-line', style: { marginLeft: '40%' } }),
              React.createElement('div', { style: { fontSize: '7pt', color: '#888', marginTop: '2pt', textAlign: 'right' } }, 'Signature & Stamp')
            )
          )
        )
      ),

      React.createElement('div', { className: 'footer-text' }, 'PAS Freight Services Pvt Ltd  •  ' + new Date().toLocaleDateString() + '  •  Generated by PAS Checklist Scanner'),

      React.createElement('div', { className: 'text-center mt-4 print:hidden' },
        React.createElement('button', { onClick: function() { setShowRaw(!showRaw) }, style: { fontSize: '12px', color: '#999', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none' } }, showRaw ? 'Hide raw text' : 'Show raw text')
      ),
      showRaw ? React.createElement('div', { className: 'glass rounded-xl border p-4 mt-2 print:hidden', style: { maxHeight: '200px', overflow: 'auto' } },
        React.createElement('pre', { style: { fontSize: '10px', whiteSpace: 'pre-wrap', color: '#666' } }, rawText)
      ) : null
    ) : null
  )
}