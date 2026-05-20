const ExcelJS = require('exceljs');
const path = require('path');

async function exportShipmentsToExcel(shipments, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PAS Freight Services Pvt Ltd';
  workbook.created = new Date();

  const STAGE_OPTIONS = ['Draft', 'Created', 'Confirmed', 'Booked', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold'];
  const STAGE_COLORS = { 'Draft': 'E5E7EB', 'Created': 'DBEAFE', 'Confirmed': 'FEF3C7', 'Booked': 'DDD6FE', 'Scheduled': 'CFFAFE', 'In Progress': 'FEF9C3', 'Completed': 'DCFCE7', 'Cancelled': 'FEE2E2', 'On Hold': 'FED7AA' };

  const chaBillCount = shipments.filter(s => s.shipmentType === 'CHA Only').length;
  const freightShipmentCount = shipments.length - chaBillCount;
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

  // =============================================
  // SHEET 1: ALL SHIPMENTS
  // =============================================
  const ws = workbook.addWorksheet('All Shipments', {
    properties: { tabColor: { argb: '1E40AF' } },
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  const columns = [
    { header: 'Ref No', key: 'refNo', width: 18 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Stage', key: 'shipmentStage', width: 16 },
    { header: 'Transport Mode', key: 'mode', width: 16 },
    { header: 'Import / Export', key: 'importExport', width: 16 },
    { header: 'Created By', key: 'createdBy', width: 18 },
    { header: 'Consignee', key: 'consignee', width: 24 },
    { header: 'Shipper', key: 'shipper', width: 24 },
    { header: 'From', key: 'fromLocation', width: 18 },
    { header: 'To', key: 'toLocation', width: 18 },
    { header: 'Terms', key: 'terms', width: 14 },
    { header: 'Port Location', key: 'portLocation', width: 16 },
    { header: 'Agent', key: 'agent', width: 18 },
    { header: 'Pkgs', key: 'packages', width: 7 },
    { header: 'Gross Weight (kg)', key: 'grossWeight', width: 15 },
    { header: 'Chargeable Weight (kg)', key: 'weight', width: 18 },
    { header: 'CBM', key: 'cbm', width: 10 },
    { header: 'Selling Rate', key: 'rate', width: 14 },
    { header: 'Booking Date', key: 'booking', width: 15 },
    { header: 'ETD', key: 'etd', width: 14 },
    { header: 'ETA', key: 'eta', width: 14 },
    { header: 'MAWB/MBL', key: 'mawb', width: 17 },
    { header: 'HAWB/HBL', key: 'hawb', width: 17 },
    { header: 'Job No', key: 'jobNo', width: 14 },
    { header: 'BOE No', key: 'boeNo', width: 14 },
    { header: 'DO Collection', key: 'doDate', width: 17 },
    { header: 'OOC Date', key: 'oocDate', width: 14 },
    { header: 'Gate Pass', key: 'gatePass', width: 14 },
    { header: 'Delivery Date', key: 'delivery', width: 16 },
    { header: 'Tracking No', key: 'tracking', width: 20 },
    { header: 'Invoice No', key: 'invoiceNo', width: 16 },
    { header: 'Invoice Date', key: 'invoiceDate', width: 15 },
    { header: 'Invoice Sent', key: 'invoiceSent', width: 15 },
    { header: 'Created', key: 'createdAt', width: 15 },
    { header: 'Remarks', key: 'remarks', width: 30 },
  ];
  ws.columns = columns;

  const lastCol = 'AI';
  const colCount = 35;

  // Row 1: Title
  ws.insertRow(1, ['PAS FREIGHT SERVICES PVT LTD - SHIPMENT REPORT']);
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: '1E40AF' } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 35;

  // Row 2: Generated date + Total shipments
  ws.insertRow(2, [`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}     |     Total Shipments: ${shipments.length}     |     Freight: ${freightShipmentCount}     |     CHA Only: ${chaBillCount}`]);
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell('A2').font = { name: 'Arial', size: 10, color: { argb: '666666' } };
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  // Row 3: Header
  const headerRow = ws.getRow(3);
  headerRow.height = 32;
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E40AF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: '1E3A8A' } },
      bottom: { style: 'medium', color: { argb: '1E3A8A' } },
      left: { style: 'thin', color: { argb: '1E3A8A' } },
      right: { style: 'thin', color: { argb: '1E3A8A' } }
    };
  });

  // Dropdown for Stage column (C = 3)
  ws.dataValidations.add(`C4:C${3 + shipments.length + 500}`, {
    type: 'list', allowBlank: true, formulae: [`"${STAGE_OPTIONS.join(',')}"`],
    showErrorMessage: true, errorTitle: 'Invalid Stage', error: 'Please select a valid Shipment Stage.'
  });

  // Data rows
  shipments.forEach((s, index) => {
    const ff = s.freightForwarding || {}; const cha = s.cha || {}; const acc = s.accounts || {};
    const isCHA = s.shipmentType === 'CHA Only';
    const row = ws.addRow({
      refNo: s.refNo || '',
      status: s.currentStatus?.replace(/_/g, ' ') || '',
      shipmentStage: s.shipmentStage || '',
      mode: s.shipmentType || '',
      importExport: s.importExport || '',
      createdBy: s.createdByName || '',
      consignee: ff.consigneeName || '',
      shipper: ff.shipperName || '',
      fromLocation: ff.fromLocation || '',
      toLocation: ff.toLocation || '',
      terms: ff.terms || '',
      portLocation: ff.portLocation || '',
      agent: ff.agent || '',
      packages: ff.noOfPackages || '',
      grossWeight: ff.grossWeight || '',
      weight: ff.weight || '',
      cbm: ff.cbm || '',
      rate: ff.sellingRate ? `₹${parseFloat(ff.sellingRate).toLocaleString()}` : '',
      booking: ff.bookingDate ? new Date(ff.bookingDate).toLocaleDateString('en-US') : '',
      etd: ff.etd ? new Date(ff.etd).toLocaleDateString('en-US') : '',
      eta: ff.eta ? new Date(ff.eta).toLocaleDateString('en-US') : '',
      mawb: ff.mawb || '',
      hawb: ff.hawb || '',
      jobNo: cha.jobNo || '',
      boeNo: cha.boeNo || '',
      doDate: cha.doCollectionDate ? new Date(cha.doCollectionDate).toLocaleDateString('en-US') : '',
      oocDate: cha.oocDate ? new Date(cha.oocDate).toLocaleDateString('en-US') : '',
      gatePass: cha.gatePassDate ? new Date(cha.gatePassDate).toLocaleDateString('en-US') : '',
      delivery: cha.deliveryDate ? new Date(cha.deliveryDate).toLocaleDateString('en-US') : '',
      tracking: cha.trackingNumber || '',
      invoiceNo: acc.invoiceNumber || '',
      invoiceDate: acc.invoiceDate ? new Date(acc.invoiceDate).toLocaleDateString('en-US') : '',
      invoiceSent: acc.sendingDate ? new Date(acc.sendingDate).toLocaleDateString('en-US') : '',
      createdAt: new Date(s.createdAt).toLocaleDateString('en-US'),
      remarks: s.remarks || '',
    });

    row.height = 22;
    row.alignment = { horizontal: 'center', vertical: 'middle' };
    row.font = { name: 'Arial', size: 9 };

    if (index % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
    }

    const stageCell = row.getCell(3);
    if (s.shipmentStage && STAGE_COLORS[s.shipmentStage]) {
      stageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_COLORS[s.shipmentStage] } };
      stageCell.font = { name: 'Arial', size: 9, bold: true };
    }

    if (isCHA) {
      const modeCell = row.getCell(4);
      modeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCFCE7' } };
      modeCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '166534' } };
    }

    const remCell = row.getCell(35);
    remCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    row.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: '1E40AF' } };

    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'D1D5DB' } },
        left: { style: 'thin', color: { argb: 'D1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
        right: { style: 'thin', color: { argb: 'D1D5DB' } }
      };
    });
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + shipments.length, column: colCount } };
  ws.views = [{ state: 'frozen', ySplit: 3 }];

  const fr = ws.addRow(['']);
  ws.mergeCells(`A${fr.number}:${lastCol}${fr.number}`);
  ws.getCell(`A${fr.number}`).value = `© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd | Confidential`;
  ws.getCell(`A${fr.number}`).font = { name: 'Arial', size: 8, italic: true, color: { argb: '94A3B8' } };
  ws.getCell(`A${fr.number}`).alignment = { horizontal: 'center' };

  try {
    const fs = require('fs'); let lp = path.join(__dirname, '..', 'logo.webp'), ext = 'webp';
    if (!fs.existsSync(lp)) { lp = path.join(__dirname, '..', 'logo.png'); ext = 'png'; }
    if (fs.existsSync(lp)) { const id = workbook.addImage({ filename: lp, extension: ext }); ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 45 } }); }
  } catch (e) {}

  // =============================================
  // SHEET 2: SUMMARY DASHBOARD
  // =============================================
  const ss = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: '059669' } } });

  ss.mergeCells('A1:C2');
  const card1 = ss.getCell('A1');
  card1.value = { richText: [{ font: { size: 24, bold: true, color: { argb: '1E40AF' } }, text: `${shipments.length}` }, { font: { size: 11, color: { argb: '6B7280' } }, text: '\nTotal Shipments' }] };
  card1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  card1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFF6FF' } };
  card1.border = { top: { style: 'thin', color: { argb: 'BFDBFE' } }, bottom: { style: 'thin', color: { argb: 'BFDBFE' } }, left: { style: 'thin', color: { argb: 'BFDBFE' } }, right: { style: 'thin', color: { argb: 'BFDBFE' } } };
  ss.getRow(1).height = 28; ss.getRow(2).height = 22;

  ss.mergeCells('D1:F2');
  const card2 = ss.getCell('D1');
  card2.value = { richText: [{ font: { size: 24, bold: true, color: { argb: '059669' } }, text: `${freightShipmentCount}` }, { font: { size: 11, color: { argb: '6B7280' } }, text: '\nFreight Shipments' }] };
  card2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  card2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } };
  card2.border = { top: { style: 'thin', color: { argb: 'A7F3D0' } }, bottom: { style: 'thin', color: { argb: 'A7F3D0' } }, left: { style: 'thin', color: { argb: 'A7F3D0' } }, right: { style: 'thin', color: { argb: 'A7F3D0' } } };

  ss.mergeCells('G1:I2');
  const card3 = ss.getCell('G1');
  card3.value = { richText: [{ font: { size: 24, bold: true, color: { argb: '16A34A' } }, text: `${chaBillCount}` }, { font: { size: 11, color: { argb: '6B7280' } }, text: '\nCHA Only Bills' }] };
  card3.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  card3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };
  card3.border = { top: { style: 'thin', color: { argb: '86EFAC' } }, bottom: { style: 'thin', color: { argb: '86EFAC' } }, left: { style: 'thin', color: { argb: '86EFAC' } }, right: { style: 'thin', color: { argb: '86EFAC' } } };

  ss.getCell('A4').value = 'STATUS BREAKDOWN';
  ss.mergeCells('A4:I4');
  ss.getCell('A4').font = { name: 'Calibri', size: 12, bold: true, color: { argb: '1E40AF' } };
  ss.getRow(4).height = 26;

  const sHead = ss.getRow(5);
  sHead.values = ['Status', 'Count', '%', '', '', '', '', '', ''];
  sHead.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
  sHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E40AF' } };
  sHead.alignment = { horizontal: 'center', vertical: 'middle' };
  sHead.height = 24;
  sHead.eachCell(cell => { cell.border = { top: { style: 'thin', color: { argb: '1E3A8A' } }, bottom: { style: 'thin', color: { argb: '1E3A8A' } } }; });

  const counts = {};
  shipments.forEach(s => { const st = s.currentStatus?.replace(/_/g, ' ') || 'Unknown'; counts[st] = (counts[st] || 0) + 1; });
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
    const r = ss.addRow([status, count, `${Math.round((count / shipments.length) * 100)}%`, '', '', '', '', '', '']);
    r.alignment = { horizontal: 'center', vertical: 'middle' };
    r.font = { name: 'Calibri', size: 10 };
    r.height = 22;
  });
  const tr = ss.addRow(['TOTAL', shipments.length, '100%', '', '', '', '', '', '']);
  tr.font = { name: 'Calibri', size: 10, bold: true };
  tr.alignment = { horizontal: 'center' };
  tr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };

  const stageStart = Object.keys(counts).length + 8;
  ss.getCell(`A${stageStart}`).value = 'STAGE BREAKDOWN';
  ss.mergeCells(`A${stageStart}:I${stageStart}`);
  ss.getCell(`A${stageStart}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: '7C3AED' } };
  ss.getRow(stageStart).height = 26;

  const sHead2 = ss.getRow(stageStart + 1);
  sHead2.values = ['Stage', 'Count', '%', '', '', '', '', '', ''];
  sHead2.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
  sHead2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C3AED' } };
  sHead2.alignment = { horizontal: 'center', vertical: 'middle' };
  sHead2.height = 24;

  const stageCounts = {};
  shipments.forEach(s => { const st = s.shipmentStage || 'Not Set'; stageCounts[st] = (stageCounts[st] || 0) + 1; });
  Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).forEach(([stage, count]) => {
    const r = ss.addRow([stage, count, `${Math.round((count / shipments.length) * 100)}%`, '', '', '', '', '', '']);
    r.alignment = { horizontal: 'center', vertical: 'middle' };
    r.font = { name: 'Calibri', size: 10 };
    r.height = 22;
    if (STAGE_COLORS[stage]) r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_COLORS[stage] } };
  });

  ss.getColumn(1).width = 22;
  ss.getColumn(2).width = 10;
  ss.getColumn(3).width = 10;

  // =============================================
  // SHEET 3: CHA ONLY BILLS
  // =============================================
  if (chaBillCount > 0) {
    const cs = workbook.addWorksheet('CHA Only Bills', { properties: { tabColor: { argb: '16A34A' } } });
    const chaShipments = shipments.filter(s => s.shipmentType === 'CHA Only');

    cs.mergeCells('A1:V1');
    cs.getCell('A1').value = '🛃 CHA ONLY BILLS — DETAILED REPORT';
    cs.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } };
    cs.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '16A34A' } };
    cs.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    cs.getRow(1).height = 32;

    cs.mergeCells('A2:V2');
    cs.getCell('A2').value = `Total CHA Bills: ${chaBillCount}  |  Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
    cs.getCell('A2').font = { name: 'Calibri', size: 9, color: { argb: '6B7280' } };
    cs.getCell('A2').alignment = { horizontal: 'center' };
    cs.getRow(2).height = 20;

    const chaCols = [
      { header: 'Ref No', w: 18 },
      { header: 'Status', w: 16 },
      { header: 'Created By', w: 16 },
      { header: 'Import/Export', w: 13 },
      { header: 'Consignee', w: 22 },
      { header: 'Shipper', w: 22 },
      { header: 'Agent', w: 18 },
      { header: 'HAWB No', w: 17 },
      { header: 'MAWB No', w: 17 },
      { header: 'AWB Date', w: 13 },
      { header: 'Pkgs', w: 7 },
      { header: 'Gross Weight (kg)', w: 15 },
      { header: 'Chargeable Weight (kg)', w: 18 },
      { header: 'Job No', w: 13 },
      { header: 'BOE No', w: 14 },
      { header: 'BOE Date', w: 13 },
      { header: 'DO Date', w: 13 },
      { header: 'OOC Date', w: 13 },
      { header: 'Gate Pass', w: 13 },
      { header: 'Delivery', w: 13 },
      { header: 'Invoice No', w: 15 },
      { header: 'Invoice Date', w: 14 },
      { header: 'Remarks', w: 25 },
    ];

    const cHead = cs.getRow(3);
    cHead.height = 28;
    chaCols.forEach((col, i) => {
      const cell = cHead.getCell(i + 1);
      cell.value = col.header;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '16A34A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    chaShipments.forEach((s, i) => {
      const ff = s.freightForwarding || {};
      const cha = s.cha || {};
      const acc = s.accounts || {};

      const r = cs.addRow([
        s.refNo,
        s.currentStatus?.replace(/_/g, ' '),
        s.createdByName || '',
        s.importExport || '',
        ff.consigneeName || '',
        ff.shipperName || '',
        ff.agent || '',
        ff.hawb || '',
        ff.mawb || '',
        fmt(ff.awbDate),
        ff.noOfPackages || '',
        ff.grossWeight || '',
        ff.weight ? `${ff.weight} kg` : '',
        cha.jobNo || '',
        cha.boeNo || '',
        fmt(cha.boeDate),
        fmt(cha.doCollectionDate),
        fmt(cha.oocDate),
        fmt(cha.gatePassDate),
        fmt(cha.deliveryDate),
        acc.invoiceNumber || '',
        fmt(acc.invoiceDate),
        s.remarks || '',
      ]);

      r.height = 22;
      r.font = { name: 'Calibri', size: 9 };
      r.alignment = { horizontal: 'center', vertical: 'middle' };
      if (i % 2 === 0) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };
      r.getCell(1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: '166534' } };

      r.eachCell(cell => {
        cell.border = { top: { style: 'thin', color: { argb: 'D1D5DB' } }, left: { style: 'thin', color: { argb: 'D1D5DB' } }, bottom: { style: 'thin', color: { argb: 'D1D5DB' } }, right: { style: 'thin', color: { argb: 'D1D5DB' } } };
      });
    });

    chaCols.forEach((col, i) => { cs.getColumn(i + 1).width = col.w; });
    cs.views = [{ state: 'frozen', ySplit: 3 }];
  }

  // =============================================
  // SEND
  // =============================================
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportShipmentsToExcel };