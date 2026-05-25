const ExcelJS = require('exceljs');
const path = require('path');

async function exportShipmentsToExcel(shipments, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PAS Freight Services Pvt Ltd';
  workbook.created = new Date();

  const STAGE_OPTIONS = ['Draft', 'Created', 'Confirmed', 'Booked', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold'];
  const STAGE_COLORS = { 'Draft': 'E5E7EB', 'Created': 'DBEAFE', 'Confirmed': 'FEF3C7', 'Booked': 'DDD6FE', 'Scheduled': 'CFFAFE', 'In Progress': 'FEF9C3', 'Completed': 'DCFCE7', 'Cancelled': 'FEE2E2', 'On Hold': 'FED7AA' };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const num = (v) => (v !== null && v !== undefined && v !== '') ? Number(v) : null;

  // Split shipments by type
  const freightShipments = shipments.filter(s => s.shipmentType !== 'CHA Only' && s.shipmentType !== 'Transport');
  const chaImportShipments = shipments.filter(s => s.shipmentType === 'CHA Only' && s.importExport === 'Import');
  const chaExportShipments = shipments.filter(s => s.shipmentType === 'CHA Only' && s.importExport === 'Export');
  const transportShipments = shipments.filter(s => s.shipmentType === 'Transport');

  const totalFreight = freightShipments.length;
  const totalCHAImport = chaImportShipments.length;
  const totalCHAExport = chaExportShipments.length;
  const totalTransport = transportShipments.length;

  // =============================================
  // COMMON COLUMNS FOR ALL SHEETS
  // =============================================
  const allColumns = [
    { header: 'SL No', key: 'slNo', width: 7 },
    { header: 'Ref No', key: 'refNo', width: 18 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Stage', key: 'shipmentStage', width: 16 },
    { header: 'Type', key: 'mode', width: 16 },
    { header: 'Import / Export', key: 'importExport', width: 16 },
    { header: 'Created By', key: 'createdBy', width: 18 },
    { header: 'Customer / Consignee', key: 'customer', width: 24 },
    { header: 'Shipper', key: 'shipper', width: 24 },
    { header: 'Vehicle Type', key: 'vehicleType', width: 14 },
    { header: 'Containers', key: 'containers', width: 10 },
    { header: 'Package Type', key: 'packageType', width: 18 },
    { header: 'From', key: 'fromLocation', width: 18 },
    { header: 'To', key: 'toLocation', width: 18 },
    { header: 'Delivery Date', key: 'deliveryDate', width: 15 },
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
    { header: 'SB No', key: 'sbNo', width: 14 },
    { header: 'SB Date', key: 'sbDate', width: 14 },
    { header: 'BOE No', key: 'boeNo', width: 14 },
    { header: 'BOE Date', key: 'boeDate', width: 14 },
    { header: 'DO Collection', key: 'doDate', width: 17 },
    { header: 'OOC Date', key: 'oocDate', width: 14 },
    { header: 'LEO Date', key: 'leoDate', width: 14 },
    { header: 'Gate Pass', key: 'gatePass', width: 14 },
    { header: 'Hand Over Date', key: 'handOverDate', width: 16 },
    { header: 'Tracking No', key: 'tracking', width: 20 },
    { header: 'Invoice No', key: 'invoiceNo', width: 16 },
    { header: 'Invoice Date', key: 'invoiceDate', width: 15 },
    { header: 'Invoice Sent', key: 'invoiceSent', width: 15 },
    { header: 'Created', key: 'createdAt', width: 15 },
    { header: 'Remarks', key: 'remarks', width: 30 },
  ];
  const colCount = allColumns.length;
  const lastCol = 'AR';

  // Helper: write a sheet
  function writeSheet(ws, data, title, color) {
    ws.columns = allColumns;
    ws.insertRow(1, [title]);
    ws.mergeCells(`A1:${lastCol}1`);
    const tCell = ws.getCell('A1');
    tCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFF' } };
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 35;

    ws.insertRow(2, [`Total: ${data.length}  |  Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`]);
    ws.mergeCells(`A2:${lastCol}2`);
    ws.getCell('A2').font = { name: 'Arial', size: 10, color: { argb: '666666' } };
    ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 22;

    const headerRow = ws.getRow(3);
    headerRow.height = 32;
    allColumns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'medium', color: { argb: '1E3A8A' } }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    data.forEach((s, index) => {
      const ff = s.freightForwarding || {}; const cha = s.cha || {}; const acc = s.accounts || {};
      const row = ws.addRow({
        slNo: index + 1, refNo: s.refNo || '', status: s.currentStatus?.replace(/_/g, ' ') || '',
        shipmentStage: s.shipmentStage || '', mode: s.shipmentType || '', importExport: s.importExport || '',
        createdBy: s.createdByName || '', customer: ff.customerName || ff.consigneeName || '', shipper: ff.shipperName || '',
        vehicleType: ff.vehicleType || '', containers: num(ff.noOfContainers), packageType: ff.packageType || '',
        fromLocation: ff.fromLocation || '', toLocation: ff.toLocation || '',
        deliveryDate: ff.deliveryDate ? new Date(ff.deliveryDate).toLocaleDateString('en-US') : '',
        terms: ff.terms || '', portLocation: ff.portLocation || '', agent: ff.agent || '',
        packages: num(ff.noOfPackages), grossWeight: num(ff.grossWeight), weight: num(ff.weight), cbm: num(ff.cbm),
        rate: ff.sellingRate ? num(ff.sellingRate) : '',
        booking: ff.bookingDate ? new Date(ff.bookingDate).toLocaleDateString('en-US') : '',
        etd: ff.etd ? new Date(ff.etd).toLocaleDateString('en-US') : '',
        eta: ff.eta ? new Date(ff.eta).toLocaleDateString('en-US') : '',
        mawb: ff.mawb || '', hawb: ff.hawb || '',
        jobNo: cha.jobNo || '', sbNo: cha.sbNo || '', sbDate: cha.sbDate ? new Date(cha.sbDate).toLocaleDateString('en-US') : '',
        boeNo: cha.boeNo || '', boeDate: cha.boeDate ? new Date(cha.boeDate).toLocaleDateString('en-US') : '',
        doDate: cha.doCollectionDate ? new Date(cha.doCollectionDate).toLocaleDateString('en-US') : '',
        oocDate: cha.oocDate ? new Date(cha.oocDate).toLocaleDateString('en-US') : '',
        leoDate: cha.leoDate ? new Date(cha.leoDate).toLocaleDateString('en-US') : '',
        gatePass: cha.gatePassDate ? new Date(cha.gatePassDate).toLocaleDateString('en-US') : '',
        handOverDate: cha.handOverDate ? new Date(cha.handOverDate).toLocaleDateString('en-US') : '',
        tracking: cha.trackingNumber || '',
        invoiceNo: acc.invoiceNumber || '', invoiceDate: acc.invoiceDate ? new Date(acc.invoiceDate).toLocaleDateString('en-US') : '',
        invoiceSent: acc.sendingDate ? new Date(acc.sendingDate).toLocaleDateString('en-US') : '',
        createdAt: new Date(s.createdAt).toLocaleDateString('en-US'), remarks: s.remarks || '',
      });
      row.height = 22; row.alignment = { horizontal: 'center', vertical: 'middle' }; row.font = { name: 'Arial', size: 9 };
      if (index % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
      row.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: color } };
      row.eachCell(cell => { cell.border = { top: { style: 'thin', color: { argb: 'D1D5DB' } }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
    });

    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + data.length, column: colCount } };
    ws.views = [{ state: 'frozen', ySplit: 3 }];
  }

  // =============================================
  // SHEET 1: ALL SHIPMENTS
  // =============================================
  const wsAll = workbook.addWorksheet('All Shipments', { properties: { tabColor: { argb: '1E40AF' } } });
  writeSheet(wsAll, shipments, 'PAS FREIGHT SERVICES PVT LTD - ALL SHIPMENTS', '1E40AF');

  // =============================================
  // SHEET 2: FREIGHT SHIPMENTS
  // =============================================
  if (totalFreight > 0) {
    const wsF = workbook.addWorksheet('Freight', { properties: { tabColor: { argb: '3B82F6' } } });
    writeSheet(wsF, freightShipments, '🚢 FREIGHT SHIPMENTS', '3B82F6');
  }

  // =============================================
  // SHEET 3: CHA IMPORT
  // =============================================
  if (totalCHAImport > 0) {
    const wsCI = workbook.addWorksheet('CHA Import', { properties: { tabColor: { argb: '10B981' } } });
    writeSheet(wsCI, chaImportShipments, '🛃 CHA IMPORT BILLS', '10B981');
  }

  // =============================================
  // SHEET 4: CHA EXPORT
  // =============================================
  if (totalCHAExport > 0) {
    const wsCE = workbook.addWorksheet('CHA Export', { properties: { tabColor: { argb: 'F59E0B' } } });
    writeSheet(wsCE, chaExportShipments, '📤 CHA EXPORT BILLS', 'F59E0B');
  }

  // =============================================
  // SHEET 5: TRANSPORT
  // =============================================
  if (totalTransport > 0) {
    const wsT = workbook.addWorksheet('Transport', { properties: { tabColor: { argb: '0EA5E9' } } });
    writeSheet(wsT, transportShipments, '🚛 TRANSPORT SHIPMENTS', '0EA5E9');
  }

  // =============================================
  // SHEET 6: SUMMARY
  // =============================================
  const ss = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: '8B5CF6' } } });
  ss.mergeCells('A1:D2');
  const c1 = ss.getCell('A1');
  c1.value = { richText: [{ font: { size: 22, bold: true, color: { argb: '1E40AF' } }, text: `${shipments.length}` }, { font: { size: 11, color: { argb: '6B7280' } }, text: '\nTotal Shipments' }] };
  c1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFF6FF' } };
  c1.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  ss.getRow(1).height = 28; ss.getRow(2).height = 22;

  ss.mergeCells('E1:H2');
  const c2 = ss.getCell('E1');
  c2.value = { richText: [{ font: { size: 22, bold: true, color: { argb: '3B82F6' } }, text: `${totalFreight}` }, { font: { size: 11, color: { argb: '6B7280' } }, text: '\nFreight' }] };
  c2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DBEAFE' } };
  c2.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

  ss.mergeCells('A4:D5');
  const c3 = ss.getCell('A4');
  c3.value = { richText: [{ font: { size: 22, bold: true, color: { argb: '10B981' } }, text: `${totalCHAImport}` }, { font: { size: 11, color: { argb: '6B7280' } }, text: '\nCHA Import' }] };
  c3.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } };
  c3.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  ss.getRow(4).height = 28; ss.getRow(5).height = 22;

  ss.mergeCells('E4:H5');
  const c4 = ss.getCell('E4');
  c4.value = { richText: [{ font: { size: 22, bold: true, color: { argb: 'F59E0B' } }, text: `${totalCHAExport}` }, { font: { size: 11, color: { argb: '6B7280' } }, text: '\nCHA Export' }] };
  c4.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  c4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
  c4.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

  ss.mergeCells('A7:D8');
  const c5 = ss.getCell('A7');
  c5.value = { richText: [{ font: { size: 22, bold: true, color: { argb: '0EA5E9' } }, text: `${totalTransport}` }, { font: { size: 11, color: { argb: '6B7280' } }, text: '\nTransport' }] };
  c5.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  c5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0F2FE' } };
  c5.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  ss.getRow(7).height = 28; ss.getRow(8).height = 22;

  ss.getColumn(1).width = 14; ss.getColumn(2).width = 14; ss.getColumn(3).width = 14; ss.getColumn(4).width = 14;
  ss.getColumn(5).width = 14; ss.getColumn(6).width = 14; ss.getColumn(7).width = 14; ss.getColumn(8).width = 14;

  // =============================================
  // SEND
  // =============================================
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportShipmentsToExcel };