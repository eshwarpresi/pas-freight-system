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
    var text = '';

    for (var pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      var page = await pdfDocument.getPage(pageNum);
      var content = await page.getTextContent();
      var pageText = content.items.map(function(item) { return item.str; }).join(' ');
      text += pageText + '\n';
    }

    console.log('📄 PDF Text Extracted (' + text.length + ' chars)');
    var parsed = parseChecklistText(text);

    res.json({ status: 'success', data: parsed, rawText: text.substring(0, 2000) });
  } catch (error) {
    console.error('PDF scan error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to scan PDF: ' + error.message });
  }
});

function parseChecklistText(text) {
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

  var cleanText = text.replace(/\s+/g, ' ').trim();

  // B.E No
  var beMatch = cleanText.match(/B\.?E\s*No[,\s]*Date\s*:\s*([^\s]+)/i);
  if (beMatch) result.boeSbNo = beMatch[1];

  // Job No & Date
  var jobMatch = cleanText.match(/Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)\s*[&]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (jobMatch) {
    result.jobOrderNo = jobMatch[1];
    result.jobOrderDate = jobMatch[2];
  }

  // Transport Mode
  var modeMatch = cleanText.match(/Transport\s*Mode\s*:\s*(\w+)/i);
  if (modeMatch) result.shipmentMode = modeMatch[1];

  // Importer Name
  var importerMatch = cleanText.match(/Importer\s*Details\s*:[\s\d]*[A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d{1}\s*(?:Br\.Slno\s*:\d+\s*)?(?:PAN:[A-Z0-9]+\s*)?([A-Z][A-Z\s]{5,}(?:PRIVATE|PVT|LTD|LIMITED|INC|CORP)[A-Z\s]*)/i);
  if (importerMatch && importerMatch[1]) {
    result.importerName = importerMatch[1].trim().replace(/\s+/g, ' ');
  }

  // File No / Reference Number
  var refMatch = cleanText.match(/File\s*No\s*:\s*([^\s,]+)/i);
  if (refMatch) result.referenceNumber = refMatch[1];

  // Location - Port of Filing
  var locMatch = cleanText.match(/Port\s*Of\s*Filing\s*:\s*([^,]+)/i);
  if (locMatch) result.location = locMatch[1].trim();

  // MBL/MAWB
  var mblMatch = cleanText.match(/MBL\/\s*MAWB\s*:\s*(\d+)/i);
  if (mblMatch) result.mawbMblNo = mblMatch[1];
  var mblDateMatch = cleanText.match(/MBL\/\s*MAWB\s*:[\s\d]+\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (mblDateMatch) result.mawbMblDate = mblDateMatch[1];

  // HBL/HAWB
  var hblMatch = cleanText.match(/HBL\/\s*HAWB\s*:\s*([A-Z0-9]+)/i);
  if (hblMatch) result.hawbHblNo = hblMatch[1];
  var hblDateMatch = cleanText.match(/HBL\/\s*HAWB\s*:[\s\w]+\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (hblDateMatch) result.hawbHblDate = hblDateMatch[1];

  // No. of Pkgs
  var pkgMatch = cleanText.match(/No\.?\s*of\s*Pkgs\s*:\s*(\d+)\s*PKG/i);
  if (pkgMatch) result.noOfPackages = pkgMatch[1];

  // Gross Weight
  var wtMatch = cleanText.match(/Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i);
  if (wtMatch) result.grossWeight = wtMatch[1];

  // Port Origin
  var poMatch = cleanText.match(/Port\s*Origin\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (poMatch) result.portOfDischarge = poMatch[1];

  // Port Destination
  var pdMatch = cleanText.match(/Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (pdMatch) result.portOfDestination = pdMatch[1];

  // Country Origin
  var coMatch = cleanText.match(/Country\s*Origin\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (coMatch && !result.exporterName) result.exporterName = coMatch[1];

  // Invoice No
  var invNoMatch = cleanText.match(/Inv\.?\s*No\s*:\s*(\d+)/i);
  if (invNoMatch) result.invoiceNo = invNoMatch[1];

  // Invoice Date
  var invDateMatch = cleanText.match(/Inv\.?\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (invDateMatch) result.invoiceDate = invDateMatch[1];

  // Invoice Value / Currency
  var invValMatch = cleanText.match(/Inv\.?\s*Value\s*:\s*([\d.]+\s*[A-Z]{3})/i);
  if (invValMatch) result.billingCurrency = invValMatch[1];

  // Supplier Details
  var supplierMatch = cleanText.match(/SUPPLIER\s*DETAILS[\s-]+(?:Inv\.?Sl\.?No\s*:\s*\d+\s*)?([A-Z][A-Z\s]{5,}(?:PTE|PVT|LTD|INC|CORP|LIMITED)[A-Z\s]*)/i);
  if (supplierMatch && supplierMatch[1]) {
    result.supplierName = supplierMatch[1].trim().replace(/\s+/g, ' ');
  }

  // CHA Details
  var chaMatch = cleanText.match(/CHA\s*Details\s*:[\s\d]*([A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d{1})/i);
  if (chaMatch && !result.exporterName) {
    var afterCha = cleanText.substring(cleanText.indexOf(chaMatch[1]) + chaMatch[1].length);
    var chaNameMatch = afterCha.match(/([A-Z][A-Z\s]{5,}(?:SERVICES|FREIGHT|CARGO|LOGISTICS|SHIPPING)[A-Z\s]*)/i);
    if (chaNameMatch) result.agentDebitNote = chaNameMatch[1].trim().replace(/\s+/g, ' ');
  }

  return result;
}

module.exports = router;