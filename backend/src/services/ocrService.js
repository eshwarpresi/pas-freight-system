// backend/src/services/ocrService.js
const { createWorker } = require('tesseract.js');
const sharp = require('sharp');

/**
 * FREE OCR Service using Tesseract.js
 * No API keys, no limits, works offline
 * 
 * This service:
 * 1. Converts PDF buffer to high-quality images (if needed)
 * 2. Preprocesses images for better OCR (contrast, sharpen)
 * 3. Runs Tesseract OCR to extract text
 * 4. Returns clean, structured text
 */

// ─── IMAGE PREPROCESSING ───
async function preprocessImage(imageBuffer) {
  try {
    const processed = await sharp(imageBuffer)
      .grayscale()           // Convert to grayscale
      .normalize()           // Stretch contrast
      .sharpen({             // Sharpen text edges
        sigma: 1.5,
        m1: 1.0,
        m2: 0.5
      })
      .threshold(128)        // Binarize (black & white)
      .toBuffer();
    
    return processed;
  } catch (err) {
    console.warn('Image preprocessing failed, using original:', err.message);
    return imageBuffer;
  }
}

// ─── INITIALIZE TESSERACT WORKER ───
let worker = null;

async function getWorker() {
  if (worker) return worker;
  
  console.log('🔧 Initializing Tesseract OCR worker...');
  worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        // Silent progress - you can log if needed
      }
    }
  });
  
  // Optimize for document OCR
  await worker.setParameters({
    tessedit_pageseg_mode: '6',    // Assume uniform block of text
    tessedit_char_whitelist: '',    // Allow all characters
    preserve_interword_spaces: '1',
  });
  
  console.log('✅ Tesseract OCR worker ready');
  return worker;
}

// ─── RUN OCR ON IMAGE BUFFER ───
async function ocrImage(imageBuffer, preprocess = true) {
  const w = await getWorker();
  
  // Preprocess for better accuracy
  const processedBuffer = preprocess ? await preprocessImage(imageBuffer) : imageBuffer;
  
  // Run OCR
  const { data } = await w.recognize(processedBuffer);
  
  return {
    text: data.text || '',
    confidence: data.confidence || 0,
    words: data.words || []
  };
}

// ─── OCR MULTIPLE IMAGES ───
async function ocrMultipleImages(imageBuffers, preprocess = true) {
  const results = [];
  
  for (let i = 0; i < imageBuffers.length; i++) {
    console.log(`📄 Processing page ${i + 1}/${imageBuffers.length}...`);
    const result = await ocrImage(imageBuffers[i], preprocess);
    results.push({
      page: i + 1,
      text: result.text,
      confidence: result.confidence
    });
  }
  
  return results;
}

// ─── CLEANUP WORKER ───
async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
    console.log('🛑 Tesseract worker terminated');
  }
}

// ─── COMBINE DIGITAL TEXT + OCR TEXT ───
function mergeTexts(digitalText, ocrText) {
  if (!digitalText || digitalText.trim().length === 0) {
    return ocrText; // Only OCR available
  }
  
  if (!ocrText || ocrText.trim().length === 0) {
    return digitalText; // Only digital text available
  }
  
  // Both available - combine and remove obvious duplicates
  const digitalLines = digitalText.split('\n').map(l => l.trim()).filter(Boolean);
  const ocrLines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Merge unique lines
  const merged = [...new Set([...digitalLines, ...ocrLines])];
  return merged.join('\n');
}

// ─── EXTRACT TEXT FROM PDF USING TESSERACT ───
// This requires pdf-poppler to convert PDF to images first
// But we can also use pdfjs to render pages as images
async function ocrPdfFromImages(images) {
  const w = await getWorker();
  let fullText = '';
  
  for (let i = 0; i < images.length; i++) {
    console.log(`🔍 OCR on page ${i + 1}/${images.length}...`);
    const processed = await preprocessImage(images[i]);
    const { data } = await w.recognize(processed);
    fullText += data.text + '\n';
  }
  
  return fullText;
}

module.exports = {
  ocrImage,
  ocrMultipleImages,
  ocrPdfFromImages,
  preprocessImage,
  mergeTexts,
  terminateWorker,
  getWorker
};