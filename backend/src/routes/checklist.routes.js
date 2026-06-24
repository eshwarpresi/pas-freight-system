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

  // Build raw text from ALL items sorted by position
  var rawText = items.slice().sort(function(a, b) { return b.y - a.y || a.x - b.x; })
    .map(function(i) { return i.text; }).join(' ');
  
  // Also remove all spaces version for GSTIN
  var noSpace = rawText.replace(/\s+/g, '');
  
  var m;

  // Reference Number
  m = rawText.match(/File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i);
  if (m) result.referenceNumber = m[1];

  // Job No & Date
  m = rawText.match(/Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)\s*[&]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) { result.jobOrderNo = m[1]; result.jobOrderDate = m[2]; }

  // Transport Mode
  m = rawText.match(/Transport\s*Mode\s*:\s*(\S)/i);
  if (m) result.shipmentMode = m[1];

  // Port Of Filing
  m = rawText.match(/Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i);
  if (m) { result.location = m[1].trim(); result.portOfDischarge = m[1].trim(); }

  // B.E Date
  m = rawText.match(/Printed\s*On\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) result.boeSbDate = m[1];

  // Agent
  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  // Importer Name
  m = rawText.match(/PAS\s+FREIGHT\s+SERVICES\s+([\w\s]+?(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP|INTEGRATORS)[\w\s]*?)\s+#/i);
  if (!m) m = rawText.match(/([\w\s]+(?:PRIVATE|LIMITED|INTEGRATORS))\s+#19/i);
  if (!m) m = rawText.match(/(RESURGENT\s+AV\s+INTEGRATORS\s+PRIVATE\s+LIMITED)/i);
  if (m) result.importerName = m[1].replace(/\s+/g, ' ').trim();

  // MBL/MAWB
  m = rawText.match(/MBL\/\s*MAWB\s*:\s*(\d+)/i);
  if (m) result.mawbMblNo = m[1];

  // HBL/HAWB
  m = rawText.match(/HBL\/\s*HAWB\s*:\s*([A-Z0-9]+)/i);
  if (m) result.hawbHblNo = m[1];

  // AWB Dates - try multiple patterns
  // Pattern 1: Exact sequence MBL...HBL...Date...Date
  m = rawText.match(/MBL\/\s*MAWB\s*:\s*\d+\s*HBL\/\s*HAWB\s*:\s*[A-Z0-9]+\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  // Pattern 2: Just two dates near AWB section
  if (!m) {
    var awbIdx = rawText.indexOf('MBL/MAWB');
    if (awbIdx > -1) {
      var section = rawText.substring(awbIdx);
      m = section.match(/Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    }
  }
  // Pattern 3: Just grab first 2 dates after MBL/MAWB
  if (!m) {
    var awbIdx2 = rawText.indexOf('MBL/MAWB');
    if (awbIdx2 > -1) {
      var allDates = rawText.substring(awbIdx2).match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g);
      if (allDates && allDates.length >= 2) {
        result.mawbMblDate = allDates[0];
        result.hawbHblDate = allDates[1];
      }
    }
  } else {
    result.mawbMblDate = m[1];
    result.hawbHblDate = m[2];
  }

  // No of Pkgs
  m = rawText.match(/No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i);
  if (m) result.noOfPackages = m[1];

  // Gross Weight
  m = rawText.match(/Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i);
  if (m) result.grossWeight = m[1];

  // Port Destination
  m = rawText.match(/Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (m) result.portOfDestination = m[1];

  // Supplier & Exporter
  m = rawText.match(/Inv\.?\s*Sl\.?\s*No\s*:\s*1\s+([A-Z][\w\s]+(?:PTE|LTD|PVT|INC|CORP|LIMITED))/i);
  if (m) { result.supplierName = m[1].replace(/\s+/g, ' ').trim(); result.exporterName = result.supplierName; }

  // Invoice No
  m = rawText.match(/Inv\.?\s*No\s*:\s*(\d+)/i);
  if (m) result.invoiceNo = m[1];

  // Invoice Date
  m = rawText.match(/Inv\.?\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) result.invoiceDate = m[1];

  // Invoice Value
  m = rawText.match(/Inv\.?\s*Value\s*:\s*([\d.]+\s*USD)/i);
  if (m) result.billingCurrency = m[1];

  // Marks & Nos
  m = rawText.match(/Marks\s*[&]?\s*Nos\s*:\s*([A-Z0-9]+-[A-Z0-9]+\/[A-Z]+)/i);
  if (m) result.remarks = m[1].trim();

  // GSTIN - multiple fallback patterns
  m = noSpace.match(/GSTIN:?(\d{2}[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/i);
  if (!m) m = noSpace.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d)/);
  if (!m) {
    // Try with spaces in raw text
    m = rawText.match(/GSTIN\s*:?\s*(\d{2}\s*[A-Z]{5}\s*\d{4}\s*[A-Z]\s*\d{3}\s*[A-Z]{3}\s*\d)/i);
  }
  if (m) result.additionalRemarks = 'GSTIN: ' + m[1].replace(/\s+/g, '');

  // Freight
  m = rawText.match(/Freight\s*:\s*([\d.]+\s*USD)/i);
  if (m) result.billNo = m[1];

  // Exchange Rate
  m = rawText.match(/Exchange\s*Rate\s*:\s*([\d.]+\s*USD\s*=\s*[\d.]+\s*INR)/i);
  if (m) result.billDate = m[1];

  return result;
}

module.exports = router;