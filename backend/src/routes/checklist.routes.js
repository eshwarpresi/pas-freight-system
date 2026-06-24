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
    
    var rawText = allItems.slice().sort(function(a, b) { return b.y - a.y || a.x - b.x; })
      .map(function(i) { return i.text; }).join(' ');
    
    res.json({ status: 'success', data: parsed, rawText: rawText.substring(0, 3000) });
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

  var rawText = items.slice().sort(function(a, b) { return b.y - a.y || a.x - b.x; })
    .map(function(i) { return i.text; }).join(' ');
  
  var noSpace = rawText.replace(/\s+/g, '');

  function tryPatterns(patterns, text) {
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m && m[1] && m[1].trim().length > 0) return m[1].trim();
    }
    return '';
  }

  function findDateNear(label, text) {
    var idx = text.toLowerCase().indexOf(label.toLowerCase());
    if (idx >= 0) {
      var chunk = text.substring(idx, idx + 150);
      var m = chunk.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
      if (m) return m[1];
    }
    return '';
  }

  result.referenceNumber = tryPatterns([
    /File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i,
    /Reference\s*(?:No|Number)?\s*:?\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i,
    /Ref\s*(?:No|Number)?\s*:?\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i,
    /ONLINE[-\s]*(\d+)/i,
  ], rawText);

  result.jobOrderNo = tryPatterns([
    /Job\s*(?:Order)?\s*No\s*[&]?\s*(?:Date)?\s*:?\s*(\d+)/i,
    /Job\s*#?\s*:?\s*(\d+)/i,
    /JOB\s*(?:No|Number)?\s*:?\s*(\d+)/i,
  ], rawText);
  
  var jobIdx = rawText.toLowerCase().indexOf('job');
  if (jobIdx >= 0) {
    var afterJob = rawText.substring(jobIdx, jobIdx + 200);
    var dates = afterJob.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g);
    if (dates && dates.length >= 1) result.jobOrderDate = dates[0];
  }

  result.boeSbNo = tryPatterns([
    /BOE\s*(?:No|Number)?\s*:?\s*(\d+)/i,
    /SB\s*(?:No|Number)?\s*:?\s*(\d+)/i,
    /B\.?E\s*No\s*:?\s*(\d+)/i,
  ], rawText);
  
  result.boeSbDate = tryPatterns([
    /BOE\s*(?:Date)?\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /SB\s*(?:Date)?\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /Printed\s*On\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  ], rawText);

  result.shipmentMode = tryPatterns([
    /Transport\s*Mode\s*:?\s*(\S)/i,
    /Shipment\s*Mode\s*:?\s*(\S)/i,
    /Mode\s*(?:of\s*Transport)?\s*:?\s*(\S)/i,
  ], rawText);

  result.location = tryPatterns([
    /Port\s*Of\s*Filing\s*:?\s*([^,]+(?:,[^,]+)?)/i,
    /Filing\s*Port\s*:?\s*([^,]+(?:,[^,]+)?)/i,
    /Location\s*:?\s*([A-Z0-9]+\s*,?\s*[A-Z]+)/i,
  ], rawText);
  result.portOfDischarge = result.location || tryPatterns([
    /Port\s*Of\s*Discharge\s*:?\s*([A-Z0-9]+\s*,?\s*[A-Z]+)/i,
    /Discharge\s*(?:Port)?\s*:?\s*([A-Z0-9]+\s*,?\s*[A-Z]+)/i,
  ], rawText);

  result.importerName = tryPatterns([
    /Importer\s*(?:Name|Details)?\s*:?\s*([\w\s]+(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP|INTEGRATORS))/i,
    /Consignee\s*(?:Name)?\s*:?\s*([\w\s]+(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP))/i,
    /PAS\s+FREIGHT\s+SERVICES\s+([\w\s]+(?:PRIVATE|LIMITED|INTEGRATORS)[\w\s]*?)(?:\s+#|\s{2,})/i,
  ], rawText);
  if (result.importerName) result.importerName = result.importerName.replace(/\s+/g, ' ').trim();

  result.exporterName = tryPatterns([
    /Exporter\s*(?:Name)?\s*:?\s*([\w\s]+(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP|PTE))/i,
    /Shipper\s*(?:Name)?\s*:?\s*([\w\s]+(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP|PTE))/i,
    /Seller\s*(?:Name)?\s*:?\s*([\w\s]+(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP|PTE))/i,
  ], rawText);
  if (result.exporterName) result.exporterName = result.exporterName.replace(/\s+/g, ' ').trim();

  result.supplierName = tryPatterns([
    /Supplier\s*(?:Name)?\s*:?\s*([\w\s]+(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP|PTE))/i,
    /Inv\.?\s*Sl\.?\s*No\s*:?\s*\d+\s+([A-Z][\w\s]+(?:PTE|LTD|PVT|INC|CORP|LIMITED))/i,
  ], rawText);
  if (result.supplierName) result.supplierName = result.supplierName.replace(/\s+/g, ' ').trim();
  if (!result.exporterName && result.supplierName) result.exporterName = result.supplierName;
  if (!result.supplierName && result.exporterName) result.supplierName = result.exporterName;

  result.mawbMblNo = tryPatterns([
    /MAWB\s*(?:No|Number)?\s*:?\s*(\d+)/i,
    /MBL\s*(?:No|Number)?\s*:?\s*(\d+)/i,
    /Master\s*(?:AWB|BL)\s*(?:No)?\s*:?\s*(\d+)/i,
  ], rawText);
  result.mawbMblDate = findDateNear('MAWB', rawText) || findDateNear('MBL', rawText);

  result.hawbHblNo = tryPatterns([
    /HAWB\s*(?:No|Number)?\s*:?\s*([A-Z0-9]+)/i,
    /HBL\s*(?:No|Number)?\s*:?\s*([A-Z0-9]+)/i,
    /House\s*(?:AWB|BL)\s*(?:No)?\s*:?\s*([A-Z0-9]+)/i,
  ], rawText);
  result.hawbHblDate = findDateNear('HAWB', rawText) || findDateNear('HBL', rawText);

  result.noOfPackages = tryPatterns([
    /No\.?\s*of\s*Pkgs\s*:?\s*(\d+)/i,
    /Packages\s*:?\s*(\d+)/i,
    /Qty\s*:?\s*(\d+)/i,
    /Pkgs?\s*:?\s*(\d+)/i,
  ], rawText);

  result.grossWeight = tryPatterns([
    /Gross\s*Weight\s*:?\s*([\d.]+\s*KGS)/i,
    /Total\s*Weight\s*:?\s*([\d.]+\s*KGS)/i,
    /Weight\s*:?\s*([\d.]+\s*KGS)/i,
    /Gr\.?\s*Wt\.?\s*:?\s*([\d.]+\s*KGS)/i,
  ], rawText);

  result.portOfDestination = tryPatterns([
    /Port\s*Shipment\s*:?\s*([A-Z]+[-\s]?[A-Z]+)/i,
    /Destination\s*(?:Port)?\s*:?\s*([A-Z]+[-\s]?[A-Z]+)/i,
    /Port\s*Of\s*Destination\s*:?\s*([A-Z]+[-\s]?[A-Z]+)/i,
  ], rawText);

  result.invoiceNo = tryPatterns([
    /Inv\.?\s*No\s*:?\s*(\d+)/i,
    /Invoice\s*(?:No|Number)?\s*:?\s*(\d+)/i,
    /Invoice\s*#?\s*:?\s*(\d+)/i,
  ], rawText);
  result.invoiceDate = tryPatterns([
    /Inv\.?\s*Date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /Invoice\s*Date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  ], rawText);
  result.billingCurrency = tryPatterns([
    /Inv\.?\s*Value\s*:?\s*([\d.]+\s*[A-Z]{3})/i,
    /Invoice\s*Value\s*:?\s*([\d.]+\s*[A-Z]{3})/i,
    /Amount\s*:?\s*([\d.]+\s*[A-Z]{3})/i,
  ], rawText);

  result.billNo = tryPatterns([
    /Freight\s*(?:Charges?)?\s*:?\s*([\d.]+\s*[A-Z]{3})/i,
  ], rawText);

  result.billDate = tryPatterns([
    /Exchange\s*Rate\s*:?\s*([\d.]+\s*[A-Z]{3}\s*=\s*[\d.]+\s*INR)/i,
  ], rawText);

  if (rawText.indexOf('PAS FREIGHT SERVICES') >= 0) {
    result.agentDebitNote = 'PAS FREIGHT SERVICES';
  }

  result.remarks = tryPatterns([
    /Marks\s*[&]?\s*Nos\s*:?\s*([A-Z0-9]+[-\/][A-Z0-9\/]+)/i,
  ], rawText);

  var gstMatch = noSpace.match(/GSTIN:?(\d{2}[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/i);
  if (!gstMatch) gstMatch = noSpace.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/);
  if (gstMatch) result.additionalRemarks = 'GSTIN: ' + gstMatch[1];

  if (!result.deliveryOrderDate) result.deliveryOrderDate = findDateNear('Delivery Order', rawText);
  if (!result.occDate) result.occDate = findDateNear('OCC', rawText);
  if (!result.gatePassDate) result.gatePassDate = findDateNear('Gate Pass', rawText);
  if (!result.igmDate) result.igmDate = findDateNear('IGM', rawText);

  return result;
}

module.exports = router;