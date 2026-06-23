import React, { useState, useRef } from 'react'
import api from '../lib/api'
import {
  Upload, FileText, Download, RefreshCw, CheckCircle2,
  X, Search, Edit3, FileUp, AlertCircle, Zap,
  Package, Globe, MapPin, Calendar, FileCheck, Hash,
  DollarSign, Truck, Anchor, ClipboardList
} from 'lucide-react'

export default function ChecklistScanner() {
  var [file, setFile] = useState(null)
  var [scanning, setScanning] = useState(false)
  var [formData, setFormData] = useState(null)
  var [rawText, setRawText] = useState('')
  var [showRaw, setShowRaw] = useState(false)
  var [downloading, setDownloading] = useState(false)
  var fileInputRef = useRef(null)

  // Handle file drop
  function handleDrop(e) {
    e.preventDefault()
    var f = e.dataTransfer.files[0]
    if (f && (f.type === 'application/pdf' || f.name.endsWith('.pdf'))) {
      setFile(f)
    }
  }

  function handleDragOver(e) {
    e.preventDefault()
  }

  // Handle file select
  function handleFileSelect(e) {
    var f = e.target.files[0]
    if (f) setFile(f)
  }

  // Scan the uploaded PDF
  async function handleScan() {
    if (!file) return
    setScanning(true)
    try {
      var formDataToSend = new FormData()
      formDataToSend.append('checklist', file)

      var res = await api.post('/checklist/scan', formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setFormData(res.data.data)
      setRawText(res.data.rawText || '')
    } catch (err) {
      console.error('Scan failed:', err)
      alert('Failed to scan PDF. Please try again.')
    }
    setScanning(false)
  }

  // Update a field manually
  function updateField(field, value) {
    setFormData(function(prev) {
      var updated = {}
      for (var key in prev) updated[key] = prev[key]
      updated[field] = value
      return updated
    })
  }

  // Download filled checklist as PDF
  async function handleDownload() {
    setDownloading(true)
    var style = document.createElement('style')
    style.id = 'pdf-print-style'
    style.textContent = '@media print{body *{visibility:hidden!important}#checklist-print,#checklist-print *{visibility:visible!important}#checklist-print{position:absolute;left:0;top:0;width:100%;padding:20px}}'
    document.head.appendChild(style)
    window.print()
    setTimeout(function() { var s = document.getElementById('pdf-print-style'); if(s) s.remove(); setDownloading(false) }, 500)
  }

  // Reset everything
  function handleReset() {
    setFile(null)
    setFormData(null)
    setRawText('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Field definitions for the form
  var fields = [
    { key: 'referenceNumber', label: 'Reference Number', icon: Hash, section: 'Basic Info' },
    { key: 'shipmentMode', label: 'Shipment Mode', icon: Truck, section: 'Basic Info' },
    { key: 'importerName', label: 'Importer Name', icon: Globe, section: 'Parties' },
    { key: 'exporterName', label: 'Exporter Name', icon: Globe, section: 'Parties' },
    { key: 'supplierName', label: 'Supplier Name', icon: Package, section: 'Parties' },
    { key: 'location', label: 'Location', icon: MapPin, section: 'Basic Info' },
    { key: 'jobOrderNo', label: 'Job Order No', icon: ClipboardList, section: 'Documents', hasDate: 'jobOrderDate' },
    { key: 'boeSbNo', label: 'BOE/SB Number', icon: FileCheck, section: 'Documents', hasDate: 'boeSbDate' },
    { key: 'mawbMblNo', label: 'MAWB/MBL Number', icon: FileText, section: 'Documents', hasDate: 'mawbMblDate' },
    { key: 'hawbHblNo', label: 'HAWB/HBL Number', icon: FileText, section: 'Documents', hasDate: 'hawbHblDate' },
    { key: 'noOfPackages', label: 'No of Packages', icon: Package, section: 'Cargo Details' },
    { key: 'grossWeight', label: 'Gross Weight', icon: Package, section: 'Cargo Details' },
    { key: 'igmNo', label: 'IGM Number', icon: FileCheck, section: 'Documents', hasDate: 'igmDate' },
    { key: 'portOfDischarge', label: 'Port of Discharge', icon: Anchor, section: 'Port Info' },
    { key: 'portOfDestination', label: 'Port of Destination', icon: Anchor, section: 'Port Info' },
    { key: 'cargoArrivalNotice', label: 'Cargo Arrival Notice', icon: FileText, section: 'Documents', hasDate: 'cargoArrivalDate' },
    { key: 'deliveryOrderDate', label: 'Delivery Order Date', icon: Calendar, section: 'Dates' },
    { key: 'occDate', label: 'OCC Date', icon: Calendar, section: 'Dates' },
    { key: 'gatePassDate', label: 'Gate Pass Date', icon: Calendar, section: 'Dates' },
    { key: 'invoiceNo', label: 'Invoice No', icon: FileText, section: 'Financial', hasDate: 'invoiceDate' },
    { key: 'agentDebitNote', label: 'Agent Debit Note', icon: FileText, section: 'Financial' },
    { key: 'billingCurrency', label: 'Billing Currency', icon: DollarSign, section: 'Financial' },
    { key: 'billNo', label: 'Bill Number', icon: FileText, section: 'Financial', hasDate: 'billDate' },
    { key: 'billTo', label: 'Bill To', icon: Globe, section: 'Financial', hasDate: 'billToDate' },
    { key: 'docketNo', label: 'Docket Number', icon: FileCheck, section: 'Documents', hasDate: 'docketDate' },
    { key: 'remarks', label: 'Remarks', icon: Edit3, section: 'Other' },
    { key: 'additionalRemarks', label: 'Additional Remarks', icon: Edit3, section: 'Other' },
  ]

  // Group fields by section
  var sections = {}
  fields.forEach(function(f) {
    if (!sections[f.section]) sections[f.section] = []
    sections[f.section].push(f)
  })

  return React.createElement('div', { className: 'space-y-6 animate-fade-in' },
    // HEADER
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

    // UPLOAD AREA (when no file scanned yet)
    !formData ? React.createElement('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6' },
      // Drop zone
      React.createElement('div', {
        className: 'glass rounded-xl border-2 border-dashed p-12 text-center hover:border-indigo-400 transition-colors cursor-pointer flex flex-col items-center justify-center',
        style: { borderColor: file ? '#6366f1' : 'var(--border-color)', minHeight: '300px' },
        onDrop: handleDrop,
        onDragOver: handleDragOver,
        onClick: function() { fileInputRef.current && fileInputRef.current.click() }
      },
        React.createElement('input', { ref: fileInputRef, type: 'file', accept: '.pdf', onChange: handleFileSelect, style: { display: 'none' } }),
        file ? React.createElement(React.Fragment, null,
          React.createElement(FileText, { size: 48, className: 'text-indigo-500 mb-4' }),
          React.createElement('p', { className: 'text-sm font-semibold', style: { color: 'var(--text-primary)' } }, file.name),
          React.createElement('p', { className: 'text-xs mt-2', style: { color: 'var(--text-muted)' } }, (file.size / 1024).toFixed(1) + ' KB'),
          React.createElement('button', {
            onClick: function(e) { e.stopPropagation(); handleScan() },
            disabled: scanning,
            className: 'mt-6 px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-sm font-semibold shadow-lg flex items-center gap-2 hover:from-indigo-700 hover:to-blue-700'
          },
            scanning ? React.createElement(RefreshCw, { size: 16, className: 'animate-spin' }) : React.createElement(Search, { size: 16 }),
            scanning ? 'Scanning...' : 'Scan Checklist'
          )
        ) : React.createElement(React.Fragment, null,
          React.createElement(Upload, { size: 48, className: 'text-indigo-400 mb-4' }),
          React.createElement('p', { className: 'text-sm font-semibold', style: { color: 'var(--text-primary)' } }, 'Drop your PDF checklist here'),
          React.createElement('p', { className: 'text-xs mt-2', style: { color: 'var(--text-muted)' } }, 'or click to browse • Max 10MB'),
          React.createElement('p', { className: 'text-xs mt-4 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg', style: { color: 'var(--text-muted)' } }, 'We support scanned PDFs with text. The system will auto-extract all checklist fields.')
        )
      ),
      // Info panel
      React.createElement('div', { className: 'glass rounded-xl border p-6', style: { borderColor: 'var(--glass-border)' } },
        React.createElement('h3', { className: 'text-sm font-bold mb-4 flex items-center gap-2', style: { color: 'var(--text-primary)' } },
          React.createElement(Zap, { size: 16, className: 'text-indigo-500' }), 'How it works'
        ),
        React.createElement('div', { className: 'space-y-3' },
          [ { step: '1', text: 'Upload your checklist PDF', icon: Upload },
            { step: '2', text: 'AI scans and extracts all fields', icon: Search },
            { step: '3', text: 'Review & edit extracted data', icon: Edit3 },
            { step: '4', text: 'Download filled checklist as PDF', icon: Download }
          ].map(function(item, i) {
            var Ico = item.icon
            return React.createElement('div', { key: i, className: 'flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50' },
              React.createElement('div', { className: 'w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0' }, item.step),
              React.createElement(Ico, { size: 14, className: 'text-indigo-500 flex-shrink-0' }),
              React.createElement('span', { className: 'text-xs', style: { color: 'var(--text-secondary)' } }, item.text)
            )
          })
        ),
        React.createElement('div', { className: 'mt-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' },
          React.createElement('p', { className: 'text-xs', style: { color: 'var(--text-secondary)' } },
            React.createElement('strong', null, 'Note: '),
            'If any field cannot be auto-detected, you can manually fill it in the form. All fields are editable.'
          )
        )
      )
    ) : null,

    // FORM (after scanning)
    formData ? React.createElement('div', { id: 'checklist-print', className: 'space-y-6' },
      // Print header (only visible in PDF)
      React.createElement('div', { className: 'hidden print:block mb-6 text-center border-b pb-4' },
        React.createElement('h1', { className: 'text-2xl font-bold text-gray-900' }, 'PAS Freight - Checklist Report'),
        React.createElement('p', { className: 'text-sm text-gray-500' }, 'Generated: ' + new Date().toLocaleString()),
        React.createElement('p', { className: 'text-sm text-gray-500' }, 'Reference: ' + (formData.referenceNumber || 'N/A'))
      ),
      
      // Section cards
      Object.keys(sections).map(function(sectionName) {
        var sectionFields = sections[sectionName]
        return React.createElement('div', { key: sectionName, className: 'glass rounded-xl border p-5', style: { borderColor: 'var(--glass-border)' } },
          React.createElement('h3', { className: 'text-sm font-bold mb-4 flex items-center gap-2', style: { color: 'var(--text-primary)' } },
            React.createElement(Package, { size: 16, className: 'text-indigo-500' }), sectionName
          ),
          React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3' },
            sectionFields.map(function(field) {
              var value = formData[field.key] || ''
              var FieldIcon = field.icon || FileText
              var autoFilled = value.length > 0
              
              return React.createElement('div', { key: field.key },
                React.createElement('label', { className: 'text-[10px] font-semibold mb-1 flex items-center gap-1', style: { color: 'var(--text-secondary)' } },
                  React.createElement(FieldIcon, { size: 10 }),
                  field.label,
                  autoFilled ? React.createElement('span', { className: 'text-emerald-500 text-[9px]' }, '(auto)') : React.createElement('span', { className: 'text-amber-500 text-[9px]' }, '(manual)')
                ),
                React.createElement('input', {
                  type: 'text',
                  value: value,
                  onChange: function(e) { updateField(field.key, e.target.value) },
                  placeholder: autoFilled ? '' : 'Enter ' + field.label.toLowerCase(),
                  className: 'w-full px-3 py-2 glass border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400',
                  style: { borderColor: autoFilled ? 'rgba(16,185,129,0.3)' : 'var(--border-color)', color: 'var(--text-primary)', background: autoFilled ? 'rgba(16,185,129,0.05)' : '' }
                }),
                // Date field if exists
                field.hasDate ? React.createElement('div', { className: 'mt-1' },
                  React.createElement('label', { className: 'text-[9px] font-semibold flex items-center gap-1', style: { color: 'var(--text-muted)' } },
                    React.createElement(Calendar, { size: 9 }), 'Date'
                  ),
                  React.createElement('input', {
                    type: 'text',
                    value: formData[field.hasDate] || '',
                    onChange: function(e) { updateField(field.hasDate, e.target.value) },
                    placeholder: 'Date',
                    className: 'w-full px-3 py-1.5 glass border rounded-lg text-[10px] focus:outline-none focus:ring-2 focus:ring-indigo-400',
                    style: { borderColor: 'var(--border-color)', color: 'var(--text-primary)' }
                  })
                ) : null
              )
            })
          )
        )
      }),

      // Raw text toggle
      React.createElement('div', { className: 'text-center' },
        React.createElement('button', {
          onClick: function() { setShowRaw(!showRaw) },
          className: 'text-xs underline cursor-pointer',
          style: { color: 'var(--text-muted)' }
        }, showRaw ? 'Hide raw extracted text' : 'Show raw extracted text')
      ),
      showRaw ? React.createElement('div', { className: 'glass rounded-xl border p-4', style: { borderColor: 'var(--glass-border)', maxHeight: '200px', overflow: 'auto' } },
        React.createElement('pre', { className: 'text-[10px] whitespace-pre-wrap', style: { color: 'var(--text-muted)' } }, rawText)
      ) : null
    ) : null
  )
}