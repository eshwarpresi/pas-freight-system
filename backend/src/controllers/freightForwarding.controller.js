const prisma = require('../utils/prisma');
const { exportShipmentsToExcel } = require('../utils/excelExport');
const { sendStatusEmail } = require('../utils/emailService');

async function upsertStatusEntry(shipmentId, status, remarks) {
  const existing = await prisma.statusHistory.findFirst({
    where: { shipmentId, status },
    orderBy: { createdAt: 'desc' }
  });
  if (existing) {
    await prisma.statusHistory.update({
      where: { id: existing.id },
      data: { remarks, createdAt: new Date() }
    });
  } else {
    await prisma.statusHistory.create({
      data: { shipmentId, status, remarks }
    });
  }
}

// CREATE NEW SHIPMENT
const createShipment = async (req, res) => {
  try {
    const { refNo, enquiryDate, noOfPackages, consigneeName, shipperName, agent, shipmentType, importExport, hawb, mawb, awbDate, weight, grossWeight, notificationEmail } = req.body;
    if (!refNo) return res.status(400).json({ status: 'error', message: 'Reference Number (refNo) is required' });
    const exists = await prisma.shipment.findUnique({ where: { refNo }, select: { id: true } });
    if (exists) return res.status(400).json({ status: 'error', message: 'Shipment with this Reference Number already exists' });
    const createdById = req.user?.id || null;
    const createdByName = req.user?.name || req.user?.email || null;
    const shipment = await prisma.shipment.create({
      data: { 
        refNo, currentStatus: 'ENQUIRY', shipmentType, importExport,
        createdById, createdByName,
        freightForwarding: { create: { enquiryDate: enquiryDate ? new Date(enquiryDate) : null, noOfPackages: noOfPackages ? parseInt(noOfPackages) : null, consigneeName, shipperName, agent, hawb: hawb || null, mawb: mawb || null, awbDate: awbDate ? new Date(awbDate) : null, weight: weight ? parseFloat(weight) : null, grossWeight: grossWeight ? parseFloat(grossWeight) : null, notificationEmail: notificationEmail || null } }, 
        statusHistory: { create: { status: 'ENQUIRY', remarks: `Shipment created | Ref: ${refNo}`, changedBy: createdByName } } 
      },
      include: { freightForwarding: true, statusHistory: { take: 1, orderBy: { createdAt: 'desc' } } }
    });
    res.status(201).json({ status: 'success', data: shipment });
  } catch (error) { console.error('Error creating shipment:', error); res.status(500).json({ status: 'error', message: 'Failed to create shipment' }); }
};

