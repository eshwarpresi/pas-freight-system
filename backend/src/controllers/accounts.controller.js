const prisma = require('../utils/prisma');
const { recomputeCurrentStatus } = require('./freightForwarding.controller'); // ✅ NEW — shared dynamic status logic

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

// ─── ARCHIVE ELIGIBILITY CHECK (NEW) ───
// Shared with freightForwarding.controller.js's autoArchiveMatured sweep
// (duplicated rather than imported, to avoid a circular require between
// the two controllers — this is a small pure function, cheap to keep in
// sync). A shipment is only eligible to eventually archive once ALL of
// its required fields are filled in — not just the invoice. Required
// fields differ by shipment type, matching what each type's own create/
// edit form actually collects:
//   - Full Freight shipments: From, To, Terms, Gross Weight, Chargeable
//     Weight, HAWB (Freight) + BOE No or SB No (Customs) + Invoice No +
//     Invoice Date (Accounts)
//   - CHA Only: BOE No or SB No (Customs) + Invoice No + Invoice Date
//     (Accounts) — no Freight-tab fields, since CHA Only's own form
//     never collects From/To/Terms
//   - Transport / DO Release / FF Only: Invoice No + Invoice Date only
//     — these simpler workflows don't have a Customs stage at all
function isArchiveEligible(shipment) {
  const ff = shipment.freightForwarding || {};
  const cha = shipment.cha || {};
  const accounts = shipment.accounts || {};

  if (!accounts.invoiceNumber || !accounts.invoiceDate) return false;

  const simpleTypes = ['Transport', 'DO Release', 'FF Only'];
  if (simpleTypes.includes(shipment.shipmentType)) return true;

  const hasCustomsDoc = !!(cha.boeNo || cha.sbNo);
  if (!hasCustomsDoc) return false;

  if (shipment.shipmentType === 'CHA Only') return true;

  // Full Freight shipment — everything required
  return !!(ff.fromLocation && ff.toLocation && ff.terms && ff.grossWeight && ff.weight && ff.hawb);
}

// ─── MARK INVOICE COMPLETE (FIXED) ───
// Now checks ALL required fields for this shipment's type (see
// isArchiveEligible above), not just the 3 accounts fields. The moment
// everything required is present for the first time, this stamps
// `completedAt` on the Accounts record (once — never overwritten on
// later edits) and logs a status-history entry. The shipment itself
// stays in Active; the 30-day-matured sweep (in
// freightForwarding.controller.js, run whenever shipments are listed)
// is what actually flips isArchived to true, once 30 days have passed
// AND the shipment still meets isArchiveEligible at that time.
async function markInvoiceCompleteIfReady(id, req) {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    select: { shipmentType: true, freightForwarding: true, cha: true, accounts: true }
  });
  if (!shipment || !shipment.accounts) return false;
  if (shipment.accounts.completedAt) return false; // already stamped

  if (isArchiveEligible(shipment)) {
    await prisma.shipment.update({
      where: { id },
      data: {
        accounts: { update: { completedAt: new Date() } },
        statusHistory: {
          create: {
            status: 'INVOICE_COMPLETE',
            remarks: 'All required fields complete — will move to Archive automatically in 30 days',
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
    if (req.body.invoiceDate !== undefined) { 
      data.invoiceDate = req.body.invoiceDate ? new Date(req.body.invoiceDate) : null; 
      if (req.body.invoiceDate) parts.push(`Invoice Date: ${req.body.invoiceDate}`); 
    }
    
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ 
        where: { id }, 
        data: { 
          accounts: { update: data }, 
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
      await recomputeCurrentStatus(id); // ✅ NEW — moves status forward or back based on what's actually filled in
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
    
    if (req.body.sendingDate !== undefined) {
      const sendingDate = req.body.sendingDate ? new Date(req.body.sendingDate) : null;
      
      await prisma.shipment.update({ 
        where: { id }, 
        data: { 
          accounts: { update: { sendingDate: sendingDate } }, 
          statusHistory: { 
            create: { 
              status: 'INVOICE_SENT', 
              remarks: sendingDate ? `Invoice Sent Date: ${req.body.sendingDate}` : 'Invoice sent date cleared',
              changedBy: actorName(req)
            } 
          } 
        } 
      });
      await stampAccountsHandler(id, req);
      await recomputeCurrentStatus(id); // ✅ NEW
      
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