const ExcelJS = require('exceljs');
const path = require('path');

async function exportShipmentsToExcel(shipments, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PAS Freight Services Pvt Ltd';
  workbook.created = new Date();

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const num = (v) => (v !== null && v !== undefined && v !== '') ? Number(v) : null;

  const freightShipments = shipments.filter(s => s.shipmentType !== 'CHA Only' && s.shipmentType !== 'Transport' && s.shipmentType !== 'DO Release' && s.shipmentType !== 'FF Only');
  const chaImportShipments = shipments.filter(s => s.shipmentType === 'CHA Only' && s.importExport !== 'Export');
  const chaExportShipments = shipments.filter(s => s.shipmentType === 'CHA Only' && s.importExport === 'Export');
  const transportShipments = shipments.filter(s => s.shipmentType === 'Transport');
  const doReleaseShipments = shipments.filter(s => s.shipmentType === 'DO Release');
  const ffOnlyShipments = shipments.filter(s => s.shipmentType === 'FF Only');

  const allColumns = [
    { header: 'SL No', key: 'slNo', width: 7 }, { header: 'Ref No', key: 'refNo', width: 18 }, { header: 'Status', key: 'status', width: 16 },
    { header: 'Stage', key: 'shipmentStage', width: 14 }, { header: 'Type', key: 'mode', width: 14 }, { header: 'I/E', key: 'importExport', width: 10 },
    { header: 'Created By', key: 'createdBy', width: 16 }, { header: 'Consignee/Customer', key: 'customer', width: 22 },
    { header: 'Shipper', key: 'shipper', width: 22 }, { header: 'Agent', key: 'agent', width: 18 },
    { header: 'From', key: 'fromLocation', width: 18 }, { header: 'To', key: 'toLocation', width: 18 },
    { header: 'Transport Mode', key: 'transportMode', width: 14 }, { header: 'Pkgs', key: 'packages', width: 8 },
    { header: 'Gross Wt', key: 'grossWeight', width: 12 }, { header: 'Chg Wt', key: 'weight', width: 12 },
    { header: 'CBM', key: 'cbm', width: 10 }, { header: 'Rate', key: 'rate', width: 12 },
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

  const freightColumns = allColumns.filter(c => !['sbNo','sbDate','leoDate','handOverDate','transportMode'].includes(c.key));

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
    { header: 'SL No', key: 'slNo', width: 7 }, { header: 'Vehicle No', key: 'refNo', width: 18 },
    { header: 'Status', key: 'status', width: 16 }, { header: 'Stage', key: 'shipmentStage', width: 14 },
    { header: 'Transport Mode', key: 'transportMode', width: 14 }, { header: 'Created By', key: 'createdBy', width: 16 },
    { header: 'Customer', key: 'customer', width: 24 }, { header: 'Vehicle Type', key: 'vehicleType', width: 14 },
    { header: 'No of Containers', key: 'containers', width: 14 }, { header: 'Package Type', key: 'packageType', width: 22 },
    { header: 'Weight (kg)', key: 'weight', width: 12 }, { header: 'From', key: 'fromLocation', width: 22 },
    { header: 'To', key: 'toLocation', width: 22 }, { header: 'Delivery Date', key: 'deliveryDate', width: 14 },
    { header: 'Invoice No', key: 'invoiceNo', width: 16 }, { header: 'Inv Date', key: 'invoiceDate', width: 14 },
    { header: 'Inv Sent', key: 'invoiceSent', width: 14 }, { header: 'Created', key: 'createdAt', width: 14 },
    { header: 'Remarks', key: 'remarks', width: 25 },
  ];

  // ✅ DO RELEASE columns
  const doReleaseCols = [
    { header: 'SL No', key: 'slNo', width: 7 }, { header: 'Ref No', key: 'refNo', width: 18 },
    { header: 'Status', key: 'status', width: 16 }, { header: 'Stage', key: 'shipmentStage', width: 14 },
    { header: 'Created By', key: 'createdBy', width: 16 }, { header: 'MAWB', key: 'mawb', width: 18 },
    { header: 'HAWB', key: 'hawb', width: 18 }, { header: 'CHA Name', key: 'agent', width: 22 },
    { header: 'Customer', key: 'customer', width: 22 }, { header: 'DO Date', key: 'doDate', width: 14 },
    { header: 'Invoice No', key: 'invoiceNo', width: 16 }, { header: 'Inv Date', key: 'invoiceDate', width: 14 },
    { header: 'Inv Sent', key: 'invoiceSent', width: 14 }, { header: 'Created', key: 'createdAt', width: 14 },
    { header: 'Remarks', key: 'remarks', width: 25 },
  ];

  // ✅ FF ONLY columns (same as freight but with DO Date)
  const ffOnlyCols = [
    { header: 'SL No', key: 'slNo', width: 7 }, { header: 'Ref No', key: 'refNo', width: 18 },
    { header: 'Status', key: 'status', width: 16 }, { header: 'Stage', key: 'shipmentStage', width: 14 },
    { header: 'Created By', key: 'createdBy', width: 16 }, { header: 'Consignee', key: 'customer', width: 24 },
    { header: 'Shipper', key: 'shipper', width: 24 }, { header: 'Agent', key: 'agent', width: 18 },
    { header: 'From', key: 'fromLocation', width: 18 }, { header: 'To', key: 'toLocation', width: 18 },
    { header: 'Pkgs', key: 'packages', width: 8 }, { header: 'Gross Wt', key: 'grossWeight', width: 12 },
    { header: 'Chg Wt', key: 'weight', width: 12 }, { header: 'MAWB', key: 'mawb', width: 16 },
    { header: 'HAWB', key: 'hawb', width: 16 }, { header: 'AWB Date', key: 'awbDate', width: 14 },
    { header: 'DO Date', key: 'doDate', width: 14 }, { header: 'Terms', key: 'terms', width: 12 },
    { header: 'Port', key: 'portLocation', width: 14 }, { header: 'Booking', key: 'booking', width: 14 },
    { header: 'ETD', key: 'etd', width: 14 }, { header: 'ETA', key: 'eta', width: 14 },
    { header: 'Invoice No', key: 'invoiceNo', width: 16 }, { header: 'Inv Date', key: 'invoiceDate', width: 14 },
    { header: 'Inv Sent', key: 'invoiceSent', width: 14 }, { header: 'Created', key: 'createdAt', width: 14 },
    { header: 'Remarks', key: 'remarks', width: 25 },
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

    ws.insertRow(1, ['PAS FREIGHT SERVICES PVT LTD']);
    ws.mergeCells(`A1:${lastCol}1`);
    const coCell = ws.getCell('A1');
    coCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: color } };
    coCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 35;

    ws.insertRow(2, [title]);
    ws.mergeCells(`A2:${lastCol}2`);
    const tCell = ws.getCell('A2');
    tCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFF' } };
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 30;

    ws.insertRow(3, [`Total: ${data.length}  |  Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`]);
    ws.mergeCells(`A3:${lastCol}3`);
    ws.getCell('A3').font = { name: 'Arial', size: 10, color: { argb: '666666' } };
    ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(3).height = 22;

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
        transportMode: ff.transportMode || '',
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

    const fr = ws.addRow(['']);
    ws.mergeCells(`A${fr.number}:${lastCol}${fr.number}`);
    ws.getCell(`A${fr.number}`).value = `© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd | Confidential`;
    ws.getCell(`A${fr.number}`).font = { name: 'Arial', size: 8, italic: true, color: { argb: '94A3B8' } };
    ws.getCell(`A${fr.number}`).alignment = { horizontal: 'center' };
  }

  // HELPERS
  function sectionHeader(ws, rowNum, title, color) {
    ws.mergeCells(`A${rowNum}:J${rowNum}`);
    const cell = ws.getCell(`A${rowNum}`);
    cell.value = title;
    cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(rowNum).height = 28;
    return rowNum + 1;
  }

  function statCardRow(ws, rowNum, cards) {
    cards.forEach((card, i) => {
      const col = String.fromCharCode(65 + i * 3);
      ws.mergeCells(`${col}${rowNum}:${String.fromCharCode(65 + i * 3 + 1)}${rowNum}`);
      ws.getCell(`${col}${rowNum}`).value = card.label;
      ws.getCell(`${col}${rowNum}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: card.color || '6B7280' } };
      ws.getCell(`${col}${rowNum}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`${col}${rowNum + 1}:${String.fromCharCode(65 + i * 3 + 1)}${rowNum + 1}`);
      ws.getCell(`${col}${rowNum + 1}`).value = card.value;
      ws.getCell(`${col}${rowNum + 1}`).font = { name: 'Arial', size: 20, bold: true, color: { argb: '111827' } };
      ws.getCell(`${col}${rowNum + 1}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(rowNum + 1).height = 38;

      if (card.desc) {
        ws.mergeCells(`${col}${rowNum + 2}:${String.fromCharCode(65 + i * 3 + 1)}${rowNum + 2}`);
        ws.getCell(`${col}${rowNum + 2}`).value = card.desc;
        ws.getCell(`${col}${rowNum + 2}`).font = { name: 'Arial', size: 8, color: { argb: '9CA3AF' } };
        ws.getCell(`${col}${rowNum + 2}`).alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
    return rowNum + 3;
  }

  function tableSection(ws, rowNum, headers, rows, color) {
    headers.forEach((h, i) => {
      const col = String.fromCharCode(65 + i);
      ws.getCell(`${col}${rowNum}`).value = h;
      ws.getCell(`${col}${rowNum}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell(`${col}${rowNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      ws.getCell(`${col}${rowNum}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(`${col}${rowNum}`).border = { bottom: { style: 'medium' } };
    });
    ws.getRow(rowNum).height = 24;
    let r = rowNum + 1;
    rows.forEach((row, idx) => {
      row.forEach((val, i) => {
        const col = String.fromCharCode(65 + i);
        ws.getCell(`${col}${r}`).value = val;
        ws.getCell(`${col}${r}`).font = { name: 'Arial', size: 9, bold: idx === rows.length - 1 };
        ws.getCell(`${col}${r}`).alignment = { horizontal: 'center', vertical: 'middle' };
        if (idx === rows.length - 1) {
          ws.getCell(`${col}${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
        }
      });
      ws.getRow(r).height = 22;
      r++;
    });
    return r + 1;
  }

  // SHEET 1: ALL SHIPMENTS
  const wsAll = workbook.addWorksheet('All Shipments', { properties: { tabColor: { argb: '1E40AF' } } });
  writeSheet(wsAll, shipments, 'ALL SHIPMENTS REPORT', '1E40AF', allColumns);
  try {
    const fs = require('fs'); let lp = path.join(__dirname, '..', 'logo.webp'), ext = 'webp';
    if (!fs.existsSync(lp)) { lp = path.join(__dirname, '..', 'logo.png'); ext = 'png'; }
    if (fs.existsSync(lp)) { const id = workbook.addImage({ filename: lp, extension: ext }); wsAll.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 45 } }); }
  } catch (e) {}

  // SHEET 2: FREIGHT
  if (freightShipments.length > 0) {
    const wsF = workbook.addWorksheet('Freight', { properties: { tabColor: { argb: '3B82F6' } } });
    writeSheet(wsF, freightShipments, 'FREIGHT SHIPMENTS', '3B82F6', freightColumns);
  }

  // SHEET 3: CHA IMPORT
  if (chaImportShipments.length > 0) {
    const wsCI = workbook.addWorksheet('CHA Import', { properties: { tabColor: { argb: '10B981' } } });
    writeSheet(wsCI, chaImportShipments, 'CHA IMPORT BILLS', '10B981', chaImportCols);
  }

  // SHEET 4: CHA EXPORT
  if (chaExportShipments.length > 0) {
    const wsCE = workbook.addWorksheet('CHA Export', { properties: { tabColor: { argb: 'F59E0B' } } });
    writeSheet(wsCE, chaExportShipments, 'CHA EXPORT BILLS', 'F59E0B', chaExportCols);
  }

  // SHEET 5: TRANSPORT
  if (transportShipments.length > 0) {
    const wsT = workbook.addWorksheet('Transport', { properties: { tabColor: { argb: '0EA5E9' } } });
    writeSheet(wsT, transportShipments, 'TRANSPORT SHIPMENTS', '0EA5E9', transportCols);
  }

  // ✅ SHEET 6: DO RELEASE
  if (doReleaseShipments.length > 0) {
    const wsDR = workbook.addWorksheet('DO Release', { properties: { tabColor: { argb: '14B8A6' } } });
    writeSheet(wsDR, doReleaseShipments, 'DO RELEASE', '14B8A6', doReleaseCols);
  }

  // ✅ SHEET 7: FF ONLY
  if (ffOnlyShipments.length > 0) {
    const wsFF = workbook.addWorksheet('FF Only', { properties: { tabColor: { argb: '8B5CF6' } } });
    writeSheet(wsFF, ffOnlyShipments, 'FF ONLY', '8B5CF6', ffOnlyCols);
  }

  // SUMMARY SHEET
  const ss = workbook.addWorksheet('📊 Summary', { properties: { tabColor: { argb: '7C3AED' } } });
  ss.getColumn(1).width = 5; ss.getColumn(2).width = 22; ss.getColumn(3).width = 14;
  ss.getColumn(4).width = 12; ss.getColumn(5).width = 22; ss.getColumn(6).width = 14;
  ss.getColumn(7).width = 14; ss.getColumn(8).width = 22; ss.getColumn(9).width = 14; ss.getColumn(10).width = 14;

  let r = 1;
  ss.mergeCells(`A${r}:J${r}`);
  ss.getCell(`A${r}`).value = 'PAS FREIGHT SERVICES PVT LTD';
  ss.getCell(`A${r}`).font = { name: 'Arial', size: 18, bold: true, color: { argb: '8B5CF6' } };
  ss.getCell(`A${r}`).alignment = { horizontal: 'center', vertical: 'middle' };
  ss.getRow(r).height = 38; r++;

  ss.mergeCells(`A${r}:J${r}`);
  ss.getCell(`A${r}`).value = `EXECUTIVE DASHBOARD  |  Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}  |  ${new Date().toLocaleTimeString()}`;
  ss.getCell(`A${r}`).font = { name: 'Arial', size: 10, color: { argb: '6B7280' } };
  ss.getCell(`A${r}`).alignment = { horizontal: 'center', vertical: 'middle' };
  ss.getRow(r).height = 24; r += 2;

  const totalDelivered = shipments.filter(s => s.currentStatus === 'DELIVERED').length;
  const totalInvoiced = shipments.filter(s => ['INVOICE_GENERATED', 'INVOICE_SENT'].includes(s.currentStatus)).length;
  const activeShipments = shipments.filter(s => !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(s.currentStatus)).length;
  const deliveryRate = shipments.length > 0 ? Math.round((totalDelivered / shipments.length) * 100) : 0;

  r = statCardRow(ss, r, [
    { label: 'TOTAL', value: shipments.length, desc: 'All types', color: '8B5CF6' },
    { label: 'ACTIVE', value: activeShipments, desc: 'In progress', color: '3B82F6' },
    { label: 'DELIVERED', value: totalDelivered, desc: `${deliveryRate}%`, color: '10B981' },
  ]);
  r = statCardRow(ss, r, [
    { label: 'INVOICED', value: totalInvoiced, desc: 'Generated/sent', color: 'F59E0B' },
    { label: 'FF ONLY', value: ffOnlyShipments.length, desc: 'Freight Forwarding Only', color: '8B5CF6' },
    { label: 'DO RELEASE', value: doReleaseShipments.length, desc: 'Delivery Order', color: '14B8A6' },
  ]);
  r++;

  r = sectionHeader(ss, r, '📦 SHIPMENT TYPE BREAKDOWN', '8B5CF6');
  const typeData = [
    ['Freight', freightShipments.length, shipments.length > 0 ? Math.round((freightShipments.length / shipments.length) * 100) + '%' : '0%'],
    ['FF Only', ffOnlyShipments.length, shipments.length > 0 ? Math.round((ffOnlyShipments.length / shipments.length) * 100) + '%' : '0%'],
    ['CHA Import', chaImportShipments.length, shipments.length > 0 ? Math.round((chaImportShipments.length / shipments.length) * 100) + '%' : '0%'],
    ['CHA Export', chaExportShipments.length, shipments.length > 0 ? Math.round((chaExportShipments.length / shipments.length) * 100) + '%' : '0%'],
    ['Transport', transportShipments.length, shipments.length > 0 ? Math.round((transportShipments.length / shipments.length) * 100) + '%' : '0%'],
    ['DO Release', doReleaseShipments.length, shipments.length > 0 ? Math.round((doReleaseShipments.length / shipments.length) * 100) + '%' : '0%'],
    ['TOTAL', shipments.length, '100%'],
  ];
  r = tableSection(ss, r, ['Type', 'Count', 'Share %'], typeData, '8B5CF6');

  r = sectionHeader(ss, r, '🕐 RECENT ACTIVITY', 'EF4444');
  const recentRows = [['Date', 'Ref No', 'Type', 'Customer', 'Status']];
  shipments.slice(-50).reverse().forEach(s => {
    recentRows.push([
      new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      s.refNo || '', s.shipmentType || '',
      s.freightForwarding?.customerName || s.freightForwarding?.consigneeName || '',
      (s.currentStatus || '').replace(/_/g, ' '),
    ]);
  });
  r = tableSection(ss, r, ['Date', 'Ref No', 'Type', 'Customer', 'Status'], recentRows, 'EF4444');

  const sfr = ss.addRow(['']);
  ss.mergeCells(`A${sfr.number}:J${sfr.number}`);
  ss.getCell(`A${sfr.number}`).value = `© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd`;
  ss.getCell(`A${sfr.number}`).font = { name: 'Arial', size: 8, italic: true, color: { argb: '94A3B8' } };
  ss.getCell(`A${sfr.number}`).alignment = { horizontal: 'center' };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportShipmentsToExcel };