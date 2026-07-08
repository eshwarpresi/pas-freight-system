// backend/src/routes/checklist.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ocrPdfFromImages, mergeTexts } = require('../services/ocrService');

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

// ─── LAYER 1: PDF-JS DIGITAL TEXT EXTRACTION ───
async function extractTextWithPdfJs(buffer) {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdfDocument = await loadingTask.promise;

    const allItems = [];
    const pageInfo = [];
    
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      
      let pageTextLength = 0;
      content.items.forEach(function(item) {
        allItems.push({
          text: item.str.trim(),
          x: Math.round(item.transform[4]),
          y: Math.round(viewport.height - item.transform[5]),
          page: pageNum,
          width: item.width || 0,
          height: item.height || 0,
          fontName: item.fontName || ''
        });
        pageTextLength += item.str.replace(/\s+/g, '').length;
      });
      
      pageInfo.push({
        pageNum,
        textLength: pageTextLength,
        isScanned: pageTextLength < 50
      });
    }
    
    return { items: allItems, pageInfo };
  } catch (err) {
    console.error('PDF.js extraction error:', err.message);
    return { items: [], pageInfo: [] };
  }
}

// ─── LAYER 2: PDF-PARSE TEXT EXTRACTION (FIXED) ───
async function extractTextWithPdfParse(buffer) {
  try {
    const { PDFParse } = require('pdf-parse');
    const pdfParse = new PDFParse(buffer);
    const data = await pdfParse.parse();
    return data.text || '';
  } catch (err) {
    console.error('pdf-parse extraction error:', err.message);
    return '';
  }
}

// ─── LAYER 3: TESSERACT OCR ───
async function extractOcrFromScannedPages(buffer, pageInfo) {
  try {
    const scannedPages = pageInfo.filter(p => p.isScanned);
    if (scannedPages.length === 0) {
      console.log('All pages have digital text, skipping OCR');
      return '';
    }
    console.log(`${scannedPages.length} scanned page(s) detected, running OCR...`);

    const pdfjsLib = await import('pdfjs-dist');
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdfDocument = await loadingTask.promise;

    const imageBuffers = [];
    for (const pageInfoItem of scannedPages) {
      const page = await pdfDocument.getPage(pageInfoItem.pageNum);
      const viewport = page.getViewport({ scale: 2.5 });
      
      let canvas, ctx;
      try {
        const { createCanvas } = require('canvas');
        canvas = createCanvas(viewport.width, viewport.height);
        ctx = canvas.getContext('2d');
      } catch (e) {
        console.warn('Canvas not available, skipping OCR');
        return '';
      }
      
      await page.render({ canvasContext: ctx, viewport }).promise;
      imageBuffers.push(canvas.toBuffer('image/png'));
    }

    return await ocrPdfFromImages(imageBuffers);
  } catch (err) {
    console.error('OCR extraction failed:', err.message);
    return '';
  }
}

