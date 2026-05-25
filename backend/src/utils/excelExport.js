const ExcelJS = require('exceljs');
const path = require('path');

async function exportShipmentsToExcel(shipments, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PAS Freight Services Pvt Ltd';
  workbook.created = new Date();

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const num = (v) => (v !== null && v !== undefined && v !== '') ? Number(v) : null;

  const freightShipments = shipments.filter(s => s.shipmentType !== 'CHA Only' && s.shipmentType !== 'Transport');
  const chaImportShipments = shipments.filter(s => s.shipmentType === 'CHA Only' && s.importExport !== 'Export');
  const chaExportShipments = shipments.filter(s => s.shipmentType === 'CHA Only' && s.importExport === 'Export');
  const transportShipments = shipments.filter(s => s.shipmentType === 'Transport');

  const allColumns = [
    { header: 'SL No', key: 'slNo', width: 7 }, { header: 'Ref No', key: 'refNo', width: 18 }, { header: 'Status', key: 'status', width: 16 },
    { header: 'Stage', key: 'shipmentStage', width: 14 }, { header: 'Type', key: 'mode', width: 14 }, { header: 'I/E', key: 'importExport', width: 10 },
    { header: 'Created By', key: 'createdBy', width: 16 }, { header: 'Consignee/Customer', key: 'customer', width: 22 },
    { header: 'Shipper', key: 'shipper', width: 22 }, { header: 'Agent', key: 'agent', width: 18 },
    { header: 'From', key: 'fromLocation', width: 18 }, { header: 'To', key: 'toLocation', width: 18 },
    { header: 'Pkgs', key: 'packages', width: 8 }, { header: 'Gross Wt', key: 'grossWeight', width: 12 },
    { header: 'Chg Wt', key: 'weight', width: 12 }, { header: 'CBM', key: 'cbm', width: 10 }, { header: 'Rate', key: 'rate', width: 12 },
    { header: 'Vehicle', key: 'vehicleType', width: 12 }, { header: 'Containers', key: 'containers', width: 10 },
    { header: 'Package Type', key: 'packageType', width: 18 }, { header: 'Delivery Date', key: 'deliveryDate', width: 14 },
    { header: 'Terms', key: 'terms', width: 12 }, { header: 'Port', key: 'portLocation', width: 14 },
    { header: 'Booking', key: 'booking', width: 14 }, { header: 'ETD', key: 'etd', width: 14 }, { header: 'ETA', key: 'eta', width: 14 },
    { header: 'MAWB', key: 'mawb', width: 16 }, { header: 'HAWB', key: 'hawb', width: 16 }, { header: 'AWB Date', key: 'awbDate', width: 14 },
    { header: 'Job No', key: 'jobNo', width: 12 }, { header: 'SB No', key: 'sbNo', width: 14 }, { header: 'SB Date', key: 'sbDate', width: 14 },
    { header: 'BOE No', key: 'boeNo', width: 14 }, { header: 'BOE Date', key: 'boeDate', width: 14 },
    { header: 'DO Date', key: 'doDate', width: 14 }, { header: 'OOC Date', key: 'oocDate', width: 14 },
    { header: 'LEO Date', key: 'leoDate', width: 14 }, { header: 'Gate Pass', key: 'gatePass', width: 14 },
    { header: 'Hand Over', key: 'handOverDate', width: 14 }, { header: 'Delivery', key: 'delivery', width: 14 },
    { header: 'Tracking', key: 'tracking', width: 18 }, { header: 'Invoice No', key: 'invoiceNo', width: 16 },
    { header: 'Inv Date', key: 'invoiceDate', width: 14 }, { header: 'Inv Sent', key: 'invoiceSent', width: 14 },
    { header: 'Created', key: 'createdAt', width: 14 }, { header: 'Remarks', key: 'remarks', width: 25 },
  ];

  const freightColumns = allColumns.filter(c => !['sbNo','sbDate','leoDate','handOverDate','vehicleType','containers','packageType','deliveryDate'].includes(c.key));

  const chaImportCols = [
    { header: 'SL No', key: 'slNo', width: 7 }, { header: 'Ref No', key: 'refNo', width: 18 }, { header: 'Status', key: 'status', width: 16 },
    { header: 'Stage', key: 'shipmentStage', width: 14 }, { header: 'I/E', key: 'importExport', width: 10 }, { header: 'Created By', key: 'createdBy', width: 16 },
    { header: 'Consignee', key: 'customer', width: 24 }, { header: 'Shipper', key: 'shipper', width: 24 }, { header: 'Agent', key: 'agent', width: 18 },
    { header: 'HAWB', key: 'hawb', width: 16 }, { header: 'MAWB', key: 'mawb', width: 16 }, { header: 'AWB Date', key: 'awbDate', width: 14 },
    { header: 'Pkgs', key: 'packages', width: 8 }, { header: 'Gross Wt', key: 'grossWeight', width: 12 }, { header: 'Chg Wt', key: 'weight', width: 12 },
    { header: 'Job No', key: 'jobNo', width: 12 }, { header: 'Checklist Date', key: 'checklistDate', width: 14 }, { header: 'Approval Date', key: 'checklistApprovalDate', width: 14 },
    { header: 'BOE No', key: 'boeNo', width: 14 }, { header: 'BOE Date', key: 'boeDate', width: 14 }, { header: 'DO Date', key: 'doDate', width: 14 },
    { header: 'OOC Date', key: 'oocDate', width: 14 }, { header: 'Gate Pass', key: 'gatePass', width: 14 }, { header: 'Delivery', key: 'delivery', width: 14 },
    { header: 'Tracking', key: 'tracking', width: 18 }, { header: 'Invoice No', key: 'invoiceNo', width: 16 }, { header: 'Inv Date', key: 'invoiceDate', width: 14 },
    { header: 'Inv Sent', key: 'invoiceSent', width: 14 }, { header: 'Created', key: 'createdAt', width: 14 }, { header: 'Remarks', key: 'remarks', width: 25 },
  ];

  const chaExportCols = [
    { header: 'SL No', key: 'slNo', width: 7 }, { header: 'Ref No', key: 'refNo', width: 18 }, { header: 'Status', key: 'status', width: 16 },
    { header: 'Stage', key: 'shipmentStage', width: 14 }, { header: 'I/E', key: 'importExport', width: 10 }, { header: 'Created By', key: 'createdBy', width: 16 },
    { header: 'Shipper', key: 'shipper', width: 24 }, { header: 'Consignee', key: 'customer', width: 24 }, { header: 'Agent', key: 'agent', width: 18 },
    { header: 'HAWB', key: 'hawb', width: 16 }, { header: 'MAWB', key: 'mawb', width: 16 }, { header: 'AWB Date', key: 'awbDate', width: 14 },
    { header: 'Pkgs', key: 'packages', width: 8 }, { header: 'Gross Wt', key: 'grossWeight', width: 12 }, { header: 'Chg Wt', key: 'weight', width: 12 },
    { header: 'Job No', key: 'jobNo', width: 12 }, { header: 'Checklist Date', key: 'checklistDate', width: 14 }, { header: 'Approval Date', key: 'checklistApprovalDate', width: 14 },
    { header: 'SB No', key: 'sbNo', width: 14 }, { header: 'SB Date', key: 'sbDate', width: 14 }, { header: 'DO Date', key: 'doDate', width: 14 },
    { header: 'LEO Date', key: 'leoDate', width: 14 }, { header: 'Hand Over', key: 'handOverDate', width: 14 },
    { header: 'Invoice No', key: 'invoiceNo', width: 16 }, { header: 'Inv Date', key: 'invoiceDate', width: 14 }, { header: 'Inv Sent', key: 'invoiceSent', width: 14 },
    { header: 'Created', key: 'createdAt', width: 14 }, { header: 'Remarks', key: 'remarks', width: 25 },
  ];

  const transportCols = [
    { header: 'SL No', key: 'slNo', width: 7 }, { header: 'Ref No', key: 'refNo', width: 18 }, { header: 'Status', key: 'status', width: 16 },
    { header: 'Stage', key: 'shipmentStage', width: 14 }, { header: 'Created By', key: 'createdBy', width: 16 },
    { header: 'Customer', key: 'customer', width: 24 }, { header: 'Vehicle Type', key: 'vehicleType', width: 14 },
    { header: 'Containers', key: 'containers', width: 10 }, { header: 'Package Type', key: 'packageType', width: 20 },
    { header: 'From', key: 'fromLocation', width: 20 }, { header: 'To', key: 'toLocation', width: 20 },
    { header: 'Delivery Date', key: 'deliveryDate', width: 14 }, { header: 'Invoice No', key: 'invoiceNo', width: 16 },
    { header: 'Inv Date', key: 'invoiceDate', width: 14 }, { header: 'Inv Sent', key: 'invoiceSent', width: 14 },
    { header: 'Created', key: 'createdAt', width: 14 }, { header: 'Remarks', key: 'remarks', width: 25 },
  ];

  function getLastCol(colCount) { 
    let result = '';
    let n = colCount;
    while (n > 0) { n--; result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26); }
    return result;
  }

  function writeSheet(ws, data, title, color, columns) {
    ws.columns = columns;
    const colCount = columns.length;
    const lastCol = getLastCol(colCount);

    // Row 1: Company name
    ws.insertRow(1, ['PAS FREIGHT SERVICES PVT LTD']);
    ws.mergeCells(`A1:${lastCol}1`);
    const coCell = ws.getCell('A1');
    coCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: color } };
    coCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 35;

    // Row 2: Sheet title
    ws.insertRow(2, [title]);
    ws.mergeCells(`A2:${lastCol}2`);
    const tCell = ws.getCell('A2');
    tCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFF' } };
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 30;

    // Row 3: Total + Date
    ws.insertRow(3, [`Total: ${data.length}  |  Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`]);
    ws.mergeCells(`A3:${lastCol}3`);
    ws.getCell('A3').font = { name: 'Arial', size: 10, color: { argb: '666666' } };
    ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(3).height = 22;

    // Row 4: Header
    const headerRow = ws.getRow(4);
    headerRow.height = 32;
    columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    data.forEach((s, index) => {
      const ff = s.freightForwarding || {}; const cha = s.cha || {}; const acc = s.accounts || {};
      const rowData = {
        slNo: index + 1, refNo: s.refNo || '', status: s.currentStatus?.replace(/_/g, ' ') || '',
        shipmentStage: s.shipmentStage || '', mode: s.shipmentType || '', importExport: s.importExport || '',
        createdBy: s.createdByName || '', customer: ff.customerName || ff.consigneeName || '', shipper: ff.shipperName || '',
        agent: ff.agent || '', fromLocation: ff.fromLocation || '', toLocation: ff.toLocation || '',
        packages: num(ff.noOfPackages), grossWeight: num(ff.grossWeight), weight: num(ff.weight), cbm: num(ff.cbm),
        rate: ff.sellingRate ? num(ff.sellingRate) : '', terms: ff.terms || '', portLocation: ff.portLocation || '',
        booking: ff.bookingDate ? new Date(ff.bookingDate).toLocaleDateString('en-US') : '',
        etd: ff.etd ? new Date(ff.etd).toLocaleDateString('en-US') : '', eta: ff.eta ? new Date(ff.eta).toLocaleDateString('en-US') : '',
        mawb: ff.mawb || '', hawb: ff.hawb || '', awbDate: ff.awbDate ? new Date(ff.awbDate).toLocaleDateString('en-US') : '',
        vehicleType: ff.vehicleType || '', containers: num(ff.noOfContainers), packageType: ff.packageType || '',
        deliveryDate: ff.deliveryDate ? new Date(ff.deliveryDate).toLocaleDateString('en-US') : '',
        jobNo: cha.jobNo || '', sbNo: cha.sbNo || '', sbDate: cha.sbDate ? new Date(cha.sbDate).toLocaleDateString('en-US') : '',
        boeNo: cha.boeNo || '', boeDate: cha.boeDate ? new Date(cha.boeDate).toLocaleDateString('en-US') : '',
        doDate: cha.doCollectionDate ? new Date(cha.doCollectionDate).toLocaleDateString('en-US') : '',
        oocDate: cha.oocDate ? new Date(cha.oocDate).toLocaleDateString('en-US') : '',
        leoDate: cha.leoDate ? new Date(cha.leoDate).toLocaleDateString('en-US') : '',
        gatePass: cha.gatePassDate ? new Date(cha.gatePassDate).toLocaleDateString('en-US') : '',
        handOverDate: cha.handOverDate ? new Date(cha.handOverDate).toLocaleDateString('en-US') : '',
        delivery: cha.deliveryDate ? new Date(cha.deliveryDate).toLocaleDateString('en-US') : '',
        tracking: cha.trackingNumber || '',
        checklistDate: cha.checklistDate ? new Date(cha.checklistDate).toLocaleDateString('en-US') : '',
        checklistApprovalDate: cha.checklistApprovalDate ? new Date(cha.checklistApprovalDate).toLocaleDateString('en-US') : '',
        invoiceNo: acc.invoiceNumber || '', invoiceDate: acc.invoiceDate ? new Date(acc.invoiceDate).toLocaleDateString('en-US') : '',
        invoiceSent: acc.sendingDate ? new Date(acc.sendingDate).toLocaleDateString('en-US') : '',
        createdAt: new Date(s.createdAt).toLocaleDateString('en-US'), remarks: s.remarks || '',
      };
      const row = ws.addRow(rowData);
      row.height = 22; row.alignment = { horizontal: 'center', vertical: 'middle' }; row.font = { name: 'Arial', size: 9 };
      if (index % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
      row.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: color } };
      row.eachCell(cell => { cell.border = { top: { style: 'thin', color: { argb: 'D1D5DB' } }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
    });

    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 3 + data.length, column: colCount } };
    ws.views = [{ state: 'frozen', ySplit: 4 }];

    // Footer
    const fr = ws.addRow(['']);
    ws.mergeCells(`A${fr.number}:${lastCol}${fr.number}`);
    ws.getCell(`A${fr.number}`).value = `© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd | Confidential`;
    ws.getCell(`A${fr.number}`).font = { name: 'Arial', size: 8, italic: true, color: { argb: '94A3B8' } };
    ws.getCell(`A${fr.number}`).alignment = { horizontal: 'center' };
  }

  // =============================================
  // SHEET 1: ALL SHIPMENTS
  // =============================================
  const wsAll = workbook.addWorksheet('All Shipments', { properties: { tabColor: { argb: '1E40AF' } } });
  writeSheet(wsAll, shipments, 'ALL SHIPMENTS REPORT', '1E40AF', allColumns);

  // Add logo to All Shipments
  try {
    const fs = require('fs'); let lp = path.join(__dirname, '..', 'logo.webp'), ext = 'webp';
    if (!fs.existsSync(lp)) { lp = path.join(__dirname, '..', 'logo.png'); ext = 'png'; }
    if (fs.existsSync(lp)) { const id = workbook.addImage({ filename: lp, extension: ext }); wsAll.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 45 } }); }
  } catch (e) {}

  // =============================================
  // SHEET 2: FREIGHT
  // =============================================
  if (freightShipments.length > 0) {
    const wsF = workbook.addWorksheet('Freight', { properties: { tabColor: { argb: '3B82F6' } } });
    writeSheet(wsF, freightShipments, 'FREIGHT SHIPMENTS', '3B82F6', freightColumns);
  }

  // =============================================
  // SHEET 3: CHA IMPORT
  // =============================================
  if (chaImportShipments.length > 0) {
    const wsCI = workbook.addWorksheet('CHA Import', { properties: { tabColor: { argb: '10B981' } } });
    writeSheet(wsCI, chaImportShipments, 'CHA IMPORT BILLS', '10B981', chaImportCols);
  }

  // =============================================
  // SHEET 4: CHA EXPORT
  // =============================================
  if (chaExportShipments.length > 0) {
    const wsCE = workbook.addWorksheet('CHA Export', { properties: { tabColor: { argb: 'F59E0B' } } });
    writeSheet(wsCE, chaExportShipments, 'CHA EXPORT BILLS', 'F59E0B', chaExportCols);
  }

  // =============================================
  // SHEET 5: TRANSPORT
  // =============================================
  if (transportShipments.length > 0) {
    const wsT = workbook.addWorksheet('Transport', { properties: { tabColor: { argb: '0EA5E9' } } });
    writeSheet(wsT, transportShipments, 'TRANSPORT SHIPMENTS', '0EA5E9', transportCols);
  }

  // =============================================
  // SHEET 6: ADVANCED SUMMARY
  // =============================================
  const ss = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: '8B5CF6' } } });
  
  ss.mergeCells('A1:H1');
  ss.getCell('A1').value = 'PAS FREIGHT SERVICES PVT LTD';
  ss.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: '8B5CF6' } };
  ss.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ss.getRow(1).height = 30;

  ss.mergeCells('A2:H2');
  ss.getCell('A2').value = 'DASHBOARD SUMMARY';
  ss.getCell('A2').font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFF' } };
  ss.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '8B5CF6' } };
  ss.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  ss.getRow(2).height = 28;

  ss.mergeCells('A4:B4');
  ss.getCell('A4').value = 'SHIPMENT TYPE BREAKDOWN';
  ss.getCell('A4').font = { name: 'Arial', size: 12, bold: true, color: { argb: '8B5CF6' } };
  ss.getRow(4).height = 24;

  const typeBreakdown = [
    ['Type', 'Count', '%'],
    ['Freight', freightShipments.length, Math.round((freightShipments.length / shipments.length) * 100) + '%'],
    ['CHA Import', chaImportShipments.length, Math.round((chaImportShipments.length / shipments.length) * 100) + '%'],
    ['CHA Export', chaExportShipments.length, Math.round((chaExportShipments.length / shipments.length) * 100) + '%'],
    ['Transport', transportShipments.length, Math.round((transportShipments.length / shipments.length) * 100) + '%'],
    ['TOTAL', shipments.length, '100%'],
  ];

  typeBreakdown.forEach((row, i) => {
    const r = ss.addRow(row);
    if (i === 0) { r.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '8B5CF6' } }; }
    else if (i === typeBreakdown.length - 1) { r.font = { name: 'Arial', size: 10, bold: true }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EDE9FE' } }; }
    r.alignment = { horizontal: 'center', vertical: 'middle' }; r.height = 22;
  });

  let statusRow = typeBreakdown.length + 6;
  ss.mergeCells(`A${statusRow}:H${statusRow}`);
  ss.getCell(`A${statusRow}`).value = 'STATUS BREAKDOWN BY TYPE';
  ss.getCell(`A${statusRow}`).font = { name: 'Arial', size: 12, bold: true, color: { argb: '8B5CF6' } };
  ss.getRow(statusRow).height = 24;
  statusRow++;

  ['Freight', 'CHA Import', 'CHA Export', 'Transport'].forEach(type => {
    let data;
    if (type === 'Freight') data = freightShipments;
    else if (type === 'CHA Import') data = chaImportShipments;
    else if (type === 'CHA Export') data = chaExportShipments;
    else data = transportShipments;
    if (data.length === 0) return;

    ss.mergeCells(`A${statusRow}:H${statusRow}`);
    ss.getCell(`A${statusRow}`).value = `${type} (${data.length} shipments)`;
    ss.getCell(`A${statusRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: '6B7280' } };
    ss.getCell(`A${statusRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
    statusRow++;

    const counts = {};
    data.forEach(s => { const st = s.currentStatus?.replace(/_/g, ' ') || 'Unknown'; counts[st] = (counts[st] || 0) + 1; });
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
      const r = ss.addRow(['', status, count, Math.round((count / data.length) * 100) + '%']);
      r.alignment = { horizontal: 'center', vertical: 'middle' }; r.font = { name: 'Arial', size: 9 }; r.height = 20;
      statusRow++;
    });
    statusRow++;
  });

  // Footer
  const sfr = ss.addRow(['']);
  ss.mergeCells(`A${sfr.number}:H${sfr.number}`);
  ss.getCell(`A${sfr.number}`).value = `© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd | Confidential`;
  ss.getCell(`A${sfr.number}`).font = { name: 'Arial', size: 8, italic: true, color: { argb: '94A3B8' } };
  ss.getCell(`A${sfr.number}`).alignment = { horizontal: 'center' };

  ss.getColumn(1).width = 5; ss.getColumn(2).width = 20; ss.getColumn(3).width = 12; ss.getColumn(4).width = 10;
  for (let i = 5; i <= 8; i++) ss.getColumn(i).width = 14;

  // =============================================
  // SEND
  // =============================================
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportShipmentsToExcel };