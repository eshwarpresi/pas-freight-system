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

    res.json({ status: 'success', data: parsed, rawText: text.substring(0, 3000) });
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

  var t = text.replace(/\s+/g, ' ').trim();

  // Reference Number (File No)
  var m = t.match(/File\s*No\s*:\s*([^\s,]+)/i);
  if (m) result.referenceNumber = m[1];

  // Job No & Date
  m = t.match(/Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)\s*[&]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) { result.jobOrderNo = m[1]; result.jobOrderDate = m[2]; }

  // Transport Mode
  m = t.match(/Transport\s*Mode\s*:\s*(\w+)/i);
  if (m) result.shipmentMode = m[1];

  // Location (Port of Filing)
  m = t.match(/Port\s*Of\s*Filing\s*:\s*([^,]+)/i);
  if (m) result.location = m[1].trim();

  // B.E Date (Printed On date since no actual BE number in this PDF)
  m = t.match(/B\.?E\s*No[,\s]*Date\s*:\s*Printed\s*On\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) result.boeSbDate = m[1];

  // Importer Name - company before # in address
  m = t.match(/([A-Z][A-Z\s]{5,}(?:PRIVATE|PVT|LTD|LIMITED|INC|CORP|INTEGRATORS|SOLUTIONS|TECHNOLOGIES|ENTERPRISES|MARKETING|TRADING|INDUSTRIES)[A-Z\s]*?)\s+#/i);
  if (m) result.importerName = m[1].trim().replace(/\s+/g, ' ');

  // Agent / CHA Name
  m = t.match(/(PAS FREIGHT SERVICES)/i);
  if (m) result.agentDebitNote = m[1].trim();

  // Supplier Name - after Inv.SlNo
  var si = t.indexOf('SUPPLIER DETAILS');
  if (si > -1) {
    var as = t.substring(si);
    m = as.match(/Inv\.?Sl\.?No\s*:\s*\d+\s+([A-Z][A-Z\s]+(?:PTE|PVT|LTD|INC|CORP|LIMITED|SERVICES)[A-Z\s]*?)\s+\d+/i);
    if (m) result.supplierName = m[1].trim().replace(/\s+/g, ' ');
  }

  // MBL/MAWB Number
  m = t.match(/MBL\/\s*MAWB\s*:\s*(\d+)/i);
  if (m) result.mawbMblNo = m[1];

  // MBL/MAWB Date
  m = t.match(/MBL\/\s*MAWB\s*:[\s\d]+\s*(?:HBL\/\s*HAWB\s*:[\s\w]+\s*)?Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) result.mawbMblDate = m[1];

  // HBL/HAWB Number
  m = t.match(/HBL\/\s*HAWB\s*:\s*([A-Z0-9]+)/i);
  if (m) result.hawbHblNo = m[1];

  // HBL/HAWB Date
  m = t.match(/HBL\/\s*HAWB\s*:[\s\w]+\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) result.hawbHblDate = m[1];

  // No of Packages
  m = t.match(/No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i);
  if (m) result.noOfPackages = m[1];

  // Gross Weight
  m = t.match(/Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i);
  if (m) result.grossWeight = m[1];

  // Port Origin
  m = t.match(/Port\s*Origin\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (m) result.portOfDischarge = m[1];

  // Port Destination (Port Shipment)
  m = t.match(/Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (m) result.portOfDestination = m[1];

  // Country Origin → Exporter
  m = t.match(/Country\s*Origin\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (m && !result.exporterName) result.exporterName = m[1];

  // Invoice No
  m = t.match(/Inv\.?\s*No\s*:\s*(\d+)/i);
  if (m) result.invoiceNo = m[1];

  // Invoice Date
  m = t.match(/Inv\.?\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) result.invoiceDate = m[1];

  // Invoice Value → Billing Currency
  m = t.match(/Inv\.?\s*Value\s*:\s*([\d.]+\s*[A-Z]{3})/i);
  if (m) result.billingCurrency = m[1];

  // Marks & Nos → Remarks
  m = t.match(/Marks\s*[&]?\s*Nos\s*:\s*([^\s-]+)/i);
  if (m) result.remarks = m[1];

  // GSTIN → Additional Remarks
  m = t.match(/GSTIN\s*:\s*([A-Z0-9]+)/i);
  if (m) result.additionalRemarks = 'GSTIN: ' + m[1];

  // Freight Charge → Bill Number field
  m = t.match(/Freight\s*:\s*([\d.]+\s*[A-Z]{3})/i);
  if (m) result.billNo = m[1];

  // Exchange Rate → Bill Date field
  m = t.match(/Exchange\s*Rate\s*:\s*([\d.]+\s*[A-Z]{3}\s*=\s*[\d.]+\s*INR)/i);
  if (m) result.billDate = m[1];

  return result;
}

module.exports = router;