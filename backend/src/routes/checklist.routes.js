const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');

// Use memory storage - no disk writes needed
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: function(req, file, cb) {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// POST /api/checklist/scan - Upload and scan PDF checklist
router.post('/scan', upload.single('checklist'), async function(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Please upload a PDF checklist' });
    }

    // Extract text from PDF directly from memory buffer
    var pdfData = await pdfParse(req.file.buffer);
    var text = pdfData.text;
    
    console.log('📄 PDF Text Extracted (' + text.length + ' chars):', text.substring(0, 200) + '...');

    // Parse extracted text for checklist fields
    var parsed = parseChecklistText(text);

    res.json({
      status: 'success',
      data: parsed,
      rawText: text.substring(0, 2000)
    });

  } catch (error) {
    console.error('PDF scan error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to scan PDF: ' + error.message 
    });
  }
});

// Parse checklist text and extract fields
function parseChecklistText(text) {
  var result = {
    referenceNumber: '',
    shipmentMode: '',
    importerName: '',
    exporterName: '',
    supplierName: '',
    location: '',
    jobOrderNo: '',
    jobOrderDate: '',
    boeSbNo: '',
    boeSbDate: '',
    mawbMblNo: '',
    mawbMblDate: '',
    hawbHblNo: '',
    hawbHblDate: '',
    noOfPackages: '',
    grossWeight: '',
    igmNo: '',
    igmDate: '',
    portOfDischarge: '',
    portOfDestination: '',
    cargoArrivalNotice: '',
    cargoArrivalDate: '',
    deliveryOrderDate: '',
    occDate: '',
    gatePassDate: '',
    remarks: '',
    invoiceNo: '',
    invoiceDate: '',
    agentDebitNote: '',
    billingCurrency: '',
    billNo: '',
    billDate: '',
    billTo: '',
    billToDate: '',
    docketNo: '',
    docketDate: '',
    additionalRemarks: ''
  };

  var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });

  function findAfter(keywords, lines) {
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].toLowerCase().replace(/[\s:]+/g, ' ').trim();
      for (var k = 0; k < keywords.length; k++) {
        var kw = keywords[k].toLowerCase();
        var idx = line.indexOf(kw);
        if (idx >= 0) {
          var val = lines[i].substring(idx + kw.length).replace(/^[\s:.-]+/, '').trim();
          if (!val && i + 1 < lines.length) {
            val = lines[i + 1].trim();
            if (val.length > 50 || /^[a-z\s]+$/i.test(val)) val = '';
          }
          val = val.replace(/^[:.\-\s]+/, '').trim();
          if (val && val.length < 100) return val;
        }
      }
    }
    return '';
  }

  result.referenceNumber = findAfter(['reference number', 'reference no', 'ref no', 'ref:', 'reference #'], lines);
  result.shipmentMode = findAfter(['shipment mode', 'mode of shipment', 'transport mode', 'mode:'], lines);
  result.importerName = findAfter(['importer name', 'importer:', 'consignee name', 'consignee:', 'buyer:'], lines);
  result.exporterName = findAfter(['exporter name', 'exporter:', 'shipper name', 'shipper:'], lines);
  result.supplierName = findAfter(['supplier name', 'supplier:', 'seller:', 'vendor:'], lines);
  result.location = findAfter(['location', 'place of receipt', 'port of loading', 'from:'], lines);
  result.jobOrderNo = findAfter(['job order no', 'job no', 'job #', 'order no'], lines);
  result.jobOrderDate = findAfter(['job order date', 'job date'], lines);
  result.boeSbNo = findAfter(['boe no', 'sb no', 'boe/sb no', 'boe #', 'sb #', 'bill of entry'], lines);
  result.boeSbDate = findAfter(['boe date', 'sb date', 'boe/sb date'], lines);
  result.mawbMblNo = findAfter(['mawb no', 'mbl no', 'mawb/mbl no', 'master awb', 'master bill'], lines);
  result.mawbMblDate = findAfter(['mawb date', 'mbl date'], lines);
  result.hawbHblNo = findAfter(['hawb no', 'hbl no', 'hawb/hbl no', 'house awb', 'house bill'], lines);
  result.hawbHblDate = findAfter(['hawb date', 'hbl date'], lines);
  result.noOfPackages = findAfter(['no of packages', 'packages:', 'qty:', 'quantity:'], lines);
  result.grossWeight = findAfter(['gross weight', 'gr wt', 'total weight', 'weight:'], lines);
  result.igmNo = findAfter(['igm no', 'igm number', 'igm #'], lines);
  result.igmDate = findAfter(['igm date', 'igm dt'], lines);
  result.portOfDischarge = findAfter(['port of discharge', 'discharge port', 'pod:'], lines);
  result.portOfDestination = findAfter(['port of destination', 'destination port', 'final destination', 'podest:'], lines);
  result.cargoArrivalNotice = findAfter(['cargo arrival notice', 'arrival notice', 'can:'], lines);
  result.cargoArrivalDate = findAfter(['cargo arrival date', 'arrival date'], lines);
  result.deliveryOrderDate = findAfter(['delivery order date', 'do date', 'do issued', 'delivery order issued'], lines);
  result.occDate = findAfter(['occ date', 'occ:', 'out of charge date'], lines);
  result.gatePassDate = findAfter(['gate pass date', 'gate pass:', 'gate out date'], lines);
  result.invoiceNo = findAfter(['invoice no', 'invoice #', 'inv no', 'invoice number'], lines);
  result.invoiceDate = findAfter(['invoice date', 'inv date'], lines);
  result.agentDebitNote = findAfter(['agent debit note', 'debit note', 'agent note'], lines);
  result.billingCurrency = findAfter(['billing currency', 'currency:', 'currency code'], lines);
  result.billNo = findAfter(['bill no', 'bill number', 'bill #'], lines);
  result.billDate = findAfter(['bill date'], lines);
  result.billTo = findAfter(['bill to', 'billed to:', 'customer:'], lines);
  result.billToDate = findAfter(['bill to date'], lines);
  result.docketNo = findAfter(['docket no', 'docket number', 'docket #'], lines);
  result.docketDate = findAfter(['docket date'], lines);
  result.remarks = findAfter(['remarks', 'notes:', 'comments:'], lines);

  if (!result.exporterName) {
    result.exporterName = findAfter(['shipper:', 'exporter:', 'seller:', 'from:'], lines);
  }

  var datePattern = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2,4}/i;
  
  function tryFindDate(label) {
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().indexOf(label) >= 0) {
        var match = lines[i].match(datePattern);
        if (match) return match[0];
        if (i + 1 < lines.length) {
          match = lines[i + 1].match(datePattern);
          if (match) return match[0];
        }
      }
    }
    return '';
  }

  if (!result.jobOrderDate) result.jobOrderDate = tryFindDate('job order');
  if (!result.boeSbDate) result.boeSbDate = tryFindDate('boe');
  if (!result.mawbMblDate) result.mawbMblDate = tryFindDate('mawb');
  if (!result.cargoArrivalDate) result.cargoArrivalDate = tryFindDate('arrival');
  if (!result.invoiceDate) result.invoiceDate = tryFindDate('invoice');

  return result;
}

module.exports = router;