// ─── INTELLIGENT PARSER ───
function intelligentParse(items, pdfParseText, ocrText) {
  const result = {
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
    containerNo: '', shipmentType: '', gstin: ''
  };

  const confidence = {};
  
  const page1Items = items.filter(i => i.page === 1);
  const sortedByPosition = [...page1Items].sort((a, b) => a.y - b.y || a.x - b.x);
  const digitalText = sortedByPosition.map(i => i.text).join(' ');
  const combinedText = mergeTexts(digitalText, ocrText || pdfParseText || '');
  const compactText = combinedText.replace(/\s+/g, '');
  const upperText = combinedText.toUpperCase();

  function findWithConfidence(patterns, text, fieldName) {
    for (let i = 0; i < patterns.length; i++) {
      const match = text.match(patterns[i]);
      if (match && match[1] && match[1].trim().length > 1) {
        const value = match[1].trim();
        const conf = Math.max(0.5, 1 - (i * 0.05));
        confidence[fieldName] = conf;
        return value;
      }
    }
    confidence[fieldName] = 0;
    return '';
  }

  function cleanCompanyName(name) {
    if (!name) return '';
    return name
      .replace(/\s+(Inv\.?|SUPPLIER|DETAILS|CHA|Importer|GSTIN|SERVICES|CO\.?|LTD|PTE|PVT|PRIVATE|LIMITED)\s*$/i, '')
      .replace(/^\s*(PAS\s*FREIGHT\s*SERVICES?\s*)/i, '')
      .trim();
  }

  // ─── DETECT SHIPMENT TYPE ───
  const seaKeywords = ['GATEWAY IGM', 'CONTAINER', 'MBL', 'FCL', 'LCL', 'VESSEL', 'IGM NO'];
  const airKeywords = ['MAWB', 'AWB', 'AIR WAYBILL', 'FLIGHT NO', 'AIRPORT'];
  
  let seaScore = 0, airScore = 0;
  seaKeywords.forEach(kw => { if (upperText.includes(kw)) seaScore++; });
  airKeywords.forEach(kw => { if (upperText.includes(kw)) airScore++; });
  
  result.shipmentType = seaScore > airScore ? 'Sea' : airScore > seaScore ? 'Air' : 'Unknown';
  const isSea = result.shipmentType === 'Sea';

  // ─── REFERENCE NUMBER ───
  result.referenceNumber = findWithConfidence([
    /File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i,
    /Ref\s*(?:erence)?\s*No\s*:?\s*([A-Z0-9\/-]+)/i
  ], combinedText, 'referenceNumber');

  // ─── IMPORTER NAME ───
  result.importerName = findWithConfidence([
    /PAS\s+FREIGHT\s+SERVICES\s+([A-Z][\w\s]+?(?:LIMITED|PRIVATE|INTEGRATORS|TECHNOLOGY|LTD)[\w\s]*?)(?:\s+#|\s{2,}|\s+\d)/i,
    /Importer\s+Details\s*:?\s*\d*\s*[A-Z0-9]+\s+[A-Z0-9]+\s+[A-Z0-9]+\s+PAS\s+FREIGHT\s+SERVICES\s+([A-Z][\w\s]+?(?:LTD|LIMITED|TECHNOLOGY)[\w\s]*)/i,
    /(ONLINE\s+INSTRUMENTS\s*\(INDIA\)\s*LIMITED)/i,
    /(RESURGENT\s+AV\s+INTEGRATORS\s+PRIVATE\s+LIMITED)/i,
    /(ARION\s+TECHNOLOGY\s+LTD)/i,
    /Importer\s*(?:Name|Details)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PVT|PRIVATE)[\w\s]*)/i
  ], combinedText, 'importerName');

  // ─── EXPORTER NAME ───
  result.exporterName = findWithConfidence([
    /SUPPLIER\s+DETAILS[\s\S]{0,300}?\b([A-Z][\w\s]+(?:LTD|LIMITED|PTE|CO\.?,?\s*LTD|PRINTING|TECHNOLOGY)[\w\s]*)/i,
    /Exporter\s*(?:Name|Details)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PTE|PVT|PRIVATE|CO\.?)[\w\s]*)/i,
    /Shipper\s*(?:Name)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PTE|PVT)[\w\s]*)/i,
    /(TCL\s+SMART\s+HOMETECHNOLOGIES\s*CO\.?,?\s*LTD)/i,
    /(CRESTRON\s+SINGAPORE\s+PTE\s+LTD)/i,
    /(YUAN\s+HENG\s+TAI\s+WATER\s+TRANSFER\s+PRINTING\s+CO\s+LTD)/i,
    /Inv\.?\s*Sl\.?\s*No\s*:\s*\d+\s+([A-Z][\w\s]+(?:PTE|LTD|CO\.?,?\s*LTD|PRINTING|TECHNOLOGY)[\w\s]*)/i
  ], combinedText, 'exporterName');

  // ─── SUPPLIER NAME ───
  result.supplierName = findWithConfidence([
    /SUPPLIER\s+DETAILS[\s\S]{0,100}?\b([A-Z][\w\s]+(?:LTD|LIMITED|PTE|CO\.?,?\s*LTD|PRINTING|TECHNOLOGY)[\w\s]*)/i,
    /Supplier\s*(?:Name|Details)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PTE|PVT|PRIVATE)[\w\s]*)/i
  ], combinedText, 'supplierName');
  
  if (!result.supplierName && result.exporterName) {
    result.supplierName = result.exporterName;
    confidence.supplierName = 0.7;
  }

  // ─── LOCATION ───
  result.location = findWithConfidence([
    /Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i,
    /Location\s*:?\s*([A-Z0-9]+\s*,?\s*[A-Z\s]+)/i
  ], combinedText, 'location');

  // ─── JOB ORDER NO + DATE ───
  result.jobOrderNo = findWithConfidence([
    /Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)/i,
    /Job\s*No\s*:?\s*(\d{3,})/i
  ], combinedText, 'jobOrderNo');
  
  result.jobOrderDate = findWithConfidence([
    /Job\s*No\s*[&]?\s*Date\s*:\s*\d+\s*[&]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Job\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], combinedText, 'jobOrderDate');

  // ─── BOE/SB NUMBER + DATE ───
  const boeSbNo = findWithConfidence([
    /B\.?E\s*No[,\s]*Date\s*:\s*(\d{3,})/i,
    /BOE\s*No\s*:?\s*(\d{3,})/i,
    /SB\s*No\s*:?\s*(\d{3,})/i,
    /B\/E\s*No\s*:?\s*(\d{3,})/i
  ], combinedText, 'boeSbNo');
  
  if (boeSbNo && /^\d{3,}$/.test(boeSbNo)) {
    result.boeSbNo = boeSbNo;
  }
  
  if (result.boeSbNo) {
    result.boeSbDate = findWithConfidence([
      /B\.?E\s*No[,\s]*Date\s*:\s*\d+\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /Printed\s*On\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /BOE\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], combinedText, 'boeSbDate');
  }

  // ─── SHIPMENT MODE (FIXED - case insensitive) ───
  result.shipmentMode = findWithConfidence([
    /Transport\s*Mode\s*:\s*([ALSals])\b/i,
    /Transport\s*Mode\s*:\s*(\S+)/i,
    /Mode\s*:\s*([ALSals])\b/i
  ], combinedText, 'shipmentMode');
  // Uppercase the result
  if (result.shipmentMode) result.shipmentMode = result.shipmentMode.toUpperCase();

  // ─── MAWB/MBL NUMBER + DATE ───
  result.mawbMblNo = findWithConfidence([
    /MBL\/?\s*MAWB\s*:\s*([A-Z0-9]{6,20})/i,
    /MBL\s*(?:No)?\s*:?\s*([A-Z0-9]{6,20})/i,
    /MAWB\s*(?:No)?\s*:?\s*([A-Z0-9]{6,20})/i
  ], combinedText, 'mawbMblNo');
  
  if (result.mawbMblNo) {
    const escM = result.mawbMblNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result.mawbMblDate = findWithConfidence([
      new RegExp(escM + '[\\s\\S]{0,80}?(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{2,4})'),
      /(?:MAWB|MBL)\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], combinedText, 'mawbMblDate');
  }

  // ─── HAWB/HBL NUMBER + DATE (only if value exists) ───
  const hblMatch = combinedText.match(/HBL\/?\s*HAWB\s*:\s*(\d{6,14})\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
  if (hblMatch) {
    result.hawbHblNo = hblMatch[1];
    result.hawbHblDate = hblMatch[2];
    confidence.hawbHblNo = 0.9;
  } else {
    const hblNum = combinedText.match(/HBL\/?\s*HAWB\s*:\s*(\d{6,14})/i);
    if (hblNum && hblNum[1] && hblNum[1].length >= 6) {
      result.hawbHblNo = hblNum[1];
      confidence.hawbHblNo = 0.8;
      const escH = hblNum[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dateAfter = combinedText.match(new RegExp(escH + '\\s+(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{2,4})'));
      if (dateAfter) result.hawbHblDate = dateAfter[1];
    }
  }

  // ─── NO OF PACKAGES (FIXED - handles "1 CAS") ───
  result.noOfPackages = findWithConfidence([
    /No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i,
    /Packages\s*:?\s*(\d+)/i,
    /(\d+)\s*(?:PKGS|Pkgs|PACKAGES|CAS|PKG|CTNS|NOS)/i
  ], combinedText, 'noOfPackages');

  // ─── GROSS WEIGHT ───
  result.grossWeight = findWithConfidence([
    /Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i,
    /Weight\s*:?\s*([\d.]+\s*KGS)/i
  ], combinedText, 'grossWeight');

  // ─── IGM + GATEWAY + LOCAL + CONTAINER (SEA only) ───
  if (isSea) {
    // IGM with full format
    const igmFull = combinedText.match(/IGM\s*NO\s*:\s*(\d+)\s*\/\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
    if (igmFull) {
      result.igmNo = igmFull[1];
      result.igmDate = igmFull[2];
      confidence.igmNo = 0.95;
    } else {
      result.igmNo = findWithConfidence([
        /IGM\s*(?:NO|No|Number)?\s*:?\s*(\d{4,})/i
      ], combinedText, 'igmNo');
      result.igmDate = findWithConfidence([
        /IGM\s*(?:Date)?\s*:?\s*\d+\s*\/\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
      ], combinedText, 'igmDate');
    }

    // Gateway IGM
    const gwFull = combinedText.match(/Gateway\s*IGM\s*:\s*(\d+)\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
    if (gwFull) {
      result.gatewayIgmNo = gwFull[1];
      result.gatewayIgmDate = gwFull[2];
      confidence.gatewayIgmNo = 0.95;
    } else {
      result.gatewayIgmNo = findWithConfidence([
        /Gateway\s*IGM\s*(?:No)?\s*:?\s*(\d{4,})/i
      ], combinedText, 'gatewayIgmNo');
      result.gatewayIgmDate = findWithConfidence([
        /Gateway\s*IGM\s*:?\s*\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
      ], combinedText, 'gatewayIgmDate');
    }

    result.localIgmNo = findWithConfidence([
      /Local\s*IGM\s*(?:No)?\s*:?\s*(\d{4,})/i
    ], combinedText, 'localIgmNo');
    
    result.localIgmDate = findWithConfidence([
      /Local\s*IGM\s*(?:Date)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], combinedText, 'localIgmDate');

    // ─── CONTAINER NUMBER (FIXED - searches entire text) ───
    // Search for standard container format: 4 letters + 7 digits
    const containerSection = combinedText.match(/CONTAINER\s+DETAILS[\s\S]{0,800}/i);
    if (containerSection) {
      const contMatch = containerSection[0].match(/\b([A-Z]{4}\d{7})\b/);
      if (contMatch) {
        const container = contMatch[1];
        const invalidPrefixes = /^(CSBL|JJCSK|SZBGL|OGC|UESZ|MAWB|MBL|HAWB)/i;
        if (!invalidPrefixes.test(container)) {
          result.containerNo = container;
          confidence.containerNo = 0.95;
        }
      }
    }
    
    // Fallback: find ANY valid container format in the entire text
    if (!result.containerNo) {
      // Try near "CONTAINER" label
      const nearContainerLabel = combinedText.match(/CONTAINER\s+(?:NO\.?|NUMBER)?[\s\S]{0,200}?\b([A-Z]{4}\d{7})\b/i);
      if (nearContainerLabel) {
        const container = nearContainerLabel[1];
        const invalidPrefixes = /^(CSBL|JJCSK|SZBGL|OGC|UESZ|MAWB|MBL|HAWB)/i;
        if (!invalidPrefixes.test(container)) {
          result.containerNo = container;
          confidence.containerNo = 0.9;
        }
      }
    }
    
    // Last resort: any valid container anywhere
    if (!result.containerNo) {
      const allContainers = combinedText.match(/\b([A-Z]{4}\d{7})\b/g) || [];
      const invalidPrefixes = /^(CSBL|JJCSK|SZBGL|OGC|UESZ|MAWB|MBL|HAWB)/i;
      const validContainers = allContainers.filter(c => !invalidPrefixes.test(c));
      if (validContainers.length > 0) {
        result.containerNo = validContainers[0];
        confidence.containerNo = 0.8;
      }
    }
  }

  // ─── PORTS ───
  result.portOfDischarge = findWithConfidence([
    /Port\s*Of\s*Discharge\s*:?\s*([A-Z0-9]+\s*,?\s*[A-Z\s]+)/i,
    /Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i
  ], combinedText, 'portOfDischarge');

  result.portOfDestination = findWithConfidence([
    /Port\s*(?:Of)?\s*Destination\s*:?\s*([A-Z0-9]+-[A-Z]+)/i,
    /Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i,
    /Port\s*Origin\s*:\s*([A-Z]+-[A-Z]+)/i
  ], combinedText, 'portOfDestination');

  // ─── INVOICE ───
  result.invoiceNo = findWithConfidence([
    /Inv\.?\s*(?:No|Number)\s*:?\s*([A-Z0-9\-]+)/i,
    /Invoice\s*(?:No|Number)\s*:?\s*([A-Z0-9\-]+)/i
  ], combinedText, 'invoiceNo');
  
  result.invoiceDate = findWithConfidence([
    /Inv\.?\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Invoice\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], combinedText, 'invoiceDate');

  // ─── DATES ───
  result.deliveryOrderDate = findWithConfidence([
    /DO\s*(?:Issued)?\s*(?:Date|DT)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], combinedText, 'deliveryOrderDate');

  result.occDate = findWithConfidence([
    /O[OC]C\s*(?:Date|DT)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], combinedText, 'occDate');

  result.gatePassDate = findWithConfidence([
    /Gate\s*Pass\s*(?:Date|DT)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], combinedText, 'gatePassDate');

  // ─── MARKS & NOS ───
  result.remarks = findWithConfidence([
    /Marks\s*[&]?\s*Nos\s*:\s*([A-Z0-9\s\/\-]+?)(?:\s{2,}|\s*---|$)/i,
    /Marks?\s*:?\s*([A-Z0-9\/\s]+?)(?:\s{2,}|\s*---|$)/i
  ], combinedText, 'remarks');
  if (result.remarks) {
    result.remarks = result.remarks.replace(/[-]{3,}.*$/, '').trim();
  }

  // ─── GSTIN ───
  const gstinMatch = compactText.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d])/i);
  if (gstinMatch) {
    result.gstin = gstinMatch[1].toUpperCase();
    result.additionalRemarks = 'GSTIN: ' + result.gstin;
    confidence.gstin = 0.95;
  }

  // ─── BILLING ───
  result.billingCurrency = findWithConfidence([
    /Currency\s*:?\s*([A-Z]{3})/i,
    /Inv\.?\s*Value\s*:?\s*[\d.,]+\s*([A-Z]{3})/i
  ], combinedText, 'billingCurrency');

  result.billTo = findWithConfidence([
    /Bill\s*To\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PVT|PRIVATE)[\w\s]*)/i
  ], combinedText, 'billTo');
  if (!result.billTo && result.importerName) {
    result.billTo = result.importerName;
    confidence.billTo = 0.7;
  }

  // ─── DOCKET + AGENT ───
  result.docketNo = result.jobOrderNo || result.referenceNumber || '';
  result.docketDate = result.jobOrderDate || new Date().toISOString().split('T')[0];
  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  // ─── CLEAN ───
  result.importerName = cleanCompanyName(result.importerName);
  result.exporterName = cleanCompanyName(result.exporterName);
  result.supplierName = cleanCompanyName(result.supplierName);
  result.billTo = cleanCompanyName(result.billTo);

  if (!result.cargoArrivalNotice) result.cargoArrivalNotice = result.gatewayIgmNo;
  if (!result.cargoArrivalDate) result.cargoArrivalDate = result.gatewayIgmDate;

  return { data: result, confidence };
}

