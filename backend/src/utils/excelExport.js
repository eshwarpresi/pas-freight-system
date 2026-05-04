const ExcelJS = require('exceljs');
const path = require('path');

async function exportShipmentsToExcel(shipments, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PAS Freight Services Pvt Ltd';
  workbook.created = new Date();
  workbook.properties.date1904 = true;

  // Dropdown options for Shipment Stage
  const STAGE_OPTIONS = ['Draft', 'Created', 'Confirmed', 'Booked', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold'];
  
  // Color mapping for each stage
  const STAGE_COLORS = {
    'Draft': 'F5F5F5',       // Light gray
    'Created': 'DBEAFE',     // Light blue
    'Confirmed': 'FEF3C7',   // Light amber
    'Booked': 'DDD6FE',      // Light purple
    'Scheduled': 'CFFAFE',   // Light cyan
    'In Progress': 'FEF9C3', // Yellow
    'Completed': 'DCFCE7',   // Light green
    'Cancelled': 'FEE2E2',   // Light red
    'On Hold': 'FED7AA',     // Light orange
  };

  // ==========================================
  // SHEET 1: SHIPMENTS DATA
  // ==========================================
  const ws = workbook.addWorksheet('Shipments', {
    properties: { tabColor: { argb: '1E40AF' } },
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  // Column definitions - ADDED STAGE + REMARKS at the end
  const columns = [
    { header: 'REF NO', key: 'refNo', width: 18 },
    { header: 'STATUS', key: 'status', width: 18 },
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
    { header: 'SHIPMENT STAGE', key: 'shipmentStage', width: 20 },  // NEW
    { header: 'REMARKS', key: 'remarks', width: 35 },               // NEW
  ];
  ws.columns = columns;

  // Update merge cells range (now 25 columns = A:Y)
  const lastCol = 'Y';

  // ===== ROW 1: COMPANY HEADER =====
  ws.insertRow(1, ['']);
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getRow(1).height = 50;
  const titleCell = ws.getCell('A1');
  titleCell.value = 'PAS FREIGHT SERVICES PVT LTD';
  titleCell.font = { name: 'Calibri', size: 22, bold: true, color: { argb: '1E40AF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F4FF' } };

  // ===== ROW 2: SUBTITLE =====
  ws.insertRow(2, ['']);
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getRow(2).height = 22;
  ws.getCell('A2').value = 'SHIPMENT REPORT';
  ws.getCell('A2').font = { name: 'Calibri', size: 14, bold: true, color: { argb: '475569' } };
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  // ===== ROW 3: DATE & STATS =====
  ws.insertRow(3, ['']);
  ws.mergeCells(`A3:${lastCol}3`);
  ws.getRow(3).height = 20;
  ws.getCell('A3').value = `Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}  |  Total Shipments: ${shipments.length}`;
  ws.getCell('A3').font = { name: 'Calibri', size: 9, color: { argb: '64748B' } };
  ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  // ===== ROW 4: EMPTY SPACER =====
  ws.insertRow(4, ['']);
  ws.getRow(4).height = 5;

  // ===== ROW 5: HEADERS (with distinct color for new columns) =====
  const headerRow = ws.getRow(5);
  headerRow.height = 32;
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    const isNewCol = col.key === 'shipmentStage' || col.key === 'remarks';
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isNewCol ? '7C3AED' : '1E40AF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: isNewCol ? '6D28D9' : '1E3A8A' } },
      bottom: { style: 'medium', color: { argb: isNewCol ? '6D28D9' : '1E3A8A' } },
      left: { style: 'thin', color: { argb: isNewCol ? '6D28D9' : '1E3A8A' } },
      right: { style: 'thin', color: { argb: isNewCol ? '6D28D9' : '1E3A8A' } }
    };
  });

  // ===== ADD DROPDOWN VALIDATION for SHIPMENT STAGE column (column 25) =====
  const firstDataRow = 6;
  const lastDataRow = 5 + shipments.length;
  ws.dataValidations.add(`Y${firstDataRow}:Y${lastDataRow + 100}`, {
    type: 'list',
    allowBlank: true,
    formulae: [`"${STAGE_OPTIONS.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Invalid Stage',
    error: 'Please select a valid Shipment Stage from the dropdown.'
  });

  // ===== DATA ROWS =====
  const sectionColors = {
    'ENQUIRY': 'FFF7ED', 'RATES_ADDED': 'F0F9FF', 'NOMINATED': 'F5F3FF',
    'BOOKED': 'EEF2FF', 'SCHEDULED': 'ECFEFF', 'AWB_GENERATED': 'F0FDFA',
    'CHECKLIST_APPROVED': 'ECFDF5', 'BOE_FILED': 'F7FEE7', 'DO_COLLECTED': 'F0FDF4',
    'OOC_DONE': 'EFF6FF', 'GATE_PASS': 'F5F3FF', 'DELIVERED': 'DCFCE7',
    'INVOICE_GENERATED': 'FFF7ED', 'INVOICE_SENT': 'FFF1F2', 'COMPLETED': 'F3F4F6',
  };

  shipments.forEach((s, i) => {
    const ff = s.freightForwarding || {};
    const cha = s.cha || {};
    const acc = s.accounts || {};

    const row = ws.addRow({
      refNo: s.refNo,
      status: s.currentStatus?.replace(/_/g, ' ') || '',
      consignee: ff.consigneeName || '',
      shipper: ff.shipperName || '',
      agent: ff.agent || '',
      packages: ff.noOfPackages || '',
      weight: ff.weight || '',
      rate: ff.sellingRate ? `$${parseFloat(ff.sellingRate).toLocaleString()}` : '',
      booking: ff.bookingDate ? new Date(ff.bookingDate).toLocaleDateString() : '',
      etd: ff.etd ? new Date(ff.etd).toLocaleDateString() : '',
      eta: ff.eta ? new Date(ff.eta).toLocaleDateString() : '',
      mawb: ff.mawb || '',
      hawb: ff.hawb || '',
      jobNo: cha.jobNo || '',
      boeNo: cha.boeNo || '',
      doDate: cha.doCollectionDate ? new Date(cha.doCollectionDate).toLocaleDateString() : '',
      oocDate: cha.oocDate ? new Date(cha.oocDate).toLocaleDateString() : '',
      gatePass: cha.gatePassDate ? new Date(cha.gatePassDate).toLocaleDateString() : '',
      delivery: cha.deliveryDate ? new Date(cha.deliveryDate).toLocaleDateString() : '',
      tracking: cha.trackingNumber || '',
      invoiceNo: acc.invoiceNumber || '',
      invoiceDate: acc.invoiceDate ? new Date(acc.invoiceDate).toLocaleDateString() : '',
      invoiceSent: acc.sendingDate ? new Date(acc.sendingDate).toLocaleDateString() : '',
      createdAt: new Date(s.createdAt).toLocaleDateString(),
      shipmentStage: s.shipmentStage || '',  // NEW
      remarks: s.remarks || '',              // NEW
    });

    row.alignment = { horizontal: 'center', vertical: 'middle' };
    row.font = { name: 'Calibri', size: 9 };

    // Row color based on status
    const bgColor = sectionColors[s.currentStatus] || 'FFFFFF';
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };

    // Color the Stage cell based on selected stage
    const stageCell = row.getCell(25); // Column Y = SHIPMENT STAGE
    const stageColor = STAGE_COLORS[s.shipmentStage] || 'FFFFFF';
    if (s.shipmentStage) {
      stageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stageColor } };
      stageCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '374151' } };
    }

    // Remarks cell left-aligned
    const remarksCell = row.getCell(26); // Column Z = REMARKS
    remarksCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    // Border
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } }
      };
    });

    row.getCell(1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: '1E40AF' } };
    row.getCell(2).font = { name: 'Calibri', size: 9, bold: true };
  });

  // Auto-filter & Freeze
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: lastDataRow, column: columns.length } };
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 0 }];

  // Footer
  const footerRow = ws.addRow(['']);
  ws.mergeCells(`A${footerRow.number}:${lastCol}${footerRow.number}`);
  ws.getCell(`A${footerRow.number}`).value = `© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd | Confidential | Generated by PAS Freight Management System`;
  ws.getCell(`A${footerRow.number}`).font = { name: 'Calibri', size: 8, italic: true, color: { argb: '94A3B8' } };
  ws.getCell(`A${footerRow.number}`).alignment = { horizontal: 'center' };

  // ===== ADD LOGO (WebP & PNG) =====
  try {
    const fs = require('fs');
    let logoPath = path.join(__dirname, '..', 'logo.webp');
    let extension = 'webp';
    if (!fs.existsSync(logoPath)) {
      logoPath = path.join(__dirname, '..', 'logo.png');
      extension = 'png';
    }
    if (fs.existsSync(logoPath)) {
      const logoId = workbook.addImage({ filename: logoPath, extension });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 45 } });
    }
  } catch (e) { /* skip */ }

  // ==========================================
  // SHEET 2: SUMMARY
  // ==========================================
  const ss = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: '059669' } } });
  const counts = {};
  shipments.forEach(s => { const st = s.currentStatus?.replace(/_/g, ' ') || 'Unknown'; counts[st] = (counts[st] || 0) + 1; });
  ss.columns = [{ header: 'STATUS', key: 'status', width: 25 }, { header: 'COUNT', key: 'count', width: 15 }, { header: 'PERCENTAGE', key: 'pct', width: 15 }];
  ss.insertRow(1, ['SHIPMENT SUMMARY']); ss.mergeCells('A1:C1');
  ss.getCell('A1').font = { size: 14, bold: true, color: { argb: '059669' } }; ss.getCell('A1').alignment = { horizontal: 'center' };
  const sh = ss.getRow(2); sh.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
  sh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } }; sh.alignment = { horizontal: 'center' };
  Object.entries(counts).forEach(([s, c]) => ss.addRow({ status: s, count: c, pct: `${Math.round((c / shipments.length) * 100)}%` }));
  ss.addRow({ status: 'TOTAL', count: shipments.length, pct: '100%' }).font = { bold: true };

  // Also add stage summary
  ss.addRow([]);
  ss.addRow(['STAGE SUMMARY', '', '']).font = { bold: true, size: 12 };
  const stageCounts = {};
  shipments.forEach(s => { const st = s.shipmentStage || 'Not Set'; stageCounts[st] = (stageCounts[st] || 0) + 1; });
  Object.entries(stageCounts).forEach(([stage, count]) => ss.addRow({ status: stage, count, pct: `${Math.round((count / shipments.length) * 100)}%` }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportShipmentsToExcel };