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
    gatewayIgmNo: '', gatewayIgmDate: '', localIgmNo: '', localIgmDate: '',
    containerNo: ''
  };

  var page1Items = items.filter(function(i) { return i.page === 1; })
    .sort(function(a, b) { return a.y - b.y || a.x - b.x; });
  var rawText = page1Items.map(function(i) { return i.text; }).join(' ');
  var rawTextCompact = rawText.replace(/\s+/g, '');

  function tryPatterns(patterns, text) {
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m && m[1] && m[1].trim().length > 0) return m[1].trim();
    }
    return '';
  }

  function cleanCompanyName(name) {
    if (!name) return '';
    return name.replace(/\s+(Inv\.?|SUPPLIER|DETAILS|CHA|Importer|GSTIN)\s*$/i, '').trim();
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
  result.importerName = tryPatterns([
    /PAS\s+FREIGHT\s+SERVICES\s+([\w\s]+?(?:LIMITED|PRIVATE|INTEGRATORS|TECHNOLOGY|LTD)[\w\s]*?)(?:\s+#|\s{2,}|\s+\d)/i,
    /PAS\s+FREIGHT\s+SERVICES\s+([A-Z][\w\s]+?(?:LTD|LIMITED|PRIVATE|PVT|INC|CORP|CO\.?)(?:[\w\s]*?))(?:\s+#|\s{2,})/i,
    /(ONLINE\s+INSTRUMENTS\s*\(INDIA\)\s*LIMITED)/i,
    /(RESURGENT\s+AV\s+INTEGRATORS\s+PRIVATE\s+LIMITED)/i,
    /(ARION\s+TECHNOLOGY\s+LTD)/i,
    /Importer\s+Details?\s*:?\s*\d*\s+([A-Z][\w\s]+(?:LIMITED|LTD|PRIVATE|PVT)[\w\s]*)/i,
  ], rawText);
  result.importerName = cleanCompanyName(result.importerName);

  // ── GSTIN ──
  var gstMatch = rawText.match(/GSTIN\s*:?\s*(\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d])/i);
  if (!gstMatch) gstMatch = rawTextCompact.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d])/i);
  if (!gstMatch) {
    var looseMatch = rawText.match(/\b(\d{2}[A-Z0-9]{13})\b/i);
    if (looseMatch && /[A-Z]/.test(looseMatch[1]) && /\d/.test(looseMatch[1].substring(2))) gstMatch = looseMatch;
  }
  if (!gstMatch) {
    var looseCompact = rawTextCompact.match(/(\d{2}[A-Z0-9]{13})/i);
    if (looseCompact && /[A-Z]/.test(looseCompact[1]) && /\d/.test(looseCompact[1].substring(2))) gstMatch = looseCompact;
  }
  if (gstMatch) {
    result.additionalRemarks = 'GSTIN: ' + gstMatch[1].toUpperCase();
  }

  // ── IGM ──
  result.igmNo = tryPatterns([/IGM\s*NO\s*:\s*(\d+)/i, /IGM\s*No\s*:?\s*(\d+)/i], rawText);
  result.igmDate = tryPatterns([
    /IGM\s*NO\s*:\s*\d+\s*\/\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /IGM\s*No\s*:?\s*\d+[\s\/]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  // ── GATEWAY IGM ──
  result.gatewayIgmNo = tryPatterns([/Gateway\s*IGM\s*:\s*(\d+)/i], rawText);
  result.gatewayIgmDate = tryPatterns([/Gateway\s*IGM\s*:\s*\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], rawText);
  if (!result.cargoArrivalNotice) result.cargoArrivalNotice = result.gatewayIgmNo;
  if (!result.cargoArrivalDate) result.cargoArrivalDate = result.gatewayIgmDate;

  // ── CONTAINER NUMBER ──
  // Fix: Look for container in CONTAINER DETAILS section specifically
  // Pattern: "1 / 1   TLLU1178760   NA   L" (4 letters + 7 digits = container number)
  var containerMatch = rawText.match(/CONTAINER\s+(?:NO\.?|DETAILS|NUMBER)[\s\S]{0,300}?([A-Z]{4}\d{7})/i);
  if (!containerMatch) {
    // Try the compact format: "1 / 1 TLLU1178760"
    containerMatch = rawText.match(/(?:^|\s)([A-Z]{4}\d{7})(?:\s|$)/);
  }
  if (containerMatch && containerMatch[1]) {
    result.containerNo = containerMatch[1];
  }

  // ── PORT OF DESTINATION ──
  result.portOfDestination = tryPatterns([
    /Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i,
    /Destination\s*(?:Port)?\s*:?\s*([A-Z]+-[A-Z]+)/i,
    /Port\s*Origin\s*:\s*([A-Z]+-[A-Z]+)/i,
  ], rawText);

  // ═══════════════════════════════════════════
  // ── MAWB/MBL + HAWB/HBL ──
  // ═══════════════════════════════════════════
  // Strategy: Search the ENTIRE raw text, not just an 800-char chunk
  
  // Find the AWB section: look for "MBL/MAWB" or "HBL/HAWB" anywhere in raw text
  var awbSectionStart = rawText.indexOf('MBL/MAWB');
  if (awbSectionStart < 0) awbSectionStart = rawText.indexOf('MAWB');
  
  // Also find "Date :" patterns near MBL/MAWB for context
  // But the Date might be far away, so search full text
  
  // MAWB/MBL number
  result.mawbMblNo = tryPatterns([
    /MBL\/\s*MAWB\s*:\s*([A-Z0-9]+)/i,
    /MAWB\s*(?:No)?\s*:?\s*([A-Z0-9]+)/i,
  ], rawText);

  // MAWB date: find "Date :" that appears near MAWB in the AWB line
  // In some PDFs the Date is in the same line, in others it's separate
  if (awbSectionStart >= 0) {
    var afterAwb = rawText.substring(awbSectionStart, awbSectionStart + 500);
    var dateInAwb = afterAwb.match(/Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
    if (dateInAwb && dateInAwb[1]) {
      result.mawbMblDate = dateInAwb[1].trim();
    }
  }
  // Fallback: find any "Date : XX-XX-XXXX" near "MBL" or "MAWB" in full text
  if (!result.mawbMblDate) {
    var mawbPos = rawText.indexOf('MBL');
    if (mawbPos < 0) mawbPos = rawText.indexOf('MAWB');
    if (mawbPos >= 0) {
      var nearMawb = rawText.substring(Math.max(0, mawbPos - 300), mawbPos + 500);
      var dateNearMawb = nearMawb.match(/Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
      if (dateNearMawb && dateNearMawb[1]) {
        result.mawbMblDate = dateNearMawb[1].trim();
      }
    }
  }

  // HAWB/HBL number
  result.hawbHblNo = tryPatterns([
    /HBL\/\s*HAWB\s*:\s*([A-Z0-9]+)/i,
    /HAWB\s*(?:No)?\s*:?\s*([A-Z0-9]+)/i,
  ], rawText);
  
  // If standard pattern failed, find HBL and grab the next 7-12 digit number
  if (!result.hawbHblNo || result.hawbHblNo.length < 3) {
    var hblPos = rawText.indexOf('HBL');
    if (hblPos >= 0) {
      var nearHbl = rawText.substring(hblPos, hblPos + 150);
      var numMatch = nearHbl.match(/(\d{7,12})/);
      if (numMatch && numMatch[1]) {
        var numVal = numMatch[1];
        // Don't capture IGM numbers (typically 7 digits starting with 4)
        // HAWB numbers are typically 7-10 digits
        if (numVal.length >= 7 && numVal.length <= 12) {
          result.hawbHblNo = numVal;
        }
      }
    }
  }

  // Clean HAWB value
  if (result.hawbHblNo) {
    var lowerHawb = result.hawbHblNo.toLowerCase();
    if (lowerHawb === 'date' || lowerHawb === 'nos' || lowerHawb === 'printed' ||
        lowerHawb === 'on' || lowerHawb === 'gross' || lowerHawb === 'marks' ||
        result.hawbHblNo.length < 3) {
      result.hawbHblNo = '';
    }
  }

  // HAWB date: find date right after the HAWB number in the raw text
  if (result.hawbHblNo) {
    var escapedNo = result.hawbHblNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var hawbDatePattern = new RegExp(escapedNo + '\\s+(\\d{1,2}[-\\/]\\d{1,2}[-\\/]\\d{2,4})');
    var hawbDateMatch = rawText.match(hawbDatePattern);
    if (hawbDateMatch && hawbDateMatch[1]) {
      result.hawbHblDate = hawbDateMatch[1];
    }
  }
  
  // If HAWB date still empty, find date near HBL position in full text
  if (!result.hawbHblDate) {
    var hblSearchPos = rawText.indexOf('HBL');
    if (hblSearchPos >= 0) {
      var nearHblDate = rawText.substring(hblSearchPos, hblSearchPos + 200);
      // Find date that's NOT the MAWB date
      var datesInHbl = nearHblDate.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g);
      if (datesInHbl) {
        for (var di = 0; di < datesInHbl.length; di++) {
          if (datesInHbl[di] !== result.mawbMblDate) {
            result.hawbHblDate = datesInHbl[di];
            break;
          }
        }
      }
    }
  }

  // ── PACKAGES & WEIGHT ──
  result.noOfPackages = tryPatterns([/No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i, /Pkgs\s*:\s*(\d+)/i], rawText);
  result.grossWeight = tryPatterns([/Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i, /Weight\s*:\s*([\d.]+\s*KGS)/i], rawText);

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
    /SUPPLIER\s+DETAILS[\s\S]{0,200}?\b([A-Z][\w\s]+(?:LTD|LIMITED|PTE|CO\.?,?\s*LTD|PRINTING|TECHNOLOGY)[\w\s]*)/i,
  ], rawText);
  if (result.supplierName) {
    result.supplierName = cleanCompanyName(result.supplierName);
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
  result.billNo = tryPatterns([/Freight\s*:?\s*([\d.]+\s*[A-Z]{3})/i, /Freight\s*Charges?\s*:?\s*([\d.]+\s*[A-Z]{3})/i], rawText);
  result.billDate = tryPatterns([
    /Exchange\s*Rate\s*:\s*([\d.]+\s*[A-Z]{3}\s*=\s*[\d.]+\s*INR)/i,
    /Exchange\s*Rate\s*:?\s*(.+?)(?:\s{2,}|$)/i,
  ], rawText);

  // ── DO/OCC/GATE PASS ──
  result.deliveryOrderDate = tryPatterns([
    /DO\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Delivery\s*Order\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);
  result.occDate = tryPatterns([
    /OCC\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /OOC\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);
  result.gatePassDate = tryPatterns([
    /Gate\s*Pass\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Gate\s*Pass\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  // ── FINAL CLEANUP ──
  result.importerName = cleanCompanyName(result.importerName);
  result.exporterName = cleanCompanyName(result.exporterName);
  result.supplierName = cleanCompanyName(result.supplierName);

  return result;
}

module.exports = router;