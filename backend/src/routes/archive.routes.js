const express = require('express');
const router = express.Router();

// ─── ARCHIVE SHIPMENT ───
router.put('/shipments/:id/archive', async (req, res) => {
  const prisma = require('../utils/prisma');
  try {
    const { id } = req.params;
    
    // Get shipment with all related data
    const existing = await prisma.shipment.findUnique({
      where: { id },
      include: {
        accounts: true,
        freightForwarding: true,
        cha: true
      }
    });

    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Shipment not found' });
    }

    // ─── VALIDATE: Only INVOICE_SENT or INVOICE_GENERATED can be archived ───
    const allowedStatuses = ['INVOICE_SENT', 'INVOICE_GENERATED'];
    const isAllowed = allowedStatuses.includes(existing.currentStatus);
    
    if (!isAllowed) {
      return res.status(400).json({ 
        status: 'error', 
        message: `Cannot archive shipment with status: ${existing.currentStatus}. Only INVOICE_SENT or INVOICE_GENERATED shipments can be archived.`,
        currentStatus: existing.currentStatus,
        allowedStatuses: allowedStatuses
      });
    }

    // ─── SET ORIGINAL STATUS BEFORE ARCHIVING ───
    const originalStatus = existing.currentStatus;

    const shipment = await prisma.shipment.update({
      where: { id },
      data: {
        isArchived: true,
        isDeleted: false,
        currentStatus: 'COMPLETED',
        statusHistory: {
          create: {
            status: 'COMPLETED',
            remarks: `Shipment archived (Original status: ${originalStatus} | Invoice: ${existing.accounts?.invoiceNumber || 'N/A'})`
          }
        }
      },
      include: {
        freightForwarding: true,
        cha: true,
        accounts: true,
        statusHistory: true
      }
    });

    res.json({ 
      status: 'success', 
      data: shipment,
      message: 'Shipment archived successfully'
    });
  } catch (error) {
    console.error('Error archiving shipment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to archive' });
  }
});

// ─── UNARCHIVE SHIPMENT ───
router.put('/shipments/:id/unarchive', async (req, res) => {
  const prisma = require('../utils/prisma');
  try {
    const { id } = req.params;
    
    const existing = await prisma.shipment.findUnique({
      where: { id },
      include: {
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Shipment not found' });
    }

    // Find the status before COMPLETED (original status)
    let originalStatus = 'ENQUIRY';
    const history = existing.statusHistory || [];
    
    // Find the last status before 'COMPLETED'
    for (let i = 0; i < history.length; i++) {
      if (history[i].status === 'COMPLETED' && i + 1 < history.length) {
        originalStatus = history[i + 1].status || 'ENQUIRY';
        break;
      }
    }
    
    // If no previous status found, try to find any non-COMPLETED status
    if (originalStatus === 'COMPLETED' || originalStatus === 'ENQUIRY') {
      const nonCompletedStatus = history.find(h => h.status !== 'COMPLETED' && h.status !== 'ARCHIVED');
      if (nonCompletedStatus) {
        originalStatus = nonCompletedStatus.status;
      }
    }

    const shipment = await prisma.shipment.update({
      where: { id },
      data: { 
        isArchived: false,
        isDeleted: false,
        currentStatus: originalStatus,
        statusHistory: {
          create: {
            status: 'RESTORED',
            remarks: `Shipment restored from archive (Restored to: ${originalStatus})`
          }
        }
      },
      include: {
        freightForwarding: true,
        cha: true,
        accounts: true,
        statusHistory: true
      }
    });

    res.json({ 
      status: 'success', 
      data: shipment,
      message: 'Shipment restored from archive'
    });
  } catch (error) {
    console.error('Error unarchiving shipment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to unarchive' });
  }
});

// ─── SOFT DELETE (MOVE TO BIN) ───
router.put('/shipments/:id/delete', async (req, res) => {
  const prisma = require('../utils/prisma');
  try {
    const { id } = req.params;
    
    const user = req.user || {};
    const deletedByName = user.name || user.email || 'Unknown';
    
    const existing = await prisma.shipment.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Shipment not found' });
    }

    if (existing.isDeleted) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Shipment is already in bin' 
      });
    }

    const shipment = await prisma.shipment.update({
      where: { id },
      data: {
        isDeleted: true,
        isArchived: false,
        deletedAt: new Date(),
        deletedBy: deletedByName,
        statusHistory: {
          create: {
            status: 'DELETED',
            remarks: `Shipment moved to bin by ${deletedByName} (Original status: ${existing.currentStatus})`
          }
        }
      },
      include: {
        freightForwarding: true,
        cha: true,
        accounts: true,
        statusHistory: true
      }
    });

    res.json({ 
      status: 'success', 
      data: shipment,
      message: 'Shipment moved to bin successfully'
    });
  } catch (error) {
    console.error('Error deleting shipment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to move to bin' });
  }
});

