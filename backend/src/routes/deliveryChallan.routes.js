// backend/src/routes/deliveryChallan.routes.js
//
// NEW FILE — standalone feature. Does NOT read from or write to the database.
// Does NOT touch any existing routes, controllers, or Prisma models.
//
// Flow:
//   1) POST /scan     -> upload a Bill of Entry (BOE) PDF, extract fields
//   2) POST /generate -> take the (possibly user-edited) fields, return a
//                        formatted Delivery Challan PDF for download
//
// Reuses the same 3-layer extraction approach already used in
// checklist.routes.js (pdfjs digital text -> pdf-parse -> tesseract OCR
// fallback for scanned pages), so behaviour is consistent with the rest
// of the app.

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ocrPdfFromImages } = require('../services/ocrService');
const { generateDeliveryChallanPdf } = require('../utils/challanPdfGenerator');

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
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
      content.items.forEach(function (item) {
        allItems.push({
          text: item.str.trim(),
          x: Math.round(item.transform[4]),
          y: Math.round(viewport.height - item.transform[5]),
          page: pageNum
        });
        pageTextLength += item.str.replace(/\s+/g, '').length;
      });

      pageInfo.push({ pageNum, textLength: pageTextLength, isScanned: pageTextLength < 50 });
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

// ─── LAYER 3: TESSERACT OCR (only for scanned/image pages) ───
async function extractOcrFromScannedPages(buffer, pageInfo) {
  try {
    const scannedPages = pageInfo.filter((p) => p.isScanned);
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
      } catch (e) {
        return '';
      }
      await page.render({ canvasContext: ctx, viewport }).promise;
      imageBuffers.push(canvas.toBuffer('image/png'));
    }
    return await ocrPdfFromImages(imageBuffers);
  } catch (err) {
    return '';
  }
}

function simpleMerge(texts) {
  return texts.filter((t) => t && t.length > 5).join('\n');
}

// ─── FIELD EXTRACTION FOR DELIVERY CHALLAN ───
// Only pulls what the Delivery Challan template needs.
function extractChallanFields(items, pdfParseText, ocrText) {
  const page1Items = items.filter((i) => i.page === 1).sort((a, b) => a.y - b.y || a.x - b.x);
  const digitalText = page1Items.map((i) => i.text).join(' ');

  const allItemsSorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const allPagesText = allItemsSorted.map((i) => i.text).join(' ');

  const combinedText = simpleMerge([allPagesText, pdfParseText, ocrText]);

  const result = {
    beNo: '',
    beDate: '',
    mawbHawbNo: '',
    noOfPkgs: '',
    grossWeight: '',
    marksNos: '',
    descriptionOfGoods: 'AS PER BOE AND INVOICE'
  };
  const confidence = {};

  function find(patterns, text, field) {
    for (let i = 0; i < patterns.length; i++) {
      const m = text.match(patterns[i]);
      if (m && m[1] && m[1].trim().length > 0) {
        confidence[field] = Math.max(0.5, 1 - i * 0.05);
        return m[1].trim();
      }
    }
    confidence[field] = 0;
    return '';
  }

  // BE No & Date
  result.beNo = find(
    [/B\.?E\s*No[,\s]*Date\s*:\s*(\d{3,})/i, /BOE\s*No\s*:?\s*(\d{3,})/i, /Bill\s*of\s*Entry\s*No\.?\s*:?\s*(\d{3,})/i],
    digitalText,
    'beNo'
  );
  result.beDate = find(
    [
      /B\.?E\s*No[,\s]*Date\s*:\s*\d+\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /B\.?E\s*Date\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /Printed\s*On\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ],
    combinedText,
    'beDate'
  );

  // MAWB / HAWB No — try MAWB first, then HAWB
  const mawb = find([/MBL\/?\s*MAWB\s*:\s*([A-Z0-9]{6,20})/i, /MAWB\s*(?:No)?\s*:?\s*([A-Z0-9]{6,20})/i], digitalText, 'mawbNo');
  const hawb = find([/HBL\/?\s*HAWB\s*:\s*([A-Z0-9]{6,20})/i, /HAWB\s*(?:No)?\s*:?\s*([A-Z0-9]{6,20})/i], digitalText, 'hawbNo');
  result.mawbHawbNo = [mawb, hawb].filter(Boolean).join(' / ');
  confidence.mawbHawbNo = Math.max(confidence.mawbNo || 0, confidence.hawbNo || 0);

  // No of Packages
  result.noOfPkgs = find([/No\.?\s*of\s*Pkgs\s*:\s*(\d+)/i, /Total\s*(?:No\.?\s*of\s*)?Packages\s*:?\s*(\d+)/i], combinedText, 'noOfPkgs');

  // Gross Weight (number only, unit appended later in the PDF)
  const gw = find([/Gross\s*Weight\s*:\s*([\d.]+)/i], combinedText, 'grossWeight');
  result.grossWeight = gw;

  // Marks & Nos
  result.marksNos = find([/Marks\s*[&]?\s*Nos\s*:\s*([A-Z0-9\s\/\-]+?)(?:\s{2,}|\s*---|$)/i], digitalText, 'marksNos');
  if (result.marksNos) result.marksNos = result.marksNos.replace(/[-]{3,}.*$/, '').trim();

  return { data: result, confidence };
}

// ─── ROUTE: SCAN BOE PDF ───
router.post('/scan', upload.single('boeFile'), async function (req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Please upload the Bill of Entry (BOE) PDF' });
    }

    const buffer = req.file.buffer;
    console.log(`\n📄 [Delivery Challan] Scanning BOE: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);

    const { items, pageInfo } = await extractTextWithPdfJs(buffer);
    const pdfParseText = await extractTextWithPdfParse(buffer);
    const ocrText = await extractOcrFromScannedPages(buffer, pageInfo);

    const { data, confidence } = extractChallanFields(items, pdfParseText, ocrText);

    const confVals = Object.values(confidence).filter((v) => v > 0);
    const accuracy = confVals.length > 0 ? Math.round((confVals.reduce((a, b) => a + b, 0) / confVals.length) * 100) : 0;

    console.log(`✅ [Delivery Challan] Extraction done: ${accuracy}% confidence`);

    res.json({ status: 'success', data, confidence, accuracy });
  } catch (error) {
    console.error('❌ [Delivery Challan] Scan error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to read BOE PDF: ' + error.message });
  }
});

// ─── ROUTE: GENERATE FINAL PDF ───
// Accepts JSON body with the (possibly edited) fields — nothing is saved to the DB.
router.post('/generate', express.json(), async function (req, res) {
  try {
    const fields = req.body || {};
    const pdfBuffer = await generateDeliveryChallanPdf(fields);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Delivery-Challan.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ [Delivery Challan] Generate error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to generate PDF: ' + error.message });
  }
});

module.exports = router;
