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
    if (!req.file) return res.status(400).json({ status: 'error', message: 'Please upload a PDF checklist' });

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
        allItems.push({ text: item.str, x: Math.round(item.transform[4]), y: Math.round(viewport.height - item.transform[5]), page: pageNum });
      });
    }

    var parsed = parseChecklistUniversal(allItems);
    var rawText = allItems.slice().sort(function(a, b) { return a.y - b.y || a.x - b.x; }).map(function(i) { return i.text; }).join(' ');
    
    // Detect shipment type from raw text
    var shipmentType = detectShipmentType(rawText);
    parsed.shipmentType = shipmentType;
    
    res.json({ status: 'success', data: parsed, rawText: rawText });
  } catch (error) {
    console.error('PDF scan error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to scan PDF: ' + error.message });
  }
});

function detectShipmentType(rawText) {
  var text = rawText.toUpperCase();
  
  var seaIndicators = [
    'GATEWAY IGM',
    'CONTAINER NO',
    'CONTAINER NUMBER',
    'MBL',
    'SEA',
    'FCL',
    'LCL',
    'PORT OF DISCHARGE',
    'VESSEL',
    'VOYAGE'
  ];
  
  var airIndicators = [
    'MAWB',
    'AWB',
    'AIR WAYBILL',
    'FLIGHT NO',
    'AIRPORT',
    'AIR FREIGHT'
  ];
  
  var seaScore = 0;
  var airScore = 0;
  
  seaIndicators.forEach(function(ind) {
    if (text.includes(ind)) seaScore++;
  });
  
  airIndicators.forEach(function(ind) {
    if (text.includes(ind)) airScore++;
  });
  
  if (text.includes('GATEWAY IGM') || text.includes('CONTAINER NO')) {
    return 'Sea';
  }
  
  if (text.includes('MAWB') && !text.includes('MBL')) {
    return 'Air';
  }
  
  if (seaScore > airScore) return 'Sea';
  if (airScore > seaScore) return 'Air';
  
  return 'Unknown';
}

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
    billTo: '', billToDate: '', docketNo: '', docketDate: '', additionalRemarks: '',
    gatewayIgmNo: '', gatewayIgmDate: '', localIgmNo: '', localIgmDate: '',
    containerNo: '', shipmentType: ''
  };

  var page1Items = items.filter(function(i) { return i.page === 1; });
  var sortedItems = page1Items.slice().sort(function(a, b) { return a.y - b.y || a.x - b.x; });
  var rawText = sortedItems.map(function(i) { return i.text; }).join(' ');
  var rawTextCompact = rawText.replace(/\s+/g, '');

  function tryPatterns(patterns, text) {
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m && m[1] && m[1].trim().length > 0) return m[1].trim();
    }
    return '';
  }

  function cleanCompanyName(name) {
    if (!name) return '';
    return name.replace(/\s+(Inv\.?|SUPPLIER|DETAILS|CHA|Importer|GSTIN)\s*$/i, '').trim();
  }

  // ── DETECT SHIPMENT TYPE ──
  var isSea = /Gateway\s*IGM|IGM\s*NO|Container|HBL\/\s*HAWB|MBL\/\s*MAWB|SEA|FCL|LCL/i.test(rawText);
  var isAir = /MAWB|AWB|AIR\s*WAYBILL|FLIGHT|AIRPORT/i.test(rawText);
  
  if (isSea && !isAir) result.shipmentType = 'Sea';
  else if (isAir && !isSea) result.shipmentType = 'Air';
  else if (isSea && isAir) {
    var seaCount = (rawText.match(/IGM|Container|MBL|SEA|FCL|LCL/gi) || []).length;
    var airCount = (rawText.match(/MAWB|AWB|AIR|FLIGHT/gi) || []).length;
    result.shipmentType = seaCount > airCount ? 'Sea' : 'Air';
  } else {
    result.shipmentType = 'Unknown';
  }

  // ── REFERENCE NUMBER ──
  result.referenceNumber = tryPatterns([
    /File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i,
    /ONLINE[-\s]*(\d+)/i,
    /Ref\s*No\s*:?\s*([A-Z0-9\/-]+)/i,
    /([A-Z]+\/\d+\/[A-Z]+)/i
  ], rawText);

  // ── SHIPMENT MODE ──
  result.shipmentMode = tryPatterns([
    /Transport\s*Mode\s*:\s*(\S)/i,
    /Mode\s*:\s*(\S)/i,
    /Shipment\s*Mode\s*:?\s*(\S)/i
  ], rawText);

  // ── IMPORTER/EXPORTER NAME ──
  result.importerName = tryPatterns([
    /PAS\s+FREIGHT\s+SERVICES\s+([\w\s]+?(?:LIMITED|PRIVATE|INTEGRATORS|TECHNOLOGY|LTD)[\w\s]*?)(?:\s+#|\s{2,}|\s+\d)/i,
    /PAS\s+FREIGHT\s+SERVICES\s+([A-Z][\w\s]+?(?:LTD|LIMITED|PRIVATE|PVT|INC|CORP|CO\.?)(?:[\w\s]*?))(?:\s+#|\s{2,})/i,
    /(ONLINE\s+INSTRUMENTS\s*\(INDIA\)\s*LIMITED)/i,
    /(RESURGENT\s+AV\s+INTEGRATORS\s+PRIVATE\s+LIMITED)/i,
    /(ARION\s+TECHNOLOGY\s+LTD)/i,
    /Importer\s+Details\s*:?\s*([\w\s]+?(?:LTD|LIMITED|PRIVATE|PVT)[\w\s]*)/i,
    /Importer\s*Name\s*:?\s*([\w\s]+?(?:LTD|LIMITED|PVT|PRIVATE)[\w\s]*)/i
  ], rawText);
  result.importerName = cleanCompanyName(result.importerName);

  // ── SUPPLIER NAME ──
  result.supplierName = tryPatterns([
    /Inv\.?\s*Sl\.?\s*No\s*:\s*\d+\s+([A-Z][\w\s]+(?:PTE|LTD|CO\.?,?\s*LTD|PRINTING|TECHNOLOGY)[\w\s]*)/i,
    /(TCL\s+SMART\s+HOMETECHNOLOGIES\s*CO\.?,?\s*LTD)/i,
    /(CRESTRON\s+SINGAPORE\s+PTE\s+LTD)/i,
    /(YUAN\s+HENG\s+TAI\s+WATER\s+TRANSFER\s+PRINTING\s+CO\s+LTD)/i,
    /SUPPLIER\s+DETAILS[\s\S]{0,200}?\b([A-Z][\w\s]+(?:LTD|LIMITED|PTE|CO\.?,?\s*LTD|PRINTING|TECHNOLOGY)[\w\s]*)/i,
    /Supplier\s*Name\s*:?\s*([\w\s]+?(?:LTD|LIMITED|PTE|PVT)[\w\s]*)/i
  ], rawText);
  result.supplierName = cleanCompanyName(result.supplierName);
  result.exporterName = result.supplierName;

  // ── LOCATION ──
  result.location = tryPatterns([
    /Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i,
    /Port\s*Of\s*Filing\s*:\s*([A-Z0-9]+\s*,?\s*[A-Z]+\s*,?\s*[A-Z\s]+)/i,
    /Location\s*:?\s*([A-Z0-9]+\s*,?\s*[A-Z\s]+)/i
  ], rawText);

  // ── JOB ORDER NO + DATE ──
  result.jobOrderNo = tryPatterns([
    /Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)/i,
    /Job\s*No\s*:?\s*(\d+)/i
  ], rawText);
  
  result.jobOrderDate = tryPatterns([
    /Job\s*No\s*[&]?\s*Date\s*:\s*\d+\s*[&]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Job\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], rawText);

  // ── BOE/SB NUMBER + DATE ──
  result.boeSbNo = tryPatterns([
    /B\.?E\s*No[,\s]*Date\s*:\s*(\d+)/i,
    /BOE\s*No\s*:?\s*(\d+)/i,
    /SB\s*No\s*:?\s*(\d+)/i
  ], rawText);
  
  result.boeSbDate = tryPatterns([
    /B\.?E\s*No[,\s]*Date\s*:\s*\d+\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Printed\s*On\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /BOE\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], rawText);

  // ── MAWB/MBL NUMBER + DATE (AIR vs SEA specific) ──
  if (isAir) {
    result.mawbMblNo = tryPatterns([
      /MAWB\s*(?:No)?\s*:?\s*([A-Z0-9]+)/i,
      /Air\s*Waybill\s*No\s*:?\s*([A-Z0-9]+)/i,
      /AWB\s*No\s*:?\s*([A-Z0-9]+)/i
    ], rawText);
  } else {
    result.mawbMblNo = tryPatterns([
      /MBL\/\s*MAWB\s*:\s*([A-Z0-9]+)/i,
      /MBL\s*No\s*:?\s*([A-Z0-9]+)/i,
      /MAWB\s*(?:No)?\s*:?\s*([A-Z0-9]+)/i
    ], rawText);
  }
  
  result.mawbMblDate = tryPatterns([
    /MAWB\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /MBL\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], rawText);

  // ── HAWB/HBL NUMBER + DATE (AIR vs SEA specific) ──
  if (isAir) {
    // AIR: HAWB is the house airway bill
    result.hawbHblNo = tryPatterns([
      /HAWB\s*(?:No)?\s*:?\s*([A-Z0-9]+)/i,
      /House\s*Air\s*Waybill\s*No\s*:?\s*([A-Z0-9]+)/i,
      /HBL\/\s*HAWB\s*:\s*([A-Z0-9]+)/i,
      /HAWB\s*:?\s*([A-Z0-9]+)/i
    ], rawText);
    
    // FIX: Better HAWB/HBL date extraction for Air
    if (result.hawbHblNo) {
      var escH = result.hawbHblNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var dateH = rawText.match(new RegExp(escH + '[\\s\\S]{0,150}?(\\d{1,2}[-\\/]\\d{1,2}[-\\/]\\d{2,4})'));
      if (dateH) {
        result.hawbHblDate = dateH[1];
      } else {
        // Try direct pattern: HBL/HAWB : OGC2606474 Date : 21/06/2026
        var directDate = rawText.match(/HBL\/\s*HAWB\s*:\s*[A-Z0-9]+\s+Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
        if (directDate) result.hawbHblDate = directDate[1];
      }
    }
    
    // If still no date, try general patterns
    if (!result.hawbHblDate) {
      result.hawbHblDate = tryPatterns([
        /HAWB\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
        /HBL\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
        /Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
      ], rawText);
    }
  } else {
    // SEA: HBL is the house bill of lading
    var seaM = rawText.match(/HBL\/\s*HAWB\s*:\s*(\d{7,12})\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
    if (seaM) { 
      result.hawbHblNo = seaM[1]; 
      result.hawbHblDate = seaM[2]; 
    } else {
      var seaM2 = rawText.match(/HBL\/\s*HAWB\s*:\s*(\d{7,12})/i);
      if (seaM2) {
        result.hawbHblNo = seaM2[1];
        var dA = rawText.match(new RegExp(seaM2[1] + '\\s+(\\d{1,2}[-\\/]\\d{1,2}[-\\/]\\d{2,4})'));
        if (dA) result.hawbHblDate = dA[1];
      }
    }
    if (!result.hawbHblNo) {
      var hi = rawText.indexOf('HBL');
      if (hi >= 0) {
        var nh = rawText.substring(hi, hi + 150).match(/(\d{7,12})/);
        if (nh) {
          result.hawbHblNo = nh[1];
          var dN = rawText.match(new RegExp(nh[1] + '\\s+(\\d{1,2}[-\\/]\\d{1,2}[-\\/]\\d{2,4})'));
          if (dN) result.hawbHblDate = dN[1];
        }
      }
    }
  }

  // ── NO OF PACKAGES ──
  result.noOfPackages = tryPatterns([
    /No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i,
    /Pkgs\s*:\s*(\d+)/i,
    /Packages\s*:?\s*(\d+)/i,
    /(\d+)\s*(?:PKGS|Pkgs|PACKAGES|CAS)/i
  ], rawText);

  // ── GROSS WEIGHT ──
  result.grossWeight = tryPatterns([
    /Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i,
    /Weight\s*:\s*([\d.]+\s*KGS)/i,
    /Gross\s*Weight\s*:?\s*([\d.]+\s*KGS?)/i
  ], rawText);

  // ── IGM NUMBER + DATE (SEA only) ──
  if (isSea) {
    result.igmNo = tryPatterns([
      /IGM\s*NO\s*:\s*(\d+)/i,
      /IGM\s*No\s*:?\s*(\d+)/i
    ], rawText);
    
    result.igmDate = tryPatterns([
      /IGM\s*NO\s*:\s*\d+\s*\/\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /IGM\s*No\s*:?\s*\d+[\s\/]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /IGM\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], rawText);
  }

  // ── GATEWAY IGM (SEA only) ──
  if (isSea) {
    result.gatewayIgmNo = tryPatterns([
      /Gateway\s*IGM\s*:\s*(\d+)/i,
      /Gateway\s*IGM\s*No\s*:?\s*(\d+)/i
    ], rawText);
    
    result.gatewayIgmDate = tryPatterns([
      /Gateway\s*IGM\s*:\s*\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /Gateway\s*IGM\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], rawText);
  }

  // ── LOCAL IGM (SEA only) ──
  if (isSea) {
    result.localIgmNo = tryPatterns([
      /Local\s*IGM\s*No\s*:?\s*(\d+)/i,
      /Local\s*IGM\s*:?\s*(\d+)/i
    ], rawText);
    
    result.localIgmDate = tryPatterns([
      /Local\s*IGM\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /Local\s*IGM\s*:\s*\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], rawText);
  }

  // ── CONTAINER NUMBER (SEA only) ──
  if (isSea) {
    var containerMatch = rawText.match(/CONTAINER\s+(?:NO\.?|DETAILS|NUMBER)[\s\S]{0,500}?([A-Z]{4}\d{7})/i);
    if (!containerMatch) containerMatch = rawText.match(/\d+\s*\/\s*\d+\s+(?:Signature\s+)?(?:CHA\s+)?(?:Importer\s+)?([A-Z]{4}\d{7})/i);
    if (!containerMatch) containerMatch = rawText.match(/(?:^|\s)([A-Z]{4}\d{7})(?:\s|$)/);
    if (containerMatch && containerMatch[1]) result.containerNo = containerMatch[1];
  }

  // ── CARGO ARRIVAL NOTICE ──
  if (!result.cargoArrivalNotice) result.cargoArrivalNotice = result.gatewayIgmNo;
  if (!result.cargoArrivalDate) result.cargoArrivalDate = result.gatewayIgmDate;

  // ── PORT OF DISCHARGE ──
  result.portOfDischarge = tryPatterns([
    /Port\s*Of\s*Discharge\s*:?\s*([A-Z0-9]+\s*,?\s*[A-Z\s]+)/i,
    /Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i
  ], rawText);

  // ── PORT OF DESTINATION ──
  result.portOfDestination = tryPatterns([
    /Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i,
    /Destination\s*(?:Port)?\s*:?\s*([A-Z]+-[A-Z]+)/i,
    /Port\s*Origin\s*:\s*([A-Z]+-[A-Z]+)/i,
    /Port\s*Of\s*Destination\s*:?\s*([A-Z0-9]+-[A-Z]+)/i
  ], rawText);

  // ── INVOICE NUMBER + DATE ──
  result.invoiceNo = tryPatterns([
    /Inv\.?\s*No\s*:\s*([A-Z0-9]+[-\/]?\d*[A-Z]?[-\/]?\d*)/i,
    /Invoice\s*(?:No|Number)\s*:?\s*([A-Z0-9\-]+)/i
  ], rawText);
  
  result.invoiceDate = tryPatterns([
    /Inv\.?\s*Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Invoice\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], rawText);

  // ── DELIVERY ORDER DATE ──
  result.deliveryOrderDate = tryPatterns([
    /DO\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Delivery\s*Order\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], rawText);

  // ── OCC DATE ──
  result.occDate = tryPatterns([
    /O[OC]C\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /OOC\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], rawText);

  // ── GATE PASS DATE ──
  result.gatePassDate = tryPatterns([
    /Gate\s*Pass\s*(?:Date)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Gate\s*Pass\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], rawText);

  // ── REMARKS / MARKS & NOS ──
  result.remarks = tryPatterns([
    /Marks\s*[&]?\s*Nos\s*:\s*([A-Z0-9]+[-\/\s]+[A-Z0-9]+)/i,
    /Marks\s*[&]?\s*Nos\s*:?\s*(.+?)(?:\s{2,}|$)/i,
    /REMARKS\s*:?\s*([\w\s\/\-]+)/i
  ], rawText);

  // ── GSTIN ──
  var gstMatch = rawText.match(/GSTIN\s*:?\s*(\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d])/i);
  if (!gstMatch) gstMatch = rawTextCompact.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d])/i);
  if (!gstMatch) { 
    var lm = rawText.match(/\b(\d{2}[A-Z0-9]{13})\b/i); 
    if (lm && /[A-Z]/.test(lm[1]) && /\d/.test(lm[1].substring(2))) gstMatch = lm; 
  }
  if (gstMatch) result.additionalRemarks = 'GSTIN: ' + gstMatch[1].toUpperCase();

  // ── BILLING CURRENCY ──
  result.billingCurrency = tryPatterns([
    /Inv\.?\s*Value\s*:\s*[\d.,]+\s*([A-Z]{3})/i,
    /Invoice\s*Value\s*:?\s*[\d.,]+\s*([A-Z]{3})/i,
    /Currency\s*:?\s*([A-Z]{3})/i,
    /Exchange\s*Rate\s*:\s*[\d.]+\s*([A-Z]{3})\s*=/i
  ], rawText);

  // ── BILL NUMBER ──
  result.billNo = tryPatterns([
    /UCR\s*Number\s*:?\s*([A-Z0-9\-]+)/i,
    /Bill\s*No\s*:?\s*([A-Z0-9\-]+)/i,
    /Invoice\s*(?:No|Number)\s*:?\s*([A-Z0-9\-]+)/i
  ], rawText);

  // ── BILL DATE ──
  if (result.billNo) {
    var escBill = result.billNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var dateMatch = rawText.match(new RegExp(escBill + '[\\s\\S]{0,100}?(\\d{1,2}[-\\/]\\d{1,2}[-\\/]\\d{2,4})'));
    if (dateMatch) result.billDate = dateMatch[1];
  }
  if (!result.billDate) {
    result.billDate = tryPatterns([
      /Bill\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /Invoice\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], rawText);
  }

  // ── BILL TO ──
  result.billTo = tryPatterns([
    /Bill\s*To\s*:?\s*([\w\s]+?(?:LTD|LIMITED|PVT|PRIVATE|INC|CORP)[\w\s]*?)(?:\s+#|\s{2,})/i,
    /Importer\s+Details\s*:?\s*([\w\s]+?(?:LTD|LIMITED|PVT|PRIVATE)[\w\s]*?)(?:\s+#|\s{2,})/i,
    /Importer\s*Name\s*:?\s*([\w\s]+?(?:LTD|LIMITED|PVT|PRIVATE)[\w\s]*)/i
  ], rawText);
  result.billTo = cleanCompanyName(result.billTo);
  
  // Fallback: Use importerName if billTo is empty
  if (!result.billTo && result.importerName) {
    result.billTo = result.importerName;
  }

  // ── DOCKET NUMBER ──
  result.docketNo = tryPatterns([
    /File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i,
    /Docket\s*No\s*:?\s*([A-Z0-9\-]+)/i,
    /Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)/i
  ], rawText);
  
  // If docketNo is just a number, add prefix
  if (result.docketNo && /^\d+$/.test(result.docketNo)) {
    result.docketNo = 'JOB-' + result.docketNo;
  }

  // ── DOCKET DATE ──
  if (result.docketNo) {
    var escDocket = result.docketNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var dDateMatch = rawText.match(new RegExp(escDocket + '[\\s\\S]{0,100}?(\\d{1,2}[-\\/]\\d{1,2}[-\\/]\\d{2,4})'));
    if (dDateMatch) result.docketDate = dDateMatch[1];
  }
  if (!result.docketDate) {
    result.docketDate = tryPatterns([
      /File\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /Job\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], rawText);
  }

  // ── CLEAN UP ──
  result.importerName = cleanCompanyName(result.importerName);
  result.exporterName = cleanCompanyName(result.exporterName);
  result.supplierName = cleanCompanyName(result.supplierName);
  
  // ── AGENT DEBIT NOTE ──
  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  return result;
}

module.exports = router;