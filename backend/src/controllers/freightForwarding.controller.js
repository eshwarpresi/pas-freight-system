const prisma = require('../utils/prisma');
const { exportShipmentsToExcel } = require('../utils/excelExport');
const { sendStatusEmail } = require('../utils/emailService');

async function upsertStatusEntry(shipmentId, status, remarks) {
  const existing = await prisma.statusHistory.findFirst({
    where: { shipmentId, status },
    orderBy: { createdAt: 'desc' }
  });
  if (existing) {
    await prisma.statusHistory.update({
      where: { id: existing.id },
      data: { remarks, createdAt: new Date() }
    });
  } else {
    await prisma.statusHistory.create({
      data: { shipmentId, status, remarks }
    });
  }
}

// ─── CREATE NEW SHIPMENT ───
const createShipment = async (req, res) => {
  try {
    const { refNo, enquiryDate, noOfPackages, consigneeName, shipperName, agent, shipmentType, importExport, hawb, mawb, awbDate, weight, grossWeight, notificationEmail, customerName, vehicleType, noOfContainers, packageType, deliveryDate, fromLocation, toLocation } = req.body;
    if (!refNo) return res.status(400).json({ status: 'error', message: 'Reference Number (refNo) is required' });
    const createdById = req.user?.id || null;
    const createdByName = req.user?.name || req.user?.email || null;
    const shipment = await prisma.shipment.create({
      data: { 
        refNo, currentStatus: 'ENQUIRY', shipmentType, importExport,
        createdById, createdByName,
        freightForwarding: { create: { enquiryDate: enquiryDate ? new Date(enquiryDate) : null, noOfPackages: noOfPackages ? parseInt(noOfPackages) : null, consigneeName, shipperName, agent, hawb: hawb || null, mawb: mawb || null, awbDate: awbDate ? new Date(awbDate) : null, weight: weight ? parseFloat(weight) : null, grossWeight: grossWeight ? parseFloat(grossWeight) : null, notificationEmail: notificationEmail || null, customerName: customerName || null, vehicleType: vehicleType || null, noOfContainers: noOfContainers ? parseInt(noOfContainers) : null, packageType: packageType || null, deliveryDate: deliveryDate ? new Date(deliveryDate) : null, fromLocation: fromLocation || null, toLocation: toLocation || null } }, 
        statusHistory: { create: { status: 'ENQUIRY', remarks: `Shipment created | Ref: ${refNo}`, changedBy: createdByName } } 
      },
      include: { freightForwarding: true, statusHistory: { take: 1, orderBy: { createdAt: 'desc' } } }
    });
    res.status(201).json({ status: 'success', data: shipment });
  } catch (error) { console.error('Error creating shipment:', error); res.status(500).json({ status: 'error', message: 'Failed to create shipment' }); }
};

