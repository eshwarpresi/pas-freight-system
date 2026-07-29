// backend/src/utils/challanPdfGenerator.js
//
// NEW FILE — does not touch any existing utils/services.
// Generates a branded "Delivery Challan" PDF using pdfkit.
//
// Requires: npm install pdfkit   (new dependency — does not affect existing packages)

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Brand colors picked from the PAS Freight logo
const NAVY = '#0F2A4A';
const ORANGE = '#F2821F';
const GREY = '#444444';
const LIGHT_GREY = '#888888';

// Path to the logo shipped alongside this feature.
// Place the enhanced logo file at: backend/src/assets/pas-logo.png
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'pas-logo.png');

/**
 * Draws a labeled field row: "LABEL : value"
 */
function drawField(doc, label, value, x, y, labelWidth, totalWidth) {
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(GREY)
    .text(label, x, y, { width: labelWidth, continued: false });

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#000000')
    .text(value || '-', x + labelWidth, y, { width: totalWidth - labelWidth });
}

/**
 * Generate the Delivery Challan PDF as a Buffer.
 *
 * @param {Object} fields
 * @param {string} fields.refNo            - optional reference / challan no
 * @param {string} fields.marksNos         - Marks & No's
 * @param {string} fields.noOfPkgs         - No of Pkgs (number only)
 * @param {string} fields.grossWeight      - Gross weight (number only)
 * @param {string} fields.beNo             - BE No
 * @param {string} fields.beDate           - BE Date
 * @param {string} fields.mawbHawbNo       - MAWB / HAWB No
 * @param {string} fields.descriptionOfGoods
 * @param {string} fields.consigneeName    - optional, shown under salutation
 * @returns {Promise<Buffer>}
 */
function generateDeliveryChallanPdf(fields = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;

      // ─────────────────────────────────────────────
      // HEADER: Logo + Company Block
      // ─────────────────────────────────────────────
      let headerBottom = 40;

      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, left, 36, { width: 110 });
        } catch (e) {
          console.warn('Logo could not be embedded:', e.message);
        }
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor(NAVY)
        .text('PAS FREIGHT SERVICES PVT LTD', left + 120, 40, { width: pageWidth - 120, align: 'right' });

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(GREY)
        .text(
          'Site no 171, 1st and 2nd Floor, 7th Block, Arkavathy Layout, Jakkur, Bangalore - 560064',
          left + 120, 60, { width: pageWidth - 120, align: 'right' }
        )
        .text(
          'Contact: +91 9036101201  |  Landline: 080-4372 2701',
          left + 120, 72, { width: pageWidth - 120, align: 'right' }
        );

      // Orange separator line
      headerBottom = 96;
      doc.moveTo(left, headerBottom).lineTo(left + pageWidth, headerBottom)
        .lineWidth(2).strokeColor(ORANGE).stroke();
      doc.moveTo(left, headerBottom + 3).lineTo(left + pageWidth, headerBottom + 3)
        .lineWidth(0.75).strokeColor(NAVY).stroke();

      // ─────────────────────────────────────────────
      // TITLE
      // ─────────────────────────────────────────────
      let y = headerBottom + 20;
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(NAVY)
        .text('DELIVERY CHALLAN', left, y, { width: pageWidth, align: 'center', characterSpacing: 1.5 });

      y += 30;

      // Challan No + Date (top right, auto-generated, not stored anywhere)
      const today = new Date().toLocaleDateString('en-GB');
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(GREY)
        .text(`Date: ${today}`, left, y, { width: pageWidth, align: 'right' });

      y += 20;

      // ─────────────────────────────────────────────
      // SALUTATION
      // ─────────────────────────────────────────────
      doc.font('Helvetica').fontSize(10.5).fillColor('#000000');
      doc.text('Dear Sir,', left, y);
      y += 16;
      doc.text(
        'Kindly receive the following goods in good condition & acknowledge the same.',
        left, y, { width: pageWidth }
      );
      y += 30;

      // ─────────────────────────────────────────────
      // FIELDS TABLE
      // ─────────────────────────────────────────────
      const colWidth = pageWidth / 2 - 10;

      drawField(doc, "Marks & No's : ", fields.marksNos, left, y, 90, colWidth);
      y += 22;

      drawField(doc, 'No of Pkgs : ', fields.noOfPkgs ? `${fields.noOfPkgs} PKG` : '', left, y, 90, colWidth);
      drawField(doc, 'Gross Weight : ', fields.grossWeight ? `${fields.grossWeight} KGS` : '', left + colWidth + 20, y, 90, colWidth);
      y += 26;

      // Divider
      doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.5).strokeColor('#CCCCCC').stroke();
      y += 14;

      drawField(doc, 'BE No & Date : ', [fields.beNo, fields.beDate].filter(Boolean).join('  /  '), left, y, 90, colWidth);
      drawField(doc, 'MAWB / HAWB No : ', fields.mawbHawbNo, left + colWidth + 20, y, 110, colWidth);
      y += 26;

      doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.5).strokeColor('#CCCCCC').stroke();
      y += 14;

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(GREY)
        .text('Description of goods : ', left, y, { width: 130 });
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(NAVY)
        .text(fields.descriptionOfGoods || 'AS PER BOE AND INVOICE', left, y + 14, { width: pageWidth, align: 'center' });

      y += 45;

      // ─────────────────────────────────────────────
      // NOTE / ENCLOSED DOCUMENTS
      // ─────────────────────────────────────────────
      doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.5).strokeColor('#CCCCCC').stroke();
      y += 14;

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000000').text('Note :', left, y);
      y += 16;
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#000000')
        .text('Enclosed Documents', left, y);
      y += 14;
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#000000')
        .text('B/E   -----   COPY BILL OF ENTRY AND INVOICE', left + 10, y);

      y += 50;

      // ─────────────────────────────────────────────
      // SIGNATURE BLOCK
      // ─────────────────────────────────────────────
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#000000')
        .text('Name and Signature of receiver with seal :', left, y);

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(NAVY)
        .text('For PAS FREIGHT SERVICES PVT LTD', left, y, { width: pageWidth, align: 'right' });

      y += 55;
      doc.moveTo(left, y).lineTo(left + 200, y).lineWidth(0.75).strokeColor('#000000').stroke();
      doc.moveTo(left + pageWidth - 200, y).lineTo(left + pageWidth, y).lineWidth(0.75).strokeColor('#000000').stroke();

      // ─────────────────────────────────────────────
      // FOOTER
      // ─────────────────────────────────────────────
      const footerY = doc.page.height - doc.page.margins.bottom - 16;
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(LIGHT_GREY)
        .text('This is a system-generated Delivery Challan — PAS Freight Services Pvt Ltd', left, footerY, {
          width: pageWidth,
          align: 'center'
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateDeliveryChallanPdf };
