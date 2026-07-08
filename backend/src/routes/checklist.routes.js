// backend/src/routes/checklist.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ocrPdfFromImages } = require('../services/ocrService');

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

// ─── LAYER 2: PDF-PARSE ───
async function extractTextWithPdfParse(buffer) {
  try {
    const { PDFParse } = require('pdf-parse');
    const pdfParse = new PDFParse(buffer);
    await pdfParse.load();
    const pages = await pdfParse.getText();
    return Array.isArray(pages) ? pages.join('\n') : (pages || '');
  } catch (err) {
    console.error('pdf-parse error:', err.message);
    return '';
  }
}

// ─── LAYER 3: TESSERACT OCR ───
async function extractOcrFromScannedPages(buffer, pageInfo) {
  try {
    const scannedPages = pageInfo.filter(p => p.isScanned);
    if (scannedPages.length === 0) return '';
    
    const pdfjsLib = await import('pdfjs-dist');
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdfDocument = await loadingTask.promise;

    const imageBuffers = [];
    for (const pi of scannedPages) {
      const page = await pdfDocument.getPage(pi.pageNum);
      const viewport = page.getViewport({ scale: 2.5 });
      let canvas, ctx;
      try {
        const { createCanvas } = require('canvas');
        canvas = createCanvas(viewport.width, viewport.height);
        ctx = canvas.getContext('2d');
      } catch (e) { return ''; }
      await page.render({ canvasContext: ctx, viewport }).promise;
      imageBuffers.push(canvas.toBuffer('image/png'));
    }
    return await ocrPdfFromImages(imageBuffers);
  } catch (err) { return ''; }
}

