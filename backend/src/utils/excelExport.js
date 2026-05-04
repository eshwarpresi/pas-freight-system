const ExcelJS = require('exceljs');
const path = require('path');

async function exportShipmentsToExcel(shipments, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PAS Freight Services Pvt Ltd';
  workbook.created = new Date();

  const STAGE_OPTIONS = ['Draft', 'Created', 'Confirmed', 'Booked', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold'];
  const STAGE_COLORS = { 'Draft': 'E5E7EB', 'Created': 'DBEAFE', 'Confirmed': 'FEF3C7', 'Booked': 'DDD6FE', 'Scheduled': 'CFFAFE', 'In Progress': 'FEF9C3', 'Completed': 'DCFCE7', 'Cancelled': 'FEE2E2', 'On Hold': 'FED7AA' };

  const ws = workbook.addWorksheet('Shipments', {
    properties: { tabColor: { argb: '1E40AF' } },
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  const columns = [
    { header: 'Ref No', key: 'refNo', width: 18 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Stage', key: 'shipmentStage', width: 16 },
    { header: 'Consignee', key: 'consignee', width: 24 },
    { header: 'Shipper', key: 'shipper', width: 24 },
    { header: 'From', key: 'fromLocation', width: 18 },
    { header: 'To', key: 'toLocation', width: 18 },
    { header: 'Terms', key: 'terms', width: 18 },
    { header: 'Agent', key: 'agent', width: 18 },
    { header: 'Pkgs', key: 'packages', width: 7 },
    { header: 'Weight (kg)', key: 'weight', width: 12 },
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

  const lastCol = 'AC';
  const colCount = 29;

  // Row 1: Title
  ws.insertRow(1, ['PAS FREIGHT SERVICES PVT LTD - SHIPMENT REPORT']);
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: '1E40AF' } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 35;

  // Row 2: Generated date + Total shipments
  ws.insertRow(2, [`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}     |     Total Shipments: ${shipments.length}`]);
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
    const row = ws.addRow({
      refNo: s.refNo,
      status: s.currentStatus?.replace(/_/g, ' ') || '',
      shipmentStage: s.shipmentStage || '',
      consignee: ff.consigneeName || '',
      shipper: ff.shipperName || '',
      fromLocation: ff.fromLocation || '',
      toLocation: ff.toLocation || '',
      terms: ff.terms || '',
      agent: ff.agent || '',
      packages: ff.noOfPackages || '',
      weight: ff.weight || '',
      rate: ff.sellingRate ? `$${parseFloat(ff.sellingRate).toLocaleString()}` : '',
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

    const remCell = row.getCell(29);
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

  const ss = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: '059669' } } });
  ss.columns = [{ header: 'Status', key: 'status', width: 28 }, { header: 'Count', key: 'count', width: 12 }, { header: 'Percentage', key: 'pct', width: 15 }];
  ss.insertRow(1, ['SHIPMENT SUMMARY']); ss.mergeCells('A1:C1');
  ss.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: '059669' } }; ss.getCell('A1').alignment = { horizontal: 'center' };
  ss.getRow(1).height = 28;
  const sh = ss.getRow(2); sh.values = ['Status', 'Count', 'Percentage'];
  sh.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  sh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } };
  sh.alignment = { horizontal: 'center', vertical: 'middle' }; sh.height = 26;
  const counts = {}; shipments.forEach(s => { const st = s.currentStatus?.replace(/_/g, ' ') || 'Unknown'; counts[st] = (counts[st] || 0) + 1; });
  Object.entries(counts).forEach(([s, c]) => { const r = ss.addRow({ status: s, count: c, pct: `${Math.round((c / shipments.length) * 100)}%` }); r.alignment = { horizontal: 'center', vertical: 'middle' }; r.font = { name: 'Arial', size: 10 }; });
  const totalRow = ss.addRow({ status: 'TOTAL', count: shipments.length, pct: '100%' });
  totalRow.font = { name: 'Arial', size: 10, bold: true }; totalRow.alignment = { horizontal: 'center' };
  ss.addRow([]); ss.addRow(['STAGE SUMMARY', '', '']).font = { name: 'Arial', size: 12, bold: true, color: { argb: '7C3AED' } };
  const stageCounts = {}; shipments.forEach(s => { const st = s.shipmentStage || 'Not Set'; stageCounts[st] = (stageCounts[st] || 0) + 1; });
  Object.entries(stageCounts).forEach(([stage, count]) => { const r = ss.addRow({ status: stage, count, pct: `${Math.round((count / shipments.length) * 100)}%` }); r.alignment = { horizontal: 'center' }; r.font = { name: 'Arial', size: 10 }; if (STAGE_COLORS[stage]) r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_COLORS[stage] } }; });
  ss.getColumn(1).width = 28; ss.getColumn(2).width = 12; ss.getColumn(3).width = 15;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportShipmentsToExcel };