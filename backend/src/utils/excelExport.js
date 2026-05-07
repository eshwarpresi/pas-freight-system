const ExcelJS = require('exceljs');
const path = require('path');

async function exportShipmentsToExcel(shipments, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PAS Freight Services Pvt Ltd';
  workbook.created = new Date();

  const STAGE_OPTIONS = ['Draft', 'Created', 'Confirmed', 'Booked', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold'];
  const STAGE_COLORS = { 'Draft': 'E5E7EB', 'Created': 'DBEAFE', 'Confirmed': 'FEF3C7', 'Booked': 'DDD6FE', 'Scheduled': 'CFFAFE', 'In Progress': 'FEF9C3', 'Completed': 'DCFCE7', 'Cancelled': 'FEE2E2', 'On Hold': 'FED7AA' };

  // =============================================
  // SHEET 1: SHIPMENTS - All details
  // =============================================
  const ws = workbook.addWorksheet('Shipments', {
    properties: { tabColor: { argb: '1E40AF' } },
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  const columns = [
    // BASIC INFO
    { header: 'Ref No', key: 'refNo', width: 18 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Stage', key: 'shipmentStage', width: 16 },
    { header: 'Transport Mode', key: 'mode', width: 16 },
    { header: 'Import / Export', key: 'importExport', width: 16 },
    { header: 'Shipment Type', key: 'shipmentType', width: 16 },
    // PARTIES
    { header: 'Consignee', key: 'consignee', width: 24 },
    { header: 'Shipper', key: 'shipper', width: 24 },
    { header: 'Agent / Forwarder', key: 'agent', width: 20 },
    // ROUTE
    { header: 'From', key: 'fromLocation', width: 18 },
    { header: 'To', key: 'toLocation', width: 18 },
    { header: 'Terms', key: 'terms', width: 14 },
    { header: 'Port Location', key: 'portLocation', width: 16 },
    // CARGO
    { header: 'No of Pkgs', key: 'packages', width: 10 },
    { header: 'Weight (kg)', key: 'weight', width: 12 },
    { header: 'CBM', key: 'cbm', width: 10 },
    { header: 'Selling Rate (₹)', key: 'rate', width: 16 },
    // FREIGHT DATES
    { header: 'Enquiry Date', key: 'enquiryDate', width: 15 },
    { header: 'Booking Date', key: 'booking', width: 15 },
    { header: 'ETD', key: 'etd', width: 14 },
    { header: 'ETA', key: 'eta', width: 14 },
    // AWB
    { header: 'MAWB / MBL', key: 'mawb', width: 17 },
    { header: 'HAWB / HBL', key: 'hawb', width: 17 },
    { header: 'AWB Date', key: 'awbDate', width: 14 },
    // CHA / CUSTOMS
    { header: 'Job No', key: 'jobNo', width: 14 },
    { header: 'Checklist Date', key: 'checklistDate', width: 15 },
    { header: 'BOE No', key: 'boeNo', width: 14 },
    { header: 'BOE Date', key: 'boeDate', width: 14 },
    { header: 'DO Collection Date', key: 'doDate', width: 18 },
    { header: 'OOC Date', key: 'oocDate', width: 14 },
    { header: 'Gate Pass Date', key: 'gatePass', width: 16 },
    { header: 'Delivery Date', key: 'delivery', width: 16 },
    { header: 'Tracking No', key: 'tracking', width: 20 },
    // ACCOUNTS
    { header: 'Invoice No', key: 'invoiceNo', width: 16 },
    { header: 'Invoice Date', key: 'invoiceDate', width: 15 },
    { header: 'Invoice Sent Date', key: 'invoiceSent', width: 17 },
    // META
    { header: 'Created Date', key: 'createdAt', width: 15 },
    { header: 'Remarks', key: 'remarks', width: 35 },
  ];
  ws.columns = columns;

  const lastCol = 'AN';
  const colCount = 40;

  // ---- Row 1: Title ----
  ws.insertRow(1, ['PAS FREIGHT SERVICES PVT LTD']);
  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = '🚢 PAS FREIGHT SERVICES PVT LTD — SHIPMENT EXPORT REPORT';
  titleCell.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E40AF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 42;

  // ---- Row 2: Meta info ----
  ws.insertRow(2, ['']);
  ws.mergeCells(`A2:${lastCol}2`);
  const metaCell = ws.getCell('A2');
  const chaCount = shipments.filter(s => s.shipmentType === 'CHA Only').length;
  const freightCount = shipments.length - chaCount;
  metaCell.value = `Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}   |   Total Shipments: ${shipments.length}   |   Freight: ${freightCount}   |   CHA Only: ${chaCount}`;
  metaCell.font = { name: 'Arial', size: 10, color: { argb: '4B5563' } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F4FF' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 26;

  // ---- Row 3: Column Headers ----
  const headerRow = ws.getRow(3);
  headerRow.height = 34;
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: '1E3A8A' } },
      bottom: { style: 'medium', color: { argb: '1E3A8A' } },
      left: { style: 'thin', color: { argb: '1E40AF' } },
      right: { style: 'thin', color: { argb: '1E40AF' } }
    };
  });

  // Dropdown for Stage column (C = 3)
  ws.dataValidations.add(`C4:C${3 + shipments.length + 500}`, {
    type: 'list', allowBlank: true, formulae: [`"${STAGE_OPTIONS.join(',')}"`],
    showErrorMessage: true, errorTitle: 'Invalid Stage', error: 'Please select a valid Shipment Stage.'
  });

  // ---- Data Rows ----
  shipments.forEach((s, index) => {
    const ff = s.freightForwarding || {}; 
    const cha = s.cha || {}; 
    const acc = s.accounts || {};
    const isCHA = s.shipmentType === 'CHA Only';
    
    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

    const row = ws.addRow({
      refNo: s.refNo || '',
      status: s.currentStatus?.replace(/_/g, ' ') || '',
      shipmentStage: s.shipmentStage || '',
      mode: s.shipmentType === 'CHA Only' ? '' : (s.shipmentType || ''),
      importExport: s.importExport || '',
      shipmentType: isCHA ? 'CHA Only (Customs)' : 'Freight Shipment',
      consignee: ff.consigneeName || '',
      shipper: ff.shipperName || '',
      agent: ff.agent || '',
      fromLocation: ff.fromLocation || '',
      toLocation: ff.toLocation || '',
      terms: ff.terms || '',
      portLocation: ff.portLocation || '',
      packages: ff.noOfPackages || '',
      weight: ff.weight ? `${ff.weight} kg` : '',
      cbm: ff.cbm || '',
      rate: ff.sellingRate ? `₹${parseFloat(ff.sellingRate).toLocaleString('en-IN')}` : '',
      enquiryDate: fmt(ff.enquiryDate),
      booking: fmt(ff.bookingDate),
      etd: fmt(ff.etd),
      eta: fmt(ff.eta),
      mawb: ff.mawb || '',
      hawb: ff.hawb || '',
      awbDate: fmt(ff.awbDate),
      jobNo: cha.jobNo || '',
      checklistDate: fmt(cha.checklistDate),
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
      createdAt: fmt(s.createdAt),
      remarks: s.remarks || '',
    });

    row.height = 24;
    row.alignment = { horizontal: 'center', vertical: 'middle' };
    row.font = { name: 'Arial', size: 9 };

    // Alternating row colors
    if (index % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
    }

    // CHA Only rows - green tint
    if (isCHA) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };
      // Bold the Shipment Type column
      const typeCell = row.getCell(6);
      typeCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '166534' } };
    }

    // Stage column coloring
    const stageCell = row.getCell(3);
    if (s.shipmentStage && STAGE_COLORS[s.shipmentStage]) {
      stageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_COLORS[s.shipmentStage] } };
      stageCell.font = { name: 'Arial', size: 9, bold: true };
    }

    // Status badge coloring
    const statusCell = row.getCell(2);
    const statusColors = {
      'DELIVERED': 'DCFCE7', 'INVOICE SENT': 'FFE4E6', 'INVOICE GENERATED': 'FFF7ED',
      'ENQUIRY': 'FEF3C7', 'BOOKED': 'E0E7FF', 'CHECKLIST APPROVED': 'D1FAE5'
    };
    if (statusColors[s.currentStatus?.replace(/_/g, ' ')]) {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors[s.currentStatus.replace(/_/g, ' ')] } };
    }

    // Remarks - left aligned
    row.getCell(40).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    // Ref No - bold blue
    row.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: '1E40AF' } };

    // Borders
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'D1D5DB' } },
        left: { style: 'thin', color: { argb: 'D1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
        right: { style: 'thin', color: { argb: 'D1D5DB' } }
      };
    });
  });

  // ---- Filters & Freeze ----
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + shipments.length, column: colCount } };
  ws.views = [{ state: 'frozen', ySplit: 3 }];

  // ---- Footer ----
  const footerRow = ws.addRow(['']);
  ws.mergeCells(`A${footerRow.number}:${lastCol}${footerRow.number}`);
  ws.getCell(`A${footerRow.number}`).value = `© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd | Confidential | Auto-generated Report`;
  ws.getCell(`A${footerRow.number}`).font = { name: 'Arial', size: 8, italic: true, color: { argb: '94A3B8' } };
  ws.getCell(`A${footerRow.number}`).alignment = { horizontal: 'center' };

  // Logo
  try {
    const fs = require('fs'); let lp = path.join(__dirname, '..', 'logo.webp'), ext = 'webp';
    if (!fs.existsSync(lp)) { lp = path.join(__dirname, '..', 'logo.png'); ext = 'png'; }
    if (fs.existsSync(lp)) { const id = workbook.addImage({ filename: lp, extension: ext }); ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 90, height: 50 } }); }
  } catch (e) {}

  // =============================================
  // SHEET 2: SUMMARY
  // =============================================
  const ss = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: '059669' } } });
  
  // Title
  ss.mergeCells('A1:F1');
  const ssTitle = ss.getCell('A1');
  ssTitle.value = '📊 SHIPMENT SUMMARY';
  ssTitle.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFF' } };
  ssTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } };
  ssTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  ss.getRow(1).height = 36;

  // Status Breakdown
  ss.getCell('A3').value = 'STATUS BREAKDOWN';
  ss.mergeCells('A3:C3');
  ss.getCell('A3').font = { name: 'Arial', size: 12, bold: true, color: { argb: '059669' } };
  ss.getRow(3).height = 24;

  const statusHeaders = ss.getRow(4);
  statusHeaders.values = ['Status', 'Count', 'Percentage'];
  statusHeaders.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  statusHeaders.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } };
  statusHeaders.alignment = { horizontal: 'center', vertical: 'middle' };
  statusHeaders.height = 26;

  const counts = {};
  shipments.forEach(s => { const st = s.currentStatus?.replace(/_/g, ' ') || 'Unknown'; counts[st] = (counts[st] || 0) + 1; });
  const sortedStatuses = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  sortedStatuses.forEach(([status, count]) => {
    const r = ss.addRow({ status, count, pct: shipments.length > 0 ? `${Math.round((count / shipments.length) * 100)}%` : '0%' });
    r.alignment = { horizontal: 'center', vertical: 'middle' };
    r.font = { name: 'Arial', size: 10 };
  });
  const totalRow = ss.addRow({ status: 'TOTAL', count: shipments.length, pct: '100%' });
  totalRow.font = { name: 'Arial', size: 10, bold: true };
  totalRow.alignment = { horizontal: 'center' };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };

  // Stage Breakdown
  const stageStartRow = sortedStatuses.length + 7;
  ss.getCell(`A${stageStartRow}`).value = 'STAGE BREAKDOWN';
  ss.mergeCells(`A${stageStartRow}:C${stageStartRow}`);
  ss.getCell(`A${stageStartRow}`).font = { name: 'Arial', size: 12, bold: true, color: { argb: '7C3AED' } };
  ss.getRow(stageStartRow).height = 24;

  const sh2 = ss.getRow(stageStartRow + 1);
  sh2.values = ['Stage', 'Count', 'Percentage'];
  sh2.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  sh2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C3AED' } };
  sh2.alignment = { horizontal: 'center', vertical: 'middle' };
  sh2.height = 26;

  const stageCounts = {};
  shipments.forEach(s => { const st = s.shipmentStage || 'Not Set'; stageCounts[st] = (stageCounts[st] || 0) + 1; });
  Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).forEach(([stage, count]) => {
    const r = ss.addRow({ status: stage, count, pct: shipments.length > 0 ? `${Math.round((count / shipments.length) * 100)}%` : '0%' });
    r.alignment = { horizontal: 'center' };
    r.font = { name: 'Arial', size: 10 };
    if (STAGE_COLORS[stage]) r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_COLORS[stage] } };
  });

  // Type Breakdown (Freight vs CHA)
  const typeStartRow = stageStartRow + Object.keys(stageCounts).length + 4;
  ss.getCell(`A${typeStartRow}`).value = 'SHIPMENT TYPE BREAKDOWN';
  ss.mergeCells(`A${typeStartRow}:C${typeStartRow}`);
  ss.getCell(`A${typeStartRow}`).font = { name: 'Arial', size: 12, bold: true, color: { argb: '1E40AF' } };
  ss.getRow(typeStartRow).height = 24;

  const thRow = ss.getRow(typeStartRow + 1);
  thRow.values = ['Type', 'Count', 'Percentage'];
  thRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  thRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E40AF' } };
  thRow.alignment = { horizontal: 'center', vertical: 'middle' };
  thRow.height = 26;

  const freightCount = shipments.filter(s => s.shipmentType !== 'CHA Only').length;
  const chaBillCount = shipments.filter(s => s.shipmentType === 'CHA Only').length;
  
  const frRow = ss.addRow({ status: 'Freight Shipments', count: freightCount, pct: shipments.length > 0 ? `${Math.round((freightCount / shipments.length) * 100)}%` : '0%' });
  frRow.alignment = { horizontal: 'center' }; frRow.font = { name: 'Arial', size: 10 };
  frRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DBEAFE' } };
  
  const chRow = ss.addRow({ status: 'CHA Only Bills', count: chaBillCount, pct: shipments.length > 0 ? `${Math.round((chaBillCount / shipments.length) * 100)}%` : '0%' });
  chRow.alignment = { horizontal: 'center' }; chRow.font = { name: 'Arial', size: 10 };
  chRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCFCE7' } };

  // Column widths
  ss.getColumn(1).width = 28;
  ss.getColumn(2).width = 14;
  ss.getColumn(3).width = 16;
  ss.getColumn(4).width = 10;
  ss.getColumn(5).width = 10;
  ss.getColumn(6).width = 10;

  // =============================================
  // SHEET 3: CHA ONLY SUMMARY (if any exist)
  // =============================================
  if (chaBillCount > 0) {
    const cs = workbook.addWorksheet('CHA Only Bills', { properties: { tabColor: { argb: '16A34A' } } });
    
    cs.mergeCells('A1:G1');
    cs.getCell('A1').value = '🛃 CHA ONLY BILLS';
    cs.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFF' } };
    cs.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '16A34A' } };
    cs.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    cs.getRow(1).height = 36;

    const chaHeaders = ['Ref No', 'Consignee', 'Shipper', 'Agent', 'HAWB', 'MAWB', 'Status'];
    const chaRow = cs.getRow(3);
    chaHeaders.forEach((h, i) => {
      chaRow.getCell(i + 1).value = h;
      chaRow.getCell(i + 1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
      chaRow.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '16A34A' } };
      chaRow.getCell(i + 1).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    chaRow.height = 26;

    const chaShipments = shipments.filter(s => s.shipmentType === 'CHA Only');
    chaShipments.forEach((s, i) => {
      const ff = s.freightForwarding || {};
      const r = cs.addRow([s.refNo, ff.consigneeName || '', ff.shipperName || '', ff.agent || '', ff.hawb || '', ff.mawb || '', s.currentStatus?.replace(/_/g, ' ') || '']);
      r.alignment = { horizontal: 'center', vertical: 'middle' };
      r.font = { name: 'Arial', size: 10 };
      if (i % 2 === 0) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };
    });

    cs.getColumn(1).width = 18;
    cs.getColumn(2).width = 24;
    cs.getColumn(3).width = 24;
    cs.getColumn(4).width = 20;
    cs.getColumn(5).width = 18;
    cs.getColumn(6).width = 18;
    cs.getColumn(7).width = 20;
    cs.views = [{ state: 'frozen', ySplit: 3 }];
  }

  // =============================================
  // SEND FILE
  // =============================================
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportShipmentsToExcel };