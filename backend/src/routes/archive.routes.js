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

// ─── LAYER 2: PDF-PARSE TEXT EXTRACTION ───
async function extractTextWithPdfParse(buffer) {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    console.error('pdf-parse extraction error:', err.message);
    return '';
  }
}

// ─── LAYER 3: TESSERACT OCR FOR SCANNED PDFs ───
async function extractOcrFromScannedPages(buffer, pageInfo) {
  try {
    const scannedPages = pageInfo.filter(p => p.isScanned);
    if (scannedPages.length === 0) {
      console.log('✅ All pages have digital text, skipping OCR');
      return '';
    }

    console.log(`🔍 ${scannedPages.length} scanned page(s) detected, running OCR...`);

    // Convert PDF pages to images using pdfjs
    const pdfjsLib = await import('pdfjs-dist');
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdfDocument = await loadingTask.promise;

    const imageBuffers = [];
    for (const pageInfoItem of scannedPages) {
      const page = await pdfDocument.getPage(pageInfoItem.pageNum);
      const viewport = page.getViewport({ scale: 2.5 }); // High resolution for OCR
      
      // Dynamic import canvas (only needed for OCR)
      let canvas, ctx;
      try {
        const { createCanvas } = require('canvas');
        canvas = createCanvas(viewport.width, viewport.height);
        ctx = canvas.getContext('2d');
      } catch (e) {
        // Fallback: use node-canvas or skip
        console.warn('Canvas module not available, trying alternative...');
        try {
          const { createCanvas: cc } = await import('canvas');
          canvas = cc(viewport.width, viewport.height);
          ctx = canvas.getContext('2d');
        } catch (e2) {
          console.error('Cannot render PDF pages for OCR:', e2.message);
          return '';
        }
      }
      
      await page.render({ canvasContext: ctx, viewport }).promise;
      const imageBuffer = canvas.toBuffer('image/png');
      imageBuffers.push(imageBuffer);
    }

    const ocrText = await ocrPdfFromImages(imageBuffers);
    return ocrText;
  } catch (err) {
    console.error('OCR extraction failed:', err.message);
    return '';
  }
}

// ─── INTELLIGENT PARSER WITH CONFIDENCE SCORING ───
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
  
  // Combine ALL text sources (digital + OCR)
  const page1Items = items.filter(i => i.page === 1);
  const sortedByPosition = [...page1Items].sort((a, b) => a.y - b.y || a.x - b.x);
  const digitalText = sortedByPosition.map(i => i.text).join(' ');
  const ocrTextClean = ocrText || '';
  
  // Merge texts, preferring digital but filling gaps with OCR
  const combinedText = mergeTexts(digitalText, ocrTextClean || pdfParseText || '');
  const compactText = combinedText.replace(/\s+/g, '');
  const upperText = combinedText.toUpperCase();

  // ─── HELPER: Multi-pattern matcher with confidence ───
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
  const seaKeywords = ['GATEWAY IGM', 'CONTAINER NO', 'MBL', 'SEA', 'FCL', 'LCL', 'VESSEL', 'PORT OF DISCHARGE'];
  const airKeywords = ['MAWB', 'AWB', 'AIR WAYBILL', 'FLIGHT NO', 'AIRPORT', 'HAWB'];
  
  let seaScore = 0, airScore = 0;
  seaKeywords.forEach(kw => { if (upperText.includes(kw)) seaScore++; });
  airKeywords.forEach(kw => { if (upperText.includes(kw)) airScore++; });
  
  result.shipmentType = seaScore > airScore ? 'Sea' : airScore > seaScore ? 'Air' : 'Unknown';

  // ─── REFERENCE NUMBER ───
  result.referenceNumber = findWithConfidence([
    /File\s*No\s*:\s*([A-Z0-9]+[-\/][A-Z0-9\/-]+)/i,
    /Ref\s*(?:erence)?\s*No\s*:?\s*([A-Z0-9\/-]+)/i,
    /ONLINE[-\s]*(\d+)/i,
    /([A-Z]{2,4}\/\d{2,4}\/[A-Z]{2,4})/i
  ], combinedText, 'referenceNumber');

  // ─── IMPORTER NAME ───
  result.importerName = findWithConfidence([
    /Importer\s*(?:Name|Details)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PVT|PRIVATE|INC|CORP)[\w\s]*)/i,
    /Consignee\s*(?:Name)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PVT|PRIVATE)[\w\s]*)/i,
    /PAS\s+FREIGHT\s+SERVICES\s+([A-Z][\w\s]+?(?:LTD|LIMITED|PRIVATE|PVT)[\w\s]*)/i
  ], combinedText, 'importerName');

  // ─── EXPORTER NAME ───
  result.exporterName = findWithConfidence([
    /Exporter\s*(?:Name|Details)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PTE|PVT|PRIVATE)[\w\s]*)/i,
    /Shipper\s*(?:Name)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PTE|PVT)[\w\s]*)/i
  ], combinedText, 'exporterName');

  // ─── SUPPLIER NAME ───
  result.supplierName = findWithConfidence([
    /Supplier\s*(?:Name|Details)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PTE|PVT|PRIVATE)[\w\s]*)/i,
    /Vendor\s*(?:Name)?\s*:?\s*([A-Z][\w\s]+?(?:LTD|LIMITED|PTE|PVT)[\w\s]*)/i
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
    /Job\s*(?:Order)?\s*No\s*[&]?\s*Date\s*:\s*(\d+)/i,
    /Job\s*No\s*:?\s*(\d{3,})/i
  ], combinedText, 'jobOrderNo');
  
  result.jobOrderDate = findWithConfidence([
    /Job\s*(?:Order)?\s*No\s*[&]?\s*Date\s*:\s*\d+\s*[&\/]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Job\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], combinedText, 'jobOrderDate');

  // ─── BOE/SB NUMBER + DATE ───
  const boeSbNo = findWithConfidence([
    /B\.?E\s*No[,\s]*Date\s*:\s*(\d{3,})/i,
    /BOE\s*No\s*:?\s*(\d{3,})/i,
    /SB\s*No\s*:?\s*(\d{3,})/i,
    /B\/E\s*No\s*:?\s*(\d{3,})/i,
    /Shipping\s*Bill\s*No\s*:?\s*(\d{3,})/i
  ], combinedText, 'boeSbNo');
  
  if (boeSbNo && /^\d{3,}$/.test(boeSbNo)) {
    result.boeSbNo = boeSbNo;
  }
  
  if (result.boeSbNo) {
    result.boeSbDate = findWithConfidence([
      /B\.?E\s*No[,\s]*Date\s*:\s*\d+\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /BOE\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /SB\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /Printed\s*On\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], combinedText, 'boeSbDate');
  }

  // ─── MAWB/MBL NUMBER + DATE ───
  const isAir = result.shipmentType === 'Air';
  
  result.mawbMblNo = findWithConfidence([
    isAir 
      ? /MAWB\s*(?:No)?\s*:?\s*(\d{3}[- ]?\d{4}[- ]?\d{3})/i 
      : /MBL\/?\s*MAWB\s*:?\s*([A-Z0-9]{6,20})/i,
    /(?:MAWB|MBL)\s*(?:No)?\s*:?\s*([A-Z0-9]{6,20})/i
  ], combinedText, 'mawbMblNo');
  
  if (result.mawbMblNo) {
    result.mawbMblDate = findWithConfidence([
      /(?:MAWB|MBL)\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], combinedText, 'mawbMblDate');
  }

  // ─── HAWB/HBL NUMBER + DATE ───
  result.hawbHblNo = findWithConfidence([
    /(?:HAWB|HBL)\s*(?:No)?\s*:?\s*([A-Z0-9]{6,20})/i,
    /HBL\/?\s*HAWB\s*:?\s*(\d{7,12})/i
  ], combinedText, 'hawbHblNo');
  
  if (result.hawbHblNo) {
    result.hawbHblDate = findWithConfidence([
      /(?:HAWB|HBL)\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], combinedText, 'hawbHblDate');
  }

  // ─── NO OF PACKAGES ───
  result.noOfPackages = findWithConfidence([
    /No\.?\s*of\s*Pkgs\s*:?\s*(\d+)/i,
    /Packages\s*:?\s*(\d+)/i,
    /(\d+)\s*(?:PKGS|Pkgs|PACKAGES|CTNS|CAS)/i
  ], combinedText, 'noOfPackages');

  // ─── GROSS WEIGHT ───
  result.grossWeight = findWithConfidence([
    /Gross\s*Weight\s*:?\s*([\d,]+\s*\.?\d*\s*KGS?)/i,
    /Weight\s*:?\s*([\d,]+\s*\.?\d*\s*KGS?)/i,
    /([\d,]+\s*\.?\d*\s*KGS?)/i
  ], combinedText, 'grossWeight');

  // ─── IGM + CONTAINER (SEA only) ───
  if (!isAir) {
    result.igmNo = findWithConfidence([
      /IGM\s*(?:NO|No|Number)?\s*:?\s*(\d{4,})/i
    ], combinedText, 'igmNo');
    
    result.igmDate = findWithConfidence([
      /IGM\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], combinedText, 'igmDate');

    result.gatewayIgmNo = findWithConfidence([
      /Gateway\s*IGM\s*(?:No)?\s*:?\s*(\d{4,})/i
    ], combinedText, 'gatewayIgmNo');
    
    result.gatewayIgmDate = findWithConfidence([
      /Gateway\s*IGM\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], combinedText, 'gatewayIgmDate');

    result.localIgmNo = findWithConfidence([
      /Local\s*IGM\s*(?:No)?\s*:?\s*(\d{4,})/i
    ], combinedText, 'localIgmNo');
    
    result.localIgmDate = findWithConfidence([
      /Local\s*IGM\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ], combinedText, 'localIgmDate');

    // ─── CONTAINER NUMBER ───
    const containerMatches = combinedText.match(/\b([A-Z]{4}\d{7})\b/g) || [];
    const invalidPrefixes = /^(CSBL|JJCSK|SZBGL|OGC|UESZ|MAWB|MBL)/i;
    const validContainers = containerMatches.filter(c => !invalidPrefixes.test(c));
    
    if (validContainers.length > 0) {
      const containerLabelIndex = combinedText.search(/CONTAINER/i);
      if (containerLabelIndex >= 0) {
        const nearContainer = validContainers.find(c => {
          const idx = combinedText.indexOf(c);
          return Math.abs(idx - containerLabelIndex) < 200;
        });
        result.containerNo = nearContainer || validContainers[0];
      } else {
        result.containerNo = validContainers[0];
      }
      confidence.containerNo = 0.85;
    }
  }

  // ─── PORTS ───
  result.portOfDischarge = findWithConfidence([
    /Port\s*Of\s*Discharge\s*:?\s*([A-Z0-9]+\s*,?\s*[A-Z\s]+)/i
  ], combinedText, 'portOfDischarge');

  result.portOfDestination = findWithConfidence([
    /(?:Port\s*(?:Of)?\s*Destination|Final\s*Destination)\s*:?\s*([A-Z0-9\-]+)/i
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
    /DO\s*(?:Issued)?\s*(?:Date|DT)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /Delivery\s*Order\s*(?:Issued)?\s*(?:Date|DT)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], combinedText, 'deliveryOrderDate');

  result.occDate = findWithConfidence([
    /O[OC]C\s*(?:Date|DT)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], combinedText, 'occDate');

  result.gatePassDate = findWithConfidence([
    /Gate\s*Pass\s*(?:Date|DT)?\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  ], combinedText, 'gatePassDate');

  // ─── MARKS & NOS / REMARKS ───
  result.remarks = findWithConfidence([
    /Marks\s*[&]?\s*Nos\s*:?\s*(.+?)(?:\s{2,}|\s*$)/i,
    /Remarks\s*:?\s*(.+?)(?:\s{2,}|\s*$)/i
  ], combinedText, 'remarks');

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

    // Layer 1: Extract digital text with pdfjs (position-aware)
    console.log('📑 Layer 1: Extracting digital text...');
    const { items: pdfJsItems, pageInfo } = await extractTextWithPdfJs(buffer);
    const digitalChars = pdfJsItems.reduce((s, i) => s + i.text.length, 0);
    console.log(`   → ${digitalChars} characters across ${pageInfo.length} page(s)`);

    // Layer 2: Extract with pdf-parse (better formatting)
    console.log('📑 Layer 2: Extracting with pdf-parse...');
    const pdfParseText = await extractTextWithPdfParse(buffer);
    console.log(`   → ${pdfParseText.length} characters`);

    // Layer 3: OCR for scanned pages
    console.log('📑 Layer 3: Checking for scanned pages...');
    const scannedCount = pageInfo.filter(p => p.isScanned).length;
    const ocrText = await extractOcrFromScannedPages(buffer, pageInfo);
    if (ocrText) {
      console.log(`   → OCR extracted ${ocrText.length} characters`);
    } else if (scannedCount === 0) {
      console.log('   → No scanned pages detected, skipping OCR');
    }

    // Merge all text
    const sortedItems = pdfJsItems
      .filter(i => i.page === 1)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const digitalText = sortedItems.map(i => i.text).join(' ');
    const mergedText = mergeTexts(digitalText, ocrText || pdfParseText || '');

    // Layer 4: Intelligent parsing
    console.log('🧠 Layer 4: Parsing fields...');
    const parsed = intelligentParse(pdfJsItems, pdfParseText, ocrText);

    // Calculate accuracy
    const confidenceValues = Object.values(parsed.confidence).filter(v => v > 0);
    const overallAccuracy = confidenceValues.length > 0
      ? Math.round((confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length) * 100)
      : 0;

    const scanMethod = ocrText ? 'OCR (scanned PDF)' : 'Digital extraction';
    console.log(`✅ Done: ${overallAccuracy}% accuracy • ${confidenceValues.length} fields • ${scanMethod}\n`);

    res.json({
      status: 'success',
      data: parsed.data,
      rawText: mergedText || 'No text extracted',
      confidence: parsed.confidence,
      accuracy: overallAccuracy,
      fieldsDetected: confidenceValues.length,
      totalFields: Object.keys(parsed.confidence).length,
      scanMethod
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