import React, { useState, useRef } from 'react'
import api from '../lib/api'
import {
  Upload, FileText, Download, RefreshCw, CheckCircle2,
  X, Search, Edit3, FileUp, AlertCircle, Zap,
  Package, Globe, MapPin, Calendar, FileCheck, Hash,
  DollarSign, Truck, Anchor, ClipboardList, Ship, Plane
} from 'lucide-react'

export default function ChecklistScanner() {
  var [file, setFile] = useState(null)
  var [scanning, setScanning] = useState(false)
  var [formData, setFormData] = useState(null)
  var [rawText, setRawText] = useState('')
  var [showRaw, setShowRaw] = useState(false)
  var [downloading, setDownloading] = useState(false)
  var [shipmentType, setShipmentType] = useState('')
  var fileInputRef = useRef(null)

  function handleDrop(e) {
    e.preventDefault()
    var f = e.dataTransfer.files[0]
    if (f && (f.type === 'application/pdf' || f.name.endsWith('.pdf'))) setFile(f)
  }

  function handleDragOver(e) { e.preventDefault() }

  function handleFileSelect(e) {
    var f = e.target.files[0]
    if (f) setFile(f)
  }

  async function handleScan() {
    if (!file) return
    setScanning(true)
    try {
      var fd = new FormData()
      fd.append('checklist', file)
      var res = await api.post('/checklist/scan', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setFormData(res.data.data)
      setRawText(res.data.rawText || '')
    } catch (err) {
      console.error('Scan failed:', err)
      alert('Failed to scan PDF. Please try again.')
    }
    setScanning(false)
  }

  function updateField(field, value) {
    setFormData(function(prev) {
      var u = {}
      for (var k in prev) u[k] = prev[k]
      u[field] = value
      return u
    })
  }

  function handleDownload() {
    setDownloading(true)
    var style = document.createElement('style')
    style.id = 'pdf-print-style'
    style.textContent = '@media print{body *{visibility:hidden!important}#checklist-print,#checklist-print *{visibility:visible!important}#checklist-print{position:absolute;left:0;top:0;width:100%;padding:0;margin:0}}'
    document.head.appendChild(style)
    window.print()
    setTimeout(function() { var s = document.getElementById('pdf-print-style'); if(s) s.remove(); setDownloading(false) }, 500)
  }

  function handleReset() {
    setFile(null); setFormData(null); setRawText(''); setShipmentType('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  var fields = [
    { key: 'referenceNumber', label: 'Reference Number', icon: Hash, section: 'Shipment Details' },
    { key: 'jobOrderNo', label: 'Job Order No', icon: ClipboardList, section: 'Shipment Details', hasDate: 'jobOrderDate' },
    { key: 'boeSbNo', label: 'BOE/SB Number', icon: FileCheck, section: 'Shipment Details', hasDate: 'boeSbDate' },
    { key: 'importerName', label: 'Importer Name', icon: Globe, section: 'Party Details' },
    { key: 'exporterName', label: 'Exporter Name', icon: Globe, section: 'Party Details' },
    { key: 'supplierName', label: 'Supplier Name', icon: Package, section: 'Party Details' },
    { key: 'mawbMblNo', label: 'MAWB/MBL Number', icon: FileText, section: 'Document Details', hasDate: 'mawbMblDate' },
    { key: 'hawbHblNo', label: 'HAWB/HBL Number', icon: FileText, section: 'Document Details', hasDate: 'hawbHblDate' },
    { key: 'noOfPackages', label: 'No of Packages', icon: Package, section: 'Cargo Details' },
    { key: 'grossWeight', label: 'Gross Weight', icon: Package, section: 'Cargo Details' },
    { key: 'portOfDischarge', label: 'Port of Discharge', icon: Anchor, section: 'Route Details' },
    { key: 'portOfDestination', label: 'Port of Destination', icon: Anchor, section: 'Route Details' },
    { key: 'location', label: 'Location / Filing Port', icon: MapPin, section: 'Route Details' },
    { key: 'invoiceNo', label: 'Invoice No', icon: FileText, section: 'Financial Details', hasDate: 'invoiceDate' },
    { key: 'billingCurrency', label: 'Invoice Value / Currency', icon: DollarSign, section: 'Financial Details' },
    { key: 'billNo', label: 'Freight Charges', icon: DollarSign, section: 'Financial Details' },
    { key: 'billDate', label: 'Exchange Rate', icon: DollarSign, section: 'Financial Details' },
    { key: 'agentDebitNote', label: 'CHA / Agent', icon: FileCheck, section: 'Other Details' },
    { key: 'remarks', label: 'Marks & Nos', icon: Edit3, section: 'Other Details' },
    { key: 'additionalRemarks', label: 'GSTIN / Additional Info', icon: Edit3, section: 'Other Details' },
    { key: 'deliveryOrderDate', label: 'Delivery Order Date', icon: Calendar, section: 'Dates' },
    { key: 'occDate', label: 'OCC Date', icon: Calendar, section: 'Dates' },
    { key: 'gatePassDate', label: 'Gate Pass Date', icon: Calendar, section: 'Dates' },
  ]

  var sections = {}
  fields.forEach(function(f) {
    if (!sections[f.section]) sections[f.section] = []
    sections[f.section].push(f)
  })

  var sectionOrder = ['Shipment Details', 'Party Details', 'Document Details', 'Cargo Details', 'Route Details', 'Financial Details', 'Dates', 'Other Details']

  return React.createElement('div', { className: 'space-y-6 animate-fade-in' },
    // PAGE HEADER
    React.createElement('div', { className: 'flex flex-col lg:flex-row lg:items-center justify-between gap-4' },
      React.createElement('div', null,
        React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
          React.createElement('div', { className: 'w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md' },
            React.createElement(FileUp, { size: 15, className: 'text-white' })
          ),
          React.createElement('span', { className: 'text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-md' }, 'Checklist Scanner')
        ),
        React.createElement('h1', { className: 'text-[32px] font-bold bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 dark:from-indigo-400 dark:via-blue-400 dark:to-purple-400 bg-clip-text text-transparent tracking-tight' }, 'Scan & Fill Checklist'),
        React.createElement('p', { className: 'text-xs mt-1', style: { color: 'var(--text-muted)' } }, 'Upload a PDF checklist and auto-extract all details')
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        formData ? React.createElement('button', { onClick: handleReset, className: 'px-3.5 py-2.5 glass border rounded-lg text-xs font-semibold flex items-center gap-2', style: { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' } },
          React.createElement(X, { size: 14 }), ' Clear'
        ) : null,
        formData ? React.createElement('button', { onClick: handleDownload, disabled: downloading, className: 'px-3.5 py-2.5 glass border rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2', style: { borderColor: 'var(--border-color)' } },
          React.createElement(Download, { size: 14 }), downloading ? 'Downloading...' : 'Download PDF'
        ) : null
      )
    ),

    // UPLOAD AREA
    !formData ? React.createElement('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6' },
      React.createElement('div', {
        className: 'glass rounded-xl border-2 border-dashed p-12 text-center hover:border-indigo-400 transition-colors cursor-pointer flex flex-col items-center justify-center',
        style: { borderColor: file ? '#6366f1' : 'var(--border-color)', minHeight: '300px' },
        onDrop: handleDrop, onDragOver: handleDragOver,
        onClick: function() { fileInputRef.current && fileInputRef.current.click() }
      },
        React.createElement('input', { ref: fileInputRef, type: 'file', accept: '.pdf', onChange: handleFileSelect, style: { display: 'none' } }),
        file ? React.createElement(React.Fragment, null,
          React.createElement(FileText, { size: 48, className: 'text-indigo-500 mb-4' }),
          React.createElement('p', { className: 'text-sm font-semibold', style: { color: 'var(--text-primary)' } }, file.name),
          React.createElement('p', { className: 'text-xs mt-2', style: { color: 'var(--text-muted)' } }, (file.size / 1024).toFixed(1) + ' KB'),
          React.createElement('button', {
            onClick: function(e) { e.stopPropagation(); handleScan() }, disabled: scanning,
            className: 'mt-6 px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-sm font-semibold shadow-lg flex items-center gap-2 hover:from-indigo-700 hover:to-blue-700'
          }, scanning ? React.createElement(RefreshCw, { size: 16, className: 'animate-spin' }) : React.createElement(Search, { size: 16 }), scanning ? 'Scanning...' : 'Scan Checklist')
        ) : React.createElement(React.Fragment, null,
          React.createElement(Upload, { size: 48, className: 'text-indigo-400 mb-4' }),
          React.createElement('p', { className: 'text-sm font-semibold', style: { color: 'var(--text-primary)' } }, 'Drop your PDF checklist here'),
          React.createElement('p', { className: 'text-xs mt-2', style: { color: 'var(--text-muted)' } }, 'or click to browse • Max 10MB')
        )
      ),
      React.createElement('div', { className: 'glass rounded-xl border p-6', style: { borderColor: 'var(--glass-border)' } },
        React.createElement('h3', { className: 'text-sm font-bold mb-4 flex items-center gap-2', style: { color: 'var(--text-primary)' } },
          React.createElement(Zap, { size: 16, className: 'text-indigo-500' }), 'How it works'
        ),
        React.createElement('div', { className: 'space-y-3' },
          [{ step: '1', text: 'Upload your checklist PDF', icon: Upload }, { step: '2', text: 'AI scans and extracts all fields', icon: Search }, { step: '3', text: 'Review & edit extracted data', icon: Edit3 }, { step: '4', text: 'Download filled checklist as PDF', icon: Download }].map(function(item, i) {
            var Ico = item.icon
            return React.createElement('div', { key: i, className: 'flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50' },
              React.createElement('div', { className: 'w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0' }, item.step),
              React.createElement(Ico, { size: 14, className: 'text-indigo-500 flex-shrink-0' }),
              React.createElement('span', { className: 'text-xs', style: { color: 'var(--text-secondary)' } }, item.text)
            )
          })
        )
      )
    ) : null,

    // FORM WITH PROFESSIONAL PRINT LAYOUT
    formData ? React.createElement('div', { id: 'checklist-print', className: 'space-y-0' },
      // ========== PRINT HEADER ==========
      React.createElement('div', { className: 'border-b-2 border-gray-800 pb-4 mb-6', style: { fontFamily: 'Arial, sans-serif' } },
        React.createElement('div', { className: 'flex items-start justify-between' },
          // Logo (left)
          React.createElement('div', { className: 'w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center border border-gray-300' },
            React.createElement('span', { className: 'text-xs text-gray-500 font-bold' }, 'LOGO')
          ),
          // Company Details (center)
          React.createElement('div', { className: 'text-center flex-1 px-4' },
            React.createElement('h1', { className: 'text-xl font-bold tracking-wide', style: { color: '#1a1a2e' } }, 'PAS FREIGHT SERVICES PVT LTD'),
            React.createElement('p', { className: 'text-[11px] mt-1', style: { color: '#444' } }, 'SITE NO 171, 1ST FLOOR, 7TH BLOCK, ARKAVATHY LAYOUT'),
            React.createElement('p', { className: 'text-[11px]', style: { color: '#444' } }, 'JAKKUR, BENGALURU - 560064'),
            React.createElement('p', { className: 'text-[11px] font-semibold mt-1', style: { color: '#1a1a2e' } }, 'GST NO: 29AALCP2369R1ZD')
          ),
          // Shipment Type (right)
          React.createElement('div', { className: 'text-right', style: { minWidth: '180px' } },
            React.createElement('label', { className: 'text-[10px] font-bold uppercase tracking-wider', style: { color: '#1a1a2e' } }, 'Shipment Type'),
            React.createElement('select', {
              value: shipmentType,
              onChange: function(e) { setShipmentType(e.target.value) },
              className: 'mt-1 w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-semibold bg-white',
              style: { color: '#1a1a2e' }
            },
              React.createElement('option', { value: '' }, '-- Select --'),
              React.createElement('option', { value: 'Air' }, '✈️ Air'),
              React.createElement('option', { value: 'Sea FCL' }, '🚢 Sea FCL'),
              React.createElement('option', { value: 'Sea LCL' }, '🚢 Sea LCL'),
              React.createElement('option', { value: 'Local Transport' }, '🚛 Local Transport')
            ),
            shipmentType ? React.createElement('div', { className: 'mt-2 inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 rounded-full' },
              React.createElement('span', { className: 'text-xs font-bold text-indigo-700' }, shipmentType)
            ) : null
          )
        ),
        // Title line
        React.createElement('div', { className: 'mt-4 pt-3 border-t border-gray-300 text-center' },
          React.createElement('h2', { className: 'text-lg font-bold uppercase tracking-widest', style: { color: '#1a1a2e' } }, 'Checklist Report'),
          React.createElement('p', { className: 'text-[10px]', style: { color: '#666' } }, 'Generated: ' + new Date().toLocaleString() + ' | Ref: ' + (formData.referenceNumber || 'N/A'))
        )
      ),

      // ========== SECTION CARDS ==========
      sectionOrder.map(function(sectionName) {
        var sectionFields = sections[sectionName]
        if (!sectionFields) return null
        return React.createElement('div', { key: sectionName, className: 'mb-4 border border-gray-300 rounded-lg overflow-hidden', style: { pageBreakInside: 'avoid' } },
          React.createElement('div', { className: 'px-4 py-2 font-bold text-sm', style: { background: '#1a1a2e', color: '#fff' } }, sectionName),
          React.createElement('div', { className: 'p-3', style: { background: '#fff' } },
            React.createElement('div', { className: 'grid grid-cols-2 md:grid-cols-3 gap-2' },
              sectionFields.map(function(field) {
                var value = formData[field.key] || ''
                var FieldIcon = field.icon || FileText
                var autoFilled = value.length > 0
                return React.createElement('div', { key: field.key, className: 'border border-gray-200 rounded p-2' },
                  React.createElement('label', { className: 'text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 mb-1', style: { color: '#555' } },
                    React.createElement(FieldIcon, { size: 9 }), field.label,
                    autoFilled ? React.createElement('span', { className: 'text-emerald-600 text-[8px]' }, ' ✓') : null
                  ),
                  React.createElement('input', {
                    type: 'text', value: value,
                    onChange: function(e) { updateField(field.key, e.target.value) },
                    placeholder: autoFilled ? '' : 'Enter...',
                    className: 'w-full px-2 py-1.5 border rounded text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400',
                    style: { borderColor: autoFilled ? '#10b981' : '#ddd', color: '#1a1a2e', background: autoFilled ? '#f0fdf4' : '#fafafa' }
                  }),
                  field.hasDate ? React.createElement('div', { className: 'mt-1 flex items-center gap-1' },
                    React.createElement(Calendar, { size: 8, style: { color: '#888' } }),
                    React.createElement('input', {
                      type: 'text', value: formData[field.hasDate] || '',
                      onChange: function(e) { updateField(field.hasDate, e.target.value) },
                      placeholder: 'Date', className: 'w-full px-2 py-1 border rounded text-[9px] focus:outline-none focus:ring-1 focus:ring-indigo-400',
                      style: { borderColor: '#ddd', color: '#1a1a2e' }
                    })
                  ) : null
                )
              })
            )
          )
        )
      }),

      // ========== FOOTER ==========
      React.createElement('div', { className: 'mt-6 pt-4 border-t border-gray-300 text-center' },
        React.createElement('p', { className: 'text-[10px]', style: { color: '#888' } }, 'PAS Freight Services Pvt Ltd • Checklist Report • ' + new Date().toLocaleDateString()),
        React.createElement('div', { className: 'flex justify-between mt-4 pt-4 border-t border-gray-200' },
          React.createElement('div', { className: 'text-left' },
            React.createElement('p', { className: 'text-[10px] font-bold', style: { color: '#1a1a2e' } }, 'Prepared By:'),
            React.createElement('div', { className: 'w-32 h-0.5 mt-6', style: { background: '#1a1a2e' } }),
            React.createElement('p', { className: 'text-[9px]', style: { color: '#666' } }, 'Signature')
          ),
          React.createElement('div', { className: 'text-right' },
            React.createElement('p', { className: 'text-[10px] font-bold', style: { color: '#1a1a2e' } }, 'Authorized Signatory:'),
            React.createElement('div', { className: 'w-32 h-0.5 mt-6 ml-auto', style: { background: '#1a1a2e' } }),
            React.createElement('p', { className: 'text-[9px]', style: { color: '#666' } }, 'Signature & Stamp')
          )
        )
      ),

      // Raw text toggle (hidden in print)
      React.createElement('div', { className: 'text-center mt-4 print:hidden' },
        React.createElement('button', { onClick: function() { setShowRaw(!showRaw) }, className: 'text-xs underline cursor-pointer', style: { color: 'var(--text-muted)' } }, showRaw ? 'Hide raw extracted text' : 'Show raw extracted text')
      ),
      showRaw ? React.createElement('div', { className: 'glass rounded-xl border p-4 mt-2 print:hidden', style: { borderColor: 'var(--glass-border)', maxHeight: '200px', overflow: 'auto' } },
        React.createElement('pre', { className: 'text-[10px] whitespace-pre-wrap', style: { color: 'var(--text-muted)' } }, rawText)
      ) : null
    ) : null
  )
}