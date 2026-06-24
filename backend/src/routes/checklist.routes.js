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
          x: Math.round(item.transform[4] * 100) / 100,
          y: Math.round((viewport.height - item.transform[5]) * 100) / 100,
          page: pageNum
        });
      });
    }

    console.log('📄 PDF Items extracted: ' + allItems.length);
    var parsed = parseChecklistWithPositions(allItems);

    res.json({ status: 'success', data: parsed });
  } catch (error) {
    console.error('PDF scan error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to scan PDF: ' + error.message });
  }
});

function parseChecklistWithPositions(items) {
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

  // Group items into lines by Y position
  var lines = [];
  var currentLine = [];
  var currentY = -1;
  
  var sorted = items.slice().sort(function(a, b) { return b.y - a.y || a.x - b.x; });
  
  sorted.forEach(function(item) {
    if (currentY === -1 || Math.abs(item.y - currentY) < 5) {
      currentLine.push(item);
      if (currentY === -1) currentY = item.y;
    } else {
      if (currentLine.length > 0) {
        lines.push({ y: currentY, items: currentLine.slice().sort(function(a, b) { return a.x - b.x; }) });
      }
      currentLine = [item];
      currentY = item.y;
    }
  });
  if (currentLine.length > 0) {
    lines.push({ y: currentY, items: currentLine.slice().sort(function(a, b) { return a.x - b.x; }) });
  }

  function lineText(line) {
    return line.items.map(function(i) { return i.text; }).join(' ').trim();
  }

  // Find value after label - only remove long dashes
  function findValue(label, lines, startIdx) {
    var labelLower = label.toLowerCase();
    for (var i = startIdx || 0; i < lines.length; i++) {
      var lt = lineText(lines[i]).toLowerCase();
      if (lt.indexOf(labelLower) >= 0) {
        var fullText = lineText(lines[i]);
        var labelIdx = fullText.toLowerCase().indexOf(labelLower);
        var after = fullText.substring(labelIdx + label.length).replace(/^[\s:]+/, '').trim();
        
        if (after.length < 1 && i + 1 < lines.length) {
          after = lineText(lines[i + 1]);
        }
        
        // Only remove long dashes, keep all other text
        after = after.replace(/-{4,}.*$/, '').trim();
        
        return after;
      }
    }
    return '';
  }

  // === EXTRACTIONS ===

  result.referenceNumber = findValue('File No', lines);

  var jobLine = findValue('Job No', lines);
  var jobMatch = jobLine.match(/(\d+)\s*[&]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (jobMatch) { result.jobOrderNo = jobMatch[1]; result.jobOrderDate = jobMatch[2]; }

  result.shipmentMode = findValue('Transport Mode', lines);

  var loc = findValue('Port Of Filing', lines);
  result.location = loc;
  result.portOfDischarge = loc;

  var beDate = findValue('Printed On', lines);
  var beMatch = beDate.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (beMatch) result.boeSbDate = beMatch[1];

  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  // Importer Name
  for (var i = 0; i < lines.length; i++) {
    var lt = lineText(lines[i]);
    if ((lt.indexOf('PRIVATE') >= 0 || lt.indexOf('LIMITED') >= 0) && lt.indexOf('#') >= 0) {
      var impMatch = lt.match(/([A-Z][A-Z\s]+(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP|INTEGRATORS)[A-Z\s]*)/i);
      if (impMatch) {
        result.importerName = impMatch[1].replace(/\s+/g, ' ').trim();
        result.importerName = result.importerName.replace(/^PAS FREIGHT SERVICES\s+/i, '');
        break;
      }
    }
  }

  var mbl = findValue('MBL/MAWB', lines);
  var mblMatch = mbl.match(/(\d+)/);
  if (mblMatch) result.mawbMblNo = mblMatch[1];

  var hbl = findValue('HBL/HAWB', lines);
  var hblMatch = hbl.match(/([A-Z0-9]+)/);
  if (hblMatch) result.hawbHblNo = hblMatch[1];

  // AWB Dates
  for (var i = 0; i < lines.length; i++) {
    var lt = lineText(lines[i]);
    if (lt.indexOf('MBL/MAWB') >= 0 || lt.indexOf('HBL/HAWB') >= 0) {
      for (var j = i; j < Math.min(i + 5, lines.length); j++) {
        var dt = lineText(lines[j]);
        var dates = dt.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g);
        if (dates && dates.length >= 2) {
          result.mawbMblDate = dates[0];
          result.hawbHblDate = dates[1];
          break;
        }
      }
      break;
    }
  }

  var pkg = findValue('No. of Pkgs', lines);
  var pkgMatch = pkg.match(/(\d+)/);
  if (pkgMatch) result.noOfPackages = pkgMatch[1];

  var wt = findValue('Gross Weight', lines);
  var wtMatch = wt.match(/([\d.]+\s*KGS)/i);
  if (wtMatch) result.grossWeight = wtMatch[1];

  var ps = findValue('Port Shipment', lines);
  var psMatch = ps.match(/([A-Z]+-[A-Z]+)/);
  if (psMatch) result.portOfDestination = psMatch[1];

  // Supplier & Exporter
  for (var i = 0; i < lines.length; i++) {
    var lt = lineText(lines[i]);
    if (lt.indexOf('SUPPLIER DETAILS') >= 0) {
      for (var j = i; j < Math.min(i + 5, lines.length); j++) {
        var sl = lineText(lines[j]);
        var suppMatch = sl.match(/([A-Z][A-Z\s]+(?:PTE|LTD|PVT|INC|CORP|LIMITED)[A-Z\s]*?)\s+\d+\s+[A-Z]/);
        if (suppMatch) {
          result.supplierName = suppMatch[1].replace(/\s+/g, ' ').trim();
          result.exporterName = result.supplierName;
          break;
        }
      }
      break;
    }
  }

  var inv = findValue('Inv.No', lines);
  var invMatch = inv.match(/(\d+)/);
  if (invMatch) result.invoiceNo = invMatch[1];

  var invd = findValue('Inv.Date', lines);
  var invdMatch = invd.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (invdMatch) result.invoiceDate = invdMatch[1];

  var invv = findValue('Inv.Value', lines);
  var invvMatch = invv.match(/([\d.]+\s*USD)/i) || invv.match(/([\d.]+\s*[A-Z]{3})/);
  if (invvMatch) result.billingCurrency = invvMatch[1];

  var marks = findValue('Marks & Nos', lines);
  var marksMatch = marks.match(/([A-Z0-9]+-[A-Z0-9]+\/[A-Z\s]+?(?:REPLACEMENT|REPAIR|RETURN))/i) || marks.match(/([A-Z0-9]+-[A-Z0-9]+\/[A-Z]+)/i);
  if (marksMatch) result.remarks = marksMatch[1].trim();

  // GSTIN
  for (var i = 0; i < lines.length; i++) {
    var lt = lineText(lines[i]);
    var gstMatch = lt.match(/([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9]{3}[A-Z]{3}[0-9])/);
    if (gstMatch) {
      result.additionalRemarks = 'GSTIN: ' + gstMatch[1];
      break;
    }
  }

  var fr = findValue('Freight', lines);
  var frMatch = fr.match(/([\d.]+\s*[A-Z]{3})/);
  if (frMatch) result.billNo = frMatch[1];

  var er = findValue('Exchange Rate', lines);
  var erMatch = er.match(/([\d.]+\s*[A-Z]{3}\s*=\s*[\d.]+\s*INR)/);
  if (erMatch) result.billDate = erMatch[1];

  return result;
}

module.exports = router;