const prisma = require('../utils/prisma');

const fullShipmentSelect = (id) => ({
  where: { id },
  include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } }
});

// CREATE NEW SHIPMENT - added shipmentType
const createShipment = async (req, res) => {
  try {
    const { refNo, enquiryDate, noOfPackages, consigneeName, shipperName, agent, shipmentType } = req.body;
    if (!refNo) return res.status(400).json({ status: 'error', message: 'Reference Number (refNo) is required' });
    const exists = await prisma.shipment.findUnique({ where: { refNo }, select: { id: true } });
    if (exists) return res.status(400).json({ status: 'error', message: 'Shipment with this Reference Number already exists' });
    const shipment = await prisma.shipment.create({
      data: { refNo, currentStatus: 'ENQUIRY', shipmentType, freightForwarding: { create: { enquiryDate: enquiryDate ? new Date(enquiryDate) : null, noOfPackages: noOfPackages ? parseInt(noOfPackages) : null, consigneeName, shipperName, agent } }, statusHistory: { create: { status: 'ENQUIRY', remarks: `Shipment created | Ref: ${refNo} | Consignee: ${consigneeName || 'N/A'} | Shipper: ${shipperName || 'N/A'}` } } },
      include: { freightForwarding: true, statusHistory: { take: 1, orderBy: { createdAt: 'desc' } } }
    });
    res.status(201).json({ status: 'success', data: shipment });
  } catch (error) { console.error('Error creating shipment:', error); res.status(500).json({ status: 'error', message: 'Failed to create shipment' }); }
};

// DELETE SINGLE SHIPMENT
const deleteShipment = async (req, res) => {
  try { const { id } = req.params; await prisma.shipment.delete({ where: { id } }); res.json({ status: 'success', message: 'Shipment deleted' }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed to delete' }); }
};

// DELETE ALL SHIPMENTS
const deleteAllShipments = async (req, res) => {
  try { await prisma.statusHistory.deleteMany({}); await prisma.freightForwarding.deleteMany({}); await prisma.cHA.deleteMany({}); await prisma.accounts.deleteMany({}); await prisma.shipment.deleteMany({}); res.json({ status: 'success', message: 'All shipments deleted' }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed to delete all' }); }
};

// EXPORT - added shipmentType
const exportShipments = async (req, res) => {
  try {
    const { status, search, isArchived } = req.query;
    const where = { isArchived: isArchived === 'true' };
    if (status) where.currentStatus = status;
    if (search) where.OR = [
      { refNo: { contains: search } },
      { freightForwarding: { consigneeName: { contains: search } } },
      { freightForwarding: { hawb: { contains: search } } },
      { cha: { boeNo: { contains: search } } },
      { accounts: { invoiceNumber: { contains: search } } }
    ];
    const totalCount = await prisma.shipment.count({ where });
    const BATCH_SIZE = 5000; let all = [];
    for (let skip = 0; skip < totalCount; skip += BATCH_SIZE) {
      const batch = await prisma.shipment.findMany({ where, select: { refNo: true, currentStatus: true, createdAt: true, shipmentStage: true, remarks: true, shipmentType: true, freightForwarding: { select: { enquiryDate: true, noOfPackages: true, consigneeName: true, shipperName: true, agent: true, fromLocation: true, toLocation: true, terms: true, sellingRate: true, weight: true, cbm: true, portLocation: true, bookingDate: true, etd: true, eta: true, mawb: true, hawb: true, awbDate: true } }, cha: { select: { jobNo: true, checklistDate: true, boeNo: true, boeDate: true, doCollectionDate: true, oocDate: true, gatePassDate: true, deliveryDate: true, trackingNumber: true } }, accounts: { select: { invoiceNumber: true, invoiceDate: true, sendingDate: true } } }, orderBy: { createdAt: 'desc' }, skip, take: BATCH_SIZE });
      all = all.concat(batch);
    }
    const { exportShipmentsToExcel } = require('../utils/excelExport');
    await exportShipmentsToExcel(all, res);
  } catch (error) { console.error('Error exporting:', error); res.status(500).json({ status: 'error', message: 'Failed to export' }); }
};

// GET ALL
const getAllShipments = async (req, res) => {
  try {
    const { status, search, isArchived, page = 1, limit = 25 } = req.query;
    const p = Math.max(1, parseInt(page)); const l = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const where = { isArchived: isArchived === 'true' };
    if (status) where.currentStatus = status;
    if (search) where.OR = [
      { refNo: { contains: search } },
      { freightForwarding: { consigneeName: { contains: search } } },
      { freightForwarding: { hawb: { contains: search } } },
      { cha: { boeNo: { contains: search } } },
      { accounts: { invoiceNumber: { contains: search } } }
    ];
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({ 
        where, 
        select: { 
          id: true, refNo: true, currentStatus: true, shipmentStage: true, createdAt: true, 
          freightForwarding: { select: { consigneeName: true, hawb: true } },
          cha: { select: { boeNo: true } }
        }, 
        orderBy: { createdAt: 'desc' }, skip: (p-1)*l, take: l 
      }),
      prisma.shipment.count({ where })
    ]);
    res.json({ status: 'success', data: shipments, pagination: { total, page: p, limit: l, totalPages: Math.ceil(total/l) } });
  } catch (error) { console.error('Error fetching:', error); res.status(500).json({ status: 'error', message: 'Failed to fetch' }); }
};

// GET SINGLE
const getShipmentById = async (req, res) => {
  try { const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } }); if (!s) return res.status(404).json({ status: 'error', message: 'Not found' }); res.json({ status: 'success', data: s }); } catch (error) { console.error('Error:', error); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE SHIPMENT TYPE (NEW)
const updateShipmentType = async (req, res) => {
  try {
    const { shipmentType } = req.body;
    await prisma.shipment.update({ where: { id: req.params.id }, data: { shipmentType }, statusHistory: { create: { status: 'TYPE_UPDATED', remarks: `Shipment Type: ${shipmentType}` } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE STAGE
const updateStage = async (req, res) => {
  try {
    const stage = req.body.shipmentStage;
    await prisma.shipment.update({ where: { id: req.params.id }, data: { shipmentStage: stage }, statusHistory: { create: { status: 'STAGE_CHANGE', remarks: `Stage changed to: ${stage}` } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE REMARKS
const updateRemarks = async (req, res) => {
  try {
    const remarks = req.body.remarks;
    await prisma.shipment.update({ where: { id: req.params.id }, data: { remarks }, statusHistory: { create: { status: 'REMARKS', remarks: `Remarks: ${remarks}` } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE FROM LOCATION
const updateFromLocation = async (req, res) => {
  try {
    const val = req.body.fromLocation;
    await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { fromLocation: val } }, statusHistory: { create: { status: 'FROM_LOCATION', remarks: `From: ${val}` } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE TO LOCATION
const updateToLocation = async (req, res) => {
  try {
    const val = req.body.toLocation;
    await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { toLocation: val } }, statusHistory: { create: { status: 'TO_LOCATION', remarks: `To: ${val}` } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE TERMS
const updateTerms = async (req, res) => {
  try {
    const val = req.body.terms;
    await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { terms: val } }, statusHistory: { create: { status: 'TERMS', remarks: `Terms: ${val}` } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE RATES
const updateRates = async (req, res) => {
  try {
    const data = {};
    const parts = [];
    if (req.body.sellingRate !== undefined) { data.sellingRate = parseFloat(req.body.sellingRate); parts.push(`Rate: ₹${req.body.sellingRate}`); }
    if (req.body.weight !== undefined) { data.weight = parseFloat(req.body.weight); parts.push(`Weight: ${req.body.weight}kg`); }
    if (req.body.cbm !== undefined) { data.cbm = parseFloat(req.body.cbm); parts.push(`CBM: ${req.body.cbm}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'RATES_ADDED', freightForwarding: { update: { data } }, statusHistory: { create: { status: 'RATES_ADDED', remarks: parts.join(' | ') } } } });
    }
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE CBM
const updateCBM = async (req, res) => {
  try {
    const val = req.body.cbm;
    await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { cbm: parseFloat(val) } }, statusHistory: { create: { status: 'CBM_UPDATED', remarks: `CBM: ${val}` } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE PORT LOCATION
const updatePortLocation = async (req, res) => {
  try {
    const val = req.body.portLocation;
    await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { portLocation: val } }, statusHistory: { create: { status: 'PORT_LOCATION', remarks: `Port Location: ${val}` } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE SCHEDULE
const updateSchedule = async (req, res) => {
  try {
    const data = {};
    const parts = [];
    if (req.body.etd) { data.etd = new Date(req.body.etd); parts.push(`ETD: ${req.body.etd}`); }
    if (req.body.eta) { data.eta = new Date(req.body.eta); parts.push(`ETA: ${req.body.eta}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'SCHEDULED', freightForwarding: { update: { data } }, statusHistory: { create: { status: 'SCHEDULED', remarks: parts.join(' | ') } } } });
    }
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE NOMINATION
const updateNomination = async (req, res) => {
  try {
    if (req.body.nominationDate) {
      await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'NOMINATED', freightForwarding: { update: { nominationDate: new Date(req.body.nominationDate) } }, statusHistory: { create: { status: 'NOMINATED', remarks: `Nomination Date: ${req.body.nominationDate}` } } } });
    }
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE BOOKING
const updateBooking = async (req, res) => {
  try {
    if (req.body.bookingDate) {
      await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'BOOKED', freightForwarding: { update: { bookingDate: new Date(req.body.bookingDate) } }, statusHistory: { create: { status: 'BOOKED', remarks: `Booking Date: ${req.body.bookingDate}` } } } });
    }
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE AWB
const updateAWB = async (req, res) => {
  try {
    const data = {};
    const parts = [];
    if (req.body.mawb !== undefined) { data.mawb = req.body.mawb; parts.push(`MAWB: ${req.body.mawb}`); }
    if (req.body.hawb !== undefined) { data.hawb = req.body.hawb; parts.push(`HAWB: ${req.body.hawb}`); }
    if (req.body.awbDate) { data.awbDate = new Date(req.body.awbDate); parts.push(`AWB Date: ${req.body.awbDate}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'AWB_GENERATED', freightForwarding: { update: { data } }, statusHistory: { create: { status: 'AWB_GENERATED', remarks: parts.join(' | ') } } } });
    }
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { createShipment, deleteShipment, deleteAllShipments, exportShipments, getAllShipments, getShipmentById, updateShipmentType, updateStage, updateRemarks, updateFromLocation, updateToLocation, updateTerms, updateRates, updateCBM, updatePortLocation, updateNomination, updateBooking, updateSchedule, updateAWB };