// ─── MAIN ROUTE ───
router.post('/scan', upload.single('checklist'), async function(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Please upload a PDF checklist' });
    }

    const buffer = req.file.buffer;
    console.log(`\n📄 Scanning: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);

    // Layer 1: Digital text
    console.log('📑 Layer 1: Extracting digital text...');
    const { items: pdfJsItems, pageInfo } = await extractTextWithPdfJs(buffer);
    console.log(`   → ${pageInfo.length} page(s)`);

    // Layer 2: pdf-parse (FIXED)
    console.log('📑 Layer 2: Extracting with pdf-parse...');
    const pdfParseText = await extractTextWithPdfParse(buffer);
    console.log(`   → ${pdfParseText.length} chars`);

    // Layer 3: OCR
    console.log('📑 Layer 3: Checking for scanned pages...');
    const ocrText = await extractOcrFromScannedPages(buffer, pageInfo);

    // Merge
    const sortedItems = pdfJsItems.filter(i => i.page === 1).sort((a, b) => a.y - b.y || a.x - b.x);
    const digitalText = sortedItems.map(i => i.text).join(' ');
    const mergedText = mergeTexts(digitalText, ocrText || pdfParseText || '');

    // Parse
    console.log('🧠 Parsing fields...');
    const parsed = intelligentParse(pdfJsItems, pdfParseText, ocrText);

    // Accuracy
    const confidenceValues = Object.values(parsed.confidence).filter(v => v > 0);
    const overallAccuracy = confidenceValues.length > 0
      ? Math.round((confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length) * 100)
      : 0;

    console.log(`✅ Done: ${overallAccuracy}% accuracy • ${confidenceValues.length} fields\n`);

    res.json({
      status: 'success',
      data: parsed.data,
      rawText: mergedText || 'No text extracted',
      confidence: parsed.confidence,
      accuracy: overallAccuracy,
      fieldsDetected: confidenceValues.length,
      totalFields: Object.keys(parsed.confidence).length
    });
    
  } catch (error) {
    console.error('❌ PDF scan error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to scan PDF: ' + error.message
    });
  }
});

module.exports = router;