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
    billTo: '', billToDate: '', docketNo: '', docketDate: '', additionalRemarks: ''
  };

  var sortedItems = items.slice().sort(function(a, b) { return a.y - b.y || a.x - b.x; });
  var rawText = sortedItems.map(function(i) { return i.text; }).join(' ');

  function tryPatterns(patterns, text) {
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m && m[1] && m[1].trim().length > 0) return m[1].trim();
    }
    return '';
  }

  // ===== REFERENCE NUMBER =====
  result.referenceNumber = tryPatterns([
    /File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i,
  ], rawText);

  // ===== B.E No & Date =====
  result.boeSbNo = tryPatterns([/B\.?E\s*No[,\s]*Date\s*:\s*(\d+)/i], rawText);
  result.boeSbDate = tryPatterns([
    /B\.?E\s*No[,\s]*Date\s*:\s*\d+\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Printed\s*On\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  // ===== Job No & Date =====
  result.jobOrderNo = tryPatterns([/Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)/i], rawText);
  result.jobOrderDate = tryPatterns([
    /Job\s*No\s*[&]?\s*Date\s*:\s*\d+\s*[&]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  // ===== Port Of Filing =====
  result.location = tryPatterns([
    /Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i,
  ], rawText);
  result.portOfDischarge = result.location;

  // ===== Transport Mode =====
  result.shipmentMode = tryPatterns([/Transport\s*Mode\s*:\s*(\S)/i], rawText);

  // ===== CHA / Agent =====
  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  // ===== IMPORTER =====
  result.importerName = tryPatterns([
    /PAS\s+FREIGHT\s+SERVICES\s+([\w\s]+(?:PRIVATE|LIMITED|INTEGRATORS)[\w\s]*?)(?:\s+#|\s{2,})/i,
    /PAS\s+FREIGHT\s+SERVICES\s+([\w\s]+?\(INDIA\)\s*(?:PRIVATE|LIMITED|LTD))/i,
    /(ONLINE\s+INSTRUMENTS\s*\(INDIA\)\s*LIMITED)/i,
    /(RESURGENT\s+AV\s+INTEGRATORS\s+PRIVATE\s+LIMITED)/i,
  ], rawText);
  if (result.importerName) result.importerName = result.importerName.replace(/\s+/g, ' ').trim();

  // ===== GSTIN =====
  var gstMatch = rawText.match(/GSTIN\s*:?\s*(\d{2}[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/i);
  if (!gstMatch) {
    var noSpace = rawText.replace(/\s+/g, '');
    gstMatch = noSpace.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/);
  }
  if (gstMatch) result.additionalRemarks = 'GSTIN: ' + gstMatch[1];

  // ===== IGM =====
  result.igmNo = tryPatterns([/IGM\s*NO\s*:\s*(\d+)/i], rawText);
  result.igmDate = tryPatterns([/IGM\s*NO\s*:\s*\d+\s*\/\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], rawText);

  // ===== Gateway =====
  result.cargoArrivalNotice = tryPatterns([/Gateway\s*IGM\s*:\s*(\d+)/i], rawText);
  result.cargoArrivalDate = tryPatterns([/Gateway\s*Port\s*:\s*([A-Za-z]+\([A-Z]+\)-[A-Z0-9]+)/i], rawText);

  // ===== Port of Destination (Port Shipment) =====
  result.portOfDestination = tryPatterns([/Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i], rawText);

  // ===== MBL/MAWB & Date =====
  result.mawbMblNo = tryPatterns([/MBL\/\s*MAWB\s*:\s*([A-Z0-9]+)/i], rawText);
  var mblIdx = rawText.indexOf('MBL/MAWB');
  if (mblIdx >= 0) {
    var afterMbl = rawText.substring(mblIdx, mblIdx + 300);
    var dateMatch = afterMbl.match(/Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
    if (dateMatch) result.mawbMblDate = dateMatch[1];
  }

  // ===== HBL/HAWB & Date =====
  result.hawbHblNo = tryPatterns([/HBL\/\s*HAWB\s*:\s*([A-Z0-9]+)/i], rawText);
  var hblIdx = rawText.indexOf('HBL/HAWB');
  if (hblIdx >= 0) {
    var afterHbl = rawText.substring(hblIdx, hblIdx + 300);
    var dates = afterHbl.match(/Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g);
    if (dates && dates.length >= 2) {
      result.hawbHblDate = dates[1].replace(/Date\s*:\s*/, '').trim();
    } else if (dates && dates.length >= 1) {
      result.hawbHblDate = dates[0].replace(/Date\s*:\s*/, '').trim();
    }
  }

  // ===== Packages =====
  result.noOfPackages = tryPatterns([/No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i], rawText);

  // ===== Gross Weight =====
  result.grossWeight = tryPatterns([/Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i], rawText);

  // ===== Marks & Nos =====
  result.remarks = tryPatterns([/Marks\s*[&]?\s*Nos\s*:\s*([A-Z0-9]+[-\/\s]+[A-Z0-9]+)/i], rawText);

  // ===== SUPPLIER & EXPORTER =====
  result.supplierName = tryPatterns([
    /Inv\.?\s*Sl\.?\s*No\s*:\s*\d+\s+([A-Z][\w\s]+(?:PTE|LTD|CO\.?,?\s*LTD))/i,
    /(TCL\s+SMART\s+HOMETECHNOLOGIES\s*CO\.?,?\s*LTD)/i,
    /(CRESTRON\s+SINGAPORE\s+PTE\s+LTD)/i,
  ], rawText);
  if (result.supplierName) {
    result.supplierName = result.supplierName.replace(/\s+/g, ' ').trim();
    result.exporterName = result.supplierName;
  }

  // ===== Invoice No (full with suffix) =====
  result.invoiceNo = tryPatterns([
    /Inv\.?\s*No\s*:\s*([A-Z0-9]+[-\/]?\d*[A-Z]?[-\/]?\d*)/i,
  ], rawText);

  // ===== Invoice Date =====
  result.invoiceDate = tryPatterns([/Inv\.?\s*Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], rawText);

  // ===== Invoice Value =====
  result.billingCurrency = tryPatterns([/Inv\.?\s*Value\s*:\s*([\d.]+\s*[A-Z]{3})/i], rawText);

  // ===== Freight =====
  result.billNo = tryPatterns([/Freight\s*:\s*([\d.]+\s*[A-Z]{3})/i], rawText);

  // ===== Exchange Rate =====
  result.billDate = tryPatterns([/Exchange\s*Rate\s*:\s*([\d.]+\s*[A-Z]{3}\s*=\s*[\d.]+\s*INR)/i], rawText);

  return result;
}

module.exports = router;