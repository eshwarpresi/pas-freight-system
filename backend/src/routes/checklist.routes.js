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

  var page1Items = items.filter(function(i) { return i.page === 1; })
    .sort(function(a, b) { return a.y - b.y || a.x - b.x; });
  var rawText = page1Items.map(function(i) { return i.text; }).join(' ');

  function tryPatterns(patterns, text) {
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m && m[1] && m[1].trim().length > 0) return m[1].trim();
    }
    return '';
  }

  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  result.referenceNumber = tryPatterns([
    /File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i,
    /ONLINE[-\s]*(\d+)/i,
  ], rawText);

  result.boeSbNo = tryPatterns([/B\.?E\s*No[,\s]*Date\s*:\s*(\d+)/i], rawText);
  result.boeSbDate = tryPatterns([
    /B\.?E\s*No[,\s]*Date\s*:\s*\d+\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Printed\s*On\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  result.jobOrderNo = tryPatterns([/Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)/i], rawText);
  result.jobOrderDate = tryPatterns([
    /Job\s*No\s*[&]?\s*Date\s*:\s*\d+\s*[&]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ], rawText);

  var loc = tryPatterns([/Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i], rawText);
  result.location = loc;
  result.portOfDischarge = loc;

  result.shipmentMode = tryPatterns([/Transport\s*Mode\s*:\s*(\S)/i], rawText);

  result.importerName = tryPatterns([
    /PAS\s+FREIGHT\s+SERVICES\s+([\w\s]+(?:PRIVATE|LIMITED|INTEGRATORS)[\w\s]*?)(?:\s+#|\s{2,})/i,
    /PAS\s+FREIGHT\s+SERVICES\s+([\w\s]+?\(INDIA\)\s*(?:PRIVATE|LIMITED|LTD))/i,
    /(ONLINE\s+INSTRUMENTS\s*\(INDIA\)\s*LIMITED)/i,
    /(RESURGENT\s+AV\s+INTEGRATORS\s+PRIVATE\s+LIMITED)/i,
  ], rawText);
  if (result.importerName) result.importerName = result.importerName.replace(/\s+/g, ' ').trim();

  // GSTIN - 3 fallback patterns
  var gstMatch = rawText.match(/GSTIN\s*:?\s*(\d{2}[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/i);
  if (!gstMatch) {
    var noSpace = rawText.replace(/\s+/g, '');
    gstMatch = noSpace.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/);
  }
  if (!gstMatch) {
    gstMatch = rawText.match(/(29[A-Z]{4}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/i);
  }
  if (gstMatch) result.additionalRemarks = 'GSTIN: ' + gstMatch[1];

  result.igmNo = tryPatterns([/IGM\s*NO\s*:\s*(\d+)/i], rawText);
  result.igmDate = tryPatterns([/IGM\s*NO\s*:\s*\d+\s*\/\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], rawText);
  result.cargoArrivalNotice = tryPatterns([/Gateway\s*IGM\s*:\s*(\d+)/i], rawText);
  result.cargoArrivalDate = tryPatterns([/Gateway\s*Port\s*:\s*([A-Za-z]+\([A-Z]+\)-[A-Z0-9]+)/i], rawText);

  result.portOfDestination = tryPatterns([
    /Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i,
    /Destination\s*(?:Port)?\s*:?\s*([A-Z]+-[A-Z]+)/i,
  ], rawText);

  result.mawbMblNo = tryPatterns([
    /MBL\/\s*MAWB\s*:\s*([A-Z0-9]+)/i,
    /MAWB\s*(?:No)?\s*:?\s*([A-Z0-9]+)/i,
  ], rawText);
  
  var awbStart = rawText.indexOf('MBL/MAWB');
  if (awbStart < 0) awbStart = rawText.indexOf('MAWB');
  if (awbStart >= 0) {
    var awbChunk = rawText.substring(awbStart, awbStart + 500);
    var dateMatches = awbChunk.match(/Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g);
    if (dateMatches && dateMatches.length >= 1) {
      result.mawbMblDate = dateMatches[0].replace(/Date\s*:\s*/, '').trim();
      if (dateMatches.length >= 2) {
        result.hawbHblDate = dateMatches[1].replace(/Date\s*:\s*/, '').trim();
      }
    }
  }

  result.hawbHblNo = tryPatterns([
    /HBL\/\s*HAWB\s*:\s*([A-Z0-9]+)/i,
    /HAWB\s*(?:No)?\s*:?\s*([A-Z0-9]+)/i,
  ], rawText);

  result.noOfPackages = tryPatterns([/No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i], rawText);
  result.grossWeight = tryPatterns([/Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i], rawText);
  result.remarks = tryPatterns([/Marks\s*[&]?\s*Nos\s*:\s*([A-Z0-9]+[-\/\s]+[A-Z0-9]+)/i], rawText);

  result.supplierName = tryPatterns([
    /Inv\.?\s*Sl\.?\s*No\s*:\s*\d+\s+([A-Z][\w\s]+(?:PTE|LTD|CO\.?,?\s*LTD))/i,
    /(TCL\s+SMART\s+HOMETECHNOLOGIES\s*CO\.?,?\s*LTD)/i,
    /(CRESTRON\s+SINGAPORE\s+PTE\s+LTD)/i,
  ], rawText);
  if (result.supplierName) {
    result.supplierName = result.supplierName.replace(/\s+/g, ' ').trim();
    result.exporterName = result.supplierName;
  }

  result.invoiceNo = tryPatterns([/Inv\.?\s*No\s*:\s*([A-Z0-9]+[-\/]?\d*[A-Z]?[-\/]?\d*)/i], rawText);
  result.invoiceDate = tryPatterns([/Inv\.?\s*Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], rawText);
  result.billingCurrency = tryPatterns([/Inv\.?\s*Value\s*:\s*([\d.]+\s*[A-Z]{3})/i], rawText);
  result.billNo = tryPatterns([/Freight\s*:?\s*([\d.]+\s*[A-Z]{3})/i], rawText);
  result.billDate = tryPatterns([/Exchange\s*Rate\s*:\s*([\d.]+\s*[A-Z]{3}\s*=\s*[\d.]+\s*INR)/i], rawText);

  return result;
}

module.exports = router;