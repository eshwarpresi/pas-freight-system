const ExcelJS = require('exceljs');

async function exportShipmentsToExcel(shipments, res) {
  const workbook = new ExcelJS.Workbook();
  
  // Company branding
  workbook.creator = 'PAS Freight Services Pvt Ltd';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Shipments', {
    properties: { tabColor: { argb: '1E40AF' } }
  });

  // Define columns
  worksheet.columns = [
    { header: 'Ref No', key: 'refNo', width: 18 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Consignee', key: 'consignee', width: 25 },
    { header: 'Shipper', key: 'shipper', width: 25 },
    { header: 'Agent', key: 'agent', width: 22 },
    { header: 'Packages', key: 'packages', width: 12 },
    { header: 'Weight (kg)', key: 'weight', width: 14 },
    { header: 'Selling Rate', key: 'rate', width: 15 },
    { header: 'Booking Date', key: 'booking', width: 18 },
    { header: 'ETD', key: 'etd', width: 15 },
    { header: 'ETA', key: 'eta', width: 15 },
    { header: 'MAWB', key: 'mawb', width: 18 },
    { header: 'HAWB', key: 'hawb', width: 18 },
    { header: 'Job No', key: 'jobNo', width: 15 },
    { header: 'BOE No', key: 'boeNo', width: 15 },
    { header: 'DO Collection', key: 'doDate', width: 18 },
    { header: 'OOC Date', key: 'oocDate', width: 15 },
    { header: 'Gate Pass', key: 'gatePass', width: 15 },
    { header: 'Delivery Date', key: 'delivery', width: 18 },
    { header: 'Tracking No', key: 'tracking', width: 18 },
    { header: 'Invoice No', key: 'invoiceNo', width: 18 },
    { header: 'Invoice Date', key: 'invoiceDate', width: 18 },
    { header: 'Invoice Sent', key: 'invoiceSent', width: 18 },
    { header: 'Created Date', key: 'createdAt', width: 18 },
  ];

  // Add title row
  worksheet.insertRow(1, ['PAS FREIGHT SERVICES PVT LTD - SHIPMENT REPORT']);
  worksheet.mergeCells('A1:X1');
  const titleCell = worksheet.getCell('A1');
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: '1E40AF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 35;

  // Add date row
  worksheet.insertRow(2, [`Generated: ${new Date().toLocaleDateString()}`]);
  worksheet.mergeCells('A2:X2');
  worksheet.getCell('A2').font = { size: 10, color: { argb: '666666' } };
  worksheet.getCell('A2').alignment = { horizontal: 'center' };

  // Style header row (row 3)
  const headerRow = worksheet.getRow(3);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1E40AF' }
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 30;

  // Add data rows
  shipments.forEach((shipment, index) => {
    const ff = shipment.freightForwarding || {};
    const cha = shipment.cha || {};
    const acc = shipment.accounts || {};

    const rowData = {
      refNo: shipment.refNo,
      status: shipment.currentStatus,
      consignee: ff.consigneeName || '',
      shipper: ff.shipperName || '',
      agent: ff.agent || '',
      packages: ff.noOfPackages || '',
      weight: ff.weight || '',
      rate: ff.sellingRate || '',
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
      createdAt: new Date(shipment.createdAt).toLocaleDateString(),
    };

    const row = worksheet.addRow(rowData);
    row.alignment = { horizontal: 'center', vertical: 'middle' };

    // Alternate row colors
    if (index % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'F8FAFC' }
      };
    }
  });

  // Add borders
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber >= 3) {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } }
        };
      });
    }
  });

  // Set response headers
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=PAS_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`
  );

  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { exportShipmentsToExcel };