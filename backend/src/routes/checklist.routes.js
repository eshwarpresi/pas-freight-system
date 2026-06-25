const express = require('express');
const router = express.Router();
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

router.post('/scan', upload.single('checklist'), async function(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Please upload a PDF checklist' });
    }

    var pdfjsLib = await import('pdfjs-dist');
    var uint8Array = new Uint8Array(req.file.buffer);
    var loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    var pdfDocument = await loadingTask.promise;

    var allItems = [];
    for (var pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      var page = await pdfDocument.getPage(pageNum);
      var content = await page.getTextContent();
      var viewport = page.getViewport({ scale: 1 });
      
      content.items.forEach(function(item) {
        allItems.push({
          text: item.str,
          x: Math.round(item.transform[4]),
          y: Math.round(viewport.height - item.transform[5]),
          page: pageNum
        });
      });
    }

    var parsed = parseChecklistUniversal(allItems);
    
    var rawText = allItems.slice().sort(function(a, b) { return a.y - b.y || a.x - b.x; })
      .map(function(i) { return i.text; }).join(' ');
    
    res.json({ status: 'success', data: parsed, rawText: rawText });
  } catch (error) {
    console.error('PDF scan error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to scan PDF: ' + error.message });
  }
});

function parseChecklistUniversal(items) {
  var result = {
    referenceNumber: '', shipmentMode: '', importerName: '', exporterName: '',
    supplierName: '', location: '', jobOrderNo: '', jobOrderDate: '',
    boeSbNo: '', boeSbDate: '', mawbMblNo: '', mawbMblDate: '',
    hawbHblNo: '', hawbHblDate: '', noOfPackages: '', grossWeight: '',
    igmNo: '', igmDate: '', portOfDischarge: '', portOfDestination: '',
    cargoArrivalNotice: '', cargoArrivalDate: '', deliveryOrderDate: '',
    occDate: '', gatePassDate: '', remarks: '', invoiceNo: '', invoiceDate: '',
    agentDebitNote: '', billingCurrency: '', billNo: '', billDate: '',
    billTo: '', billToDate: '', docketNo: '', docketDate: '', additionalRemarks: '',
    // ── SEA SHIPMENT FIELDS ──
    gatewayIgmNo: '', gatewayIgmDate: '', localIgmNo: '', localIgmDate: '',
    containerNo: ''
  };

  var page1Items = items.filter(function(i) { return i.page === 1; })
    .sort(function(a, b) { return a.y - b.y || a.x - b.x; });
  var rawText = page1Items.map(function(i) { return i.text; }).join(' ');

  // Also build no-space version for compact pattern matching
  var rawTextCompact = rawText.replace(/\s+/g, '');

  function tryPatterns(patterns, text) {
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m && m[1] && m[1].trim().length > 0) return m[1].trim();
    }
    return '';
  }

  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  // ── REFERENCE NUMBER ──
  result.referenceNumber = tryPatterns([
    /File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i,
    /ONLINE[-\s]*(\d+)/i,
  ], rawText);

  // ── BOE/SB ──
  result.boeSbNo = tryPatterns([/B\.?E\s*No[,\s]*Date\s*:\s*(\d+)/i], rawText);
  result.boeSbDate = tryPatterns([
    /B\.?E\s*No[,\s]*Date\s*:\s*\d+\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Printed\s*On\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  // ── JOB ORDER ──
  result.jobOrderNo = tryPatterns([/Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)/i], rawText);
  result.jobOrderDate = tryPatterns([
    /Job\s*No\s*[&]?\s*Date\s*:\s*\d+\s*[&]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  // ── LOCATION / PORT ──
  var loc = tryPatterns([
    /Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i,
    /Port\s*Of\s*Filing\s*:\s*([A-Z0-9]+\s*,?\s*[A-Z]+\s*,?\s*[A-Z\s]+)/i,
  ], rawText);
  result.location = loc;
  result.portOfDischarge = loc;

  // ── SHIPMENT MODE ──
  result.shipmentMode = tryPatterns([
    /Transport\s*Mode\s*:\s*(\S)/i,
    /Mode\s*:\s*(\S)/i,
  ], rawText);

  // ── IMPORTER NAME ──
  // Strategy: Find "PAS FREIGHT SERVICES" in the CHA Details block, then the text
  // after it on the same line or next meaningful word group is the importer.
  // Common pattern: "PAS FREIGHT SERVICES   IMPORTER_NAME   #address"
  result.importerName = tryPatterns([
    // Pattern 1: PAS FREIGHT SERVICES followed by company name ending in LTD/LIMITED/PRIVATE
    /PAS\s+FREIGHT\s+SERVICES\s+([\w\s]+?(?:LIMITED|PRIVATE|INTEGRATORS|TECHNOLOGY|LTD)[\w\s]*?)(?:\s+#|\s{2,}|\s+\d)/i,
    // Pattern 2: PAS FREIGHT SERVICES then any capitalized word group before an address
    /PAS\s+FREIGHT\s+SERVICES\s+([A-Z][\w\s]+?(?:LTD|LIMITED|PRIVATE|PVT|INC|CORP|CO\.?)(?:[\w\s]*?))(?:\s+#|\s{2,})/i,
    // Pattern 3: Known importers
    /(ONLINE\s+INSTRUMENTS\s*\(INDIA\)\s*LIMITED)/i,
    /(RESURGENT\s+AV\s+INTEGRATORS\s+PRIVATE\s+LIMITED)/i,
    /(ARION\s+TECHNOLOGY\s+LTD)/i,
    // Pattern 4: Generic - any WORD WORD LTD pattern near CHA Details
    /Importer\s+Details?\s*:?\s*\d*\s+([A-Z][\w\s]+(?:LIMITED|LTD|PRIVATE|PVT)[\w\s]*)/i,
  ], rawText);
  if (result.importerName) result.importerName = result.importerName.replace(/\s+/g, ' ').trim();

  // ── GSTIN ──
  var gstMatch = rawText.match(/GSTIN\s*:?\s*(\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d])/i);
  
  if (!gstMatch) {
    gstMatch = rawTextCompact.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d])/i);
  }
  
  if (!gstMatch) {
    var looseMatch = rawText.match(/\b(\d{2}[A-Z0-9]{13})\b/i);
    if (looseMatch) {
      var candidate = looseMatch[1];
      if (/[A-Z]/.test(candidate) && /\d/.test(candidate.substring(2))) {
        gstMatch = looseMatch;
      }
    }
  }
  
  if (!gstMatch) {
    var looseCompact = rawTextCompact.match(/(\d{2}[A-Z0-9]{13})/i);
    if (looseCompact) {
      var candidate2 = looseCompact[1];
      if (/[A-Z]/.test(candidate2) && /\d/.test(candidate2.substring(2))) {
        gstMatch = looseCompact;
      }
    }
  }
  
  if (gstMatch) {
    result.additionalRemarks = 'GSTIN: ' + gstMatch[1].toUpperCase();
  }

  // ── IGM ──
  result.igmNo = tryPatterns([
    /IGM\s*NO\s*:\s*(\d+)/i,
    /IGM\s*No\s*:?\s*(\d+)/i,
  ], rawText);
  
  result.igmDate = tryPatterns([
    /IGM\s*NO\s*:\s*\d+\s*\/\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /IGM\s*No\s*:?\s*\d+[\s\/]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  // ── GATEWAY IGM ──
  result.gatewayIgmNo = tryPatterns([
    /Gateway\s*IGM\s*:\s*(\d+)/i,
  ], rawText);
  
  result.gatewayIgmDate = tryPatterns([
    /Gateway\s*IGM\s*:\s*\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);
  
  if (!result.cargoArrivalNotice) {
    result.cargoArrivalNotice = result.gatewayIgmNo;
  }
  if (!result.cargoArrivalDate) {
    result.cargoArrivalDate = result.gatewayIgmDate;
  }

  // ── CONTAINER NUMBER ──
  result.containerNo = tryPatterns([
    /CONTAINER\s*(?:NO|DETAILS|NUMBER)[\s\S]*?([A-Z]{4}\d{7})/i,
    /Container\s*(?:No|Number)?\s*:?\s*([A-Z]{4}\d{7})/i,
    /([A-Z]{4}\d{7})/i,
  ], rawText);

  // ── PORT OF DESTINATION ──
  result.portOfDestination = tryPatterns([
    /Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i,
    /Destination\s*(?:Port)?\s*:?\s*([A-Z]+-[A-Z]+)/i,
    /Port\s*Origin\s*:\s*([A-Z]+-[A-Z]+)/i,
  ], rawText);

  // ── MAWB/MBL ──
  result.mawbMblNo = tryPatterns([
    /MBL\/\s*MAWB\s*:\s*([A-Z0-9]+)/i,
    /MAWB\s*(?:No)?\s*:?\s*([A-Z0-9]+)/i,
  ], rawText);
  
  // Extract MAWB/MBL and HAWB/HBL dates more intelligently
  var awbStart = rawText.indexOf('MBL/MAWB');
  if (awbStart < 0) awbStart = rawText.indexOf('MAWB');
  if (awbStart >= 0) {
    var awbChunk = rawText.substring(awbStart, awbStart + 800);
    
    // Find "Date : DD-MM-YYYY" patterns in the AWB chunk
    var dateMatches = awbChunk.match(/Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g);
    if (dateMatches) {
      var dates = dateMatches.map(function(d) { return d.replace(/Date\s*:\s*/, '').trim(); });
      // First date is MAWB/MBL date
      if (dates.length >= 1 && dates[0] && dates[0].length > 4) {
        result.mawbMblDate = dates[0];
      }
      // Second date is HAWB/HBL date
      if (dates.length >= 2 && dates[1] && dates[1].length > 4) {
        result.hawbHblDate = dates[1];
      }
    }
  }

  // ── HAWB/HBL ──
  result.hawbHblNo = tryPatterns([
    /HBL\/\s*HAWB\s*:\s*([A-Z0-9]+)/i,
    /HAWB\s*(?:No)?\s*:?\s*([A-Z0-9]+)/i,
  ], rawText);
  
  // If HAWB/HBL extracted value is "Date" or other garbage, clear it
  if (result.hawbHblNo && !/[A-Z]/.test(result.hawbHblNo)) {
    result.hawbHblNo = '';
  }
  if (result.hawbHblNo && result.hawbHblNo.length < 3) {
    result.hawbHblNo = '';
  }

  // ── PACKAGES & WEIGHT ──
  result.noOfPackages = tryPatterns([
    /No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i,
    /Pkgs\s*:\s*(\d+)/i,
  ], rawText);
  
  result.grossWeight = tryPatterns([
    /Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i,
    /Weight\s*:\s*([\d.]+\s*KGS)/i,
  ], rawText);

  // ── MARKS & NOS ──
  result.remarks = tryPatterns([
    /Marks\s*[&]?\s*Nos\s*:\s*([A-Z0-9]+[-\/\s]+[A-Z0-9]+)/i,
    /Marks\s*[&]?\s*Nos\s*:?\s*(.+?)(?:\s{2,}|$)/i,
  ], rawText);

  // ── SUPPLIER / EXPORTER ──
  result.supplierName = tryPatterns([
    /Inv\.?\s*Sl\.?\s*No\s*:\s*\d+\s+([A-Z][\w\s]+(?:PTE|LTD|CO\.?,?\s*LTD|PRINTING|TECHNOLOGY)[\w\s]*)/i,
    /(TCL\s+SMART\s+HOMETECHNOLOGIES\s*CO\.?,?\s*LTD)/i,
    /(CRESTRON\s+SINGAPORE\s+PTE\s+LTD)/i,
    /(YUAN\s+HENG\s+TAI\s+WATER\s+TRANSFER\s+PRINTING\s+CO\s+LTD)/i,
    /Supplier\s*:?\s*(.+?)(?:\s{2,}|$)/i,
    // Fallback: Look for company names in SUPPLIER DETAILS section
    /SUPPLIER\s+DETAILS[\s\S]{0,200}?\b([A-Z][\w\s]+(?:LTD|LIMITED|PTE|CO\.?,?\s*LTD|PRINTING|TECHNOLOGY)[\w\s]*)/i,
  ], rawText);
  if (result.supplierName) {
    result.supplierName = result.supplierName.replace(/\s+/g, ' ').trim();
    result.exporterName = result.supplierName;
  }

  // ── INVOICE ──
  result.invoiceNo = tryPatterns([
    /Inv\.?\s*No\s*:\s*([A-Z0-9]+[-\/]?\d*[A-Z]?[-\/]?\d*)/i,
    /Invoice\s*(?:No|Number)\s*:?\s*([A-Z0-9\-]+)/i,
  ], rawText);
  
  result.invoiceDate = tryPatterns([
    /Inv\.?\s*Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Invoice\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);
  
  result.billingCurrency = tryPatterns([
    /Inv\.?\s*Value\s*:\s*([\d.]+\s*[A-Z]{3})/i,
    /Invoice\s*Value\s*:?\s*([\d.]+\s*[A-Z]{3})/i,
  ], rawText);

  // ── FREIGHT CHARGES ──
  result.billNo = tryPatterns([
    /Freight\s*:?\s*([\d.]+\s*[A-Z]{3})/i,
    /Freight\s*Charges?\s*:?\s*([\d.]+\s*[A-Z]{3})/i,
  ], rawText);

  // ── EXCHANGE RATE ──
  result.billDate = tryPatterns([
    /Exchange\s*Rate\s*:\s*([\d.]+\s*[A-Z]{3}\s*=\s*[\d.]+\s*INR)/i,
    /Exchange\s*Rate\s*:?\s*(.+?)(?:\s{2,}|$)/i,
  ], rawText);

  // ── DELIVERY ORDER DATE ──
  result.deliveryOrderDate = tryPatterns([
    /DO\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Delivery\s*Order\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /DO\s*Collection\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  // ── OCC DATE ──
  result.occDate = tryPatterns([
    /OCC\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /OOC\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /OOC\s*Done\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  // ── GATE PASS DATE ──
  result.gatePassDate = tryPatterns([
    /Gate\s*Pass\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Gate\s*Pass\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  // ── POST-PROCESSING: Clean up extracted values ──
  
  // If importer still empty, try extracting from the CHA/Importer signature block
  if (!result.importerName) {
    // Look for company name after "PAS FREIGHT SERVICES" in the signature area
    var sigMatch = rawText.match(/PAS\s+FREIGHT\s+SERVICES\s+([A-Z][\w\s]+?(?:LTD|LIMITED|PRIVATE|TECHNOLOGY))/i);
    if (sigMatch && sigMatch[1]) {
      result.importerName = sigMatch[1].replace(/\s+/g, ' ').trim();
    }
  }

  // Clean HAWB/HBL - if it looks like a date, clear it
  if (result.hawbHblNo && /^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/.test(result.hawbHblNo)) {
    result.hawbHblNo = '';
  }
  if (result.hawbHblNo && result.hawbHblNo.toLowerCase() === 'date') {
    result.hawbHblNo = '';
  }

  return result;
}

module.exports = router;