// DELETE SINGLE
const deleteShipment = async (req, res) => {
  try { const { id } = req.params; await prisma.shipment.delete({ where: { id } }); res.json({ status: 'success', message: 'Shipment deleted' }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed to delete' }); }
};

// DELETE ALL
const deleteAllShipments = async (req, res) => {
  try { await prisma.statusHistory.deleteMany({}); await prisma.freightForwarding.deleteMany({}); await prisma.cHA.deleteMany({}); await prisma.accounts.deleteMany({}); await prisma.shipment.deleteMany({}); res.json({ status: 'success', message: 'All shipments deleted' }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed to delete all' }); }
};

// EXPORT
const exportShipments = async (req, res) => {
  try {
    const { status, search, isArchived } = req.query;
    const where = { isArchived: isArchived === 'true' };
    if (status) where.currentStatus = status;
    if (search) where.OR = [{ refNo: { contains: search } }, { freightForwarding: { consigneeName: { contains: search } } }, { freightForwarding: { hawb: { contains: search } } }, { cha: { boeNo: { contains: search } } }, { accounts: { invoiceNumber: { contains: search } } }];
    const totalCount = await prisma.shipment.count({ where });
    const BATCH_SIZE = 5000; let all = [];
    for (let skip = 0; skip < totalCount; skip += BATCH_SIZE) {
      const batch = await prisma.shipment.findMany({ where, select: { refNo: true, currentStatus: true, createdAt: true, shipmentStage: true, remarks: true, shipmentType: true, importExport: true, createdByName: true, freightForwarding: { select: { enquiryDate: true, noOfPackages: true, consigneeName: true, shipperName: true, agent: true, fromLocation: true, toLocation: true, terms: true, sellingRate: true, weight: true, grossWeight: true, cbm: true, portLocation: true, bookingDate: true, etd: true, eta: true, mawb: true, hawb: true, awbDate: true } }, cha: { select: { jobNo: true, checklistDate: true, boeNo: true, boeDate: true, doCollectionDate: true, oocDate: true, gatePassDate: true, deliveryDate: true, trackingNumber: true } }, accounts: { select: { invoiceNumber: true, invoiceDate: true, sendingDate: true } } }, orderBy: { createdAt: 'desc' }, skip, take: BATCH_SIZE });
      all = all.concat(batch);
    }
    await exportShipmentsToExcel(all, res);
  } catch (error) { console.error('Error exporting:', error); res.status(500).json({ status: 'error', message: 'Failed to export' }); }
};

// GET ALL
const getAllShipments = async (req, res) => {
  try {
    const { status, search, isArchived, shipmentType, page = 1, limit = 25 } = req.query;
    const p = Math.max(1, parseInt(page)); const l = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const where = { isArchived: isArchived === 'true' };
    if (status) where.currentStatus = status;
    if (shipmentType) { if (shipmentType === 'CHA_ONLY') where.shipmentType = 'CHA Only'; else if (shipmentType === 'FULL_SHIPMENT') where.NOT = { shipmentType: 'CHA Only' }; }
    if (search) where.OR = [{ refNo: { contains: search } }, { freightForwarding: { consigneeName: { contains: search } } }, { freightForwarding: { hawb: { contains: search } } }, { cha: { boeNo: { contains: search } } }, { accounts: { invoiceNumber: { contains: search } } }];
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({ where, select: { id: true, refNo: true, currentStatus: true, shipmentStage: true, shipmentType: true, importExport: true, createdByName: true, createdAt: true, freightForwarding: { select: { consigneeName: true, hawb: true } }, cha: { select: { boeNo: true } } }, orderBy: { createdAt: 'desc' }, skip: (p-1)*l, take: l }),
      prisma.shipment.count({ where })
    ]);
    res.json({ status: 'success', data: shipments, pagination: { total, page: p, limit: l, totalPages: Math.ceil(total/l) } });
  } catch (error) { console.error('Error fetching:', error); res.status(500).json({ status: 'error', message: 'Failed to fetch' }); }
};

// GET SINGLE
const getShipmentById = async (req, res) => {
  try { const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); if (!s) return res.status(404).json({ status: 'error', message: 'Not found' }); res.json({ status: 'success', data: s }); } catch (error) { console.error('Error:', error); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE REFERENCE NUMBER
const updateRefNo = async (req, res) => {
  try { const { refNo } = req.body; if (!refNo) return res.status(400).json({ status: 'error', message: 'Reference Number is required' }); const existing = await prisma.shipment.findFirst({ where: { refNo, id: { not: req.params.id } }, select: { id: true } }); if (existing) return res.status(400).json({ status: 'error', message: 'Shipment with this Reference Number already exists' }); await prisma.shipment.update({ where: { id: req.params.id }, data: { refNo } }); await upsertStatusEntry(req.params.id, 'REFNO_UPDATED', `Ref No: ${refNo}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE CONSIGNEE
const updateConsignee = async (req, res) => {
  try { const val = req.body.consigneeName; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { consigneeName: val } } } }); await upsertStatusEntry(req.params.id, 'CONSIGNEE_UPDATED', `Consignee: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE SHIPPER
const updateShipper = async (req, res) => {
  try { const val = req.body.shipperName; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { shipperName: val } } } }); await upsertStatusEntry(req.params.id, 'SHIPPER_UPDATED', `Shipper: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE AGENT
const updateAgent = async (req, res) => {
  try { const val = req.body.agent; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { agent: val } } } }); await upsertStatusEntry(req.params.id, 'AGENT_UPDATED', `Agent: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE SHIPMENT TYPE
const updateShipmentType = async (req, res) => {
  try { const { shipmentType } = req.body; await prisma.shipment.update({ where: { id: req.params.id }, data: { shipmentType } }); await upsertStatusEntry(req.params.id, 'TYPE_UPDATED', `Mode: ${shipmentType}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE IMPORT/EXPORT
const updateImportExport = async (req, res) => {
  try { const { importExport } = req.body; await prisma.shipment.update({ where: { id: req.params.id }, data: { importExport } }); await upsertStatusEntry(req.params.id, 'IMPORT_EXPORT_UPDATED', `Import/Export: ${importExport}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE STAGE
const updateStage = async (req, res) => {
  try { const stage = req.body.shipmentStage; await prisma.shipment.update({ where: { id: req.params.id }, data: { shipmentStage: stage } }); await upsertStatusEntry(req.params.id, 'STAGE_CHANGE', `Stage: ${stage}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE REMARKS
const updateRemarks = async (req, res) => {
  try { const remarks = req.body.remarks; await prisma.shipment.update({ where: { id: req.params.id }, data: { remarks } }); await upsertStatusEntry(req.params.id, 'REMARKS', 'Remarks updated'); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE FROM LOCATION
const updateFromLocation = async (req, res) => {
  try { const val = req.body.fromLocation; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { fromLocation: val } } } }); await upsertStatusEntry(req.params.id, 'FROM_LOCATION', `From: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE TO LOCATION
const updateToLocation = async (req, res) => {
  try { const val = req.body.toLocation; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { toLocation: val } } } }); await upsertStatusEntry(req.params.id, 'TO_LOCATION', `To: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE TERMS
const updateTerms = async (req, res) => {
  try { const val = req.body.terms; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { terms: val } } } }); await upsertStatusEntry(req.params.id, 'TERMS', `Terms: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE RATES
const updateRates = async (req, res) => {
  try { const { sellingRate, weight, cbm, grossWeight, notificationEmail } = req.body; const data = {}; const parts = []; if (sellingRate !== undefined) { data.sellingRate = parseFloat(sellingRate); parts.push(`Rate: ₹${sellingRate}`); } if (weight !== undefined) { data.weight = parseFloat(weight); parts.push(`Chargeable Wt: ${weight}kg`); } if (cbm !== undefined) { data.cbm = parseFloat(cbm); parts.push(`CBM: ${cbm}`); } if (grossWeight !== undefined) { data.grossWeight = parseFloat(grossWeight); parts.push(`Gross Wt: ${grossWeight}kg`); } if (notificationEmail !== undefined) { data.notificationEmail = notificationEmail; } if (Object.keys(data).length > 0) { await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'RATES_ADDED', freightForwarding: { update: { data } } } }); if (parts.length > 0) await upsertStatusEntry(req.params.id, 'RATES_ADDED', parts.join(' | ')); } const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); console.log('🔍 Rates email debug - notificationEmail:', s.freightForwarding?.notificationEmail, '| ref:', s.refNo); sendStatusEmail(s).catch(() => {}); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE CBM
const updateCBM = async (req, res) => {
  try { const val = req.body.cbm; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { cbm: parseFloat(val) } } } }); await upsertStatusEntry(req.params.id, 'CBM_UPDATED', `CBM: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE PORT LOCATION
const updatePortLocation = async (req, res) => {
  try { const val = req.body.portLocation; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { portLocation: val } } } }); await upsertStatusEntry(req.params.id, 'PORT_LOCATION', `Port: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE SCHEDULE
const updateSchedule = async (req, res) => {
  try { const data = {}; const parts = []; if (req.body.etd) { data.etd = new Date(req.body.etd); parts.push(`ETD: ${req.body.etd}`); } if (req.body.eta) { data.eta = new Date(req.body.eta); parts.push(`ETA: ${req.body.eta}`); } if (Object.keys(data).length > 0) { await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'SCHEDULED', freightForwarding: { update: { data } } } }); if (parts.length > 0) await upsertStatusEntry(req.params.id, 'SCHEDULED', parts.join(' | ')); } const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); console.log('🔍 Schedule email debug - notificationEmail:', s.freightForwarding?.notificationEmail, '| ref:', s.refNo); sendStatusEmail(s).catch(() => {}); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE NOMINATION
const updateNomination = async (req, res) => {
  try { if (req.body.nominationDate) { await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'NOMINATED', freightForwarding: { update: { nominationDate: new Date(req.body.nominationDate) } } } }); await upsertStatusEntry(req.params.id, 'NOMINATED', `Nomination: ${req.body.nominationDate}`); } const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); console.log('🔍 Nomination email debug - notificationEmail:', s.freightForwarding?.notificationEmail, '| ref:', s.refNo); sendStatusEmail(s).catch(() => {}); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE BOOKING
const updateBooking = async (req, res) => {
  try { if (req.body.bookingDate) { await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'BOOKED', freightForwarding: { update: { bookingDate: new Date(req.body.bookingDate) } } } }); await upsertStatusEntry(req.params.id, 'BOOKED', `Booking: ${req.body.bookingDate}`); } const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); console.log('🔍 Booking email debug - notificationEmail:', s.freightForwarding?.notificationEmail, '| ref:', s.refNo); sendStatusEmail(s).catch(() => {}); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE AWB
const updateAWB = async (req, res) => {
  try { const data = {}; const parts = []; if (req.body.mawb !== undefined) { data.mawb = req.body.mawb; parts.push(`MAWB: ${req.body.mawb}`); } if (req.body.hawb !== undefined) { data.hawb = req.body.hawb; parts.push(`HAWB: ${req.body.hawb}`); } if (req.body.awbDate) { data.awbDate = new Date(req.body.awbDate); parts.push(`AWB Date: ${req.body.awbDate}`); } if (Object.keys(data).length > 0) { await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'AWB_GENERATED', freightForwarding: { update: { data } } } }); if (parts.length > 0) await upsertStatusEntry(req.params.id, 'AWB_GENERATED', parts.join(' | ')); } const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); console.log('🔍 AWB email debug - notificationEmail:', s.freightForwarding?.notificationEmail, '| ref:', s.refNo); sendStatusEmail(s).catch(() => {}); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { createShipment, deleteShipment, deleteAllShipments, exportShipments, getAllShipments, getShipmentById, updateRefNo, updateConsignee, updateShipper, updateAgent, updateShipmentType, updateImportExport, updateStage, updateRemarks, updateFromLocation, updateToLocation, updateTerms, updateRates, updateCBM, updatePortLocation, updateNomination, updateBooking, updateSchedule, updateAWB };