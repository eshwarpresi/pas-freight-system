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
    { header: 'Stage', key: 'shipmentStage', width: 18 },
    { header: 'Consignee', key: 'consignee', width: 25 },
    { header: 'Shipper', key: 'shipper', width: 25 },
    { header: 'From', key: 'fromLocation', width: 22 },
    { header: 'To', key: 'toLocation', width: 22 },
    { header: 'Agent', key: 'agent', width: 22 },
    { header: 'Pkgs', key: 'packages', width: 8 },
    { header: 'Weight (kg)', key: 'weight', width: 14 },
    { header: 'Selling Rate', key: 'rate', width: 15 },
    { header: 'Booking Date', key: 'booking', width: 16 },
    { header: 'ETD', key: 'etd', width: 14 },
    { header: 'ETA', key: 'eta', width: 14 },
    { header: 'MAWB/MBL', key: 'mawb', width: 18 },
    { header: 'HAWB/HBL', key: 'hawb', width: 18 },
    { header: 'Job No', key: 'jobNo', width: 14 },
    { header: 'BOE No', key: 'boeNo', width: 14 },
    { header: 'DO Collection', key: 'doDate', width: 16 },
    { header: 'OOC Date', key: 'oocDate', width: 14 },
    { header: 'Gate Pass', key: 'gatePass', width: 14 },
    { header: 'Delivery Date', key: 'delivery', width: 16 },
    { header: 'Tracking No', key: 'tracking', width: 18 },
    { header: 'Invoice No', key: 'invoiceNo', width: 18 },
    { header: 'Invoice Date', key: 'invoiceDate', width: 16 },
    { header: 'Invoice Sent', key: 'invoiceSent', width: 16 },
    { header: 'Created', key: 'createdAt', width: 16 },
    { header: 'Remarks', key: 'remarks', width: 35 },
  ];
  ws.columns = columns;

  const lastCol = 'AB';
  const colCount = 28;

  // Row 1: Title (simple, clean - like old format)
  ws.insertRow(1, ['PAS FREIGHT SERVICES PVT LTD - SHIPMENT REPORT']);
  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell('A1');
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: '1E40AF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 35;

  // Row 2: Date
  ws.insertRow(2, [`Generated: ${new Date().toLocaleDateString()}`]);
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell('A2').font = { size: 10, color: { argb: '666666' } };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  // Row 3: Header
  const headerRow = ws.getRow(3);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11, name: 'Arial' };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E40AF' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 30;

  // Dropdown for Stage column (column C = 3)
  const dataStartRow = 4;
  const dataEndRow = 3 + shipments.length + 500;
  ws.dataValidations.add(`C${dataStartRow}:C${dataEndRow}`, {
    type: 'list', allowBlank: true, formulae: [`"${STAGE_OPTIONS.join(',')}"`],
    showErrorMessage: true, errorTitle: 'Invalid Stage', error: 'Please select a valid Shipment Stage.'
  });

  // Data rows
  shipments.forEach((s, index) => {
    const ff = s.freightForwarding || {}; const cha = s.cha || {}; const acc = s.accounts || {};
    const rowData = {
      refNo: s.refNo,
      status: s.currentStatus?.replace(/_/g, ' ') || '',
      shipmentStage: s.shipmentStage || '',
      consignee: ff.consigneeName || '',
      shipper: ff.shipperName || '',
      fromLocation: ff.fromLocation || '',
      toLocation: ff.toLocation || '',
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
      remarks: s.remarks || '',
    };

    const row = ws.addRow(rowData);
    row.alignment = { horizontal: 'center', vertical: 'middle' };

    // Alternating row colors (subtle - like old format)
    if (index % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
    }

    // Color the Stage cell
    const stageCell = row.getCell(3);
    if (s.shipmentStage && STAGE_COLORS[s.shipmentStage]) {
      stageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_COLORS[s.shipmentStage] } };
      stageCell.font = { bold: true, size: 9 };
    }

    // Remarks left-aligned
    const remCell = row.getCell(28);
    remCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    // Bold Ref No
    row.getCell(1).font = { bold: true, color: { argb: '1E40AF' }, size: 9 };

    // Borders
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } }
      };
    });
  });

  // Auto-filter & Freeze
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + shipments.length, column: colCount } };
  ws.views = [{ state: 'frozen', ySplit: 3 }];

  // Footer
  const fr = ws.addRow(['']);
  ws.mergeCells(`A${fr.number}:${lastCol}${fr.number}`);
  ws.getCell(`A${fr.number}`).value = `© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd | Confidential`;
  ws.getCell(`A${fr.number}`).font = { size: 8, italic: true, color: { argb: '94A3B8' } };
  ws.getCell(`A${fr.number}`).alignment = { horizontal: 'center' };

  // Logo
  try {
    const fs = require('fs'); let lp = path.join(__dirname, '..', 'logo.webp'), ext = 'webp';
    if (!fs.existsSync(lp)) { lp = path.join(__dirname, '..', 'logo.png'); ext = 'png'; }
    if (fs.existsSync(lp)) { const id = workbook.addImage({ filename: lp, extension: ext }); ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 45 } }); }
  } catch (e) {}

  // ========== SUMMARY SHEET ==========
  const ss = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: '059669' } } });
  ss.columns = [{ header: 'Status', key: 'status', width: 25 }, { header: 'Count', key: 'count', width: 15 }, { header: 'Percentage', key: 'pct', width: 15 }];
  ss.insertRow(1, ['SHIPMENT SUMMARY']); ss.mergeCells('A1:C1');
  ss.getCell('A1').font = { size: 14, bold: true, color: { argb: '059669' } }; ss.getCell('A1').alignment = { horizontal: 'center' };
  const sh = ss.getRow(2); sh.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 }; sh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } }; sh.alignment = { horizontal: 'center' };
  const counts = {}; shipments.forEach(s => { const st = s.currentStatus?.replace(/_/g, ' ') || 'Unknown'; counts[st] = (counts[st] || 0) + 1; });
  Object.entries(counts).forEach(([s, c]) => ss.addRow({ status: s, count: c, pct: `${Math.round((c / shipments.length) * 100)}%` }));
  ss.addRow({ status: 'TOTAL', count: shipments.length, pct: '100%' }).font = { bold: true };
  ss.addRow([]); ss.addRow(['STAGE SUMMARY', '', '']).font = { bold: true, size: 12, color: { argb: '7C3AED' } };
  const stageCounts = {}; shipments.forEach(s => { const st = s.shipmentStage || 'Not Set'; stageCounts[st] = (stageCounts[st] || 0) + 1; });
  Object.entries(stageCounts).forEach(([stage, count]) => ss.addRow({ status: stage, count, pct: `${Math.round((count / shipments.length) * 100)}%` }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportShipmentsToExcel };