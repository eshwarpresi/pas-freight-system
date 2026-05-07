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
    { header: 'Stage', key: 'stage', width: 16 },
    { header: 'Transport Mode', key: 'mode', width: 16 },
    { header: 'Import/Export', key: 'importExport', width: 14 },
    { header: 'Type', key: 'type', width: 20 },
    { header: 'Consignee', key: 'consignee', width: 24 },
    { header: 'Shipper', key: 'shipper', width: 24 },
    { header: 'Agent', key: 'agent', width: 20 },
    { header: 'From', key: 'from', width: 18 },
    { header: 'To', key: 'to', width: 18 },
    { header: 'Terms', key: 'terms', width: 12 },
    { header: 'Port', key: 'port', width: 16 },
    { header: 'Pkgs', key: 'pkgs', width: 8 },
    { header: 'Weight (kg)', key: 'weight', width: 12 },
    { header: 'CBM', key: 'cbm', width: 10 },
    { header: 'Rate (₹)', key: 'rate', width: 14 },
    { header: 'Booking', key: 'booking', width: 14 },
    { header: 'ETD', key: 'etd', width: 14 },
    { header: 'ETA', key: 'eta', width: 14 },
    { header: 'MAWB', key: 'mawb', width: 16 },
    { header: 'HAWB', key: 'hawb', width: 16 },
    { header: 'AWB Date', key: 'awbDate', width: 13 },
    { header: 'Job No', key: 'jobNo', width: 13 },
    { header: 'BOE No', key: 'boeNo', width: 14 },
    { header: 'BOE Date', key: 'boeDate', width: 13 },
    { header: 'DO Date', key: 'doDate', width: 13 },
    { header: 'OOC Date', key: 'oocDate', width: 13 },
    { header: 'Gate Pass', key: 'gatePass', width: 13 },
    { header: 'Delivery', key: 'delivery', width: 14 },
    { header: 'Tracking No', key: 'tracking', width: 18 },
    { header: 'Invoice No', key: 'invoiceNo', width: 15 },
    { header: 'Invoice Date', key: 'invoiceDate', width: 14 },
    { header: 'Sent Date', key: 'invoiceSent', width: 13 },
    { header: 'Created', key: 'created', width: 14 },
    { header: 'Remarks', key: 'remarks', width: 30 },
  ];
  ws.columns = columns;

  const lastCol = 'AK';
  const colCount = 37;

  // ---- Title ----
  ws.mergeCells(`A1:${lastCol}1`);
  const t1 = ws.getCell('A1');
  t1.value = 'PAS FREIGHT SERVICES PVT LTD';
  t1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: '1E40AF' } };
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  ws.mergeCells(`A2:${lastCol}2`);
  const t2 = ws.getCell('A2');
  t2.value = `Shipment Export Report  |  ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}  |  Total: ${shipments.length}  |  Freight: ${freightShipmentCount}  |  CHA: ${chaBillCount}`;
  t2.font = { name: 'Calibri', size: 10, color: { argb: '6B7280' } };
  t2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  // ---- Headers ----
  const hRow = ws.getRow(3);
  hRow.height = 30;
  columns.forEach((col, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E40AF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: '1E3A8A' } },
      bottom: { style: 'thin', color: { argb: '1E3A8A' } },
      left: { style: 'thin', color: { argb: '1E3A8A' } },
      right: { style: 'thin', color: { argb: '1E3A8A' } }
    };
  });

  // Dropdown for Stage
  ws.dataValidations.add(`C4:C${3 + shipments.length + 500}`, {
    type: 'list', allowBlank: true, formulae: [`"${STAGE_OPTIONS.join(',')}"`],
    showErrorMessage: true, errorTitle: 'Invalid Stage', error: 'Please select a valid Stage.'
  });

  // ---- Data ----
  shipments.forEach((s, i) => {
    const ff = s.freightForwarding || {};
    const cha = s.cha || {};
    const acc = s.accounts || {};
    const isCHA = s.shipmentType === 'CHA Only';

    const row = ws.addRow({
      refNo: s.refNo || '',
      status: s.currentStatus?.replace(/_/g, ' ') || '',
      stage: s.shipmentStage || '',
      mode: isCHA ? '—' : (s.shipmentType || ''),
      importExport: s.importExport || '',
      type: isCHA ? 'CHA Only' : 'Freight',
      consignee: ff.consigneeName || '',
      shipper: ff.shipperName || '',
      agent: ff.agent || '',
      from: ff.fromLocation || '',
      to: ff.toLocation || '',
      terms: ff.terms || '',
      port: ff.portLocation || '',
      pkgs: ff.noOfPackages || '',
      weight: ff.weight ? `${ff.weight} kg` : '',
      cbm: ff.cbm || '',
      rate: ff.sellingRate ? `₹${parseFloat(ff.sellingRate).toLocaleString('en-IN')}` : '',
      booking: fmt(ff.bookingDate),
      etd: fmt(ff.etd),
      eta: fmt(ff.eta),
      mawb: ff.mawb || '',
      hawb: ff.hawb || '',
      awbDate: fmt(ff.awbDate),
      jobNo: cha.jobNo || '',
      boeNo: cha.boeNo || '',
      boeDate: fmt(cha.boeDate),
      doDate: fmt(cha.doCollectionDate),
      oocDate: fmt(cha.oocDate),
      gatePass: fmt(cha.gatePassDate),
      delivery: fmt(cha.deliveryDate),
      tracking: cha.trackingNumber || '',
      invoiceNo: acc.invoiceNumber || '',
      invoiceDate: fmt(acc.invoiceDate),
      invoiceSent: fmt(acc.sendingDate),
      created: fmt(s.createdAt),
      remarks: s.remarks || '',
    });

    row.height = 22;
    row.font = { name: 'Calibri', size: 9 };
    row.alignment = { horizontal: 'center', vertical: 'middle' };

    // Alternating rows
    if (i % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F9FAFB' } };

    // CHA Only - green tint
    if (isCHA) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };

    // Stage color
    if (s.shipmentStage && STAGE_COLORS[s.shipmentStage]) {
      row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_COLORS[s.shipmentStage] } };
    }

    // Ref No bold
    row.getCell(1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: '1E40AF' } };

    // Remarks left align
    row.getCell(37).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    // Borders
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'E5E7EB' } },
        left: { style: 'thin', color: { argb: 'E5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
        right: { style: 'thin', color: { argb: 'E5E7EB' } }
      };
    });
  });

  // Freeze & Filter
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + shipments.length, column: colCount } };
  ws.views = [{ state: 'frozen', ySplit: 3 }];

  // Footer
  const fr = ws.addRow(['']);
  ws.mergeCells(`A${fr.number}:${lastCol}${fr.number}`);
  ws.getCell(`A${fr.number}`).value = `© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd  |  Confidential`;
  ws.getCell(`A${fr.number}`).font = { name: 'Calibri', size: 8, italic: true, color: { argb: '9CA3AF' } };
  ws.getCell(`A${fr.number}`).alignment = { horizontal: 'center' };

  // =============================================
  // SHEET 2: SUMMARY DASHBOARD
  // =============================================
  const ss = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: '059669' } } });

  // ---- Top Cards Row ----
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

  // ---- Status Breakdown ----
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
  sHead.getCell(1).border = { top: { style: 'thin', color: { argb: '1E3A8A' } }, bottom: { style: 'thin', color: { argb: '1E3A8A' } }, left: { style: 'thin', color: { argb: '1E3A8A' } }, right: { style: 'thin', color: { argb: '1E3A8A' } } };

  const counts = {};
  shipments.forEach(s => { const st = s.currentStatus?.replace(/_/g, ' ') || 'Unknown'; counts[st] = (counts[st] || 0) + 1; });
  const sortedStatuses = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  sortedStatuses.forEach(([status, count]) => {
    const r = ss.addRow([status, count, `${Math.round((count / shipments.length) * 100)}%`, '', '', '', '', '', '']);
    r.alignment = { horizontal: 'center', vertical: 'middle' };
    r.font = { name: 'Calibri', size: 10 };
    r.height = 22;
  });
  const tr = ss.addRow(['TOTAL', shipments.length, '100%', '', '', '', '', '', '']);
  tr.font = { name: 'Calibri', size: 10, bold: true };
  tr.alignment = { horizontal: 'center' };
  tr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };

  // ---- Stage Breakdown ----
  const stageStart = sortedStatuses.length + 8;
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
  // SHEET 3: CHA ONLY BILLS (detailed)
  // =============================================
  if (chaBillCount > 0) {
    const cs = workbook.addWorksheet('CHA Only Bills', { properties: { tabColor: { argb: '16A34A' } } });
    const chaShipments = shipments.filter(s => s.shipmentType === 'CHA Only');

    // Title
    cs.mergeCells('A1:P1');
    const ct = cs.getCell('A1');
    ct.value = '🛃 CHA ONLY BILLS — DETAILED REPORT';
    ct.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } };
    ct.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '16A34A' } };
    ct.alignment = { horizontal: 'center', vertical: 'middle' };
    cs.getRow(1).height = 32;

    cs.mergeCells('A2:P2');
    cs.getCell('A2').value = `Total CHA Bills: ${chaBillCount}  |  Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
    cs.getCell('A2').font = { name: 'Calibri', size: 9, color: { argb: '6B7280' } };
    cs.getCell('A2').alignment = { horizontal: 'center' };
    cs.getRow(2).height = 20;

    const chaCols = [
      { header: 'Ref No', key: 'ref', width: 18 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Import/Export', key: 'ie', width: 13 },
      { header: 'Consignee', key: 'con', width: 22 },
      { header: 'Shipper', key: 'ship', width: 22 },
      { header: 'Agent', key: 'agt', width: 18 },
      { header: 'HAWB No', key: 'hawb', width: 17 },
      { header: 'MAWB No', key: 'mawb', width: 17 },
      { header: 'AWB Date', key: 'awbd', width: 13 },
      { header: 'Pkgs', key: 'pkgs', width: 7 },
      { header: 'Weight (kg)', key: 'wt', width: 12 },
      { header: 'Job No', key: 'job', width: 13 },
      { header: 'BOE No', key: 'boe', width: 14 },
      { header: 'BOE Date', key: 'boed', width: 13 },
      { header: 'DO Date', key: 'dod', width: 13 },
      { header: 'OOC Date', key: 'ooc', width: 13 },
      { header: 'Gate Pass', key: 'gp', width: 13 },
      { header: 'Delivery', key: 'del', width: 13 },
      { header: 'Invoice No', key: 'inv', width: 15 },
      { header: 'Invoice Date', key: 'invd', width: 14 },
      { header: 'Remarks', key: 'rem', width: 25 },
    ];

    const cHead = cs.getRow(3);
    cHead.height = 28;
    chaCols.forEach((col, i) => {
      const cell = cHead.getCell(i + 1);
      cell.value = col.header;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '16A34A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin', color: { argb: '15803D' } }, bottom: { style: 'thin', color: { argb: '15803D' } }, left: { style: 'thin', color: { argb: '15803D' } }, right: { style: 'thin', color: { argb: '15803D' } } };
    });

    chaShipments.forEach((s, i) => {
      const ff = s.freightForwarding || {};
      const cha = s.cha || {};
      const acc = s.accounts || {};

      const r = cs.addRow([
        s.refNo,
        s.currentStatus?.replace(/_/g, ' '),
        s.importExport || '',
        ff.consigneeName || '',
        ff.shipperName || '',
        ff.agent || '',
        ff.hawb || '',
        ff.mawb || '',
        fmt(ff.awbDate),
        ff.noOfPackages || '',
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

    cs.getColumn(1).width = 18;
    chaCols.forEach((col, i) => { if (col.width) cs.getColumn(i + 1).width = col.width; });
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