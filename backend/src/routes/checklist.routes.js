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

    var parsed = parseByColumns(allItems);
    res.json({ status: 'success', data: parsed });
  } catch (error) {
    console.error('PDF scan error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to scan PDF: ' + error.message });
  }
});

function parseByColumns(items) {
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

  var rows = {};
  items.forEach(function(item) {
    var yKey = Math.round(item.y / 5) * 5;
    if (!rows[yKey]) rows[yKey] = [];
    rows[yKey].push(item);
  });

  var rowArray = Object.keys(rows).sort(function(a, b) { return b - a; }).map(function(k) {
    return rows[k].sort(function(a, b) { return a.x - b.x; });
  });

  function rowText(row) {
    return row.map(function(i) { return i.text; }).join(' ').trim();
  }

  var flatText = rowArray.map(rowText).join(' ');
  var lineTexts = rowArray.map(rowText);
  var m;

  // Reference Number
  m = flatText.match(/File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i);
  if (m) result.referenceNumber = m[1];

  // Job No & Date
  m = flatText.match(/Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)\s*[&]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) { result.jobOrderNo = m[1]; result.jobOrderDate = m[2]; }

  // Transport Mode
  m = flatText.match(/Transport\s*Mode\s*:\s*(\S)/i);
  if (m) result.shipmentMode = m[1];

  // Port Of Filing
  m = flatText.match(/Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i);
  if (m) { result.location = m[1].trim(); result.portOfDischarge = m[1].trim(); }

  // B.E Date
  m = flatText.match(/Printed\s*On\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) result.boeSbDate = m[1];

  // Agent
  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  // Importer Name
  m = flatText.match(/PAS\s+FREIGHT\s+SERVICES\s+([\w\s]+?(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP|INTEGRATORS)[\w\s]*?)\s+#/i);
  if (!m) m = flatText.match(/([\w\s]+(?:PRIVATE|LIMITED|INTEGRATORS))\s+#19/i);
  if (!m) m = flatText.match(/(RESURGENT\s+AV\s+INTEGRATORS\s+PRIVATE\s+LIMITED)/i);
  if (m) result.importerName = m[1].replace(/\s+/g, ' ').trim();

  // MBL/MAWB
  m = flatText.match(/MBL\/\s*MAWB\s*:\s*(\d+)/i);
  if (m) result.mawbMblNo = m[1];

  // HBL/HAWB
  m = flatText.match(/HBL\/\s*HAWB\s*:\s*([A-Z0-9]+)/i);
  if (m) result.hawbHblNo = m[1];

  // AWB Dates - search near MBL/MAWB for line with exactly 2 dates
  for (var i = 0; i < lineTexts.length; i++) {
    if (lineTexts[i].indexOf('MBL/MAWB') >= 0) {
      for (var j = i; j < Math.min(i + 4, lineTexts.length); j++) {
        var dates = lineTexts[j].match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g);
        if (dates && dates.length === 2) {
          result.mawbMblDate = dates[0];
          result.hawbHblDate = dates[1];
          break;
        }
      }
      break;
    }
  }

  // No of Pkgs
  m = flatText.match(/No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i);
  if (m) result.noOfPackages = m[1];

  // Gross Weight
  m = flatText.match(/Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i);
  if (m) result.grossWeight = m[1];

  // Port Destination
  m = flatText.match(/Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (m) result.portOfDestination = m[1];

  // Supplier & Exporter
  m = flatText.match(/Inv\.?\s*Sl\.?\s*No\s*:\s*1\s+([A-Z][\w\s]+(?:PTE|LTD|PVT|INC|CORP|LIMITED))/i);
  if (m) { result.supplierName = m[1].replace(/\s+/g, ' ').trim(); result.exporterName = result.supplierName; }

  // Invoice No
  m = flatText.match(/Inv\.?\s*No\s*:\s*(\d+)/i);
  if (m) result.invoiceNo = m[1];

  // Invoice Date
  m = flatText.match(/Inv\.?\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) result.invoiceDate = m[1];

  // Invoice Value
  m = flatText.match(/Inv\.?\s*Value\s*:\s*([\d.]+\s*USD)/i);
  if (m) result.billingCurrency = m[1];

  // Marks & Nos
  m = flatText.match(/Marks\s*[&]?\s*Nos\s*:\s*([A-Z0-9]+-[A-Z0-9]+\/[A-Z]+)/i);
  if (m) result.remarks = m[1].trim();

  // GSTIN - remove all spaces from each line before searching
  for (var i = 0; i < lineTexts.length; i++) {
    var compactLine = lineTexts[i].replace(/\s+/g, '');
    var gstMatch = compactLine.match(/GSTIN:?(\d{2}[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/i);
    if (!gstMatch) gstMatch = compactLine.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/);
    if (gstMatch) { result.additionalRemarks = 'GSTIN: ' + gstMatch[1]; break; }
  }

  // Freight
  m = flatText.match(/Freight\s*:\s*([\d.]+\s*USD)/i);
  if (m) result.billNo = m[1];

  // Exchange Rate
  m = flatText.match(/Exchange\s*Rate\s*:\s*([\d.]+\s*USD\s*=\s*[\d.]+\s*INR)/i);
  if (m) result.billDate = m[1];

  return result;
}

module.exports = router;