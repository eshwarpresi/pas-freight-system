const prisma = require('../utils/prisma');

// Helper: return full shipment after update
const fullShipmentSelect = (id) => ({
  where: { id },
  include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } }
});

// CREATE NEW SHIPMENT
const createShipment = async (req, res) => {
  try {
    const { refNo, enquiryDate, noOfPackages, consigneeName, shipperName, agent } = req.body;
    if (!refNo) return res.status(400).json({ status: 'error', message: 'Reference Number (refNo) is required' });
    const exists = await prisma.shipment.findUnique({ where: { refNo }, select: { id: true } });
    if (exists) return res.status(400).json({ status: 'error', message: 'Shipment with this Reference Number already exists' });
    const shipment = await prisma.shipment.create({
      data: { refNo, currentStatus: 'ENQUIRY', freightForwarding: { create: { enquiryDate: enquiryDate ? new Date(enquiryDate) : null, noOfPackages: noOfPackages ? parseInt(noOfPackages) : null, consigneeName, shipperName, agent } }, statusHistory: { create: { status: 'ENQUIRY', remarks: 'Shipment enquiry created' } } },
      include: { freightForwarding: true, statusHistory: { take: 1, orderBy: { createdAt: 'desc' } } }
    });
    res.status(201).json({ status: 'success', data: shipment });
  } catch (error) { console.error('Error creating shipment:', error); res.status(500).json({ status: 'error', message: 'Failed to create shipment' }); }
};

// EXPORT
const exportShipments = async (req, res) => {
  try {
    const { status, search, isArchived } = req.query;
    const where = { isArchived: isArchived === 'true' };
    if (status) where.currentStatus = status;
    if (search) where.OR = [{ refNo: { contains: search } }, { freightForwarding: { consigneeName: { contains: search } } }, { freightForwarding: { shipperName: { contains: search } } }];
    const totalCount = await prisma.shipment.count({ where });
    const BATCH_SIZE = 5000; let all = [];
    for (let skip = 0; skip < totalCount; skip += BATCH_SIZE) {
      const batch = await prisma.shipment.findMany({ where, select: { refNo: true, currentStatus: true, createdAt: true, shipmentStage: true, remarks: true, freightForwarding: { select: { enquiryDate: true, noOfPackages: true, consigneeName: true, shipperName: true, agent: true, fromLocation: true, toLocation: true, sellingRate: true, weight: true, bookingDate: true, etd: true, eta: true, mawb: true, hawb: true, awbDate: true } }, cha: { select: { jobNo: true, checklistDate: true, boeNo: true, boeDate: true, doCollectionDate: true, oocDate: true, gatePassDate: true, deliveryDate: true, trackingNumber: true } }, accounts: { select: { invoiceNumber: true, invoiceDate: true, sendingDate: true } } }, orderBy: { createdAt: 'desc' }, skip, take: BATCH_SIZE });
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
    if (search) where.OR = [{ refNo: { contains: search } }, { freightForwarding: { consigneeName: { contains: search } } }, { freightForwarding: { shipperName: { contains: search } } }];
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({ where, select: { id: true, refNo: true, currentStatus: true, shipmentStage: true, createdAt: true, freightForwarding: { select: { consigneeName: true, shipperName: true } } }, orderBy: { createdAt: 'desc' }, skip: (p-1)*l, take: l }),
      prisma.shipment.count({ where })
    ]);
    res.json({ status: 'success', data: shipments, pagination: { total, page: p, limit: l, totalPages: Math.ceil(total/l) } });
  } catch (error) { console.error('Error fetching:', error); res.status(500).json({ status: 'error', message: 'Failed to fetch' }); }
};

// GET SINGLE
const getShipmentById = async (req, res) => {
  try {
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!s) return res.status(404).json({ status: 'error', message: 'Not found' });
    res.json({ status: 'success', data: s });
  } catch (error) { console.error('Error:', error); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE STAGE
const updateStage = async (req, res) => {
  try {
    await prisma.shipment.update({ where: { id: req.params.id }, data: { shipmentStage: req.body.shipmentStage } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE REMARKS
const updateRemarks = async (req, res) => {
  try {
    await prisma.shipment.update({ where: { id: req.params.id }, data: { remarks: req.body.remarks } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE FROM LOCATION
const updateFromLocation = async (req, res) => {
  try {
    await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { fromLocation: req.body.fromLocation } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE TO LOCATION
const updateToLocation = async (req, res) => {
  try {
    await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { toLocation: req.body.toLocation } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE RATES
const updateRates = async (req, res) => {
  try {
    const data = {};
    if (req.body.sellingRate !== undefined) data.sellingRate = parseFloat(req.body.sellingRate);
    if (req.body.weight !== undefined) data.weight = parseFloat(req.body.weight);
    if (Object.keys(data).length > 0) await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'RATES_ADDED', freightForwarding: { update: { data } }, statusHistory: { create: { status: 'RATES_ADDED', remarks: 'Rates updated' } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE SCHEDULE
const updateSchedule = async (req, res) => {
  try {
    const data = {};
    if (req.body.etd) data.etd = new Date(req.body.etd);
    if (req.body.eta) data.eta = new Date(req.body.eta);
    if (Object.keys(data).length > 0) await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'SCHEDULED', freightForwarding: { update: { data } }, statusHistory: { create: { status: 'SCHEDULED', remarks: 'Schedule updated' } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE NOMINATION
const updateNomination = async (req, res) => {
  try {
    if (req.body.nominationDate) await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'NOMINATED', freightForwarding: { update: { nominationDate: new Date(req.body.nominationDate) } }, statusHistory: { create: { status: 'NOMINATED', remarks: `Nominated: ${req.body.nominationDate}` } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE BOOKING
const updateBooking = async (req, res) => {
  try {
    if (req.body.bookingDate) await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'BOOKED', freightForwarding: { update: { bookingDate: new Date(req.body.bookingDate) } }, statusHistory: { create: { status: 'BOOKED', remarks: `Booked: ${req.body.bookingDate}` } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE AWB
const updateAWB = async (req, res) => {
  try {
    const data = {};
    if (req.body.mawb !== undefined) data.mawb = req.body.mawb;
    if (req.body.hawb !== undefined) data.hawb = req.body.hawb;
    if (req.body.awbDate) data.awbDate = new Date(req.body.awbDate);
    if (Object.keys(data).length > 0) await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'AWB_GENERATED', freightForwarding: { update: { data } }, statusHistory: { create: { status: 'AWB_GENERATED', remarks: 'AWB updated' } } } });
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { createShipment, exportShipments, getAllShipments, getShipmentById, updateStage, updateRemarks, updateFromLocation, updateToLocation, updateRates, updateNomination, updateBooking, updateSchedule, updateAWB };