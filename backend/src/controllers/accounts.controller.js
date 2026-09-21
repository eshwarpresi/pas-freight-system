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

// Same pattern as freightForwarding.controller.js / cha.controller.js —
// resolves the logged-in user's display name for status-history
// attribution.
function actorName(req) {
  return req.user?.name || req.user?.email || null;
}

// ─── ACCOUNTS "HANDLED BY" AUTO-STAMP (NEW) ───
// The first time anyone in Accounts acts on a shipment, this stamps their
// id+name onto the shipment permanently — powers the visible "Accounts:
// <name>" badge and the Team Performance report. Only fires once per
// shipment (checks accountsHandledById is still null), matching the same
// pattern used for Customs in cha.controller.js.
async function stampAccountsHandler(id, req) {
  if (!req.user?.id) return;
  const shipment = await prisma.shipment.findUnique({ where: { id }, select: { accountsHandledById: true } });
  if (shipment && !shipment.accountsHandledById) {
    await prisma.shipment.update({
      where: { id },
      data: { accountsHandledById: req.user.id, accountsHandledByName: actorName(req) }
    });
  }
}

// ─── MARK INVOICE COMPLETE (NEW) ───
// Replaces the old "archive immediately" behavior. The moment Invoice No
// + Invoice Date + Sending Date are ALL present for the first time, this
// stamps `completedAt` on the Accounts record (once — never overwritten
// on later edits) and logs a status-history entry. The shipment itself
// stays in Active; a separate 30-day-matured sweep (in
// freightForwarding.controller.js, run whenever shipments are listed)
// is what actually flips isArchived to true, once 30 days have passed
// since this timestamp. This gives the Accounts team a full month to
// catch mistakes or amend the invoice before the shipment disappears
// into Archive.
async function markInvoiceCompleteIfReady(id, req) {
  const currentAccounts = await prisma.accounts.findUnique({ where: { shipmentId: id } });
  const isInvoiceComplete =
    currentAccounts?.invoiceNumber &&
    currentAccounts?.invoiceDate &&
    currentAccounts?.sendingDate;

  if (isInvoiceComplete && !currentAccounts.completedAt) {
    await prisma.shipment.update({
      where: { id },
      data: {
        accounts: { update: { completedAt: new Date() } },
        statusHistory: {
          create: {
            status: 'INVOICE_COMPLETE',
            remarks: 'Invoice fully complete (Number, Date, Sending Date) — will move to Archive automatically in 30 days',
            changedBy: actorName(req)
          }
        }
      }
    });
    return true;
  }
  return false;
}

// ─── UPDATE INVOICE ───
const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureAccounts(id);
    const data = {};
    const parts = [];
    if (req.body.invoiceNumber !== undefined) { 
      data.invoiceNumber = req.body.invoiceNumber; 
      parts.push(`Invoice No: ${req.body.invoiceNumber}`); 
    }
    if (req.body.invoiceDate) { 
      data.invoiceDate = new Date(req.body.invoiceDate); 
      parts.push(`Invoice Date: ${req.body.invoiceDate}`); 
    }
    
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ 
        where: { id }, 
        data: { 
          currentStatus: 'INVOICE_GENERATED', 
          accounts: { update: { data } }, 
          statusHistory: { 
            create: { 
              status: 'INVOICE_GENERATED', 
              remarks: parts.join(' | '),
              changedBy: actorName(req)
            } 
          } 
        } 
      });
      await stampAccountsHandler(id, req);
    }

    const justCompleted = await markInvoiceCompleteIfReady(id, req);

    const s = await getFullShipment(id);
    res.json({ 
      status: 'success', 
      data: s,
      message: justCompleted ? 'Invoice updated — complete, will archive automatically in 30 days' : 'Invoice updated'
    });
  } catch (e) { 
    console.error(e); 
    res.status(500).json({ status: 'error', message: 'Failed to update invoice' }); 
  }
};

// ─── UPDATE INVOICE SENDING ───
const updateInvoiceSending = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureAccounts(id);
    
    let justCompleted = false;
    
    if (req.body.sendingDate) {
      const sendingDate = new Date(req.body.sendingDate);
      
      await prisma.shipment.update({ 
        where: { id }, 
        data: { 
          currentStatus: 'INVOICE_SENT', 
          accounts: { update: { sendingDate: sendingDate } }, 
          statusHistory: { 
            create: { 
              status: 'INVOICE_SENT', 
              remarks: `Invoice Sent Date: ${req.body.sendingDate}`,
              changedBy: actorName(req)
            } 
          } 
        } 
      });
      await stampAccountsHandler(id, req);
      
      justCompleted = await markInvoiceCompleteIfReady(id, req);
    }
    
    const s = await getFullShipment(id);
    res.json({ 
      status: 'success', 
      data: s,
      message: justCompleted ? 'Invoice sent — complete, will archive automatically in 30 days' : 'Invoice sent'
    });
  } catch (e) { 
    console.error(e); 
    res.status(500).json({ status: 'error', message: 'Failed to update invoice sending' }); 
  }
};

// ─── GET ALL INVOICES ───
const getAllInvoices = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const where = {};
    if (search) where.OR = [{ invoiceNumber: { contains: search } }, { shipment: { refNo: { contains: search } } }];
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [invoices, total] = await Promise.all([
      prisma.accounts.findMany({ 
        where, 
        include: { shipment: { select: { id: true, refNo: true, currentStatus: true, isArchived: true } } }, 
        orderBy: { createdAt: 'desc' }, 
        skip, 
        take: parseInt(limit) 
      }),
      prisma.accounts.count({ where })
    ]);
    res.json({ 
      status: 'success', 
      data: invoices, 
      pagination: { 
        total, 
        page: parseInt(page), 
        limit: parseInt(limit), 
        totalPages: Math.ceil(total / parseInt(limit)) 
      } 
    });
  } catch (e) { 
    console.error(e); 
    res.status(500).json({ status: 'error', message: 'Failed to fetch invoices' }); 
  }
};

module.exports = { updateInvoice, updateInvoiceSending, getAllInvoices };