// ─── RESTORE FROM BIN ───
router.put('/shipments/:id/restore', async (req, res) => {
  const prisma = require('../utils/prisma');
  try {
    const { id } = req.params;
    
    const user = req.user || {};
    const restoredByName = user.name || user.email || 'Unknown';
    
    const existing = await prisma.shipment.findUnique({
      where: { id },
      include: {
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Shipment not found' });
    }

    if (!existing.isDeleted) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Shipment is not in bin' 
      });
    }

    let originalStatus = 'ENQUIRY';
    const history = existing.statusHistory || [];
    
    for (let i = 0; i < history.length; i++) {
      if (history[i].status === 'DELETED' && i + 1 < history.length) {
        originalStatus = history[i + 1].status || 'ENQUIRY';
        break;
      }
    }
    
    if (originalStatus === 'DELETED' || originalStatus === 'ENQUIRY') {
      const nonDeletedStatus = history.find(h => h.status !== 'DELETED');
      if (nonDeletedStatus) {
        originalStatus = nonDeletedStatus.status;
      }
    }

    const wasArchived = existing.isArchived || false;
    const wasCompleted = ['COMPLETED', 'DELIVERED'].includes(originalStatus);

    const shipment = await prisma.shipment.update({
      where: { id },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        isArchived: wasArchived || wasCompleted,
        currentStatus: originalStatus,
        statusHistory: {
          create: {
            status: 'RESTORED',
            remarks: `Shipment restored from bin by ${restoredByName} (Restored to: ${originalStatus})`
          }
        }
      },
      include: {
        freightForwarding: true,
        cha: true,
        accounts: true,
        statusHistory: true
      }
    });

    res.json({ 
      status: 'success', 
      data: shipment,
      message: 'Shipment restored successfully'
    });
  } catch (error) {
    console.error('Error restoring shipment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to restore' });
  }
});

// ─── GET BIN (Deleted) SHIPMENTS ───
router.get('/shipments/bin', async (req, res) => {
  const prisma = require('../utils/prisma');
  try {
    const { page = 1, limit = 25, search } = req.query;
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit) || 25));

    const where = { isDeleted: true };
    
    if (search) {
      where.OR = [
        { refNo: { contains: search } },
        { freightForwarding: { consigneeName: { contains: search } } },
        { freightForwarding: { hawb: { contains: search } } },
        { freightForwarding: { mawb: { contains: search } } },
        { cha: { boeNo: { contains: search } } },
        { cha: { sbNo: { contains: search } } },
        { accounts: { invoiceNumber: { contains: search } } },
        { freightForwarding: { customerName: { contains: search } } }
      ];
    }

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        select: {
          id: true,
          refNo: true,
          currentStatus: true,
          shipmentStage: true,
          shipmentType: true,
          importExport: true,
          createdByName: true,
          createdAt: true,
          deletedAt: true,
          deletedBy: true,
          isArchived: true,
          freightForwarding: {
            select: {
              consigneeName: true,
              hawb: true,
              mawb: true,
              agent: true,
              customerName: true,
              transportMode: true,
              weight: true,
              grossWeight: true,
              cbm: true,
              sellingRate: true,
              fromLocation: true,
              toLocation: true,
              deliveryDate: true
            }
          },
          cha: { select: { boeNo: true, sbNo: true } },
          accounts: { select: { invoiceNumber: true, invoiceDate: true } }
        },
        orderBy: { deletedAt: 'desc' },
        skip: (p - 1) * l,
        take: l
      }),
      prisma.shipment.count({ where })
    ]);

    res.json({
      status: 'success',
      data: shipments,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      }
    });
  } catch (error) {
    console.error('Error fetching bin shipments:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch bin' });
  }
});

// ─── BULK RESTORE FROM BIN ───
router.put('/shipments/bin/restore-bulk', async (req, res) => {
  const prisma = require('../utils/prisma');
  try {
    const { ids } = req.body;
    const user = req.user || {};
    const restoredByName = user.name || user.email || 'Unknown';
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No shipment IDs provided' });
    }

    const results = [];
    for (const id of ids) {
      try {
        const existing = await prisma.shipment.findUnique({
          where: { id },
          include: {
            statusHistory: {
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          }
        });

        if (!existing || !existing.isDeleted) continue;

        let originalStatus = 'ENQUIRY';
        const history = existing.statusHistory || [];
        for (let i = 0; i < history.length; i++) {
          if (history[i].status === 'DELETED' && i + 1 < history.length) {
            originalStatus = history[i + 1].status || 'ENQUIRY';
            break;
          }
        }
        if (originalStatus === 'DELETED') {
          const nonDeletedStatus = history.find(h => h.status !== 'DELETED');
          if (nonDeletedStatus) originalStatus = nonDeletedStatus.status;
        }

        const wasArchived = existing.isArchived || false;
        const wasCompleted = ['COMPLETED', 'DELIVERED'].includes(originalStatus);

        await prisma.shipment.update({
          where: { id },
          data: {
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            isArchived: wasArchived || wasCompleted,
            currentStatus: originalStatus,
            statusHistory: {
              create: {
                status: 'RESTORED',
                remarks: `Shipment restored from bin by ${restoredByName}`
              }
            }
          }
        });
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: err.message });
      }
    }

    res.json({
      status: 'success',
      data: results,
      message: `Restored ${results.filter(r => r.success).length} of ${ids.length} shipments`
    });
  } catch (error) {
    console.error('Error bulk restoring:', error);
    res.status(500).json({ status: 'error', message: 'Failed to restore shipments' });
  }
});

// ─── GET BIN COUNT ───
router.get('/shipments/bin/count', async (req, res) => {
  const prisma = require('../utils/prisma');
  try {
    const count = await prisma.shipment.count({
      where: { isDeleted: true }
    });
    res.json({ status: 'success', data: { count } });
  } catch (error) {
    console.error('Error getting bin count:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get bin count' });
  }
});

module.exports = router;