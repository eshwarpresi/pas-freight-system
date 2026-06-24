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

    // Extract text WITH positions from all pages
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
          width: Math.round(item.width * 100) / 100,
          height: Math.round(item.height * 100) / 100,
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

  // Group items into lines by Y position (tolerance of 3 points)
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

  // Helper: Get text from a line as a single string
  function lineText(line) {
    return line.items.map(function(i) { return i.text; }).join(' ').trim();
  }

  // Helper: Find value on same line after label, or on next line
  function findValue(label, lines, startIdx) {
    var labelLower = label.toLowerCase();
    for (var i = startIdx || 0; i < lines.length; i++) {
      var lt = lineText(lines[i]).toLowerCase();
      if (lt.indexOf(labelLower) >= 0) {
        // Get everything after the label on this line
        var fullText = lineText(lines[i]);
        var labelIdx = fullText.toLowerCase().indexOf(labelLower);
        var after = fullText.substring(labelIdx + label.length).replace(/^[\s:]+/, '').trim();
        
        // Also check next line if current line value is short
        if (after.length < 2 && i + 1 < lines.length) {
          var nextLine = lineText(lines[i + 1]);
          if (nextLine && !nextLine.match(/^[:\s-]+$/)) {
            after = nextLine;
          }
        }
        
        // Clean up the value
        after = after.replace(/-{3,}.*$/, '').trim();
        return after;
      }
    }
    return '';
  }

  // Helper: Get multiple lines after a label (for addresses, names)
  function findBlock(label, lines, maxLines) {
    var labelLower = label.toLowerCase();
    for (var i = 0; i < lines.length; i++) {
      var lt = lineText(lines[i]).toLowerCase();
      if (lt.indexOf(labelLower) >= 0) {
        var block = [];
        for (var j = i; j < Math.min(i + (maxLines || 5), lines.length); j++) {
          var txt = lineText(lines[j]);
          if (j > i && txt.indexOf(':') >= 0 && !txt.match(/^\s*#/)) break;
          block.push(txt);
        }
        return block.join(' ').replace(/-{3,}.*$/, '').trim();
      }
    }
    return '';
  }

  // === EXTRACT EACH FIELD ===

  // Reference Number (File No)
  result.referenceNumber = findValue('File No', lines);

  // Job No & Date
  var jobLine = findValue('Job No', lines);
  var jobMatch = jobLine.match(/(\d+)\s*[&]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (jobMatch) { result.jobOrderNo = jobMatch[1]; result.jobOrderDate = jobMatch[2]; }

  // Transport Mode
  result.shipmentMode = findValue('Transport Mode', lines);

  // Location (Port Of Filing)
  var loc = findValue('Port Of Filing', lines);
  result.location = loc;
  result.portOfDischarge = loc; // Indian customs port

  // B.E Date
  var beDate = findValue('Printed On', lines);
  var beMatch = beDate.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (beMatch) result.boeSbDate = beMatch[1];

  // Agent
  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  // Importer Name
  var impBlock = findBlock('Importer Details', lines, 6);
  var impMatch = impBlock.match(/PAS FREIGHT SERVICES\s+([A-Z][A-Z\s]+(?:PRIVATE|LIMITED|PVT|LTD|INC|CORP|INTEGRATORS)[A-Z\s]*?)\s+#/i);
  if (impMatch) result.importerName = impMatch[1].replace(/\s+/g, ' ').trim();

  // MBL/MAWB
  var mbl = findValue('MBL/MAWB', lines);
  var mblMatch = mbl.match(/(\d+)/);
  if (mblMatch) result.mawbMblNo = mblMatch[1];

  // HBL/HAWB
  var hbl = findValue('HBL/HAWB', lines);
  var hblMatch = hbl.match(/([A-Z0-9]+)/);
  if (hblMatch) result.hawbHblNo = hblMatch[1];

  // AWB Dates - find line with "Date :" after MBL/MAWB
  for (var i = 0; i < lines.length; i++) {
    var lt = lineText(lines[i]);
    if (lt.indexOf('MBL/MAWB') >= 0 || lt.indexOf('HBL/HAWB') >= 0) {
      // Check next few lines for dates
      for (var j = i; j < Math.min(i + 5, lines.length); j++) {
        var dt = lineText(lines[j]);
        var dates = dt.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g);
        if (dates && dates.length >= 2) {
          result.mawbMblDate = dates[0];
          result.hawbHblDate = dates[1];
          break;
        }
      }
    }
  }

  // No. of Pkgs
  var pkg = findValue('No. of Pkgs', lines);
  var pkgMatch = pkg.match(/(\d+)/);
  if (pkgMatch) result.noOfPackages = pkgMatch[1];

  // Gross Weight
  var wt = findValue('Gross Weight', lines);
  var wtMatch = wt.match(/([\d.]+\s*KGS)/i);
  if (wtMatch) result.grossWeight = wtMatch[1];

  // Port of Destination (Port Shipment)
  var ps = findValue('Port Shipment', lines);
  var psMatch = ps.match(/([A-Z]+-[A-Z]+)/);
  if (psMatch) result.portOfDestination = psMatch[1];

  // Supplier & Exporter
  var suppBlock = findBlock('SUPPLIER DETAILS', lines, 8);
  var suppMatch = suppBlock.match(/Inv\.?SlNo\s*:\s*\d+\s+([A-Z][A-Z\s]+(?:PTE|LTD|PVT|INC|CORP|LIMITED)[A-Z\s]*?)\s+\d/);
  if (suppMatch) {
    result.supplierName = suppMatch[1].replace(/\s+/g, ' ').trim();
    result.exporterName = result.supplierName;
  }

  // Invoice No
  var inv = findValue('Inv.No', lines);
  var invMatch = inv.match(/(\d+)/);
  if (invMatch) result.invoiceNo = invMatch[1];

  // Invoice Date
  var invd = findValue('Inv.Date', lines);
  var invdMatch = invd.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (invdMatch) result.invoiceDate = invdMatch[1];

  // Invoice Value
  var invv = findValue('Inv.Value', lines);
  var invvMatch = invv.match(/([\d.]+\s*[A-Z]{3})/);
  if (invvMatch) result.billingCurrency = invvMatch[1];

  // Marks & Nos
  var marks = findValue('Marks & Nos', lines);
  var marksMatch = marks.match(/([A-Z0-9]+-[A-Z0-9]+\/[A-Z\s]+)/i);
  if (marksMatch) result.remarks = marksMatch[1].trim();

  // GSTIN
  var gst = findValue('GSTIN', lines);
  var gstMatch = gst.match(/([A-Z0-9]+)/);
  if (gstMatch) result.additionalRemarks = 'GSTIN: ' + gstMatch[1];

  // Freight
  var fr = findValue('Freight', lines);
  var frMatch = fr.match(/([\d.]+\s*[A-Z]{3})/);
  if (frMatch) result.billNo = frMatch[1];

  // Exchange Rate
  var er = findValue('Exchange Rate', lines);
  var erMatch = er.match(/([\d.]+\s*[A-Z]{3}\s*=\s*[\d.]+\s*INR)/);
  if (erMatch) result.billDate = erMatch[1];

  return result;
}

module.exports = router;