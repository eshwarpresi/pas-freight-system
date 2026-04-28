const prisma = require('../utils/prisma');

// ==========================================
// CREATE NEW SHIPMENT (ENQUIRY)
// ==========================================
const createShipment = async (req, res) => {
  try {
    const { refNo, enquiryDate, noOfPackages, consigneeName, shipperName, agent } = req.body;

    if (!refNo) {
      return res.status(400).json({ status: 'error', message: 'Reference Number (refNo) is required' });
    }

    const exists = await prisma.shipment.findUnique({ where: { refNo }, select: { id: true } });
    if (exists) {
      return res.status(400).json({ status: 'error', message: 'Shipment with this Reference Number already exists' });
    }

    const shipment = await prisma.shipment.create({
      data: {
        refNo,
        currentStatus: 'ENQUIRY',
        freightForwarding: {
          create: {
            enquiryDate: enquiryDate ? new Date(enquiryDate) : null,
            noOfPackages: noOfPackages ? parseInt(noOfPackages) : null,
            consigneeName, shipperName, agent
          }
        },
        statusHistory: { create: { status: 'ENQUIRY', remarks: 'Shipment enquiry created' } }
      },
      include: { freightForwarding: true, statusHistory: { take: 1, orderBy: { createdAt: 'desc' } } }
    });

    res.status(201).json({ status: 'success', data: shipment });
  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to create shipment' });
  }
};

// ==========================================
// EXPORT SHIPMENTS TO EXCEL
// ==========================================
const exportShipments = async (req, res) => {
  try {
    const { status, search, isArchived } = req.query;
    const where = { isArchived: isArchived === 'true' };
    if (status) where.currentStatus = status;
    if (search) {
      where.OR = [
        { refNo: { contains: search } },
        { freightForwarding: { consigneeName: { contains: search } } },
        { freightForwarding: { shipperName: { contains: search } } }
      ];
    }

    const shipments = await prisma.shipment.findMany({
      where,
      select: {
        refNo: true, currentStatus: true, createdAt: true,
        freightForwarding: { select: { enquiryDate: true, noOfPackages: true, consigneeName: true, shipperName: true, agent: true, sellingRate: true, weight: true, bookingDate: true, etd: true, eta: true, mawb: true, hawb: true, awbDate: true } },
        cha: { select: { jobNo: true, checklistDate: true, boeNo: true, boeDate: true, doCollectionDate: true, oocDate: true, gatePassDate: true, deliveryDate: true, trackingNumber: true } },
        accounts: { select: { invoiceNumber: true, invoiceDate: true, sendingDate: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const { exportShipmentsToExcel } = require('../utils/excelExport');
    await exportShipmentsToExcel(shipments, res);
  } catch (error) {
    console.error('Error exporting shipments:', error);
    res.status(500).json({ status: 'error', message: 'Failed to export shipments' });
  }
};

// ==========================================
// GET ALL SHIPMENTS - OPTIMIZED
// ==========================================
const getAllShipments = async (req, res) => {
  try {
    const { status, search, isArchived, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const skip = (pageNum - 1) * limitNum;

    const where = { isArchived: isArchived === 'true' };
    if (status) where.currentStatus = status;
    if (search) {
      where.OR = [
        { refNo: { contains: search } },
        { freightForwarding: { consigneeName: { contains: search } } },
        { freightForwarding: { shipperName: { contains: search } } }
      ];
    }

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        select: { id: true, refNo: true, currentStatus: true, createdAt: true, freightForwarding: { select: { consigneeName: true, shipperName: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.shipment.count({ where })
    ]);

    res.json({ status: 'success', data: shipments, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch shipments' });
  }
};

// ==========================================
// GET SINGLE SHIPMENT BY ID
// ==========================================
const getShipmentById = async (req, res) => {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: req.params.id },
      include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } }
    });
    if (!shipment) return res.status(404).json({ status: 'error', message: 'Shipment not found' });
    res.json({ status: 'success', data: shipment });
  } catch (error) {
    console.error('Error fetching shipment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch shipment' });
  }
};

// ==========================================
// UPDATE RATES
// ==========================================
const updateRates = async (req, res) => {
  try {
    const { id } = req.params;
    const { sellingRate, weight } = req.body;
    if (!sellingRate || !weight) return res.status(400).json({ status: 'error', message: 'Selling Rate and Weight are required' });
    const updated = await prisma.shipment.update({
      where: { id },
      data: { currentStatus: 'RATES_ADDED', freightForwarding: { update: { sellingRate: parseFloat(sellingRate), weight: parseFloat(weight) } }, statusHistory: { create: { status: 'RATES_ADDED', remarks: `Rates: ${sellingRate}, Weight: ${weight}` } } },
      select: { id: true, currentStatus: true, freightForwarding: { select: { sellingRate: true, weight: true } }, statusHistory: { take: 1, orderBy: { createdAt: 'desc' }, select: { status: true, remarks: true, createdAt: true } } }
    });
    res.json({ status: 'success', data: updated });
  } catch (error) {
    console.error('Error updating rates:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update rates' });
  }
};

// ==========================================
// UPDATE NOMINATION
// ==========================================
const updateNomination = async (req, res) => {
  try {
    const { id } = req.params;
    const { nominationDate } = req.body;
    if (!nominationDate) return res.status(400).json({ status: 'error', message: 'Nomination Date is required' });
    const updated = await prisma.shipment.update({
      where: { id },
      data: { currentStatus: 'NOMINATED', freightForwarding: { update: { nominationDate: new Date(nominationDate) } }, statusHistory: { create: { status: 'NOMINATED', remarks: `Nominated: ${nominationDate}` } } },
      select: { id: true, currentStatus: true, freightForwarding: { select: { nominationDate: true } }, statusHistory: { take: 1, orderBy: { createdAt: 'desc' }, select: { status: true, remarks: true } } }
    });
    res.json({ status: 'success', data: updated });
  } catch (error) {
    console.error('Error updating nomination:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update nomination' });
  }
};