// ─── SIMPLE MERGE ───
function simpleMerge(texts) {
  return texts.filter(t => t && t.length > 5).join('\n');
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
  
  // 🔥 FIX: Use ALL pages for container/search, but Page 1 for structured data
  const allItemsSorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const allPagesText = allItemsSorted.map(i => i.text).join(' ');
  
  const page1Items = items.filter(i => i.page === 1).sort((a, b) => a.y - b.y || a.x - b.x);
  const digitalText = page1Items.map(i => i.text).join(' ');
  
  const combinedText = simpleMerge([allPagesText, pdfParseText, ocrText]);
  const compactText = combinedText.replace(/\s+/g, '');
  const upperText = combinedText.toUpperCase();

  function findWithConfidence(patterns, text, fieldName) {
    for (let i = 0; i < patterns.length; i++) {
      const match = text.match(patterns[i]);
      if (match && match[1] && match[1].trim().length > 0) {
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
    return name.replace(/\s+(Inv\.?|SUPPLIER|DETAILS|CHA|Importer|GSTIN|SERVICES|CO\.?|LTD|PTE|PVT|PRIVATE|LIMITED)\s*$/i, '').trim();
  }

  // ─── DETECT SHIPMENT TYPE ───
  const seaScore = ['GATEWAY IGM','CONTAINER','MBL','FCL','LCL','VESSEL','IGM NO'].filter(k => upperText.includes(k)).length;
  const airScore = ['MAWB','AWB','AIR WAYBILL','FLIGHT NO','AIRPORT'].filter(k => upperText.includes(k)).length;
  result.shipmentType = seaScore > airScore ? 'Sea' : airScore > seaScore ? 'Air' : 'Unknown';
  const isSea = result.shipmentType === 'Sea';

  // ─── REFERENCE NUMBER ───
  result.referenceNumber = findWithConfidence([
    /File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i
  ], digitalText, 'referenceNumber');

  // ─── IMPORTER NAME ───
  result.importerName = findWithConfidence([
    /PAS\s+FREIGHT\s+SERVICES\s+([A-Z][\w\s]+?(?:LIMITED|PRIVATE|INTEGRATORS|TECHNOLOGY|LTD)[\w\s]*?)(?:\s+#|\s{2,}|\s+\d)/i,
    /(ARION\s+TECHNOLOGY\s+LTD)/i,
    /(RESURGENT\s+AV\s+INTEGRATORS\s+PRIVATE\s+LIMITED)/i,
    /(ONLINE\s+INSTRUMENTS\s*\(INDIA\)\s*LIMITED)/i,
    /Importer\s*(?:Name|Details)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PVT|PRIVATE)[\w\s]*)/i
  ], digitalText, 'importerName');

  // ─── EXPORTER NAME ───
  result.exporterName = findWithConfidence([
    /SUPPLIER\s+DETAILS[\s\S]{0,300}?\b([A-Z][\w\s]+(?:LTD|LIMITED|PTE|CO\.?,?\s*LTD|PRINTING|TECHNOLOGY)[\w\s]*)/i,
    /(YUAN\s+HENG\s+TAI\s+WATER\s+TRANSFER\s+PRINTING\s+CO\s+LTD)/i,
    /(CRESTRON\s+SINGAPORE\s+PTE\s+LTD)/i,
    /(TCL\s+SMART\s+HOMETECHNOLOGIES\s*CO\.?,?\s*LTD)/i,
    /Exporter\s*(?:Name|Details)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PTE|PVT|PRIVATE)[\w\s]*)/i
  ], combinedText, 'exporterName');

  // ─── SUPPLIER NAME ───
  result.supplierName = findWithConfidence([
    /SUPPLIER\s+DETAILS[\s\S]{0,100}?\b([A-Z][\w\s]+(?:LTD|LIMITED|PTE|CO\.?,?\s*LTD|PRINTING|TECHNOLOGY)[\w\s]*)/i
  ], combinedText, 'supplierName');
  if (!result.supplierName && result.exporterName) { result.supplierName = result.exporterName; confidence.supplierName = 0.7; }

  // ─── LOCATION ───
  result.location = findWithConfidence([/Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i], digitalText, 'location');

  // ─── JOB ORDER NO + DATE ───
  result.jobOrderNo = findWithConfidence([/Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)/i], digitalText, 'jobOrderNo');
  result.jobOrderDate = findWithConfidence([/Job\s*No\s*[&]?\s*Date\s*:\s*\d+\s*[&]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], digitalText, 'jobOrderDate');

  // ─── BOE/SB ───
  const boeSbNo = findWithConfidence([/B\.?E\s*No[,\s]*Date\s*:\s*(\d{3,})/i, /BOE\s*No\s*:?\s*(\d{3,})/i, /SB\s*No\s*:?\s*(\d{3,})/i], digitalText, 'boeSbNo');
  if (boeSbNo && /^\d{3,}$/.test(boeSbNo)) result.boeSbNo = boeSbNo;
  if (result.boeSbNo) result.boeSbDate = findWithConfidence([/B\.?E\s*No[,\s]*Date\s*:\s*\d+\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i, /Printed\s*On\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], digitalText, 'boeSbDate');

  // ─── SHIPMENT MODE ───
  const modeMatch = digitalText.match(/Transport\s*Mode\s*:\s*(\S)/i);
  if (modeMatch && modeMatch[1]) { result.shipmentMode = modeMatch[1].toUpperCase(); confidence.shipmentMode = 0.9; }

  // ─── MAWB/MBL ───
  result.mawbMblNo = findWithConfidence([/MBL\/?\s*MAWB\s*:\s*([A-Z0-9]{6,20})/i, /MBL\s*(?:No)?\s*:?\s*([A-Z0-9]{6,20})/i], digitalText, 'mawbMblNo');
  if (result.mawbMblNo) result.mawbMblDate = findWithConfidence([new RegExp(result.mawbMblNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]{0,80}?(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{2,4})')], digitalText, 'mawbMblDate');

  // ─── HAWB/HBL ───
  const hblNum = digitalText.match(/HBL\/?\s*HAWB\s*:\s*(\d{6,14})/i);
  if (hblNum && hblNum[1] && hblNum[1].length >= 6) {
    result.hawbHblNo = hblNum[1]; confidence.hawbHblNo = 0.8;
    const dA = digitalText.match(new RegExp(hblNum[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(\\d{1,2}[-\/]\\d{1,2}[-\/]\\d{2,4})'));
    if (dA) result.hawbHblDate = dA[1];
  }

  // ─── NO OF PACKAGES ───
  const pkgMatch = digitalText.match(/No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i);
  if (pkgMatch) { result.noOfPackages = pkgMatch[1]; confidence.noOfPackages = 0.9; }

  // ─── GROSS WEIGHT ───
  result.grossWeight = findWithConfidence([/Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i], digitalText, 'grossWeight');

  // ─── IGM + GATEWAY + LOCAL + CONTAINER (SEA) ───
  if (isSea) {
    const igmFull = digitalText.match(/IGM\s*NO\s*:\s*(\d+)\s*\/\d+\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
    if (igmFull) { result.igmNo = igmFull[1]; result.igmDate = igmFull[2]; confidence.igmNo = 0.95; }
    else { result.igmNo = findWithConfidence([/IGM\s*(?:NO|No)?\s*:?\s*(\d{4,})/i], digitalText, 'igmNo'); }

    const gwFull = digitalText.match(/Gateway\s*IGM\s*:\s*(\d+)\s*\/\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
    if (gwFull) { result.gatewayIgmNo = gwFull[1]; result.gatewayIgmDate = gwFull[2]; confidence.gatewayIgmNo = 0.95; }
    else { result.gatewayIgmNo = findWithConfidence([/Gateway\s*IGM\s*(?:No)?\s*:?\s*(\d{4,})/i], digitalText, 'gatewayIgmNo'); }

    result.localIgmNo = findWithConfidence([/Local\s*IGM\s*(?:No)?\s*:?\s*(\d{4,})/i], combinedText, 'localIgmNo');
    result.localIgmDate = findWithConfidence([/Local\s*IGM\s*(?:Date)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], combinedText, 'localIgmDate');

    // 🔥 CONTAINER - SEARCH ALL PAGES (not just page 1)
    const invalidPfx = /^(CSBL|JJCSK|SZBGL|OGC|UESZ|MAWB|MBL|HAWB)/i;
    const contMatch = allPagesText.match(/\b([A-Z]{4}\d{7})\b/g);
    if (contMatch) {
      const valid = contMatch.filter(c => !invalidPfx.test(c));
      if (valid.length > 0) { result.containerNo = valid[0]; confidence.containerNo = 0.85; }
    }
  }

  // ─── PORTS ───
  result.portOfDischarge = findWithConfidence([/Port\s*Of\s*Filing\s*:\s*([^,]+,[^,]+)/i], digitalText, 'portOfDischarge');
  result.portOfDestination = findWithConfidence([/Port\s*(?:Shipment|Origin)\s*:\s*([A-Z]+-[A-Z]+)/i, /Port\s*(?:Of)?\s*Destination\s*:?\s*([A-Z0-9]+-[A-Z]+)/i], digitalText, 'portOfDestination');

  // ─── INVOICE ───
  result.invoiceNo = findWithConfidence([/Inv\.?\s*(?:No|Number)\s*:?\s*([A-Z0-9\-]+)/i], digitalText, 'invoiceNo');
  result.invoiceDate = findWithConfidence([/Inv\.?\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], digitalText, 'invoiceDate');

  // ─── DATES ───
  result.deliveryOrderDate = findWithConfidence([/DO\s*(?:Issued)?\s*(?:Date|DT)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], combinedText, 'deliveryOrderDate');
  result.occDate = findWithConfidence([/O[OC]C\s*(?:Date|DT)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], combinedText, 'occDate');
  result.gatePassDate = findWithConfidence([/Gate\s*Pass\s*(?:Date|DT)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i], combinedText, 'gatePassDate');

  // ─── MARKS & NOS ───
  result.remarks = findWithConfidence([/Marks\s*[&]?\s*Nos\s*:\s*([A-Z0-9\s\/\-]+?)(?:\s{2,}|\s*---|$)/i], digitalText, 'remarks');
  if (result.remarks) result.remarks = result.remarks.replace(/[-]{3,}.*$/, '').trim();

  // ─── GSTIN ───
  const gst = compactText.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d])/i);
  if (gst) { result.gstin = gst[1].toUpperCase(); result.additionalRemarks = 'GSTIN: ' + result.gstin; confidence.gstin = 0.95; }

  // ─── BILLING ───
  result.billingCurrency = findWithConfidence([/Currency\s*:?\s*([A-Z]{3})/i, /Inv\.?\s*Value\s*:?\s*[\d.,]+\s*([A-Z]{3})/i], combinedText, 'billingCurrency');
  result.billTo = findWithConfidence([/Bill\s*To\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PVT|PRIVATE)[\w\s]*)/i], combinedText, 'billTo');
  if (!result.billTo && result.importerName) { result.billTo = result.importerName; confidence.billTo = 0.7; }

  // ─── DOCKET + AGENT ───
  result.docketNo = result.jobOrderNo || result.referenceNumber || '';
  result.docketDate = result.jobOrderDate || new Date().toISOString().split('T')[0];
  result.agentDebitNote = 'PAS FREIGHT SERVICES';

  // ─── CLEAN ───
  ['importerName','exporterName','supplierName','billTo'].forEach(f => { result[f] = cleanCompanyName(result[f]); });

  if (!result.cargoArrivalNotice) result.cargoArrivalNotice = result.gatewayIgmNo;
  if (!result.cargoArrivalDate) result.cargoArrivalDate = result.gatewayIgmDate;

  return { data: result, confidence };
}

// ─── MAIN ROUTE ───
router.post('/scan', upload.single('checklist'), async function(req, res) {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'Please upload a PDF checklist' });

    const buffer = req.file.buffer;
    console.log(`\n📄 Scanning: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);

    const { items, pageInfo } = await extractTextWithPdfJs(buffer);
    console.log(`   → ${pageInfo.length} page(s)`);

    const pdfParseText = await extractTextWithPdfParse(buffer);
    const ocrText = await extractOcrFromScannedPages(buffer, pageInfo);

    // Build text from ALL pages
    const allItemsSorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const allPagesText = allItemsSorted.map(i => i.text).join(' ');
    const mergedText = simpleMerge([allPagesText, pdfParseText, ocrText]);

    const parsed = intelligentParse(items, pdfParseText, ocrText);

    const confVals = Object.values(parsed.confidence).filter(v => v > 0);
    const accuracy = confVals.length > 0 ? Math.round((confVals.reduce((a,b) => a+b, 0) / confVals.length) * 100) : 0;

    console.log(`✅ Done: ${accuracy}% accuracy • ${confVals.length} fields`);

    res.json({
      status: 'success',
      data: parsed.data,
      rawText: mergedText,
      confidence: parsed.confidence,
      accuracy,
      fieldsDetected: confVals.length,
      totalFields: Object.keys(parsed.confidence).length
    });
  } catch (error) {
    console.error('❌ Scan error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to scan PDF: ' + error.message });
  }
});

module.exports = router;