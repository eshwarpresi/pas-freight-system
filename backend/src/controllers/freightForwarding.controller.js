const prisma = require('../utils/prisma');

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
      const batch = await prisma.shipment.findMany({ where, select: { refNo: true, currentStatus: true, createdAt: true, shipmentStage: true, remarks: true, freightForwarding: { select: { enquiryDate: true, noOfPackages: true, consigneeName: true, shipperName: true, agent: true, sellingRate: true, weight: true, bookingDate: true, etd: true, eta: true, mawb: true, hawb: true, awbDate: true } }, cha: { select: { jobNo: true, checklistDate: true, boeNo: true, boeDate: true, doCollectionDate: true, oocDate: true, gatePassDate: true, deliveryDate: true, trackingNumber: true } }, accounts: { select: { invoiceNumber: true, invoiceDate: true, sendingDate: true } } }, orderBy: { createdAt: 'desc' }, skip, take: BATCH_SIZE });
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
    const { id } = req.params; const { shipmentStage } = req.body;
    const u = await prisma.shipment.update({ where: { id }, data: { shipmentStage }, select: { id: true, shipmentStage: true } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE REMARKS
const updateRemarks = async (req, res) => {
  try {
    const { id } = req.params; const { remarks } = req.body;
    const u = await prisma.shipment.update({ where: { id }, data: { remarks }, select: { id: true, remarks: true } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// ========== PARTIAL UPDATES - only update what's sent ==========

// UPDATE RATES (partial)
const updateRates = async (req, res) => {
  try {
    const { id } = req.params;
    const data = {};
    if (req.body.sellingRate !== undefined) data.sellingRate = parseFloat(req.body.sellingRate);
    if (req.body.weight !== undefined) data.weight = parseFloat(req.body.weight);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { freightForwarding: { update: { data } } }, select: { id: true, freightForwarding: { select: { sellingRate: true, weight: true } } } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE SCHEDULE (partial)
const updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const data = {};
    if (req.body.etd) data.etd = new Date(req.body.etd);
    if (req.body.eta) data.eta = new Date(req.body.eta);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { freightForwarding: { update: { data } }, statusHistory: { create: { status: 'SCHEDULED', remarks: `Schedule updated` } } }, select: { id: true, freightForwarding: { select: { etd: true, eta: true } } } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE NOMINATION
const updateNomination = async (req, res) => {
  try {
    const { id } = req.params;
    const data = {};
    if (req.body.nominationDate) data.nominationDate = new Date(req.body.nominationDate);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { freightForwarding: { update: { data } } }, select: { id: true, freightForwarding: { select: { nominationDate: true } } } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE BOOKING
const updateBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const data = {};
    if (req.body.bookingDate) data.bookingDate = new Date(req.body.bookingDate);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { freightForwarding: { update: { data } } }, select: { id: true, freightForwarding: { select: { bookingDate: true } } } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE AWB (partial)
const updateAWB = async (req, res) => {
  try {
    const { id } = req.params;
    const data = {};
    if (req.body.mawb !== undefined) data.mawb = req.body.mawb;
    if (req.body.hawb !== undefined) data.hawb = req.body.hawb;
    if (req.body.awbDate) data.awbDate = new Date(req.body.awbDate);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { freightForwarding: { update: { data } } }, select: { id: true, freightForwarding: { select: { mawb: true, hawb: true, awbDate: true } } } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { createShipment, exportShipments, getAllShipments, getShipmentById, updateStage, updateRemarks, updateRates, updateNomination, updateBooking, updateSchedule, updateAWB };