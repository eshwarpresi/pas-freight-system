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
    var s = document.createElement('style')
    s.id = 'pdf-print-style'
    s.textContent = '@media print{@page{size:A4;margin:6mm 8mm}body{visibility:hidden!important;background:#fff!important}#checklist-print,#checklist-print *{visibility:visible!important}#checklist-print{position:absolute;left:0;top:0;width:100%;background:#fff!important;font-family:"Segoe UI",Arial,Helvetica,sans-serif!important;color:#111!important}.watermark-img{position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;opacity:0.04!important;z-index:0!important;pointer-events:none!important;width:160mm!important;height:230mm!important;object-fit:contain!important}.co-name{font-size:14pt!important;font-weight:900!important;color:#111!important}.co-addr{font-size:7pt!important;color:#444!important}.co-gst{font-size:7pt!important;font-weight:700!important;color:#111!important}.st-label{font-size:6pt!important;font-weight:700!important;text-transform:uppercase!important}.st-select{width:100%!important;padding:3pt!important;border:1pt solid #111!important;font-size:8pt!important;font-weight:700!important;text-align:center!important;background:#fff!important}.st-badge{padding:2pt 8pt!important;background:#111!important;color:#fff!important;font-size:7pt!important;font-weight:700!important}.title-bar{background:#111!important;color:#fff!important;text-align:center!important;padding:3mm!important;margin-bottom:3mm!important;font-size:10pt!important;font-weight:900!important;letter-spacing:3pt!important}.fr{display:flex!important;border-bottom:0.5pt solid #ddd!important;padding:3pt 0!important;align-items:center!important;min-height:24pt!important}.fl{font-size:7pt!important;font-weight:700!important;color:#555!important;text-transform:uppercase!important;width:30%!important;flex-shrink:0!important}.fv{font-size:9pt!important;font-weight:600!important;color:#111!important;flex:1!important;word-wrap:break-word!important}.fi{border:none!important;background:transparent!important;width:100%!important;font-size:9pt!important;font-weight:600!important;color:#111!important;outline:none!important;padding:2pt 0!important;font-family:inherit!important}.fdl{font-size:6pt!important;font-weight:700!important;color:#555!important;text-transform:uppercase!important;width:8%!important;text-align:right!important;padding-right:3pt!important}.fdv{font-size:8pt!important;font-weight:600!important;color:#444!important;width:18%!important}.fdi{border:none!important;background:transparent!important;width:100%!important;font-size:8pt!important;font-weight:600!important;color:#444!important;outline:none!important;padding:2pt 0!important;font-family:inherit!important}.ft{text-align:center!important;font-size:6pt!important;color:#999!important;margin-top:6mm!important}}'
    document.head.appendChild(s)
    window.print()
    setTimeout(function() { var el = document.getElementById('pdf-print-style'); if(el) el.remove(); setDownloading(false) }, 500)
  }

  function handleReset() { setFile(null); setFormData(null); setRawText(''); setShipmentType(''); if (fileInputRef.current) fileInputRef.current.value = '' }

  var F = function(key) { return (formData[key] || '') }
  var U = function(key) { return function(e) { updateField(key, e.target.value) } }

  var FR = function(label, key) {
    return React.createElement('div', { className: 'fr' },
      React.createElement('div', { className: 'fl' }, label),
      React.createElement('div', { className: 'fv' },
        React.createElement('input', { type: 'text', value: F(key), onChange: U(key), className: 'fi' })
      )
    )
  }

  var FRD = function(label, key, dateKey) {
    return React.createElement('div', { className: 'fr' },
      React.createElement('div', { className: 'fl' }, label),
      React.createElement('div', { className: 'fv' },
        React.createElement('input', { type: 'text', value: F(key), onChange: U(key), className: 'fi' })
      ),
      React.createElement('div', { className: 'fdl' }, 'DATE'),
      React.createElement('div', { className: 'fdv' },
        React.createElement('input', { type: 'text', value: F(dateKey), onChange: U(dateKey), className: 'fdi' })
      )
    )
  }

  return React.createElement('div', { className: 'space-y-6' },
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
        React.createElement('p', { className: 'text-lg font-bold', style: { color: 'var(--text-primary)' } }, 'Drop PDF Checklist Here')
      )
    ) : null,

    formData ? React.createElement('div', { id: 'checklist-print', style: { background: '#fff', maxWidth: '190mm', margin: '0 auto', fontFamily: '"Segoe UI", Arial, sans-serif', color: '#111', padding: '0', position: 'relative' } },
      
      logo ? React.createElement('img', { src: logo, className: 'watermark-img', style: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: '0.04', zIndex: '0', pointerEvents: 'none', width: '160mm', height: '230mm', objectFit: 'contain' } }) : null,

      React.createElement('div', { style: { position: 'relative', zIndex: '1' } },
      
        React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', marginBottom: '4mm' } },
          React.createElement('tbody', null,
            React.createElement('tr', null,
              React.createElement('td', { style: { width: '20%', border: '2px solid #111', padding: '3mm', textAlign: 'center', verticalAlign: 'middle' } },
                logo ? React.createElement('img', { src: logo, alt: 'Logo', style: { maxWidth: '100%', maxHeight: '18mm', objectFit: 'contain' } })
                  : React.createElement('div', { className: 'co-name', style: { fontSize: '18pt' } }, 'PAS')
              ),
              React.createElement('td', { style: { border: '2px solid #111', padding: '3mm', textAlign: 'center', verticalAlign: 'middle' } },
                React.createElement('div', { className: 'co-name' }, 'PAS FREIGHT SERVICES PVT LTD'),
                React.createElement('div', { className: 'co-addr' }, 'Site No 171, 1st Floor, 7th Block, Arkavathy Layout, Jakkur, Bengaluru - 560064'),
                React.createElement('div', { className: 'co-gst' }, 'GST No: 29AALCP2369R1ZD')
              ),
              React.createElement('td', { style: { width: '16%', border: '2px solid #111', padding: '2mm', textAlign: 'center', verticalAlign: 'middle' } },
                React.createElement('div', { className: 'st-label', style: { marginBottom: '2mm' } }, 'Shipment Type'),
                React.createElement('select', { value: shipmentType, onChange: function(e) { setShipmentType(e.target.value) }, className: 'st-select' },
                  React.createElement('option', { value: '' }, '-- Select --'),
                  React.createElement('option', { value: 'Air' }, 'AIR'),
                  React.createElement('option', { value: 'Sea FCL' }, 'SEA FCL'),
                  React.createElement('option', { value: 'Sea LCL' }, 'SEA LCL'),
                  React.createElement('option', { value: 'Local Transport' }, 'LOCAL TRANSPORT')
                ),
                shipmentType ? React.createElement('div', { className: 'st-badge', style: { marginTop: '2mm' } }, shipmentType) : null
              )
            )
          )
        ),

        React.createElement('div', { className: 'title-bar' },
          'CHECKLIST REPORT  |  ',
          React.createElement('span', { style: { fontSize: '6pt', fontWeight: '400', letterSpacing: '0' } }, 'Date: ' + new Date().toLocaleDateString() + '  |  Ref: ' + F('referenceNumber'))
        ),

        FR('Reference Number', 'referenceNumber'),
        FRD('Job Order No', 'jobOrderNo', 'jobOrderDate'),
        FRD('BOE/SB Number', 'boeSbNo', 'boeSbDate'),
        FR('Shipment Mode', 'shipmentMode'),
        FR('Location / Filing Port', 'location'),
        FR('Importer Name', 'importerName'),
        FR('Exporter Name', 'exporterName'),
        FR('Supplier Name', 'supplierName'),
        FRD('MAWB / MBL Number', 'mawbMblNo', 'mawbMblDate'),
        FRD('HAWB / HBL Number', 'hawbHblNo', 'hawbHblDate'),
        FR('Number of Packages', 'noOfPackages'),
        FR('Gross Weight', 'grossWeight'),
        FR('Port of Discharge', 'portOfDischarge'),
        FR('Port of Destination', 'portOfDestination'),
        FRD('Invoice Number', 'invoiceNo', 'invoiceDate'),
        FR('Invoice Value / Currency', 'billingCurrency'),
        FR('Freight Charges', 'billNo'),
        FR('Exchange Rate', 'billDate'),
        FR('CHA / Agent', 'agentDebitNote'),
        FR('Delivery Order Date', 'deliveryOrderDate'),
        FR('OCC Date', 'occDate'),
        FR('Gate Pass Date', 'gatePassDate'),
        FR('Marks & Nos', 'remarks'),
        FR('GSTIN / Additional Info', 'additionalRemarks'),

        React.createElement('div', { className: 'ft' }, 'PAS Freight Services Pvt Ltd  •  ' + new Date().toLocaleDateString() + '  •  Generated by PAS Checklist Scanner')
      ),

      React.createElement('div', { className: 'text-center mt-4 print:hidden' },
        React.createElement('button', { onClick: function() { setShowRaw(!showRaw) }, style: { fontSize: '12px', color: '#999', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none' } }, showRaw ? 'Hide raw text' : 'Show raw text')
      ),
      showRaw ? React.createElement('div', { className: 'glass rounded-xl border p-4 mt-2 print:hidden', style: { maxHeight: '200px', overflow: 'auto' } },
        React.createElement('pre', { style: { fontSize: '10px', whiteSpace: 'pre-wrap', color: '#666' } }, rawText)
      ) : null
    ) : null
  )
}