// ─── DELETE SINGLE (ORIGINAL - Keeping for backward compatibility) ───
// ⚠️ WARNING: This permanently deletes shipments. Use softDeleteShipment instead.
const deleteShipment = async (req, res) => {
  try { const { id } = req.params; await prisma.shipment.delete({ where: { id } }); res.json({ status: 'success', message: 'Shipment deleted' }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed to delete' }); }
};

// ─── DELETE ALL ───
// ⚠️ WARNING: This permanently deletes ALL shipments.
const deleteAllShipments = async (req, res) => {
  try { await prisma.statusHistory.deleteMany({}); await prisma.freightForwarding.deleteMany({}); await prisma.cHA.deleteMany({}); await prisma.accounts.deleteMany({}); await prisma.shipment.deleteMany({}); res.json({ status: 'success', message: 'All shipments deleted' }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed to delete all' }); }
};

// ─── SOFT DELETE (MOVE TO BIN) ─── ✅
const softDeleteShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedBy = req.user?.name || req.user?.email || 'Unknown';
    
    const existing = await prisma.shipment.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Shipment not found' });
    }

    if (existing.isDeleted) {
      return res.status(400).json({ status: 'error', message: 'Shipment is already in bin' });
    }

    const shipment = await prisma.shipment.update({
      where: { id },
      data: {
        isDeleted: true,
        isArchived: false,
        deletedAt: new Date(),
        deletedBy: deletedBy,
        statusHistory: {
          create: {
            status: 'DELETED',
            remarks: `Shipment moved to bin by ${deletedBy} (Original status: ${existing.currentStatus})`
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
    console.error('Error soft deleting shipment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to move to bin' });
  }
};

// ─── RESTORE FROM BIN ─── ✅
const restoreShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const restoredBy = req.user?.name || req.user?.email || 'Unknown';
    
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
      return res.status(400).json({ status: 'error', message: 'Shipment is not in bin' });
    }

    // Find the original status before deletion
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
            remarks: `Shipment restored from bin by ${restoredBy} (Restored to: ${originalStatus})`
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
};

// ─── GET BIN SHIPMENTS ─── ✅
const getBinShipments = async (req, res) => {
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
          deletedBy: true, // ✅ Who deleted it
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
};

// ─── GET BIN COUNT ─── ✅
const getBinCount = async (req, res) => {
  try {
    const count = await prisma.shipment.count({
      where: { isDeleted: true }
    });
    res.json({ status: 'success', data: { count } });
  } catch (error) {
    console.error('Error getting bin count:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get bin count' });
  }
};

// ─── BULK RESTORE FROM BIN ─── ✅
const bulkRestoreShipments = async (req, res) => {
  try {
    const { ids } = req.body;
    const restoredBy = req.user?.name || req.user?.email || 'Unknown';
    
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
                remarks: `Shipment restored from bin by ${restoredBy}`
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
};

// ─── EXPORT ───
const exportShipments = async (req, res) => {
  try {
    const { status, search } = req.query;
    
    const activeWhere = { isArchived: false, isDeleted: false };
    if (status) activeWhere.currentStatus = status;
    if (search) {
      activeWhere.OR = [
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
    
    const archivedWhere = { isArchived: true, isDeleted: false };
    if (status) archivedWhere.currentStatus = status;
    if (search) {
      archivedWhere.OR = [
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

    const BATCH_SIZE = 5000;
    
    // Fetch active shipments
    const activeTotal = await prisma.shipment.count({ where: activeWhere });
    let activeShipments = [];
    for (let skip = 0; skip < activeTotal; skip += BATCH_SIZE) {
      const batch = await prisma.shipment.findMany({
        where: activeWhere,
        select: {
          refNo: true, currentStatus: true, createdAt: true, shipmentStage: true,
          remarks: true, shipmentType: true, importExport: true, createdByName: true,
          isArchived: true,
          freightForwarding: {
            select: {
              enquiryDate: true, noOfPackages: true, consigneeName: true, shipperName: true,
              agent: true, fromLocation: true, toLocation: true, terms: true,
              sellingRate: true, weight: true, grossWeight: true, cbm: true,
              portLocation: true, bookingDate: true, etd: true, eta: true,
              mawb: true, hawb: true, awbDate: true, customerName: true,
              vehicleType: true, noOfContainers: true, packageType: true,
              deliveryDate: true, transportMode: true
            }
          },
          cha: {
            select: {
              jobNo: true, checklistDate: true, boeNo: true, boeDate: true,
              doCollectionDate: true, oocDate: true, gatePassDate: true,
              deliveryDate: true, trackingNumber: true, sbNo: true, sbDate: true,
              leoDate: true, handOverDate: true
            }
          },
          accounts: {
            select: {
              invoiceNumber: true, invoiceDate: true, sendingDate: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: BATCH_SIZE
      });
      activeShipments = activeShipments.concat(batch);
    }

    // Fetch archived shipments
    const archivedTotal = await prisma.shipment.count({ where: archivedWhere });
    let archivedShipments = [];
    for (let skip = 0; skip < archivedTotal; skip += BATCH_SIZE) {
      const batch = await prisma.shipment.findMany({
        where: archivedWhere,
        select: {
          refNo: true, currentStatus: true, createdAt: true, shipmentStage: true,
          remarks: true, shipmentType: true, importExport: true, createdByName: true,
          isArchived: true,
          freightForwarding: {
            select: {
              enquiryDate: true, noOfPackages: true, consigneeName: true, shipperName: true,
              agent: true, fromLocation: true, toLocation: true, terms: true,
              sellingRate: true, weight: true, grossWeight: true, cbm: true,
              portLocation: true, bookingDate: true, etd: true, eta: true,
              mawb: true, hawb: true, awbDate: true, customerName: true,
              vehicleType: true, noOfContainers: true, packageType: true,
              deliveryDate: true, transportMode: true
            }
          },
          cha: {
            select: {
              jobNo: true, checklistDate: true, boeNo: true, boeDate: true,
              doCollectionDate: true, oocDate: true, gatePassDate: true,
              deliveryDate: true, trackingNumber: true, sbNo: true, sbDate: true,
              leoDate: true, handOverDate: true
            }
          },
          accounts: {
            select: {
              invoiceNumber: true, invoiceDate: true, sendingDate: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: BATCH_SIZE
      });
      archivedShipments = archivedShipments.concat(batch);
    }

    const allShipments = [...activeShipments, ...archivedShipments];
    await exportShipmentsToExcel(allShipments, activeShipments, archivedShipments, res);
  } catch (error) {
    console.error('Error exporting:', error);
    res.status(500).json({ status: 'error', message: 'Failed to export' });
  }
};

// ─── GET ALL SHIPMENTS ───
const getAllShipments = async (req, res) => {
  try {
    const { status, search, isArchived, shipmentType, page = 1, limit = 25 } = req.query;
    console.log('🔍 REQUEST:', { shipmentType, search, isArchived, page, limit });
    
    const p = Math.max(1, parseInt(page)); const l = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const where = { 
      isArchived: isArchived === 'true',
      isDeleted: false // Exclude bin items from normal view
    };
    if (status) where.currentStatus = status;
    if (shipmentType) {
      if (shipmentType === 'CHA_ONLY') where.shipmentType = 'CHA Only';
      else if (shipmentType === 'TRANSPORT') where.shipmentType = 'Transport';
      else if (shipmentType === 'DO_RELEASE') where.shipmentType = 'DO Release';
      else if (shipmentType === 'FF_ONLY') where.shipmentType = 'FF Only';
      else if (shipmentType === 'FULL_SHIPMENT') where.NOT = { shipmentType: { in: ['CHA Only', 'Transport', 'DO Release', 'FF Only'] } };
    }
    if (search) where.OR = [{ refNo: { contains: search } }, { freightForwarding: { consigneeName: { contains: search } } }, { freightForwarding: { hawb: { contains: search } } }, { freightForwarding: { mawb: { contains: search } } }, { cha: { boeNo: { contains: search } } }, { cha: { sbNo: { contains: search } } }, { accounts: { invoiceNumber: { contains: search } } }, { freightForwarding: { customerName: { contains: search } } }];
    
    console.log('🔍 WHERE:', JSON.stringify(where));
    
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({ 
        where, 
        select: { 
          id: true, refNo: true, currentStatus: true, shipmentStage: true, 
          shipmentType: true, importExport: true, createdByName: true, createdAt: true, 
          freightForwarding: { 
            select: { 
              consigneeName: true, hawb: true, mawb: true, agent: true, 
              customerName: true, transportMode: true, weight: true, 
              grossWeight: true, cbm: true, sellingRate: true, 
              fromLocation: true, toLocation: true, deliveryDate: true 
            } 
          }, 
          cha: { select: { boeNo: true, sbNo: true } } 
        }, 
        orderBy: { createdAt: 'desc' }, 
        skip: (p-1)*l, 
        take: l 
      }),
      prisma.shipment.count({ where })
    ]);
    
    console.log('🔍 RESULT total:', total, 'data length:', shipments.length);
    if (shipments.length > 0) {
      console.log('🔍 First shipment:', shipments[0].refNo, 'type:', shipments[0].shipmentType);
    }
    
    res.json({ status: 'success', data: shipments, pagination: { total, page: p, limit: l, totalPages: Math.ceil(total/l) } });
  } catch (error) { console.error('Error fetching:', error); res.status(500).json({ status: 'error', message: 'Failed to fetch' }); }
};

// ─── GET SHIPMENT STATS ───
// Read-only. Returns counts across ALL matching shipments (not just the
// current page), so progress bars / percentages reflect the whole dataset.
const getShipmentStats = async (req, res) => {
  try {
    const { status, search, isArchived, shipmentType } = req.query;

    const where = {
      isArchived: isArchived === 'true',
      isDeleted: false
    };
    if (status) where.currentStatus = status;
    if (shipmentType) {
      if (shipmentType === 'CHA_ONLY') where.shipmentType = 'CHA Only';
      else if (shipmentType === 'TRANSPORT') where.shipmentType = 'Transport';
      else if (shipmentType === 'DO_RELEASE') where.shipmentType = 'DO Release';
      else if (shipmentType === 'FF_ONLY') where.shipmentType = 'FF Only';
      else if (shipmentType === 'FULL_SHIPMENT') where.NOT = { shipmentType: { in: ['CHA Only', 'Transport', 'DO Release', 'FF Only'] } };
    }
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

    const [total, delivered, invoiced, weightAgg] = await Promise.all([
      prisma.shipment.count({ where }),
      prisma.shipment.count({ where: { ...where, currentStatus: { in: ['DELIVERED', 'HAND_OVER'] } } }),
      prisma.shipment.count({ where: { ...where, currentStatus: { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] } } }),
      prisma.freightForwarding.aggregate({
        where: { shipment: where },
        _sum: { noOfPackages: true, grossWeight: true }
      })
    ]);

    res.json({
      status: 'success',
      data: {
        total,
        delivered,
        invoiced,
        deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
        totalPkgs: weightAgg._sum.noOfPackages || 0,
        totalWt: weightAgg._sum.grossWeight || 0
      }
    });
  } catch (error) {
    console.error('Error getting shipment stats:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get stats' });
  }
};

// ─── GET REFERENCE CODE STATS ───
// Read-only, purely derived. Groups every non-bin shipment (active AND
// archived) by the code detected at the start of its refNo (e.g.
// "RLIM-2026-004" -> "RLIM"). Refs that don't follow a letters+number
// pattern (e.g. a fully worded name like "SINGAPORE CONSOLE SHEET") are
// grouped by their full, uppercased text instead, since those are reused
// verbatim across many shipments rather than being a prefix+number scheme.
// No new fields, no schema change — reads only refNo, currentStatus, and
// createdByName, all of which already exist.
function extractReferenceCode(refNo) {
  if (!refNo || !refNo.trim()) return 'UNSPECIFIED';
  const trimmed = refNo.trim();
  const m = trimmed.match(/^([A-Za-z]{2,10})(?=[\s\-_]?\d)/);
  if (m) return m[1].toUpperCase();
  return trimmed.toUpperCase();
}

const CLOSED_STATUSES = ['DELIVERED', 'HAND_OVER', 'COMPLETED', 'INVOICE_SENT'];
const INVOICED_STATUSES = ['INVOICE_GENERATED', 'INVOICE_SENT'];

const getReferenceCodeStats = async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: { isDeleted: false },
      select: {
        refNo: true,
        currentStatus: true,
        createdByName: true
      }
    });

    const groups = {};
    for (const s of shipments) {
      const code = extractReferenceCode(s.refNo);
      if (!groups[code]) {
        groups[code] = { code, total: 0, closed: 0, open: 0, invoiced: 0, employees: {} };
      }
      const g = groups[code];
      g.total += 1;
      if (CLOSED_STATUSES.includes(s.currentStatus)) g.closed += 1;
      else g.open += 1;
      if (INVOICED_STATUSES.includes(s.currentStatus)) g.invoiced += 1;

      const emp = s.createdByName || 'Unknown';
      g.employees[emp] = (g.employees[emp] || 0) + 1;
    }

    const data = Object.values(groups)
      .map((g) => {
        const employeeBreakdown = Object.entries(g.employees)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        return {
          code: g.code,
          total: g.total,
          open: g.open,
          closed: g.closed,
          invoiced: g.invoiced, // ✅ NEW
          closedRate: g.total > 0 ? Math.round((g.closed / g.total) * 100) : 0,
          topHandler: employeeBreakdown[0] || null,
          employeeBreakdown
        };
      })
      .sort((a, b) => b.total - a.total);

    res.json({ status: 'success', data });
  } catch (error) {
    console.error('Error getting reference code stats:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get reference code stats' });
  }
};

// ─── GET SINGLE ───
const getShipmentById = async (req, res) => {
  try { const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); if (!s) return res.status(404).json({ status: 'error', message: 'Not found' }); res.json({ status: 'success', data: s }); } catch (error) { console.error('Error:', error); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// ─── ALL UPDATE ROUTES ───
const updateRefNo = async (req, res) => {
  try { const { refNo } = req.body; if (!refNo) return res.status(400).json({ status: 'error', message: 'Reference Number is required' }); 
    await prisma.shipment.update({ where: { id: req.params.id }, data: { refNo } }); await upsertStatusEntry(req.params.id, 'REFNO_UPDATED', `Ref No: ${refNo}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateConsignee = async (req, res) => {
  try { const val = req.body.consigneeName; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { consigneeName: val } } } }); await upsertStatusEntry(req.params.id, 'CONSIGNEE_UPDATED', `Consignee: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateShipper = async (req, res) => {
  try { const val = req.body.shipperName; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { shipperName: val } } } }); await upsertStatusEntry(req.params.id, 'SHIPPER_UPDATED', `Shipper: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateAgent = async (req, res) => {
  try { const val = req.body.agent; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { agent: val } } } }); await upsertStatusEntry(req.params.id, 'AGENT_UPDATED', `Agent: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateShipmentType = async (req, res) => {
  try { const { shipmentType } = req.body; await prisma.shipment.update({ where: { id: req.params.id }, data: { shipmentType } }); await upsertStatusEntry(req.params.id, 'TYPE_UPDATED', `Mode: ${shipmentType}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateImportExport = async (req, res) => {
  try { const { importExport } = req.body; await prisma.shipment.update({ where: { id: req.params.id }, data: { importExport } }); await upsertStatusEntry(req.params.id, 'IMPORT_EXPORT_UPDATED', `Import/Export: ${importExport}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateStage = async (req, res) => {
  try { const stage = req.body.shipmentStage; await prisma.shipment.update({ where: { id: req.params.id }, data: { shipmentStage: stage } }); await upsertStatusEntry(req.params.id, 'STAGE_CHANGE', `Stage: ${stage}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateRemarks = async (req, res) => {
  try { const remarks = req.body.remarks; await prisma.shipment.update({ where: { id: req.params.id }, data: { remarks } }); await upsertStatusEntry(req.params.id, 'REMARKS', 'Remarks updated'); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateFromLocation = async (req, res) => {
  try { const val = req.body.fromLocation; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { fromLocation: val } } } }); await upsertStatusEntry(req.params.id, 'FROM_LOCATION', `From: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateToLocation = async (req, res) => {
  try { const val = req.body.toLocation; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { toLocation: val } } } }); await upsertStatusEntry(req.params.id, 'TO_LOCATION', `To: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateTerms = async (req, res) => {
  try { const val = req.body.terms; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { terms: val } } } }); await upsertStatusEntry(req.params.id, 'TERMS', `Terms: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateRates = async (req, res) => {
  try { 
    const { sellingRate, weight, cbm, grossWeight, notificationEmail, enquiryDate, noOfPackages, customerName, vehicleType, noOfContainers, packageType, deliveryDate, fromLocation, toLocation, transportMode } = req.body; 
    const data = {}; const parts = []; 
    if (sellingRate !== undefined) { data.sellingRate = parseFloat(sellingRate); parts.push(`Rate: ₹${sellingRate}`); } 
    if (weight !== undefined) { data.weight = parseFloat(weight); parts.push(`Chargeable Wt: ${weight}kg`); } 
    if (cbm !== undefined) { data.cbm = parseFloat(cbm); parts.push(`CBM: ${cbm}`); } 
    if (grossWeight !== undefined) { data.grossWeight = parseFloat(grossWeight); parts.push(`Gross Wt: ${grossWeight}kg`); } 
    if (notificationEmail !== undefined) { data.notificationEmail = notificationEmail; } 
    if (enquiryDate !== undefined) { data.enquiryDate = enquiryDate ? new Date(enquiryDate) : null; } 
    if (noOfPackages !== undefined) { data.noOfPackages = noOfPackages ? parseInt(noOfPackages) : null; } 
    if (customerName !== undefined) { data.customerName = customerName; } 
    if (vehicleType !== undefined) { data.vehicleType = vehicleType; } 
    if (noOfContainers !== undefined) { data.noOfContainers = noOfContainers ? parseInt(noOfContainers) : null; } 
    if (packageType !== undefined) { data.packageType = packageType; } 
    if (deliveryDate !== undefined) { data.deliveryDate = deliveryDate ? new Date(deliveryDate) : null; } 
    if (fromLocation !== undefined) { data.fromLocation = fromLocation; } 
    if (toLocation !== undefined) { data.toLocation = toLocation; } 
    if (transportMode !== undefined) { data.transportMode = transportMode; } 
    if (Object.keys(data).length > 0) { 
      await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { data } } } }); 
      if (parts.length > 0) await upsertStatusEntry(req.params.id, 'RATES_UPDATED', parts.join(' | ')); 
    } 
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); 
    sendStatusEmail(s).catch(() => {}); 
    res.json({ status: 'success', data: s }); 
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateCBM = async (req, res) => {
  try { const val = req.body.cbm; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { cbm: parseFloat(val) } } } }); await upsertStatusEntry(req.params.id, 'CBM_UPDATED', `CBM: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updatePortLocation = async (req, res) => {
  try { const val = req.body.portLocation; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { portLocation: val } } } }); await upsertStatusEntry(req.params.id, 'PORT_LOCATION', `Port: ${val}`); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateSchedule = async (req, res) => {
  try { const data = {}; const parts = []; if (req.body.etd) { data.etd = new Date(req.body.etd); parts.push(`ETD: ${req.body.etd}`); } if (req.body.eta) { data.eta = new Date(req.body.eta); parts.push(`ETA: ${req.body.eta}`); } if (Object.keys(data).length > 0) { await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'SCHEDULED', freightForwarding: { update: { data } } } }); if (parts.length > 0) await upsertStatusEntry(req.params.id, 'SCHEDULED', parts.join(' | ')); } const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); sendStatusEmail(s).catch(() => {}); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateNomination = async (req, res) => {
  try { if (req.body.nominationDate) { await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'NOMINATED', freightForwarding: { update: { nominationDate: new Date(req.body.nominationDate) } } } }); await upsertStatusEntry(req.params.id, 'NOMINATED', `Nomination: ${req.body.nominationDate}`); } const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); sendStatusEmail(s).catch(() => {}); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateBooking = async (req, res) => {
  try { if (req.body.bookingDate) { await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'BOOKED', freightForwarding: { update: { bookingDate: new Date(req.body.bookingDate) } } } }); await upsertStatusEntry(req.params.id, 'BOOKED', `Booking: ${req.body.bookingDate}`); } const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); sendStatusEmail(s).catch(() => {}); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateAWB = async (req, res) => {
  try { const data = {}; const parts = []; if (req.body.mawb !== undefined) { data.mawb = req.body.mawb; parts.push(`MAWB: ${req.body.mawb}`); } if (req.body.hawb !== undefined) { data.hawb = req.body.hawb; parts.push(`HAWB: ${req.body.hawb}`); } if (req.body.awbDate) { data.awbDate = new Date(req.body.awbDate); parts.push(`AWB Date: ${req.body.awbDate}`); } if (Object.keys(data).length > 0) { await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: 'AWB_GENERATED', freightForwarding: { update: { data } } } }); if (parts.length > 0) await upsertStatusEntry(req.params.id, 'AWB_GENERATED', parts.join(' | ')); } const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); sendStatusEmail(s).catch(() => {}); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { 
  createShipment, 
  deleteShipment, 
  deleteAllShipments, 
  softDeleteShipment,
  restoreShipment,
  getBinShipments,
  getBinCount,
  bulkRestoreShipments,
  exportShipments, 
  getAllShipments, 
  getShipmentStats,
  getReferenceCodeStats,
  getShipmentById, 
  updateRefNo, 
  updateConsignee, 
  updateShipper, 
  updateAgent, 
  updateShipmentType, 
  updateImportExport, 
  updateStage, 
  updateRemarks, 
  updateFromLocation, 
  updateToLocation, 
  updateTerms, 
  updateRates, 
  updateCBM, 
  updatePortLocation, 
  updateNomination, 
  updateBooking, 
  updateSchedule, 
  updateAWB 
};