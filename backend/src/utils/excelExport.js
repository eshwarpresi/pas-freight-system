const ExcelJS = require('exceljs');
const path = require('path');

async function exportShipmentsToExcel(shipments, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PAS Freight Services Pvt Ltd';
  workbook.created = new Date();
  workbook.properties.date1904 = true;

  // Stage options & colors
  const STAGE_OPTIONS = ['Draft', 'Created', 'Confirmed', 'Booked', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold'];
  const STAGE_COLORS = {
    'Draft': 'E5E7EB', 'Created': 'DBEAFE', 'Confirmed': 'FEF3C7', 'Booked': 'DDD6FE',
    'Scheduled': 'CFFAFE', 'In Progress': 'FEF9C3', 'Completed': 'DCFCE7', 'Cancelled': 'FEE2E2', 'On Hold': 'FED7AA'
  };
  const STAGE_FONT_COLORS = {
    'Draft': '6B7280', 'Created': '1E40AF', 'Confirmed': '92400E', 'Booked': '6D28D9',
    'Scheduled': '155E75', 'In Progress': 'A16207', 'Completed': '166534', 'Cancelled': 'DC2626', 'On Hold': 'C2410C'
  };

  const lastColLetter = 'Z'; // 26 columns (A-Z)
  const colCount = 26;

  // ========== SHEET 1: SHIPMENTS ==========
  const ws = workbook.addWorksheet('Shipments', {
    properties: { tabColor: { argb: '1E40AF' } },
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  // Define all columns
  const columns = [
    { header: 'REF NO', key: 'refNo', width: 18 },
    { header: 'STATUS', key: 'status', width: 18 },
    { header: 'SHIPMENT STAGE', key: 'shipmentStage', width: 20 },
    { header: 'CONSIGNEE', key: 'consignee', width: 28 },
    { header: 'SHIPPER', key: 'shipper', width: 28 },
    { header: 'AGENT', key: 'agent', width: 24 },
    { header: 'PKGS', key: 'packages', width: 8 },
    { header: 'WEIGHT (KG)', key: 'weight', width: 13 },
    { header: 'SELLING RATE', key: 'rate', width: 15 },
    { header: 'BOOKING DATE', key: 'booking', width: 16 },
    { header: 'ETD', key: 'etd', width: 14 },
    { header: 'ETA', key: 'eta', width: 14 },
    { header: 'MAWB/MBL', key: 'mawb', width: 18 },
    { header: 'HAWB/HBL', key: 'hawb', width: 18 },
    { header: 'JOB NO', key: 'jobNo', width: 14 },
    { header: 'BOE NO', key: 'boeNo', width: 14 },
    { header: 'DO COLLECTION', key: 'doDate', width: 16 },
    { header: 'OOC DATE', key: 'oocDate', width: 14 },
    { header: 'GATE PASS', key: 'gatePass', width: 14 },
    { header: 'DELIVERY DATE', key: 'delivery', width: 16 },
    { header: 'TRACKING NO', key: 'tracking', width: 18 },
    { header: 'INVOICE NO', key: 'invoiceNo', width: 18 },
    { header: 'INVOICE DATE', key: 'invoiceDate', width: 16 },
    { header: 'INVOICE SENT', key: 'invoiceSent', width: 16 },
    { header: 'CREATED', key: 'createdAt', width: 16 },
    { header: 'REMARKS', key: 'remarks', width: 35 },
  ];
  ws.columns = columns;

  // Row 1: Title
  ws.insertRow(1, ['']); ws.mergeCells(`A1:${lastColLetter}1`);
  ws.getRow(1).height = 55;
  const t1 = ws.getCell('A1');
  t1.value = '🚢  PAS FREIGHT SERVICES PVT LTD';
  t1.font = { name: 'Calibri', size: 24, bold: true, color: { argb: '1E40AF' } };
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F4FF' } };

  // Row 2: Subtitle
  ws.insertRow(2, ['']); ws.mergeCells(`A2:${lastColLetter}2`);
  ws.getRow(2).height = 24;
  const t2 = ws.getCell('A2');
  t2.value = 'SHIPMENT REPORT';
  t2.font = { name: 'Calibri', size: 14, bold: true, color: { argb: '475569' } };
  t2.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3: Date + Count
  ws.insertRow(3, ['']); ws.mergeCells(`A3:${lastColLetter}3`);
  ws.getRow(3).height = 22;
  const t3 = ws.getCell('A3');
  t3.value = `Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}  |  Total: ${shipments.length} shipments`;
  t3.font = { name: 'Calibri', size: 10, color: { argb: '64748B' } };
  t3.alignment = { horizontal: 'center' };

  // Row 4: Spacer
  ws.insertRow(4, ['']); ws.getRow(4).height = 6;

  // Row 5: Headers
  const headerRow = ws.getRow(5); headerRow.height = 34;
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    const isStage = col.key === 'shipmentStage';
    const isRemarks = col.key === 'remarks';
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isStage ? '7C3AED' : isRemarks ? '0D9488' : '1E40AF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'medium', color: { argb: '1E3A8A' } }, bottom: { style: 'medium', color: { argb: '1E3A8A' } }, left: { style: 'thin', color: { argb: '1E3A8A' } }, right: { style: 'thin', color: { argb: '1E3A8A' } } };
  });

  // Dropdown validation for Stage column (column 3 = C)
  const dataStartRow = 6;
  const dataEndRow = 5 + shipments.length + 500; // extra rows for future
  ws.dataValidations.add(`C${dataStartRow}:C${dataEndRow}`, {
    type: 'list', allowBlank: true, formulae: [`"${STAGE_OPTIONS.join(',')}"`],
    showErrorMessage: true, errorTitle: 'Invalid Stage', error: 'Please select a valid Shipment Stage.'
  });

  // Data rows
  const statusRowColors = {
    'ENQUIRY': 'FFF7ED', 'RATES_ADDED': 'F0F9FF', 'NOMINATED': 'F5F3FF', 'BOOKED': 'EEF2FF',
    'SCHEDULED': 'ECFEFF', 'AWB_GENERATED': 'F0FDFA', 'CHECKLIST_APPROVED': 'ECFDF5', 'BOE_FILED': 'F7FEE7',
    'DO_COLLECTED': 'F0FDF4', 'OOC_DONE': 'EFF6FF', 'GATE_PASS': 'F5F3FF', 'DELIVERED': 'DCFCE7',
    'INVOICE_GENERATED': 'FFF7ED', 'INVOICE_SENT': 'FFF1F2', 'COMPLETED': 'F3F4F6'
  };

  shipments.forEach((s) => {
    const ff = s.freightForwarding || {}; const cha = s.cha || {}; const acc = s.accounts || {};
    const row = ws.addRow({
      refNo: s.refNo, status: s.currentStatus?.replace(/_/g, ' ') || '', shipmentStage: s.shipmentStage || '',
      consignee: ff.consigneeName || '', shipper: ff.shipperName || '', agent: ff.agent || '',
      packages: ff.noOfPackages || '', weight: ff.weight || '', rate: ff.sellingRate ? `$${parseFloat(ff.sellingRate).toLocaleString()}` : '',
      booking: ff.bookingDate ? new Date(ff.bookingDate).toLocaleDateString() : '',
      etd: ff.etd ? new Date(ff.etd).toLocaleDateString() : '', eta: ff.eta ? new Date(ff.eta).toLocaleDateString() : '',
      mawb: ff.mawb || '', hawb: ff.hawb || '', jobNo: cha.jobNo || '', boeNo: cha.boeNo || '',
      doDate: cha.doCollectionDate ? new Date(cha.doCollectionDate).toLocaleDateString() : '',
      oocDate: cha.oocDate ? new Date(cha.oocDate).toLocaleDateString() : '',
      gatePass: cha.gatePassDate ? new Date(cha.gatePassDate).toLocaleDateString() : '',
      delivery: cha.deliveryDate ? new Date(cha.deliveryDate).toLocaleDateString() : '',
      tracking: cha.trackingNumber || '', invoiceNo: acc.invoiceNumber || '',
      invoiceDate: acc.invoiceDate ? new Date(acc.invoiceDate).toLocaleDateString() : '',
      invoiceSent: acc.sendingDate ? new Date(acc.sendingDate).toLocaleDateString() : '',
      createdAt: new Date(s.createdAt).toLocaleDateString(), remarks: s.remarks || '',
    });

    row.alignment = { horizontal: 'center', vertical: 'middle' };
    row.font = { name: 'Calibri', size: 9 };

    // Subtle row background by status
    const rowBg = statusRowColors[s.currentStatus] || 'FFFFFF';
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

    // COLOR the Stage cell (column 3)
    const stageCell = row.getCell(3);
    if (s.shipmentStage && STAGE_COLORS[s.shipmentStage]) {
      stageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_COLORS[s.shipmentStage] } };
      stageCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: STAGE_FONT_COLORS[s.shipmentStage] || '374151' } };
    }

    // Remarks left-aligned with wrap
    const remCell = row.getCell(26);
    remCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    // Borders
    row.eachCell(cell => {
      cell.border = { top: { style: 'thin', color: { argb: 'E2E8F0' } }, bottom: { style: 'thin', color: { argb: 'E2E8F0' } }, left: { style: 'thin', color: { argb: 'E2E8F0' } }, right: { style: 'thin', color: { argb: 'E2E8F0' } } };
    });
    row.getCell(1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: '1E40AF' } };
    row.getCell(2).font = { name: 'Calibri', size: 9, bold: true };
  });

  // Auto-filter & freeze
  const lastRow = 5 + shipments.length;
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: lastRow, column: colCount } };
  ws.views = [{ state: 'frozen', ySplit: 5 }];

  // Footer
  const fr = ws.addRow(['']); ws.mergeCells(`A${fr.number}:${lastColLetter}${fr.number}`);
  ws.getCell(`A${fr.number}`).value = `© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd | Confidential`;
  ws.getCell(`A${fr.number}`).font = { name: 'Calibri', size: 8, italic: true, color: { argb: '94A3B8' } };
  ws.getCell(`A${fr.number}`).alignment = { horizontal: 'center' };

  // Logo
  try {
    const fs = require('fs');
    let logoPath = path.join(__dirname, '..', 'logo.webp'), ext = 'webp';
    if (!fs.existsSync(logoPath)) { logoPath = path.join(__dirname, '..', 'logo.png'); ext = 'png'; }
    if (fs.existsSync(logoPath)) { const id = workbook.addImage({ filename: logoPath, extension: ext }); ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 45 } }); }
  } catch (e) {}

  // ========== SHEET 2: SUMMARY ==========
  const ss = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: '059669' } } });
  ss.columns = [{ header: 'STATUS', key: 'status', width: 25 }, { header: 'COUNT', key: 'count', width: 15 }, { header: 'PERCENTAGE', key: 'pct', width: 15 }];

  // Header
  ss.insertRow(1, ['📊 SHIPMENT SUMMARY']); ss.mergeCells('A1:C1');
  ss.getCell('A1').font = { size: 16, bold: true, color: { argb: '059669' } }; ss.getCell('A1').alignment = { horizontal: 'center' };
  const h2 = ss.getRow(2); h2.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
  h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } }; h2.alignment = { horizontal: 'center' };

  // Status counts
  const counts = {}; shipments.forEach(s => { const st = s.currentStatus?.replace(/_/g, ' ') || 'Unknown'; counts[st] = (counts[st] || 0) + 1; });
  Object.entries(counts).forEach(([s, c]) => ss.addRow({ status: s, count: c, pct: `${Math.round((c / shipments.length) * 100)}%` }));
  ss.addRow({ status: 'TOTAL', count: shipments.length, pct: '100%' }).font = { bold: true };

  // Stage summary
  ss.addRow([]); ss.addRow(['📌 STAGE SUMMARY', '', '']).font = { bold: true, size: 12, color: { argb: '7C3AED' } };
  const stageCounts = {}; shipments.forEach(s => { const st = s.shipmentStage || 'Not Set'; stageCounts[st] = (stageCounts[st] || 0) + 1; });
  Object.entries(stageCounts).forEach(([stage, count]) => { const r = ss.addRow({ status: stage, count, pct: `${Math.round((count / shipments.length) * 100)}%` }); if (STAGE_COLORS[stage]) r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_COLORS[stage] } }; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportShipmentsToExcel };