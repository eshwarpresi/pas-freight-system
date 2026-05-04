const prisma = require('../utils/prisma');

async function ensureAccounts(shipmentId) {
  const existing = await prisma.accounts.findUnique({ where: { shipmentId } });
  if (!existing) {
    await prisma.shipment.update({ where: { id: shipmentId }, data: { accounts: { create: {} } } });
  }
}

async function getFullShipment(id) {
  return await prisma.shipment.findUnique({
    where: { id },
    include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } }
  });
}

// UPDATE INVOICE
const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureAccounts(id);
    const data = {};
    if (req.body.invoiceNumber !== undefined) data.invoiceNumber = req.body.invoiceNumber;
    if (req.body.invoiceDate) data.invoiceDate = new Date(req.body.invoiceDate);
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'INVOICE_GENERATED', accounts: { update: { data } }, statusHistory: { create: { status: 'INVOICE_GENERATED', remarks: 'Invoice generated' } } } });
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE INVOICE SENDING
const updateInvoiceSending = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureAccounts(id);
    if (req.body.sendingDate) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'INVOICE_SENT', accounts: { update: { sendingDate: new Date(req.body.sendingDate) } }, statusHistory: { create: { status: 'INVOICE_SENT', remarks: 'Invoice sent' } } } });
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// GET ALL INVOICES
const getAllInvoices = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const where = {};
    if (search) where.OR = [{ invoiceNumber: { contains: search } }, { shipment: { refNo: { contains: search } } }];
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [invoices, total] = await Promise.all([
      prisma.accounts.findMany({ where, include: { shipment: { select: { id: true, refNo: true, currentStatus: true } } }, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) }),
      prisma.accounts.count({ where })
    ]);
    res.json({ status: 'success', data: invoices, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { updateInvoice, updateInvoiceSending, getAllInvoices };