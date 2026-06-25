import React, { useState, useRef, useEffect } from 'react'
import api from '../lib/api'
import { Upload, FileText, Download, RefreshCw, Search, FileUp, X, Image, Copy, CheckCircle2, Eye, EyeOff, Anchor, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

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
  var pdfRef = useRef(null)

  var isSeaShipment = shipmentType === 'Sea FCL' || shipmentType === 'Sea LCL' || shipmentType === 'Sea'

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

  async function handleDownload() {
    if (!pdfRef.current) return
    setDownloading(true)
    try {
      var canvas = await html2canvas(pdfRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false
      })
      var imgData = canvas.toDataURL('image/png')
      var imgWidth = 210
      var pageHeight = 297
      var imgHeight = (canvas.height * imgWidth) / canvas.width
      if (imgHeight > pageHeight) imgHeight = pageHeight
      var pdf = new jsPDF('p', 'mm', 'a4')
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
      pdf.save('PAS_Checklist_' + (F('referenceNumber') || 'Report') + '.pdf')
    } catch (err) {
      console.error('PDF generation error:', err)
      alert('Failed to generate PDF. Please try again.')
    }
    setDownloading(false)
  }

  function handleReset() { setFile(null); setFormData(null); setRawText(''); setShipmentType(''); if (fileInputRef.current) fileInputRef.current.value = '' }

  var F = function(key) { return (formData && formData[key]) || '' }
  var U = function(key) { return function(e) { updateField(key, e.target.value) } }

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

  return React.createElement('div', { className: 'space-y-4' },
    // ── HEADER ──
    React.createElement('div', { className: 'flex items-center justify-between gap-4' },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('div', { className: 'w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg' }, React.createElement(FileUp, { size: 18, className: 'text-white' })),
        React.createElement('div', null, React.createElement('h1', { className: 'text-2xl font-bold', style: { color: 'var(--text-primary)' } }, 'Scan & Fill Checklist'))
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('label', { className: 'px-3 py-2 glass border rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-2', style: { borderColor: 'var(--border-color)' } }, React.createElement(Image, { size: 14 }), logo ? 'Logo ✓' : 'Add Logo', React.createElement('input', { type: 'file', accept: 'image/*', onChange: handleLogoUpload, style: { display: 'none' } })),
        formData ? React.createElement('button', { onClick: handleReset, className: 'px-3 py-2 glass border rounded-lg text-xs font-semibold', style: { borderColor: 'var(--border-color)' } }, 'Clear') : null,
        formData ? React.createElement('button', { onClick: handleDownload, disabled: downloading, className: 'px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors' }, downloading ? React.createElement(Loader2, { size: 14, className: 'animate-spin' }) : React.createElement(Download, { size: 14 }), downloading ? 'Generating...' : 'Download PDF') : null
      )
    ),

    !formData ? React.createElement('div', {
      className: 'glass rounded-xl border-2 border-dashed p-16 text-center cursor-pointer',
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

    formData ? React.createElement('div', null,
      // ── SHIPMENT TYPE + TOGGLE ──
      React.createElement('div', { className: 'flex items-center gap-3 mb-4 flex-wrap' },
        React.createElement('div', { className: 'px-3 py-1.5 rounded-full text-xs font-bold', style: { background: '#dbeafe', color: '#1e40af' } }, 'Shipment Type'),
        React.createElement('select', { value: shipmentType, onChange: function(e) { setShipmentType(e.target.value) }, className: 'px-3 py-2 border rounded-lg text-sm font-semibold', style: { borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--input-bg)' } },
          React.createElement('option', { value: '' }, '-- Select --'),
          React.createElement('option', { value: 'Air' }, '✈ Air'),
          React.createElement('option', { value: 'Sea FCL' }, '🚢 Sea FCL'),
          React.createElement('option', { value: 'Sea LCL' }, '🚢 Sea LCL'),
          React.createElement('option', { value: 'Local Transport' }, '🚛 Local Transport')
        ),
        React.createElement('button', { onClick: function() { setShowRawPanel(!showRawPanel) }, className: 'px-3 py-2 glass border rounded-lg text-xs font-semibold flex items-center gap-2', style: { borderColor: 'var(--border-color)' } },
          showRawPanel ? React.createElement(EyeOff, { size: 14 }) : React.createElement(Eye, { size: 14 }),
          showRawPanel ? 'Hide Raw Text' : 'Show Raw Text'
        )
      ),

      // ── FORM + RAW TEXT ──
      React.createElement('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-4' },
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
          
          // ── SEA SECTION MOVED AFTER INVOICE ──
          isSeaShipment ? React.createElement('div', { className: 'mb-2 mt-3' },
            React.createElement('div', { className: 'flex items-center gap-2 mb-2 px-3 py-2 rounded-lg', style: { background: '#eff6ff', border: '1px solid #bfdbfe' } },
              React.createElement(Anchor, { size: 14, style: { color: '#1d4ed8' } }),
              React.createElement('span', { className: 'text-xs font-bold uppercase tracking-wider', style: { color: '#1d4ed8' } }, 'Sea Shipment Details')
            ),
            SF('Gateway IGM No', 'gatewayIgmNo'), SF('Gateway IGM Date', 'gatewayIgmDate'),
            SF('IGM No', 'igmNo'), SF('IGM Date', 'igmDate'),
            SF('Local IGM No', 'localIgmNo'), SF('Local IGM Date', 'localIgmDate'),
            SF('Container No', 'containerNo')
          ) : null,
          
          SF('Delivery Order Date', 'deliveryOrderDate'),
          SF('OCC Date', 'occDate'), SF('Gate Pass Date', 'gatePassDate'),
          SF('Marks & Nos', 'remarks'), SF('GSTIN / Additional Info', 'additionalRemarks')
        ),
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

      // ═══════════════════════════════════════════
      // PROFESSIONAL PDF TEMPLATE
      // ═══════════════════════════════════════════
      React.createElement('div', {
        ref: pdfRef,
        style: {
          position: 'absolute', left: '-9999px', top: 0,
          width: '794px',
          background: '#ffffff',
          fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
          color: '#0a0a1a',
          padding: '40px 48px',
          boxSizing: 'border-box'
        }
      },
        logo ? React.createElement('img', {
          src: logo,
          style: {
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            opacity: 0.03, zIndex: 0,
            width: '500px', height: '700px',
            objectFit: 'contain', pointerEvents: 'none'
          }
        }) : null,

        React.createElement('div', { style: { position: 'relative', zIndex: 1 } },

          // ═══ HEADER TABLE ═══
          React.createElement('table', {
            style: {
              width: '100%', borderCollapse: 'collapse',
              marginBottom: '16px', border: '2px solid #0a0a1a'
            }
          },
            React.createElement('tbody', null,
              React.createElement('tr', null,
                React.createElement('td', {
                  style: { width: '18%', padding: '10px', textAlign: 'center', verticalAlign: 'middle', borderRight: '2px solid #0a0a1a' }
                },
                  logo ? React.createElement('img', { src: logo, alt: 'PAS Logo', style: { maxWidth: '100%', maxHeight: '55px', objectFit: 'contain' } })
                  : React.createElement('span', { style: { fontSize: '28px', fontWeight: '900', color: '#0a0a1a', letterSpacing: '2px' } }, 'PAS')
                ),
                React.createElement('td', {
                  style: { padding: '8px 14px', textAlign: 'center', verticalAlign: 'middle', borderRight: '2px solid #0a0a1a' }
                },
                  React.createElement('div', { style: { fontSize: '16px', fontWeight: '900', color: '#0a0a1a', letterSpacing: '1px', marginBottom: '2px' } }, 'PAS FREIGHT SERVICES PVT LTD'),
                  React.createElement('div', { style: { fontSize: '8px', color: '#444', lineHeight: '1.5' } }, 'Site No 171, 1st Floor, 7th Block, Arkavathy Layout'),
                  React.createElement('div', { style: { fontSize: '8px', color: '#444', lineHeight: '1.5' } }, 'Jakkur, Bengaluru - 560064'),
                  React.createElement('div', { style: { fontSize: '9px', fontWeight: '700', color: '#0a0a1a', marginTop: '2px' } }, 'GST No: 29AALCP2369R1ZD')
                ),
                React.createElement('td', { style: { width: '16%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' } },
                  React.createElement('div', { style: { fontSize: '7px', fontWeight: '700', textTransform: 'uppercase', color: '#555', marginBottom: '4px' } }, 'Shipment Type'),
                  React.createElement('div', {
                    style: { fontSize: '11px', fontWeight: '900', color: '#ffffff', background: '#0a0a1a', padding: '6px 10px', display: 'inline-block', letterSpacing: '1px' }
                  }, shipmentType ? shipmentType.toUpperCase() : '—')
                )
              )
            )
          ),

          // ═══ TITLE BAR ═══
          React.createElement('div', {
            style: { background: '#0a0a1a', color: '#ffffff', textAlign: 'center', padding: '8px 0', marginBottom: '14px', fontSize: '13px', fontWeight: '900', letterSpacing: '3px', textTransform: 'uppercase' }
          },
            'Checklist Report',
            React.createElement('div', { style: { fontSize: '7px', fontWeight: '400', letterSpacing: '0', opacity: 0.8, marginTop: '2px' } },
              'Date: ' + new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '  |  Ref: ' + F('referenceNumber'))
          ),

          // ═══ DATA ROWS ═══
          React.createElement('div', { style: { fontSize: '0' } },
            (function() {
              var rows = []
              function ROW(label, value, value2) {
                rows.push(
                  React.createElement('div', {
                    key: label,
                    style: { display: 'flex', borderBottom: '0.5px solid #d1d5db', padding: '5px 0', alignItems: 'center', minHeight: '26px', fontSize: '0' }
                  },
                    React.createElement('div', { style: { fontSize: '7.5px', fontWeight: '700', color: '#4b5563', textTransform: 'uppercase', width: '30%', flexShrink: 0, paddingLeft: '4px' } }, label),
                    React.createElement('div', { style: { fontSize: '9px', fontWeight: '600', color: '#0a0a1a', flex: 1, wordWrap: 'break-word' } }, value || '—'),
                    value2 !== undefined ? React.createElement(React.Fragment, null,
                      React.createElement('div', { style: { fontSize: '6.5px', fontWeight: '700', color: '#6b7280', width: '7%', textAlign: 'right', paddingRight: '6px' } }, 'DATE'),
                      React.createElement('div', { style: { fontSize: '8px', fontWeight: '600', color: '#374151', width: '17%' } }, value2 || '—')
                    ) : null
                  )
                )
              }

              ROW('Reference Number', F('referenceNumber'))
              ROW('Job Order No', F('jobOrderNo'), F('jobOrderDate'))
              ROW('BOE/SB Number', F('boeSbNo'), F('boeSbDate'))
              ROW('Shipment Mode', F('shipmentMode'))
              ROW('Location / Filing Port', F('location'))
              ROW('Importer Name', F('importerName'))
              ROW('Exporter Name', F('exporterName'))
              ROW('Supplier Name', F('supplierName'))
              ROW('MAWB / MBL Number', F('mawbMblNo'), F('mawbMblDate'))
              ROW('HAWB / HBL Number', F('hawbHblNo'), F('hawbHblDate'))
              ROW('Number of Packages', F('noOfPackages'))
              ROW('Gross Weight', F('grossWeight'))
              ROW('Port of Discharge', F('portOfDischarge'))
              ROW('Port of Destination', F('portOfDestination'))
              ROW('Invoice Number', F('invoiceNo'), F('invoiceDate'))

              // Sea section AFTER Invoice Number
              if (isSeaShipment) {
                rows.push(
                  React.createElement('div', {
                    key: 'sea-title',
                    style: { background: '#0a0a1a', color: '#ffffff', textAlign: 'center', padding: '5px 0', margin: '6px 0', fontSize: '8px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' }
                  }, '🚢  Sea Shipment Details')
                )
                ROW('Gateway IGM No', F('gatewayIgmNo'), F('gatewayIgmDate'))
                ROW('IGM No', F('igmNo'), F('igmDate'))
                ROW('Local IGM No', F('localIgmNo'), F('localIgmDate'))
                ROW('Container No', F('containerNo'))
              }

              ROW('Delivery Order Date', F('deliveryOrderDate'))
              ROW('OCC Date', F('occDate'))
              ROW('Gate Pass Date', F('gatePassDate'))
              ROW('Marks & Nos', F('remarks'))
              ROW('GSTIN / Additional Info', F('additionalRemarks'))

              return rows
            })()
          ),

          // ═══ FOOTER ═══
          React.createElement('div', {
            style: { textAlign: 'center', fontSize: '7px', color: '#9ca3af', marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }
          }, 'PAS Freight Services Pvt Ltd  •  ' + new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '  •  Generated by PAS Checklist Scanner')
        )
      )
    ) : null
  )
}