const prisma = require('../utils/prisma');

// Helper: ensure Accounts record exists
async function ensureAccounts(shipmentId) {
  const existing = await prisma.accounts.findUnique({ where: { shipmentId } });
  if (!existing) {
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { accounts: { create: {} } }
    });
  }
}

// UPDATE INVOICE (partial)
const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureAccounts(id);
    const data = {};
    if (req.body.invoiceNumber !== undefined) data.invoiceNumber = req.body.invoiceNumber;
    if (req.body.invoiceDate) data.invoiceDate = new Date(req.body.invoiceDate);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { accounts: { update: { data } } }, select: { id: true, accounts: true } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE INVOICE SENDING (partial)
const updateInvoiceSending = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureAccounts(id);
    const data = {};
    if (req.body.sendingDate) data.sendingDate = new Date(req.body.sendingDate);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { accounts: { update: { data } } }, select: { id: true, accounts: true } });
    res.json({ status: 'success', data: u });
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