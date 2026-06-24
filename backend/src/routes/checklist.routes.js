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

  var t = text;

  function after(label) {
    var idx = t.indexOf(label);
    if (idx === -1) return '';
    var sub = t.substring(idx + label.length);
    var match = sub.match(/^\s*:?\s*([^\n]+)/);
    if (match) return match[1].replace(/\s+/g, ' ').trim();
    return '';
  }

  // File No
  result.referenceNumber = after('File No');

  // Job No & Date
  var jd = after('Job No & Date');
  var jdMatch = jd.match(/(\d+)\s*[&]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (jdMatch) { result.jobOrderNo = jdMatch[1]; result.jobOrderDate = jdMatch[2]; }

  // Transport Mode
  result.shipmentMode = after('Transport Mode');

  // Location = Port Of Filing (where customs clearance happens)
  var loc = after('Port Of Filing');
  result.location = loc.split(',')[0].trim();

  // Port of Discharge = Port Of Filing (Indian customs port)
  result.portOfDischarge = loc;

  // B.E Date
  var be = after('B.E No,Date');
  var beMatch = be.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (beMatch) result.boeSbDate = beMatch[1];

  // Agent
  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  // Importer Name
  var imp = t.match(/PAS FREIGHT SERVICES\s+([A-Z][A-Z\s]+(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP|INTEGRATORS)[A-Z\s]*?)\s+#/i);
  if (imp) result.importerName = imp[1].replace(/\s+/g, ' ').trim();

  // MBL/MAWB
  var mbl = after('MBL/MAWB');
  var mblMatch = mbl.match(/(\d+)/);
  if (mblMatch) result.mawbMblNo = mblMatch[1];

  // HBL/HAWB
  var hbl = after('HBL/HAWB');
  var hblMatch = hbl.match(/([A-Z0-9]+)/);
  if (hblMatch) result.hawbHblNo = hblMatch[1];

  // AWB Dates
  var awbIdx = t.indexOf('MBL/MAWB');
  if (awbIdx > -1) {
    var awbSection = t.substring(awbIdx, awbIdx + 200);
    var dates = awbSection.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g);
    if (dates && dates.length >= 2) {
      result.mawbMblDate = dates[0];
      result.hawbHblDate = dates[1];
    }
  }

  // No. of Pkgs
  var pkg = after('No. of Pkgs');
  var pkgMatch = pkg.match(/(\d+)/);
  if (pkgMatch) result.noOfPackages = pkgMatch[1];

  // Gross Weight
  var wt = after('Gross Weight');
  var wtMatch = wt.match(/([\d.]+\s*KGS)/i);
  if (wtMatch) result.grossWeight = wtMatch[1];

  // Port of Destination = Port Shipment (SINGAPORE-SIN)
  var ps = after('Port Shipment');
  var psMatch = ps.match(/([A-Z]+-[A-Z]+)/);
  if (psMatch) result.portOfDestination = psMatch[1];

  // Country Origin - just for reference
  var co = after('Country Origin');
  var coMatch = co.match(/([A-Z]+-[A-Z]+)/);
  
  // Supplier Name (this is the exporter/shipper)
  var supp = t.match(/Inv\.SlNo\s*:\s*1\s+([A-Z][A-Z\s]+(?:PTE|LTD|PVT|INC|CORP|LIMITED)[A-Z\s]*?)\s+\d/);
  if (supp) {
    result.supplierName = supp[1].replace(/\s+/g, ' ').trim();
    // Exporter = Supplier (the company shipping the goods)
    result.exporterName = result.supplierName;
  }

  // Invoice No
  var inv = after('Inv.No');
  var invMatch = inv.match(/(\d+)/);
  if (invMatch) result.invoiceNo = invMatch[1];

  // Invoice Date
  var invd = after('Inv.Date');
  var invdMatch = invd.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (invdMatch) result.invoiceDate = invdMatch[1];

  // Invoice Value
  var invv = after('Inv.Value');
  var invvMatch = invv.match(/([\d.]+\s*[A-Z]{3})/);
  if (invvMatch) result.billingCurrency = invvMatch[1];

  // Marks & Nos
  var marks = after('Marks & Nos');
  var marksMatch = marks.match(/([A-Z0-9]+-[A-Z0-9]+\/[A-Z\s]+)/i);
  if (marksMatch) result.remarks = marksMatch[1].trim();

  // GSTIN
  var gst = t.match(/GSTIN\s*:\s*([A-Z0-9]+)/);
  if (gst) result.additionalRemarks = 'GSTIN: ' + gst[1];

  // Freight
  var fr = after('Freight');
  var frMatch = fr.match(/([\d.]+\s*[A-Z]{3})/);
  if (frMatch) result.billNo = frMatch[1];

  // Exchange Rate
  var er = after('Exchange Rate');
  var erMatch = er.match(/([\d.]+\s*[A-Z]{3}\s*=\s*[\d.]+\s*INR)/);
  if (erMatch) result.billDate = erMatch[1];

  return result;
}

module.exports = router;