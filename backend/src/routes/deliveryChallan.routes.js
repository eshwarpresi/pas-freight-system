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
// v2 — tuned specifically for real ICEGATE "Bill of Entry" PDFs.
// The key fix: instead of flattening all PDF text into one blob (which
// scrambles label/value order when a page has multiple tables side by
// side), we group text items into ROWS by their y-position first, sort
// each row left-to-right by x-position, and then read labels/values off
// those rows. This matches how the document actually looks on screen and
// is far more reliable for government-format tables like BOEs.

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

// ─── ROW-GROUPED DIGITAL TEXT EXTRACTION (pdfjs) ───
// Groups text items into visual rows (by y-position) instead of one flat
// blob, so "label ... value" regexes actually see them in the right order.
async function extractRowsWithPdfJs(buffer) {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdfDocument = await loadingTask.promise;

    const allRows = []; // flat list of row-strings across all pages, in order
    const pageInfo = [];

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });

      const items = content.items
        .map((item) => ({
          text: item.str,
          x: item.transform[4],
          y: viewport.height - item.transform[5]
        }))
        .filter((i) => i.text && i.text.trim().length > 0);

      // group into rows by y (tolerance ~3px, matches how these forms are laid out)
      const Y_TOL = 3;
      const rowMap = new Map();
      for (const it of items) {
        const key = Math.round(it.y / Y_TOL);
        if (!rowMap.has(key)) rowMap.set(key, []);
        rowMap.get(key).push(it);
      }

      const sortedKeys = [...rowMap.keys()].sort((a, b) => a - b);
      for (const key of sortedKeys) {
        const rowItems = rowMap.get(key).sort((a, b) => a.x - b.x);
        allRows.push(rowItems.map((i) => i.text.trim()).filter(Boolean).join(' '));
      }

      const pageTextLength = items.reduce((sum, i) => sum + i.text.replace(/\s+/g, '').length, 0);
      pageInfo.push({ pageNum, textLength: pageTextLength, isScanned: pageTextLength < 50 });
    }

    return { rows: allRows, pageInfo };
  } catch (err) {
    console.error('PDF.js row extraction error:', err.message);
    return { rows: [], pageInfo: [] };
  }
}

// ─── LAYER 2: PDF-PARSE (fallback text, no positions) ───
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

// ─── FIELD EXTRACTION — tuned for ICEGATE Bill of Entry layout ───
function extractChallanFields(rows, pdfParseText, ocrText) {
  const rowText = rows.join('\n');
  // fallback blob used only if row-based text came up empty (e.g. scanned BOE)
  const fallbackText = rowText.trim().length > 0 ? rowText : [pdfParseText, ocrText].filter(Boolean).join('\n');

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

  function find(pattern, text, field) {
    const m = text.match(pattern);
    if (m && m[1]) {
      confidence[field] = 0.85;
      return m[1].trim();
    }
    confidence[field] = 0;
    return '';
  }

  // ── BE No & BE Date ── (header table: "Port Code BE No BE Date BE Type" / "INKQZ6 9713238 05/06/2026 X")
  const beMatch = fallbackText.match(
    /BE\s*No\s+BE\s*Date[\s\S]{1,150}?(\d{6,9})\D{0,15}?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  );
  if (beMatch) {
    result.beNo = beMatch[1];
    result.beDate = beMatch[2];
    confidence.beNo = 0.9;
    confidence.beDate = 0.9;
  } else {
    // fallback for other BOE-style formats
    result.beNo = find(/B\.?E\s*No[,\s]*Date\s*:?\s*(\d{5,10})/i, fallbackText, 'beNo');
    result.beDate = find(/B\.?E\s*(?:No[,\s]*)?Date\s*:?\s*\d*\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i, fallbackText, 'beDate');
  }

  // ── No of Packages & Gross Weight ── ("PKG 2906 G.WT (KGS) 18017 ...")
  const pkgMatch = fallbackText.match(/\bPKG\b[^\S\n]*[:\s]*?(\d{2,7})[\s\S]{0,60}?G\.?\s*WT[^\d]{0,15}(\d{2,7})/i);
  if (pkgMatch) {
    result.noOfPkgs = pkgMatch[1];
    result.grossWeight = pkgMatch[2];
    confidence.noOfPkgs = 0.9;
    confidence.grossWeight = 0.9;
  } else {
    result.noOfPkgs = find(/No\.?\s*of\s*Pkgs\s*:?\s*(\d+)/i, fallbackText, 'noOfPkgs');
    result.grossWeight = find(/Gross\s*Weight\s*:?\s*([\d.]+)/i, fallbackText, 'grossWeight');
  }

  // ── MAWB / HAWB No ── (manifest table row: labels then a value row directly below)
  const labelIdx = rows.findIndex((r) => /MAWB\s*NO/i.test(r));
  if (labelIdx !== -1 && labelIdx + 1 < rows.length) {
    const valueRow = rows[labelIdx + 1];
    const tokens = valueRow.split(/\s+/);
    // a plausible MAWB/HAWB token: has both a letter and a digit, isn't a date, length >= 5
    const candidates = tokens.filter(
      (t) => /[A-Za-z]/.test(t) && /\d/.test(t) && !/^\d{1,2}[\/\-]/.test(t) && t.length >= 5
    );
    let mawb = candidates[0] || '';
    let hawb = candidates[1] || '';

    // these numbers often wrap onto the next 1-2 rows in narrow BOE columns —
    // stitch the wrapped remainder back on (best effort; please verify this field)
    if (mawb && labelIdx + 2 < rows.length) {
      const cont = rows[labelIdx + 2].trim();
      const contMatch = cont.match(/([A-Z0-9]{3,10})\s*$/);
      if (contMatch) mawb += contMatch[1];
    }
    if (hawb && labelIdx + 3 < rows.length) {
      const cont2 = rows[labelIdx + 3].trim();
      if (/^[A-Z0-9]{2,10}$/i.test(cont2)) hawb += cont2;
    }

    result.mawbHawbNo = [mawb, hawb].filter(Boolean).join(' / ');
    confidence.mawbHawbNo = mawb || hawb ? 0.6 : 0; // lower confidence — this field is the trickiest to auto-read
  }

  // Marks & Nos — not present on standard ICEGATE BOEs; left blank for manual entry
  result.marksNos = find(/Marks\s*[&]?\s*Nos?\s*:?\s*([A-Z0-9\s\/\-]{2,40})/i, fallbackText, 'marksNos');

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

    const { rows, pageInfo } = await extractRowsWithPdfJs(buffer);
    const pdfParseText = await extractTextWithPdfParse(buffer);
    const ocrText = await extractOcrFromScannedPages(buffer, pageInfo);

    const { data, confidence } = extractChallanFields(rows, pdfParseText, ocrText);

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