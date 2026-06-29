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
  var [isSeaChecked, setIsSeaChecked] = useState(false)
  var [isAirChecked, setIsAirChecked] = useState(false)
  var [detectedShipmentType, setDetectedShipmentType] = useState('')
  var fileInputRef = useRef(null)
  var pdfRef = useRef(null)

  var isSeaShipment = shipmentType === 'Sea FCL' || shipmentType === 'Sea LCL' || shipmentType === 'Sea' || shipmentType === 'Sea'

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
      
      // Auto-detect shipment type from API response
      if (res.data.data && res.data.data.shipmentType) {
        var detected = res.data.data.shipmentType
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
        logging: false,
        width: 794,
        height: 1123,
        onclone: function(clonedDoc) {
          var element = clonedDoc.getElementById('checklist-print-content')
          if (element) {
            element.style.display = 'block'
          }
        }
      })
      var imgData = canvas.toDataURL('image/png')
      var pdf = new jsPDF('p', 'mm', 'a4')
      var pdfWidth = 210
      var pdfHeight = (canvas.height * pdfWidth) / canvas.width
      if (pdfHeight > 297) pdfHeight = 297
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save('PAS_Checklist_' + (F('referenceNumber') || 'Report') + '.pdf')
    } catch (err) {
      console.error('PDF generation error:', err)
      alert('Failed to generate PDF. Please try again.')
    }
    setDownloading(false)
  }

  function handleReset() { setFile(null); setFormData(null); setRawText(''); setShipmentType(''); setIsSeaChecked(false); setIsAirChecked(false); setDetectedShipmentType(''); if (fileInputRef.current) fileInputRef.current.value = '' }

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
        React.createElement('select', { value: shipmentType, onChange: function(e) { 
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
        }, className: 'px-3 py-2 border rounded-lg text-sm font-semibold', style: { borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--input-bg)' } },
          React.createElement('option', { value: '' }, '-- Select --'),
          React.createElement('option', { value: 'Air' }, '✈ Air'),
          React.createElement('option', { value: 'Sea FCL' }, '🚢 Sea FCL'),
          React.createElement('option', { value: 'Sea LCL' }, '🚢 Sea LCL'),
          React.createElement('option', { value: 'Sea' }, '🚢 Sea'),
          React.createElement('option', { value: 'Local Transport' }, '🚛 Local Transport')
        ),
        detectedShipmentType ? React.createElement('span', { className: 'px-3 py-1.5 rounded-full text-xs font-bold', style: { background: '#d1fae5', color: '#065f46' } }, '🔍 Detected: ' + detectedShipmentType) : null,
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
          
          // ── SEA SECTION (only show for Sea shipments) ──
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
      // FINAL OFFICE DOCKET - PERFECTED
      // ═══════════════════════════════════════════
      React.createElement('div', {
        id: 'checklist-print-content',
        ref: pdfRef,
        style: {
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: '794px',
          height: '1123px',
          background: '#ffffff',
          fontFamily: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
          padding: '28px 36px',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }
      },
        // ── WATERMARK LOGO ──
        logo ? React.createElement('img', {
          src: logo,
          style: {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            opacity: 0.18,
            zIndex: 0,
            width: '600px',
            height: 'auto',
            maxHeight: '800px',
            objectFit: 'contain',
            pointerEvents: 'none',
            userSelect: 'none'
          }
        }) : null,

        React.createElement('div', { style: { position: 'relative', zIndex: 1 } },

          // ═══ HEADER ── LOGO LEFT + COMPANY RIGHT ═══
          React.createElement('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '12px',
              borderBottom: '3px solid #0a0a1a',
              paddingBottom: '10px'
            }
          },
            // ── LOGO LEFT ──
            React.createElement('div', {
              style: {
                flexShrink: 0,
                width: '80px',
                height: '80px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }
            },
              logo ? React.createElement('img', {
                src: logo,
                alt: 'PAS Logo',
                style: {
                  maxWidth: '100%',
                  maxHeight: '75px',
                  objectFit: 'contain',
                  display: 'block'
                }
              }) : React.createElement('div', {
                style: {
                  fontSize: '26px',
                  fontWeight: '900',
                  color: '#0a0a1a',
                  letterSpacing: '2px',
                  fontFamily: '"Inter", sans-serif'
                }
              }, 'PAS')
            ),

            // ── COMPANY DETAILS RIGHT ──
            React.createElement('div', {
              style: {
                flex: 1,
                textAlign: 'center'
              }
            },
              React.createElement('div', {
                style: {
                  fontSize: '17px',
                  fontWeight: '800',
                  color: '#0a0a1a',
                  letterSpacing: '1.5px',
                  fontFamily: '"Inter", sans-serif',
                  marginBottom: '3px'
                }
              }, 'PAS FREIGHT SERVICES PVT LTD'),
              React.createElement('div', {
                style: {
                  fontSize: '9px',
                  color: '#4b5563',
                  lineHeight: '1.6',
                  fontWeight: '500',
                  letterSpacing: '0.3px',
                  fontFamily: '"Inter", sans-serif'
                }
              }, 'SITE NO:171, ARKAVATHEY LAYOUT 7TH BLOCK, SY NO.90/3, JAKKUR-BDA, BANGALORE -560064'),
              React.createElement('div', {
                style: {
                  fontSize: '9px',
                  color: '#4b5563',
                  lineHeight: '1.6',
                  fontWeight: '500',
                  letterSpacing: '0.3px',
                  fontFamily: '"Inter", sans-serif'
                }
              }, 'LANDLINE: +91 80-43722701  |  WWW.PASFREIGHT.COM')
            )
          ),

          // ═══ OFFICE DOCKET TITLE ═══
          React.createElement('div', {
            style: {
              borderTop: '2px solid #0a0a1a',
              borderBottom: '2px solid #0a0a1a',
              padding: '8px 0',
              marginBottom: '14px',
              textAlign: 'center'
            }
          },
            React.createElement('div', {
              style: {
                fontSize: '16px',
                fontWeight: '900',
                color: '#0a0a1a',
                letterSpacing: '4px',
                textTransform: 'uppercase',
                fontFamily: '"Inter", sans-serif'
              }
            }, 'OFFICE DOCKET')
          ),

          // ═══ ALL FIELDS ── EXACT ORDER ═══
          React.createElement('div', {
            style: {
              fontSize: '0',
              fontFamily: '"Inter", sans-serif'
            }
          },
            (function() {
              var rows = []
              
              function FieldRow(label, value, dateLabel, dateValue) {
                var displayValue = value || '_______________________'
                var displayDate = dateValue || '__________'
                
                rows.push(
                  React.createElement('div', {
                    key: label + rows.length,
                    style: {
                      display: 'flex',
                      borderBottom: '1px solid #e5e7eb',
                      padding: '4px 0',
                      alignItems: 'center',
                      minHeight: '26px'
                    }
                  },
                    React.createElement('div', {
                      style: {
                        fontSize: '9.5px',
                        fontWeight: '700',
                        color: '#0a0a1a',
                        width: '155px',
                        flexShrink: 0,
                        letterSpacing: '0.3px',
                        fontFamily: '"Inter", sans-serif'
                      }
                    }, label),
                    React.createElement('div', {
                      style: {
                        fontSize: '10.5px',
                        fontWeight: '600',
                        color: '#0a0a1a',
                        flex: 1,
                        paddingLeft: '10px',
                        fontFamily: '"Inter", sans-serif',
                        letterSpacing: '0.2px'
                      }
                    }, displayValue),
                    dateLabel ? React.createElement('div', {
                      style: {
                        fontSize: '8.5px',
                        fontWeight: '600',
                        color: '#6b7280',
                        marginLeft: '6px',
                        fontFamily: '"Inter", sans-serif'
                      }
                    }, dateLabel + ':') : null,
                    dateLabel ? React.createElement('div', {
                      style: {
                        fontSize: '9.5px',
                        fontWeight: '600',
                        color: '#0a0a1a',
                        marginLeft: '3px',
                        minWidth: '75px',
                        fontFamily: '"Inter", sans-serif'
                      }
                    }, displayDate) : null
                  )
                )
              }

              function SectionTitle(title) {
                rows.push(
                  React.createElement('div', {
                    key: 'section-' + title + rows.length,
                    style: {
                      background: '#0a0a1a',
                      color: '#ffffff',
                      textAlign: 'center',
                      padding: '5px 0',
                      margin: '6px 0',
                      fontSize: '9px',
                      fontWeight: '700',
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      fontFamily: '"Inter", sans-serif'
                    }
                  }, title)
                )
              }

              // ── ALL FIELDS IN EXACT ORDER ──
              FieldRow('REFERENCE NUMBER', F('referenceNumber'))
              
              // Shipment Mode with checkboxes
              rows.push(
                React.createElement('div', {
                  key: 'shipment-mode',
                  style: {
                    display: 'flex',
                    borderBottom: '1px solid #e5e7eb',
                    padding: '4px 0',
                    alignItems: 'center',
                    minHeight: '26px'
                  }
                },
                  React.createElement('div', {
                    style: {
                      fontSize: '9.5px',
                      fontWeight: '700',
                      color: '#0a0a1a',
                      width: '155px',
                      flexShrink: 0,
                      letterSpacing: '0.3px',
                      fontFamily: '"Inter", sans-serif'
                    }
                  }, 'SHIPMENT MODE'),
                  React.createElement('div', {
                    style: {
                      display: 'flex',
                      gap: '20px',
                      paddingLeft: '10px',
                      flex: 1
                    }
                  },
                    React.createElement('div', {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '9.5px',
                        fontWeight: '700',
                        color: '#0a0a1a',
                        fontFamily: '"Inter", sans-serif'
                      }
                    },
                      React.createElement('span', {
                        style: {
                          display: 'inline-block',
                          width: '13px',
                          height: '13px',
                          border: '2px solid #0a0a1a',
                          background: isAirChecked ? '#0a0a1a' : 'transparent',
                          textAlign: 'center',
                          lineHeight: '11px',
                          fontSize: '8px',
                          color: isAirChecked ? '#ffffff' : '#0a0a1a'
                        }
                      }, isAirChecked ? '✓' : ''),
                      'BY AIR'
                    ),
                    React.createElement('div', {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '9.5px',
                        fontWeight: '700',
                        color: '#0a0a1a',
                        fontFamily: '"Inter", sans-serif'
                      }
                    },
                      React.createElement('span', {
                        style: {
                          display: 'inline-block',
                          width: '13px',
                          height: '13px',
                          border: '2px solid #0a0a1a',
                          background: isSeaChecked ? '#0a0a1a' : 'transparent',
                          textAlign: 'center',
                          lineHeight: '11px',
                          fontSize: '8px',
                          color: isSeaChecked ? '#ffffff' : '#0a0a1a'
                        }
                      }, isSeaChecked ? '✓' : ''),
                      'BY SEA'
                    )
                  )
                )
              )

              FieldRow('IMPORTER/EXPORTER NAME', F('importerName'))
              FieldRow('SUPPLIER NAME', F('supplierName'))
              FieldRow('LOCATION', F('location'))
              FieldRow('JOB ORDER NO', F('jobOrderNo'), 'DATE', F('jobOrderDate'))
              FieldRow('BOE/SB NUMBER', F('boeSbNo'), 'DATE', F('boeSbDate'))
              FieldRow('MAWB/MBL NUMBER', F('mawbMblNo'), 'DATE', F('mawbMblDate'))
              FieldRow('HAWB/HBL NUMBER', F('hawbHblNo'), 'DATE', F('hawbHblDate'))
              FieldRow('NO OF PACKAGES', F('noOfPackages'))
              FieldRow('GROSS WEIGHT', F('grossWeight'))
              
              // Only show IGM for Sea shipments in print
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
              
              // ── FOR ACCOUNTS PURPOSE ── SECTION TITLE ──
              SectionTitle('FOR ACCOUNTS PURPOSE')
              
              FieldRow('AGENT DEBIT NOTE', 'PAS FREIGHT SERVICES')
              FieldRow('BILLING CURRENCY', F('billingCurrency'))
              FieldRow('BILL NUMBER', F('billNo'), 'DATE', F('billDate'))
              FieldRow('BILL TO', F('billTo'))
              FieldRow('DOCKET NUMBER', F('docketNo'), 'DATE', F('docketDate'))
              FieldRow('REMARKS', F('additionalRemarks'))
              FieldRow('GSTIN', '29AALCP2369R1ZD')

              return rows
            })()
          ),

          // ═══ FOOTER ═══
          React.createElement('div', {
            style: {
              marginTop: '12px',
              textAlign: 'center',
              fontSize: '8.5px',
              color: '#9ca3af',
              borderTop: '1px solid #e5e7eb',
              paddingTop: '8px',
              fontWeight: '500',
              fontFamily: '"Inter", sans-serif',
              letterSpacing: '0.5px'
            }
          }, 'Page 1 of 1  •  Generated by PAS Checklist Scanner')
        )
      )
    ) : null
  )
}