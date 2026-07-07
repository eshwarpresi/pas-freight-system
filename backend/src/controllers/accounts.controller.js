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

// ─── UPDATE INVOICE ───
// Auto-archive when invoice is complete (Number + Date + Sending Date all present)
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
      // Update invoice
      await prisma.shipment.update({ 
        where: { id }, 
        data: { 
          currentStatus: 'INVOICE_GENERATED', 
          accounts: { update: { data } }, 
          statusHistory: { 
            create: { 
              status: 'INVOICE_GENERATED', 
              remarks: parts.join(' | ') 
            } 
          } 
        } 
      });
    }

    // ─── CHECK IF INVOICE IS COMPLETE ───
    // Get current accounts to check if all three fields are present
    const currentAccounts = await prisma.accounts.findUnique({
      where: { shipmentId: id }
    });

    // Check if invoice is fully complete (has Invoice No, Date, and Sending Date)
    const isInvoiceComplete = 
      currentAccounts?.invoiceNumber && 
      currentAccounts?.invoiceDate && 
      currentAccounts?.sendingDate;

    if (isInvoiceComplete) {
      // Auto-archive the shipment
      await prisma.shipment.update({
        where: { id },
        data: {
          isArchived: true,
          statusHistory: {
            create: {
              status: 'COMPLETED',
              remarks: 'Shipment auto-archived (Invoice complete - has Number, Date, and Sending Date)'
            }
          }
        }
      });
    }

    const s = await getFullShipment(id);
    res.json({ 
      status: 'success', 
      data: s,
      message: isInvoiceComplete ? 'Invoice updated and shipment auto-archived' : 'Invoice updated'
    });
  } catch (e) { 
    console.error(e); 
    res.status(500).json({ status: 'error', message: 'Failed to update invoice' }); 
  }
};

// ─── UPDATE INVOICE SENDING ───
// Auto-archive when invoice sending date is set (if invoice already has Number and Date)
const updateInvoiceSending = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureAccounts(id);
    
    let isArchived = false;
    const parts = [];
    
    if (req.body.sendingDate) {
      const sendingDate = new Date(req.body.sendingDate);
      parts.push(`Invoice Sent Date: ${req.body.sendingDate}`);
      
      // Update sending date
      await prisma.shipment.update({ 
        where: { id }, 
        data: { 
          currentStatus: 'INVOICE_SENT', 
          accounts: { update: { sendingDate: sendingDate } }, 
          statusHistory: { 
            create: { 
              status: 'INVOICE_SENT', 
              remarks: `Invoice Sent Date: ${req.body.sendingDate}` 
            } 
          } 
        } 
      });
      
      // ─── CHECK IF INVOICE IS NOW COMPLETE ───
      // Get current accounts to check if all three fields are present
      const currentAccounts = await prisma.accounts.findUnique({
        where: { shipmentId: id }
      });
      
      // Check if invoice is fully complete (has Invoice No, Date, and Sending Date)
      const isInvoiceComplete = 
        currentAccounts?.invoiceNumber && 
        currentAccounts?.invoiceDate && 
        currentAccounts?.sendingDate;
      
      if (isInvoiceComplete) {
        // Auto-archive the shipment
        await prisma.shipment.update({
          where: { id },
          data: {
            isArchived: true,
            statusHistory: {
              create: {
                status: 'COMPLETED',
                remarks: 'Shipment auto-archived (Invoice complete - has Number, Date, and Sending Date)'
              }
            }
          }
        });
        isArchived = true;
      }
    }
    
    const s = await getFullShipment(id);
    res.json({ 
      status: 'success', 
      data: s,
      message: isArchived ? 'Invoice sent and shipment auto-archived' : 'Invoice sent'
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