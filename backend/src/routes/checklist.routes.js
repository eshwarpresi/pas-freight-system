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

  // File No / Reference Number
  var refMatch = cleanText.match(/File\s*No\s*:\s*([^\s,]+)/i);
  if (refMatch) result.referenceNumber = refMatch[1];

  // Job No & Date
  var jobMatch = cleanText.match(/Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)\s*[&]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (jobMatch) {
    result.jobOrderNo = jobMatch[1];
    result.jobOrderDate = jobMatch[2];
  }

  // Transport Mode
  var modeMatch = cleanText.match(/Transport\s*Mode\s*:\s*(\w+)/i);
  if (modeMatch) result.shipmentMode = modeMatch[1];

  // Location - Port of Filing
  var locMatch = cleanText.match(/Port\s*Of\s*Filing\s*:\s*([^,]+)/i);
  if (locMatch) result.location = locMatch[1].trim();

  // Importer Name - Matches company name before # in address
  var impMatch = cleanText.match(/(?:PAS FREIGHT SERVICES\s+)?([A-Z][A-Z\s]{5,}(?:PRIVATE|PVT|LTD|LIMITED|INC|CORP|INTEGRATORS|SOLUTIONS|TECHNOLOGIES|ENTERPRISES|MARKETING|TRADING|INDUSTRIES)[A-Z\s]*?)\s+#/i);
  if (impMatch && impMatch[1]) {
    result.importerName = impMatch[1].trim().replace(/\s+/g, ' ');
  }

  // Agent / CHA Name
  var chaMatch = cleanText.match(/(PAS FREIGHT SERVICES)/i);
  if (chaMatch) result.agentDebitNote = chaMatch[1].trim();

  // Supplier Name
  var suppMatch = cleanText.match(/SUPPLIER\s*DETAILS[\s-]+(?:Inv\.?Sl\.?No\s*:\s*\d+\s*)?([A-Z][A-Z\s]{3,}(?:PTE|PVT|LTD|INC|CORP|LIMITED|TRADING|ENTERPRISE)[A-Z\s]*?)(?=\s+\d|\s{2,})/i);
  if (suppMatch && suppMatch[1]) {
    result.supplierName = suppMatch[1].trim().replace(/\s+/g, ' ');
  }

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

  // Country Origin → Exporter
  var coMatch = cleanText.match(/Country\s*Origin\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (coMatch && !result.exporterName) result.exporterName = coMatch[1];

  // Invoice No
  var invNoMatch = cleanText.match(/Inv\.?\s*No\s*:\s*(\d+)/i);
  if (invNoMatch) result.invoiceNo = invNoMatch[1];

  // Invoice Date
  var invDateMatch = cleanText.match(/Inv\.?\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (invDateMatch) result.invoiceDate = invDateMatch[1];

  // Invoice Value / Billing Currency
  var invValMatch = cleanText.match(/Inv\.?\s*Value\s*:\s*([\d.]+\s*[A-Z]{3})/i);
  if (invValMatch) result.billingCurrency = invValMatch[1];

  return result;
}

module.exports = router;