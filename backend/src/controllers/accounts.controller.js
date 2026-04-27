const prisma = require('../utils/prisma');

// ==========================================
// UPDATE INVOICE
// ==========================================
const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { invoiceNumber, invoiceDate } = req.body;

    if (!invoiceNumber || !invoiceDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Invoice Number and Date are required'
      });
    }

    // Check if accounts record exists, if not create it
    const existingAccounts = await prisma.accounts.findUnique({
      where: { shipmentId: id }
    });

    let updatedShipment;

    if (existingAccounts) {
      updatedShipment = await prisma.shipment.update({
        where: { id },
        data: {
          currentStatus: 'INVOICE_GENERATED',
          accounts: {
            update: {
              invoiceNumber,
              invoiceDate: new Date(invoiceDate)
            }
          },
          statusHistory: {
            create: {
              status: 'INVOICE_GENERATED',
              remarks: `Invoice Generated - No: ${invoiceNumber}`
            }
          }
        },
        include: {
          accounts: true,
          statusHistory: true
        }
      });
    } else {
      updatedShipment = await prisma.shipment.update({
        where: { id },
        data: {
          currentStatus: 'INVOICE_GENERATED',
          accounts: {
            create: {
              invoiceNumber,
              invoiceDate: new Date(invoiceDate)
            }
          },
          statusHistory: {
            create: {
              status: 'INVOICE_GENERATED',
              remarks: `Invoice Generated - No: ${invoiceNumber}`
            }
          }
        },
        include: {
          accounts: true,
          statusHistory: true
        }
      });
    }

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update invoice'
    });
  }
};

// ==========================================
// UPDATE INVOICE SENDING
// ==========================================
const updateInvoiceSending = async (req, res) => {
  try {
    const { id } = req.params;
    const { sendingDate } = req.body;

    if (!sendingDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Sending Date is required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'INVOICE_SENT',
        accounts: {
          update: {
            sendingDate: new Date(sendingDate)
          }
        },
        statusHistory: {
          create: {
            status: 'INVOICE_SENT',
            remarks: `Invoice sent on ${sendingDate}`
          }
        }
      },
      include: {
        accounts: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating invoice sending:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update invoice sending'
    });
  }
};

// ==========================================
// GET ALL INVOICES
// ==========================================
const getAllInvoices = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    const where = {};
    
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
        {
          shipment: {
            refNo: { contains: search }
          }
        }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [invoices, total] = await Promise.all([
      prisma.accounts.findMany({
        where,
        include: {
          shipment: {
            select: {
              id: true,
              refNo: true,
              currentStatus: true
            }
          }
        },
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

  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch invoices'
    });
  }
};

module.exports = {
  updateInvoice,
  updateInvoiceSending,
  getAllInvoices
};