// ==========================================
// UPDATE BOOKING
// ==========================================
const updateBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate } = req.body;
    if (!bookingDate) return res.status(400).json({ status: 'error', message: 'Booking Date is required' });
    const updated = await prisma.shipment.update({
      where: { id },
      data: { currentStatus: 'BOOKED', freightForwarding: { update: { bookingDate: new Date(bookingDate) } }, statusHistory: { create: { status: 'BOOKED', remarks: `Booked: ${bookingDate}` } } },
      select: { id: true, currentStatus: true, freightForwarding: { select: { bookingDate: true } }, statusHistory: { take: 1, orderBy: { createdAt: 'desc' }, select: { status: true, remarks: true } } }
    });
    res.json({ status: 'success', data: updated });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update booking' });
  }
};

// ==========================================
// UPDATE SCHEDULE
// ==========================================
const updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { etd, eta } = req.body;
    if (!etd || !eta) return res.status(400).json({ status: 'error', message: 'ETD and ETA are required' });
    const updated = await prisma.shipment.update({
      where: { id },
      data: { currentStatus: 'SCHEDULED', freightForwarding: { update: { etd: new Date(etd), eta: new Date(eta) } }, statusHistory: { create: { status: 'SCHEDULED', remarks: `ETD: ${etd}, ETA: ${eta}` } } },
      select: { id: true, currentStatus: true, freightForwarding: { select: { etd: true, eta: true } }, statusHistory: { take: 1, orderBy: { createdAt: 'desc' }, select: { status: true, remarks: true } } }
    });
    res.json({ status: 'success', data: updated });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update schedule' });
  }
};

// ==========================================
// UPDATE AWB
// ==========================================
const updateAWB = async (req, res) => {
  try {
    const { id } = req.params;
    const { mawb, hawb, awbDate } = req.body;
    if (!mawb || !hawb) return res.status(400).json({ status: 'error', message: 'MAWB and HAWB are required' });
    const updated = await prisma.shipment.update({
      where: { id },
      data: { currentStatus: 'AWB_GENERATED', freightForwarding: { update: { mawb, hawb, awbDate: awbDate ? new Date(awbDate) : new Date() } }, statusHistory: { create: { status: 'AWB_GENERATED', remarks: `AWB: ${mawb} / ${hawb}` } } },
      select: { id: true, currentStatus: true, freightForwarding: { select: { mawb: true, hawb: true, awbDate: true } }, statusHistory: { take: 1, orderBy: { createdAt: 'desc' }, select: { status: true, remarks: true } } }
    });
    res.json({ status: 'success', data: updated });
  } catch (error) {
    console.error('Error updating AWB:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update AWB' });
  }
};

module.exports = { createShipment, exportShipments, getAllShipments, getShipmentById, updateRates, updateNomination, updateBooking, updateSchedule, updateAWB };