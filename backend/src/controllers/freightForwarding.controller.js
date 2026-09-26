const prisma = require('../utils/prisma');
const { exportShipmentsToExcel, exportShipmentsForClient } = require('../utils/excelExport');
const { sendStatusEmail, sendEnquiryReceivedEmail, sendFreightConfirmedEmail } = require('../utils/emailService');

// changedBy is now captured on every status-history write (it was already
// a field on the model, just never populated for most update actions).
// This lets us answer "who has actually touched this shipment" going
// forward. Historic entries written before this change won't have a
// changedBy — that's expected, we can't retroactively know who made them.
async function upsertStatusEntry(shipmentId, status, remarks, changedBy) {
  const existing = await prisma.statusHistory.findFirst({
    where: { shipmentId, status },
    orderBy: { createdAt: 'desc' }
  });
  if (existing) {
    await prisma.statusHistory.update({
      where: { id: existing.id },
      data: { remarks, changedBy, createdAt: new Date() }
    });
  } else {
    await prisma.statusHistory.create({
      data: { shipmentId, status, remarks, changedBy }
    });
  }
}

function actorName(req) {
  return req.user?.name || req.user?.email || null;
}

// ─── DYNAMIC CURRENT STATUS (NEW) ───
// Previously, each update function manually set currentStatus forward
// (e.g. "if a nomination date was given, set status to NOMINATED") —
// which meant clearing that same date back to blank never moved the
// status back down. This replaces that entirely: after any change,
// recomputeCurrentStatus looks at what's ACTUALLY filled in right now
// and sets currentStatus to the furthest step that's genuinely complete
// — so it naturally moves both forward AND backward with the real data,
// mirroring exactly what the workflow stepper on the frontend shows.
//
// Step orders mirror the frontend's FULL_STEPS/CHA_IMPORT_STEPS/etc
// exactly (see ShipmentDetail.jsx) — keep these in sync if that ever
// changes.
const FULL_STEP_ORDER = ['ENQUIRY', 'RATES_ADDED', 'NOMINATED', 'BOOKED', 'SCHEDULED', 'AWB_GENERATED', 'CHECKLIST_APPROVED', 'BOE_FILED', 'DO_COLLECTED', 'OOC_DONE', 'GATE_PASS', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const CHA_IMPORT_STEP_ORDER = ['ENQUIRY', 'CHECKLIST_APPROVED', 'BOE_FILED', 'DO_COLLECTED', 'OOC_DONE', 'GATE_PASS', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const CHA_EXPORT_STEP_ORDER = ['ENQUIRY', 'CHECKLIST_APPROVED', 'SB_FILED', 'LEO_DONE', 'HAND_OVER', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const TRANSPORT_STEP_ORDER = ['ENQUIRY', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const DO_RELEASE_STEP_ORDER = ['ENQUIRY', 'DO_COLLECTED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const FF_ONLY_STEP_ORDER = ['ENQUIRY', 'AWB_GENERATED', 'DO_COLLECTED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const STAGE_ORDER_FOR_STATUS = ['Enquiry', 'Quoted', 'Nomination', 'Draft', 'Pre-alerts', 'Checklist', 'BOE', 'OOC', 'POD', 'Invoice'];

function isStepCompleteBackend(statusKey, ff, cha, accounts, shipmentStage) {
  switch (statusKey) {
    case 'ENQUIRY': return true;
    case 'RATES_ADDED': {
      const stageIdx = STAGE_ORDER_FOR_STATUS.indexOf(shipmentStage);
      const quotedIdx = STAGE_ORDER_FOR_STATUS.indexOf('Quoted');
      const stagePastQuoted = stageIdx !== -1 && stageIdx >= quotedIdx;
      return !!(ff.weight || ff.grossWeight || ff.sellingRate) || stagePastQuoted;
    }
    case 'NOMINATED': return !!ff.nominationDate;
    case 'BOOKED': return !!ff.bookingDate;
    case 'SCHEDULED': return !!(ff.etd || ff.eta);
    case 'AWB_GENERATED': return !!(ff.mawb || ff.hawb);
    case 'CHECKLIST_APPROVED': return !!cha.checklistDate;
    case 'BOE_FILED': return !!cha.boeNo;
    case 'DO_COLLECTED': return !!cha.doCollectionDate;
    case 'OOC_DONE': return !!cha.oocDate;
    case 'GATE_PASS': return !!cha.gatePassDate;
    case 'DELIVERED': return !!cha.deliveryDate;
    case 'SB_FILED': return !!cha.sbNo;
    case 'LEO_DONE': return !!cha.leoDate;
    case 'HAND_OVER': return !!cha.handOverDate;
    case 'INVOICE_GENERATED': return !!(accounts.invoiceNumber && accounts.invoiceDate);
    case 'INVOICE_SENT': return !!accounts.sendingDate;
    default: return true;
  }
}

async function recomputeCurrentStatus(shipmentId) {
  const s = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { shipmentType: true, importExport: true, shipmentStage: true, freightForwarding: true, cha: true, accounts: true }
  });
  if (!s) return;
  const ff = s.freightForwarding || {};
  const cha = s.cha || {};
  const accounts = s.accounts || {};

  let order;
  if (s.shipmentType === 'FF Only') order = FF_ONLY_STEP_ORDER;
  else if (s.shipmentType === 'DO Release') order = DO_RELEASE_STEP_ORDER;
  else if (s.shipmentType === 'Transport') order = TRANSPORT_STEP_ORDER;
  else if (s.shipmentType === 'CHA Only') order = s.importExport === 'Export' ? CHA_EXPORT_STEP_ORDER : CHA_IMPORT_STEP_ORDER;
  else order = FULL_STEP_ORDER;

  let lastComplete = 'ENQUIRY';
  for (const key of order) {
    if (isStepCompleteBackend(key, ff, cha, accounts, s.shipmentStage)) lastComplete = key;
  }
  await prisma.shipment.update({ where: { id: shipmentId }, data: { currentStatus: lastComplete } });
}

// ─── STATUS -> TEAM MAP (NEW) ───
// Classifies each status-history entry by which of the 3 workflow teams
// performed it. Used to build "Freight: A, B" / "Customs: C, D, E" /
// "Accounts: F, G" badges showing EVERYONE who worked on that team's
// part of a shipment — not just whoever was first. Statuses not listed
// here (REMARKS, STAGE_CHANGE, DELETED, RESTORED, COMPLETED, etc.) are
// team-neutral/administrative and don't attribute to any single team,
// though they still count toward the overall "Everyone Involved" total.
const STATUS_TEAM_MAP = {
  ENQUIRY: 'FREIGHT', REFNO_UPDATED: 'FREIGHT', CONSIGNEE_UPDATED: 'FREIGHT', SHIPPER_UPDATED: 'FREIGHT',
  AGENT_UPDATED: 'FREIGHT', TYPE_UPDATED: 'FREIGHT', IMPORT_EXPORT_UPDATED: 'FREIGHT',
  FROM_LOCATION: 'FREIGHT', TO_LOCATION: 'FREIGHT', TERMS: 'FREIGHT', RATES_UPDATED: 'FREIGHT',
  CBM_UPDATED: 'FREIGHT', PORT_LOCATION: 'FREIGHT', NOMINATED: 'FREIGHT', BOOKED: 'FREIGHT',
  SCHEDULED: 'FREIGHT', AWB_GENERATED: 'FREIGHT',
  CHECKLIST_APPROVED: 'CUSTOMS', BOE_FILED: 'CUSTOMS', DO_COLLECTED: 'CUSTOMS', OOC_DONE: 'CUSTOMS',
  GATE_PASS: 'CUSTOMS', DELIVERED: 'CUSTOMS', SB_FILED: 'CUSTOMS', LEO_DONE: 'CUSTOMS', HAND_OVER: 'CUSTOMS',
  INVOICE_GENERATED: 'ACCOUNTS', INVOICE_SENT: 'ACCOUNTS', INVOICE_COMPLETE: 'ACCOUNTS',
};

// Groups a shipment's status-history entries into per-team name lists,
// deduped, in first-seen order. Returns { FREIGHT: [names], CUSTOMS: [names], ACCOUNTS: [names] }.
function groupContributorsByTeam(historyEntries) {
  const byTeam = { FREIGHT: [], CUSTOMS: [], ACCOUNTS: [] };
  const seen = { FREIGHT: new Set(), CUSTOMS: new Set(), ACCOUNTS: new Set() };
  historyEntries.forEach((h) => {
    if (!h.changedBy) return;
    const team = STATUS_TEAM_MAP[h.status];
    if (!team) return;
    if (!seen[team].has(h.changedBy)) {
      seen[team].add(h.changedBy);
      byTeam[team].push(h.changedBy);
    }
  });
  return byTeam;
}

// ─── FREIGHT "HANDLED BY" COMPLETION STAMP (NEW) ───
// Mirrors the Customs/Accounts pattern: the Freight badge should only
// show a name once real freight work is done, not the instant a shipment
// is opened with nothing filled in. "Complete" here means Consignee +
// Shipper + at least one of Weight/Gross Weight/Selling Rate are all
// present. Only fires once per shipment (checks freightCompletedById is
// still null).
async function checkAndStampFreightComplete(shipmentId, req) {
  if (!req.user?.id) return;
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { freightCompletedById: true, freightForwarding: { select: { consigneeName: true, shipperName: true, weight: true, grossWeight: true, sellingRate: true } } }
  });
  if (!shipment || shipment.freightCompletedById) return;
  const ff = shipment.freightForwarding;
  const isComplete = ff && ff.consigneeName && ff.shipperName && (ff.weight || ff.grossWeight || ff.sellingRate);
  if (isComplete) {
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { freightCompletedById: req.user.id, freightCompletedByName: actorName(req) }
    });
    // ✅ NEW — Email 2 of 3: Freight Confirmed. This block only ever runs
    // once per shipment (guarded by the freightCompletedById check
    // above), so there's no risk of sending this twice. No CC.
    const full = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { freightForwarding: true, cha: true, accounts: true }
    });
    if (full?.freightForwarding?.autoEmailEnabled && full.freightForwarding.notificationEmail) {
      sendFreightConfirmedEmail(full).catch(() => {});
    }
  }
}

// ─── ARCHIVE ELIGIBILITY CHECK (NEW) ───
// Duplicated from accounts.controller.js (kept in sync manually — small
// pure function, not worth a shared-module require cycle between the two
// controllers). See that file's copy for the full field-by-type
// rationale. A shipment is only allowed to be archived — or to STAY
// archived — while all of these are true.
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

  return !!(ff.fromLocation && ff.toLocation && ff.terms && ff.grossWeight && ff.weight && ff.hawb);
}

// ─── 30-DAY DELAYED AUTO-ARCHIVE — LIGHTWEIGHT PASS (FIXED) ───
// Runs on every shipment list/stats request. Only looks at ACTIVE
// shipments whose invoice matured 30+ days ago — normally a small,
// fast-to-fetch set, safe to run on every click.
//
// ⚠️ PERFORMANCE FIX: this used to also scan and re-check EVERY currently
// archived shipment on every single request — with 1,300+ archived
// shipments and nested Freight/Customs/Accounts data pulled for each one,
// that made every click noticeably slow. That retroactive "un-archive
// ineligible shipments" check still exists (see restoreIneligibleArchives
// below), but now only runs on the periodic background schedule in
// server.js, not on every page load.
async function archiveMaturedInvoices() {
  let archivedCount = 0;
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const matured = await prisma.shipment.findMany({
      where: { isArchived: false, isDeleted: false, accounts: { completedAt: { lte: cutoff } } },
      select: { id: true, shipmentType: true, freightForwarding: true, cha: true, accounts: true }
    });
    for (const s of matured) {
      if (isArchiveEligible(s)) {
        await prisma.shipment.update({
          where: { id: s.id },
          data: {
            isArchived: true,
            statusHistory: { create: { status: 'COMPLETED', remarks: 'Auto-archived 30 days after invoice was completed' } }
          }
        });
        archivedCount++;
      }
    }
  } catch (error) {
    console.error('Error in archiveMaturedInvoices sweep:', error);
  }
  return archivedCount;
}

// ─── RETROACTIVE ARCHIVE CLEANUP — HEAVY PASS (SCHEDULED, OR ON-DEMAND) ───
// Scans EVERY currently-archived shipment and moves back to Active
// anything that no longer passes isArchiveEligible. This is the
// expensive full-table-scan part — normally only called from server.js's
// periodic schedule (every 6 hours + once on startup) so it doesn't add
// latency to live requests, but also exposed via a manual-trigger
// endpoint (POST /freight/run-archive-cleanup) for whenever you want it
// to happen immediately rather than waiting for the schedule.
async function restoreIneligibleArchives() {
  let restoredCount = 0;
  try {
    const currentlyArchived = await prisma.shipment.findMany({
      where: { isArchived: true, isDeleted: false },
      select: { id: true, shipmentType: true, freightForwarding: true, cha: true, accounts: true }
    });
    for (const s of currentlyArchived) {
      if (!isArchiveEligible(s)) {
        await prisma.shipment.update({
          where: { id: s.id },
          data: {
            isArchived: false,
            statusHistory: { create: { status: 'RESTORED', remarks: 'Moved back to Active — required fields are missing (auto-corrected)' } }
          }
        });
        restoredCount++;
      }
    }
  } catch (error) {
    console.error('Error in restoreIneligibleArchives sweep:', error);
  }
  return restoredCount;
}

// ─── RUN ARCHIVE CLEANUP NOW (NEW) ───
// Runs both sweeps immediately and reports exactly what happened —
// no waiting for the 6-hour schedule, and no dependency on NODE_ENV
// being set to 'production' (the scheduled version in server.js only
// runs in production; this always runs when called).
const runArchiveCleanupNow = async (req, res) => {
  try {
    const archived = await archiveMaturedInvoices();
    const restored = await restoreIneligibleArchives();
    res.json({
      status: 'success',
      data: { archived, restored },
      message: `Done — ${archived} shipment(s) archived, ${restored} shipment(s) moved back to Active.`
    });
  } catch (error) {
    console.error('Error running archive cleanup:', error);
    res.status(500).json({ status: 'error', message: 'Failed to run archive cleanup' });
  }
};

// Back-compat alias — old name some call sites may still reference.
async function autoArchiveMatured() {
  await archiveMaturedInvoices();
}

// ─── CREATE NEW SHIPMENT ───
const createShipment = async (req, res) => {
  try {
    const { refNo, enquiryDate, noOfPackages, consigneeName, shipperName, agent, shipmentType, importExport, hawb, mawb, awbDate, weight, grossWeight, notificationEmail, customerName, vehicleType, noOfContainers, containerType, packageType, deliveryDate, fromLocation, toLocation, terms, portLocation, cbm, commodityName, preAlertsSentDate, doCollectionDate, autoEmailEnabled, coHandlerId } = req.body;
    if (!refNo) return res.status(400).json({ status: 'error', message: 'Reference Number (refNo) is required' });
    const createdById = req.user?.id || null;
    const createdByName = req.user?.name || req.user?.email || null;
    // ✅ Co-Handler — an optional second employee who should also
    // see this shipment in their own "My Shipments". Resolved to a real
    // user account, not just text, so it stays accurate even if two
    // people share the same initials.
    let coHandlerName = null;
    if (coHandlerId) {
      const coHandler = await prisma.user.findUnique({ where: { id: coHandlerId }, select: { name: true, email: true } });
      coHandlerName = coHandler ? (coHandler.name || coHandler.email) : null;
    }
    const shipmentData = { 
      refNo, currentStatus: 'ENQUIRY', shipmentType, importExport,
      createdById, createdByName,
      coHandlerId: coHandlerId || null, coHandlerName,
      freightForwarding: { create: { enquiryDate: enquiryDate ? new Date(enquiryDate) : null, noOfPackages: noOfPackages ? parseInt(noOfPackages) : null, consigneeName, shipperName, agent, hawb: hawb || null, mawb: mawb || null, awbDate: awbDate ? new Date(awbDate) : null, weight: weight ? parseFloat(weight) : null, grossWeight: grossWeight ? parseFloat(grossWeight) : null, notificationEmail: notificationEmail || null, customerName: customerName || null, vehicleType: vehicleType || null, noOfContainers: noOfContainers ? parseInt(noOfContainers) : null, containerType: containerType || null, packageType: packageType || null, deliveryDate: deliveryDate ? new Date(deliveryDate) : null, fromLocation: fromLocation || null, toLocation: toLocation || null, terms: terms || null, portLocation: portLocation || null, cbm: cbm ? parseFloat(cbm) : null, commodityName: commodityName || null, preAlertsSentDate: preAlertsSentDate ? new Date(preAlertsSentDate) : null, autoEmailEnabled: !!autoEmailEnabled } }, 
      statusHistory: { create: { status: 'ENQUIRY', remarks: `Shipment created | Ref: ${refNo}`, changedBy: createdByName } } 
    };
    // ✅ NEW — DO Collection Date can now be filled in at creation time
    // for the standard Freight shipment type (shown on its Freight tab
    // for this type specifically). Only creates the CHA relation at all
    // if a date was actually given — otherwise it's created lazily later
    // (ensureCHA), exactly as before.
    if (doCollectionDate) {
      shipmentData.cha = { create: { doCollectionDate: new Date(doCollectionDate) } };
    }
    const shipment = await prisma.shipment.create({
      data: shipmentData,
      include: { freightForwarding: true, cha: true, statusHistory: { take: 1, orderBy: { createdAt: 'desc' } } }
    });
    // ✅ NEW — Email 1 of 3: Enquiry Received. Only if the employee
    // switched on "Send automatic update emails" for this shipment. CC'd
    // to the employee who created it. Fire-and-forget — a failed email
    // should never block or fail the shipment creation itself.
    if (autoEmailEnabled && notificationEmail) {
      sendEnquiryReceivedEmail(shipment, req.user?.email).catch(() => {});
    }
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
            remarks: `Shipment moved to bin by ${deletedBy} (Original status: ${existing.currentStatus})`,
            changedBy: deletedBy
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
            remarks: `Shipment restored from bin by ${restoredBy} (Restored to: ${originalStatus})`,
            changedBy: restoredBy
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
        { refNo: { contains: search, mode: 'insensitive' } },
        { freightForwarding: { consigneeName: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { shipperName: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { hawb: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { mawb: { contains: search, mode: 'insensitive' } } },
        { cha: { boeNo: { contains: search, mode: 'insensitive' } } },
        { cha: { sbNo: { contains: search, mode: 'insensitive' } } },
        { accounts: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { customerName: { contains: search, mode: 'insensitive' } } },
        { createdByName: { contains: search, mode: 'insensitive' } }
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
                remarks: `Shipment restored from bin by ${restoredBy}`,
                changedBy: restoredBy
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
    const { status, search, mine, userId, referenceGroup } = req.query;
    
    const activeWhere = { isArchived: false, isDeleted: false };
    if (referenceGroup && REFERENCE_GROUPS[referenceGroup]) {
      activeWhere.AND = [{ OR: REFERENCE_GROUPS[referenceGroup].map((code) => ({ refNo: { startsWith: code } })) }];
    }
    if (mine === 'true' && req.user?.id) activeWhere.AND = [...(activeWhere.AND || []), { OR: [{ createdById: req.user.id }, { coHandlerId: req.user.id }] }];
    else if (userId) activeWhere.createdById = userId;
    if (status) activeWhere.currentStatus = status;
    if (search) {
      activeWhere.OR = [
        { refNo: { contains: search, mode: 'insensitive' } },
        { freightForwarding: { consigneeName: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { shipperName: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { hawb: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { mawb: { contains: search, mode: 'insensitive' } } },
        { cha: { boeNo: { contains: search, mode: 'insensitive' } } },
        { cha: { sbNo: { contains: search, mode: 'insensitive' } } },
        { accounts: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { customerName: { contains: search, mode: 'insensitive' } } },
        { createdByName: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const archivedWhere = { isArchived: true, isDeleted: false };
    if (referenceGroup && REFERENCE_GROUPS[referenceGroup]) {
      archivedWhere.AND = [{ OR: REFERENCE_GROUPS[referenceGroup].map((code) => ({ refNo: { startsWith: code } })) }];
    }
    if (mine === 'true' && req.user?.id) archivedWhere.AND = [...(archivedWhere.AND || []), { OR: [{ createdById: req.user.id }, { coHandlerId: req.user.id }] }];
    else if (userId) archivedWhere.createdById = userId;
    if (status) archivedWhere.currentStatus = status;
    if (search) {
      archivedWhere.OR = [
        { refNo: { contains: search, mode: 'insensitive' } },
        { freightForwarding: { consigneeName: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { shipperName: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { hawb: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { mawb: { contains: search, mode: 'insensitive' } } },
        { cha: { boeNo: { contains: search, mode: 'insensitive' } } },
        { cha: { sbNo: { contains: search, mode: 'insensitive' } } },
        { accounts: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { customerName: { contains: search, mode: 'insensitive' } } },
        { createdByName: { contains: search, mode: 'insensitive' } }
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

// ─── EXPORT SELECTED SHIPMENTS FOR CLIENT (NEW) ───
// Only the checked shipments, no internal fields (createdBy, remarks,
// rate, archive status) — safe to send straight to a client.
const exportSelectedForClient = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No shipment IDs provided' });
    }
    const shipments = await prisma.shipment.findMany({
      where: { id: { in: ids }, isDeleted: false },
      select: {
        refNo: true, currentStatus: true, shipmentType: true,
        freightForwarding: {
          select: {
            consigneeName: true, shipperName: true, customerName: true,
            fromLocation: true, toLocation: true, mawb: true, hawb: true,
            etd: true, eta: true, grossWeight: true, weight: true, deliveryDate: true
          }
        },
        cha: { select: { boeNo: true, sbNo: true, deliveryDate: true } }
      }
    });
    await exportShipmentsForClient(shipments, res);
  } catch (error) {
    console.error('Error exporting for client:', error);
    res.status(500).json({ status: 'error', message: 'Failed to export for client' });
  }
};

// ─── GET ALL SHIPMENTS ───
const getAllShipments = async (req, res) => {
  try {
    // ✅ Runs the 30-day matured-invoice sweep before building the query,
    // so anything that just crossed the 30-day mark is already reflected
    // in isArchived by the time we filter/count below.
    await archiveMaturedInvoices();

    const { status, search, isArchived, shipmentType, mine, userId, pendingOnly, today, date, thisMonthOnly, inProgressOnly, deliveredOnly, invoicedOnly, invoicedThisMonthOnly, pipelineStage, cancelledOnly, createdFrom, createdTo, employeeId, referenceGroup, page = 1, limit = 25 } = req.query;
    console.log('🔍 REQUEST:', { shipmentType, search, isArchived, today, page, limit });
    
    const p = Math.max(1, parseInt(page)); const l = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const where = { 
      isDeleted: false // Exclude bin items from normal view
    };

    // ─── TODAY / CUSTOM DATE / THIS MONTH FILTER ───
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    if (today === 'true' || date) {
      let istDateStr;
      if (date) {
        istDateStr = date; // date picker already sends YYYY-MM-DD, treat as the intended IST day
      } else {
        istDateStr = new Date(Date.now() + IST_OFFSET_MS).toISOString().split('T')[0];
      }
      const start = new Date(`${istDateStr}T00:00:00+05:30`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      where.createdAt = { gte: start, lt: end };
    } else if (thisMonthOnly === 'true') {
      // ✅ NEW — "This Month Shipments" card click. Same IST month bounds
      // as the stats endpoint's monthlyShipments count, so the number on
      // the card always matches what this filter returns. Like today/date,
      // this intentionally shows both active and archived shipments
      // created this month, ignoring the isArchived toggle.
      const { start, end } = getISTMonthBounds();
      where.createdAt = { gte: start, lt: end };
    } else {
      where.isArchived = isArchived === 'true';
    }
    if (status) where.currentStatus = status;
    if (inProgressOnly === 'true' && !status) {
      where.currentStatus = { notIn: ['DELIVERED', 'HAND_OVER', 'INVOICE_GENERATED', 'INVOICE_SENT'] };
      where.AND = [...(where.AND || []), getNotCancelledFilter()]; // ✅ NEW — a stale enquiry belongs in Cancelled, not In Progress
    }
    if (deliveredOnly === 'true' && !status) {
      where.currentStatus = { in: ['DELIVERED', 'HAND_OVER'] };
    }
    if (invoicedOnly === 'true' && !status) {
      where.currentStatus = { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] };
    }
    // ✅ NEW — "Cancelled" card click. A shipment stuck at pure ENQUIRY
    // for more than 7 days.
    if (cancelledOnly === 'true' && !status) {
      delete where.isArchived;
      Object.assign(where, getCancelledWhere());
    }
    // ✅ NEW — "This Month Invoice" card click. The card's NUMBER counts
    // shipments whose invoice status-change happened this month (matches
    // getShipmentStats' monthlyInvoiced calc exactly) — this is different
    // from invoicedOnly above, which matches CURRENT status lifetime-wide
    // regardless of when. Using invoicedOnly here would show a different,
    // usually much larger, set than the number on the card.
    if (invoicedThisMonthOnly === 'true' && !status) {
      const { start, end } = getISTMonthBounds();
      const monthlyInvoiceHistory = await prisma.statusHistory.findMany({
        where: { status: { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] }, createdAt: { gte: start, lt: end } },
        select: { shipmentId: true }
      });
      const invoicedIds = [...new Set(monthlyInvoiceHistory.map((h) => h.shipmentId))];
      where.id = { in: invoicedIds.length > 0 ? invoicedIds : ['__none__'] };
    }
    // ✅ NEW — "Pending Customs" / "Pending Invoice" style stat card
    // clicks on the main Dashboard. Reuses the EXACT same stage
    // definition as the Pipeline board, so a card's count and what you
    // see after clicking it always match precisely.
    if (pipelineStage && !status) {
      const stageWhere = getPipelineStageWhere(pipelineStage);
      if (stageWhere) {
        delete where.isArchived; // the stage's own definition controls this instead (e.g. "done" spans both)
        Object.assign(where, stageWhere);
      }
    }
    if (shipmentType) {
      if (shipmentType === 'CHA_ONLY') where.shipmentType = 'CHA Only';
      else if (shipmentType === 'TRANSPORT') where.shipmentType = 'Transport';
      else if (shipmentType === 'DO_RELEASE') where.shipmentType = 'DO Release';
      else if (shipmentType === 'FF_ONLY') where.shipmentType = 'FF Only';
      else if (shipmentType === 'FULL_SHIPMENT') where.NOT = { shipmentType: { in: ['CHA Only', 'Transport', 'DO Release', 'FF Only'] } };
    }
    // ✅ ADVANCED FILTERS (NEW) — unlike the stat-card toggles above
    // (today/thisMonth/pendingCustoms/etc, which each represent "show
    // exactly this one view" and override each other), these two are
    // designed to COMBINE with search, status, type, and each other —
    // e.g. "Rajeswari's shipments created between 1 Sep and 20 Sep with
    // status BOE_FILED" all at once.
    if (createdFrom || createdTo) {
      where.createdAt = where.createdAt || {};
      if (createdFrom) where.createdAt.gte = new Date(`${createdFrom}T00:00:00+05:30`);
      if (createdTo) where.createdAt.lte = new Date(`${createdTo}T23:59:59.999+05:30`);
    }
    if (employeeId) {
      // Matches either who created it OR who's the co-handler — "show me
      // everything this person touched from the start", not just what
      // they personally opened.
      where.AND = [...(where.AND || []), { OR: [{ createdById: employeeId }, { coHandlerId: employeeId }] }];
    }
    if (referenceGroup && REFERENCE_GROUPS[referenceGroup]) {
      where.AND = [...(where.AND || []), { OR: REFERENCE_GROUPS[referenceGroup].map((code) => ({ refNo: { startsWith: code } })) }];
    }
    // ✅ SEARCH FIX (was missing Shipper Name + employee name) — now also
    // matches Shipper Name and the shipment's createdByName, so searching
    // by an employee's name or a shipper's name actually returns results.
    if (search) where.OR = [
      { refNo: { contains: search, mode: 'insensitive' } },
      { freightForwarding: { consigneeName: { contains: search, mode: 'insensitive' } } },
      { freightForwarding: { shipperName: { contains: search, mode: 'insensitive' } } },
      { freightForwarding: { hawb: { contains: search, mode: 'insensitive' } } },
      { freightForwarding: { mawb: { contains: search, mode: 'insensitive' } } },
      { cha: { boeNo: { contains: search, mode: 'insensitive' } } },
      { cha: { sbNo: { contains: search, mode: 'insensitive' } } },
      { accounts: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
      { freightForwarding: { customerName: { contains: search, mode: 'insensitive' } } },
      { createdByName: { contains: search, mode: 'insensitive' } }
    ];
    if (mine === 'true' && req.user?.id) {
      where.AND = [...(where.AND || []), { OR: [{ createdById: req.user.id }, { coHandlerId: req.user.id }] }];
    } else if (userId) {
      where.createdById = userId;
    }
    if (pendingOnly === 'true' && !status) {
      where.currentStatus = { notIn: CLOSED_STATUSES };
    }
    
    console.log('🔍 WHERE:', JSON.stringify(where));
    
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({ 
        where, 
        select: { 
          id: true, refNo: true, currentStatus: true, shipmentStage: true, 
          shipmentType: true, importExport: true, createdByName: true, createdAt: true, 
          freightForwarding: { 
            select: { 
              consigneeName: true, shipperName: true, hawb: true, mawb: true, agent: true, 
              customerName: true, transportMode: true, weight: true, 
              grossWeight: true, cbm: true, sellingRate: true, terms: true,
              fromLocation: true, toLocation: true, deliveryDate: true,
              etd: true, eta: true
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

    // ✅ HANDLED BY — EVERYONE PER TEAM (FIXED) — one batch query for the
    // whole page, not one per row. For each shipment, groups every
    // status-history entry into Freight/Customs/Accounts by which team
    // performed that action (see STATUS_TEAM_MAP), producing a full name
    // list per team — e.g. "Customs: Rajeswari, Priya, Tanuja" — not just
    // whoever touched it first. contributorCount is the total distinct
    // people across all teams, including the creator.
    if (shipments.length > 0) {
      const shipmentIds = shipments.map((s) => s.id);
      const allHistory = await prisma.statusHistory.findMany({
        where: { shipmentId: { in: shipmentIds }, changedBy: { not: null } },
        select: { shipmentId: true, changedBy: true, status: true },
        orderBy: { createdAt: 'asc' }
      });
      const historyByShipment = {};
      allHistory.forEach((h) => {
        if (!historyByShipment[h.shipmentId]) historyByShipment[h.shipmentId] = [];
        historyByShipment[h.shipmentId].push(h);
      });
      shipments.forEach((s) => {
        const entries = historyByShipment[s.id] || [];
        const byTeam = groupContributorsByTeam(entries);
        // Creator always counts as a Freight contributor, even if their
        // earliest history entries predate changedBy tracking.
        if (s.createdByName && !byTeam.FREIGHT.includes(s.createdByName)) {
          byTeam.FREIGHT.unshift(s.createdByName);
        }
        s.freightNames = byTeam.FREIGHT;
        s.customsNames = byTeam.CUSTOMS;
        s.accountsNames = byTeam.ACCOUNTS;
        const allNames = new Set([...byTeam.FREIGHT, ...byTeam.CUSTOMS, ...byTeam.ACCOUNTS]);
        s.contributorCount = allNames.size;
      });
    }
    
    console.log('🔍 RESULT total:', total, 'data length:', shipments.length);
    if (shipments.length > 0) {
      console.log('🔍 First shipment:', shipments[0].refNo, 'type:', shipments[0].shipmentType);
    }
    
    res.json({ status: 'success', data: shipments, pagination: { total, page: p, limit: l, totalPages: Math.ceil(total/l) } });
  } catch (error) { console.error('Error fetching:', error); res.status(500).json({ status: 'error', message: 'Failed to fetch' }); }
};

// ─── IST MONTH BOUNDS (NEW) ───
// Same IST-anchored approach as the day-bounds helper below (used by
// Daily Report) — computes the start/end of the CURRENT calendar month
// in IST, regardless of what timezone the server itself runs in.
const IST_OFFSET_MS_MONTH = 5.5 * 60 * 60 * 1000;
function getISTMonthBounds() {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS_MONTH);
  const y = nowIST.getUTCFullYear();
  const m = nowIST.getUTCMonth(); // 0-indexed
  const start = new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS_MONTH);
  const end = new Date(Date.UTC(y, m + 1, 1) - IST_OFFSET_MS_MONTH);
  return { start, end };
}

// ─── GET SHIPMENT STATS ───
// Read-only. Returns counts across ALL matching shipments (not just the
// current page), so progress bars / percentages reflect the whole dataset.
const getShipmentStats = async (req, res) => {
  try {
    await archiveMaturedInvoices();

    const { status, search, isArchived, shipmentType, mine, userId, referenceGroup, createdFrom, createdTo, employeeId } = req.query;

    const where = {
      isArchived: isArchived === 'true',
      isDeleted: false
    };
    if (referenceGroup && REFERENCE_GROUPS[referenceGroup]) {
      where.AND = [...(where.AND || []), { OR: REFERENCE_GROUPS[referenceGroup].map((code) => ({ refNo: { startsWith: code } })) }];
    }
    if (status) where.currentStatus = status;
    if (shipmentType) {
      if (shipmentType === 'CHA_ONLY') where.shipmentType = 'CHA Only';
      else if (shipmentType === 'TRANSPORT') where.shipmentType = 'Transport';
      else if (shipmentType === 'DO_RELEASE') where.shipmentType = 'DO Release';
      else if (shipmentType === 'FF_ONLY') where.shipmentType = 'FF Only';
      else if (shipmentType === 'FULL_SHIPMENT') where.NOT = { shipmentType: { in: ['CHA Only', 'Transport', 'DO Release', 'FF Only'] } };
    }
    // ✅ ADVANCED FILTERS (NEW) — same as getAllShipments, so the numbers
    // on screen always match what the filtered list actually contains.
    if (createdFrom || createdTo) {
      where.createdAt = where.createdAt || {};
      if (createdFrom) where.createdAt.gte = new Date(`${createdFrom}T00:00:00+05:30`);
      if (createdTo) where.createdAt.lte = new Date(`${createdTo}T23:59:59.999+05:30`);
    }
    if (employeeId) {
      where.AND = [...(where.AND || []), { OR: [{ createdById: employeeId }, { coHandlerId: employeeId }] }];
    }
    if (search) {
      where.OR = [
        { refNo: { contains: search, mode: 'insensitive' } },
        { freightForwarding: { consigneeName: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { shipperName: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { hawb: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { mawb: { contains: search, mode: 'insensitive' } } },
        { cha: { boeNo: { contains: search, mode: 'insensitive' } } },
        { cha: { sbNo: { contains: search, mode: 'insensitive' } } },
        { accounts: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
        { freightForwarding: { customerName: { contains: search, mode: 'insensitive' } } },
        { createdByName: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (mine === 'true' && req.user?.id) {
      where.AND = [...(where.AND || []), { OR: [{ createdById: req.user.id }, { coHandlerId: req.user.id }] }];
    } else if (userId) {
      where.createdById = userId;
    }

    // ✅ THIS MONTH STATS (NEW) — replaces the old lifetime "Invoiced"
    // card's meaning on the frontend with a calendar-month-scoped number,
    // plus a new "shipments created this month" count. Both respect the
    // same scope (mine/team/search/status/etc) as everything else here.
    const { start: monthStart, end: monthEnd } = getISTMonthBounds();

    const [total, delivered, invoiced, weightAgg, monthlyShipments, matchingForMonth, pipelineFreight, pipelineCustoms, pipelineInvoice, cancelled] = await Promise.all([
      prisma.shipment.count({ where }),
      prisma.shipment.count({ where: { ...where, currentStatus: { in: ['DELIVERED', 'HAND_OVER'] } } }),
      prisma.shipment.count({ where: { ...where, currentStatus: { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] } } }),
      prisma.freightForwarding.aggregate({
        where: { shipment: where },
        _sum: { noOfPackages: true, grossWeight: true }
      }),
      prisma.shipment.count({ where: { ...where, createdAt: { gte: monthStart, lt: monthEnd } } }),
      prisma.shipment.findMany({ where, select: { id: true } }),
      // ✅ NEW — "Pending Customs" / "Pending Invoice" stat cards. Counted
      // globally (matching the Pipeline board exactly), not scoped by the
      // current isArchived/search/mine filters — these two cards are
      // meant to answer "how many company-wide", same as the Pipeline tab.
      prisma.shipment.count({ where: getPipelineStageWhere('freight') }),
      prisma.shipment.count({ where: getPipelineStageWhere('customs') }),
      prisma.shipment.count({ where: getPipelineStageWhere('invoice') }),
      // ✅ NEW — "Cancelled" card. Also global/company-wide, same
      // reasoning as the pipeline counts above.
      prisma.shipment.count({ where: getCancelledWhere() })
    ]);

    // Monthly invoiced = shipments matching the current filter whose
    // INVOICE_GENERATED/INVOICE_SENT status change happened THIS month —
    // detected via status history timestamp, not currentStatus, so it
    // reflects when the invoice action actually happened.
    let monthlyInvoiced = 0;
    const matchingIds = matchingForMonth.map((s) => s.id);
    if (matchingIds.length > 0) {
      const monthlyInvoiceHistory = await prisma.statusHistory.findMany({
        where: {
          shipmentId: { in: matchingIds },
          status: { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] },
          createdAt: { gte: monthStart, lt: monthEnd }
        },
        select: { shipmentId: true }
      });
      monthlyInvoiced = new Set(monthlyInvoiceHistory.map((h) => h.shipmentId)).size;
    }

    res.json({
      status: 'success',
      data: {
        total,
        delivered,
        invoiced,
        deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
        totalPkgs: weightAgg._sum.noOfPackages || 0,
        totalWt: weightAgg._sum.grossWeight || 0,
        monthlyShipments, // ✅ NEW
        monthlyInvoiced, // ✅ NEW
        pipelineFreight, // ✅ NEW — Freight not yet complete, company-wide
        pipelineCustoms, // ✅ NEW — Freight done, waiting on Customs, company-wide
        pipelineInvoice, // ✅ NEW — Customs done, waiting on Invoice, company-wide
        cancelled // ✅ NEW — stuck at ENQUIRY for 7+ days, company-wide
      }
    });
  } catch (error) {
    console.error('Error getting shipment stats:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get stats' });
  }
};

// ─── GET REFERENCE CODE STATS ───
function extractReferenceCode(refNo) {
  if (!refNo || !refNo.trim()) return 'UNSPECIFIED';
  const trimmed = refNo.trim();
  const m = trimmed.match(/^([A-Za-z]{2,10})(?=[\s\-_]?\d)/);
  if (m) return m[1].toUpperCase();
  return trimmed.toUpperCase();
}

const REFERENCE_GROUPS = {
  RL: ['RLIM', 'RI', 'RLEX', 'RE', 'RLI', 'RLE'],
  PP: ['PPIM', 'PI', 'PPEX', 'PE', 'PPI', 'PPE'],
  SP: ['SPIM', 'SI', 'SPEX', 'SE', 'SPI', 'SPE'],
  JD: ['JDI', 'JDE'],
};

const CLOSED_STATUSES = ['DELIVERED', 'HAND_OVER', 'COMPLETED', 'INVOICE_SENT'];
const INVOICED_STATUSES = ['INVOICE_GENERATED', 'INVOICE_SENT'];

// ─── GET REFERENCE CODE STATS ───
// ⚠️ NOT rewritten for scale, and here's the honest reason why: the
// "reference code" grouping (e.g. "RLI", "PPI") isn't a stored column —
// it's derived on the fly from refNo via extractReferenceCode()'s regex.
// SQL groupBy needs to group by an actual column value, so it can't
// group by "whatever this regex would extract from refNo" without a
// stored column to group on. A genuine fix here means adding a
// `referenceCode` column to Shipment, computing it once at write-time
// (in createShipment and wherever refNo can change) and backfilling
// existing rows, then this endpoint could use a simple, fast groupBy
// exactly like getEmployeeStats above. That's a real, worthwhile
// improvement, but it's a schema change + backfill, not a same-file
// rewrite — flagging it rather than leaving it unspoken. Still fetches
// only 4 small fields (refNo, currentStatus, createdByName — no nested
// relations), so the per-row cost is low, but it does still scan every
// non-deleted shipment.
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
          invoiced: g.invoiced,
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

// ─── GET SHIPMENTS FOR A SPECIFIC REFERENCE CODE (NEW) ───
const getShipmentsByReferenceCode = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ status: 'error', message: 'code query parameter is required' });
    }
    const wantedCode = code.trim().toUpperCase();

    const all = await prisma.shipment.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        refNo: true,
        currentStatus: true,
        createdByName: true,
        createdAt: true,
        isArchived: true
      }
    });

    const matching = all.filter((s) => extractReferenceCode(s.refNo) === wantedCode);

    if (matching.length === 0) {
      return res.json({ status: 'success', data: [] });
    }

    const ids = matching.map((s) => s.id);
    const histories = await prisma.statusHistory.findMany({
      where: { shipmentId: { in: ids } },
      select: { shipmentId: true, changedBy: true }
    });

    const involvedMap = {};
    histories.forEach((h) => {
      if (!h.changedBy) return;
      if (!involvedMap[h.shipmentId]) involvedMap[h.shipmentId] = new Set();
      involvedMap[h.shipmentId].add(h.changedBy);
    });

    const data = matching
      .map((s) => {
        const involvedSet = involvedMap[s.id] || new Set();
        if (s.createdByName) involvedSet.add(s.createdByName);
        return {
          id: s.id,
          refNo: s.refNo,
          currentStatus: s.currentStatus,
          isClosed: CLOSED_STATUSES.includes(s.currentStatus),
          isArchived: s.isArchived,
          createdByName: s.createdByName,
          involved: Array.from(involvedSet),
          createdAt: s.createdAt
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ status: 'success', data });
  } catch (error) {
    console.error('Error getting shipments by reference code:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get shipments for this code' });
  }
};

// ─── GET EMPLOYEE STATS (NEW) ───
// ─── GET EMPLOYEE STATS (FIXED FOR SCALE) ───
// ⚠️ PERFORMANCE FIX: this used to fetch EVERY non-deleted shipment
// (id, createdById, currentStatus) and count totals in a JS loop — fine
// at a few thousand shipments, but at 200,000+ that's 200,000 rows
// pulled over the wire and iterated in Node on every request. Rewritten
// to do the counting in the database via 3 small groupBy queries — each
// one returns at most "number of employees" rows (dozens), not "number
// of shipments" (hundreds of thousands), regardless of how large the
// shipments table grows.
const getEmployeeStats = async (req, res) => {
  try {
    const [totalByEmployee, closedByEmployee, invoicedByEmployee, users] = await Promise.all([
      prisma.shipment.groupBy({ by: ['createdById'], where: { isDeleted: false }, _count: { _all: true } }),
      prisma.shipment.groupBy({ by: ['createdById'], where: { isDeleted: false, currentStatus: { in: CLOSED_STATUSES } }, _count: { _all: true } }),
      prisma.shipment.groupBy({ by: ['createdById'], where: { isDeleted: false, currentStatus: { in: INVOICED_STATUSES } }, _count: { _all: true } }),
      prisma.user.findMany({ select: { id: true, name: true } })
    ]);

    const nameById = {};
    users.forEach((u) => { nameById[u.id] = u.name; });

    const closedMap = {};
    closedByEmployee.forEach((r) => { closedMap[r.createdById] = r._count._all; });
    const invoicedMap = {};
    invoicedByEmployee.forEach((r) => { invoicedMap[r.createdById] = r._count._all; });

    const data = totalByEmployee
      .map((r) => {
        const total = r._count._all;
        const closed = closedMap[r.createdById] || 0;
        return {
          userId: r.createdById,
          name: nameById[r.createdById] || 'Unknown',
          total,
          open: total - closed,
          closed,
          invoiced: invoicedMap[r.createdById] || 0,
          closedRate: total > 0 ? Math.round((closed / total) * 100) : 0
        };
      })
      .sort((a, b) => b.total - a.total);

    res.json({ status: 'success', data });
  } catch (error) {
    console.error('Error getting employee stats:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get employee stats' });
  }
};

// ─── GET SHIPMENTS FOR A SPECIFIC EMPLOYEE (NEW) ───
// Already properly scoped — filters by one employee's createdById/
// createdByName before fetching, so this only ever returns that one
// person's own shipments, never the whole table. No change needed for
// scale here.
const getShipmentsByEmployee = async (req, res) => {
  try {
    const { userId, name } = req.query;
    if (!userId && !name) {
      return res.status(400).json({ status: 'error', message: 'userId or name query parameter is required' });
    }

    const where = { isDeleted: false };
    if (userId && userId !== 'unknown') where.createdById = userId;
    else where.createdByName = name;

    const matching = await prisma.shipment.findMany({
      where,
      select: { id: true, refNo: true, currentStatus: true, createdByName: true, createdAt: true, isArchived: true },
      orderBy: { createdAt: 'desc' }
    });

    const data = matching.map((s) => ({
      id: s.id,
      refNo: s.refNo,
      currentStatus: s.currentStatus,
      isClosed: CLOSED_STATUSES.includes(s.currentStatus),
      isArchived: s.isArchived,
      createdAt: s.createdAt
    }));

    res.json({ status: 'success', data });
  } catch (error) {
    console.error('Error getting shipments by employee:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get shipments for this employee' });
  }
};

// ─── REFERENCE PREFIXES (NEW) ───
const getReferencePrefixes = async (req, res) => {
  try {
    const prefixes = await prisma.referencePrefix.findMany({ orderBy: { code: 'asc' } });
    res.json({ status: 'success', data: prefixes });
  } catch (error) {
    console.error('Error loading reference prefixes:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load prefixes' });
  }
};

const createReferencePrefix = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ status: 'error', message: 'Prefix code is required' });
    }
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) {
      return res.status(400).json({ status: 'error', message: 'Invalid prefix — letters and numbers only' });
    }
    const createdBy = req.user?.name || req.user?.email || null;
    const existing = await prisma.referencePrefix.findUnique({ where: { code: clean } });
    if (existing) {
      return res.json({ status: 'success', data: existing, message: 'Prefix already exists' });
    }
    const created = await prisma.referencePrefix.create({ data: { code: clean, createdBy } });
    res.status(201).json({ status: 'success', data: created });
  } catch (error) {
    console.error('Error adding reference prefix:', error);
    res.status(500).json({ status: 'error', message: 'Failed to add prefix' });
  }
};

const deleteReferencePrefix = async (req, res) => {
  try {
    const code = req.params.code?.trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ status: 'error', message: 'Prefix code is required' });
    }
    await prisma.referencePrefix.delete({ where: { code } }).catch(() => null);
    res.json({ status: 'success', message: `Prefix "${code}" removed` });
  } catch (error) {
    console.error('Error deleting reference prefix:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete prefix' });
  }
};

// ─── REFERENCE INITIALS (NEW) ───
const getReferenceInitials = async (req, res) => {
  try {
    const initials = await prisma.referenceInitial.findMany({ orderBy: { code: 'asc' } });
    res.json({ status: 'success', data: initials });
  } catch (error) {
    console.error('Error loading reference initials:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load initials' });
  }
};

const createReferenceInitial = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ status: 'error', message: 'Initials are required' });
    }
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) {
      return res.status(400).json({ status: 'error', message: 'Invalid initials — letters and numbers only' });
    }
    const createdBy = req.user?.name || req.user?.email || null;
    const existing = await prisma.referenceInitial.findUnique({ where: { code: clean } });
    if (existing) {
      return res.json({ status: 'success', data: existing, message: 'Initials already exist' });
    }
    const created = await prisma.referenceInitial.create({ data: { code: clean, createdBy } });
    res.status(201).json({ status: 'success', data: created });
  } catch (error) {
    console.error('Error adding reference initials:', error);
    res.status(500).json({ status: 'error', message: 'Failed to add initials' });
  }
};

const updateReferenceInitial = async (req, res) => {
  try {
    const oldCode = req.params.code?.trim().toUpperCase();
    const { newCode } = req.body;
    if (!oldCode || !newCode || !newCode.trim()) {
      return res.status(400).json({ status: 'error', message: 'New initials are required' });
    }
    const clean = newCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) {
      return res.status(400).json({ status: 'error', message: 'Invalid initials — letters and numbers only' });
    }
    const existing = await prisma.referenceInitial.findUnique({ where: { code: oldCode } });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Initials not found' });
    }
    const clash = await prisma.referenceInitial.findUnique({ where: { code: clean } });
    if (clash && clean !== oldCode) {
      return res.status(400).json({ status: 'error', message: `Initials "${clean}" already exist` });
    }
    const updated = await prisma.referenceInitial.create({ data: { code: clean, createdBy: existing.createdBy } });
    await prisma.referenceInitial.delete({ where: { code: oldCode } });
    res.json({ status: 'success', data: updated });
  } catch (error) {
    console.error('Error updating reference initials:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update initials' });
  }
};

const deleteReferenceInitial = async (req, res) => {
  try {
    const code = req.params.code?.trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ status: 'error', message: 'Initials are required' });
    }
    await prisma.referenceInitial.delete({ where: { code } }).catch(() => null);
    res.json({ status: 'success', message: `Initials "${code}" removed` });
  } catch (error) {
    console.error('Error deleting reference initials:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete initials' });
  }
};

// ─── GENERATE NEXT REFERENCE NUMBER (NEW) ───
// ─── BACKFILL A PREFIX'S COUNTER FROM EXISTING SHIPMENTS (FIXED) ───
// The first time a prefix generates a number under the new per-prefix
// counter system, this scans existing shipments starting with that
// prefix code and finds the highest 4-digit sequence already in use
// (e.g. "RLI260319-BG" -> sequence 319), so the new counter continues
// from there instead of resetting to 0.
//
// ✅ FIXED: only recognizes refNos matching our OWN generated format
// exactly — CODE + 6 digits (year + 4-digit sequence) + a dash. This
// previously matched loosely on any digits after the code, so a
// manually-typed ref like "SPI2661180-XX" (not one we ever generated)
// got misread as sequence 6118 and jumped the whole counter forward by
// thousands. The tightened pattern ignores anything that doesn't look
// exactly like our own numbering scheme.
// ─── MANUALLY SET THE SHARED GLOBAL COUNTER (NEW) ───
// Lets anyone directly correct the counter if it's ever off — e.g. right
// after this reversion, to set it to match the last number actually
// issued. Setting it to N means the NEXT number generated (by ANY
// prefix — RL, PP, SP, JD, all of them) will be N+1.
const setPrefixCounter = async (req, res) => {
  try {
    const { value } = req.body;
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) {
      return res.status(400).json({ status: 'error', message: 'A valid non-negative number is required' });
    }
    const updated = await prisma.referenceCounter.upsert({
      where: { id: 'global' },
      update: { value: numValue },
      create: { id: 'global', value: numValue }
    });
    res.json({ status: 'success', data: updated, message: `Shared counter set to ${numValue}. Next generated number (any prefix) will use ${numValue + 1}.` });
  } catch (error) {
    console.error('Error setting shared counter:', error);
    res.status(500).json({ status: 'error', message: 'Failed to set counter' });
  }
};

// ─── GENERATE NEXT REFERENCE NUMBER (REVERTED TO SHARED COUNTER) ───
// ✅ Confirmed: RL, PP, SP, JD and every other prefix now share ONE
// single counter again. Whichever prefix generates next gets the next
// number in the overall sequence — if RL just used 320, the very next
// number generated by ANY prefix (even a JD one) is 321. Same
// skip-3-and-7-last-digit rule as always.
const generateReferenceNumber = async (req, res) => {
  try {
    const { prefix, initials } = req.body;
    if (!prefix || !prefix.trim()) {
      return res.status(400).json({ status: 'error', message: 'Prefix is required' });
    }
    if (!initials || !initials.trim()) {
      return res.status(400).json({ status: 'error', message: 'Initials are required' });
    }
    const code = prefix.trim().toUpperCase();
    const initialsCode = initials.trim().toUpperCase();

    const prefixExists = await prisma.referencePrefix.findUnique({ where: { code } });
    if (!prefixExists) {
      return res.status(400).json({ status: 'error', message: `Prefix "${code}" doesn't exist yet. Add it first.` });
    }
    const initialsExist = await prisma.referenceInitial.findUnique({ where: { code: initialsCode } });
    if (!initialsExist) {
      return res.status(400).json({ status: 'error', message: `Initials "${initialsCode}" don't exist yet. Add them first.` });
    }

    // Ensure the shared counter row exists before the first-ever generate.
    await prisma.referenceCounter.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global', value: 0 } });

    let counterValue;
    while (true) {
      const updated = await prisma.referenceCounter.update({
        where: { id: 'global' },
        data: { value: { increment: 1 } }
      });
      const lastDigit = updated.value % 10;
      if (lastDigit !== 3 && lastDigit !== 7) {
        counterValue = updated.value;
        break;
      }
      // else: this number ends in 3 or 7 — loop again, incrementing past it
    }

    // Display format: YEAR (2 digits) + 4-digit zero-padded sequence
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const yearTwoDigit = String(nowIST.getUTCFullYear()).slice(-2);
    const formattedNumber = `${yearTwoDigit}${String(counterValue).padStart(4, '0')}`;

    const refNo = `${code}${formattedNumber}-${initialsCode}`;
    res.json({ status: 'success', data: { refNo, number: formattedNumber, prefix: code, initials: initialsCode } });
  } catch (error) {
    console.error('Error generating reference number:', error);
    res.status(500).json({ status: 'error', message: 'Failed to generate reference number' });
  }
};

// ─── EDIT (RENAME) A REFERENCE PREFIX (NEW) ───
const updateReferencePrefix = async (req, res) => {
  try {
    const oldCode = req.params.code?.trim().toUpperCase();
    const { newCode } = req.body;
    if (!oldCode || !newCode || !newCode.trim()) {
      return res.status(400).json({ status: 'error', message: 'New prefix code is required' });
    }
    const clean = newCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) {
      return res.status(400).json({ status: 'error', message: 'Invalid prefix — letters and numbers only' });
    }
    const existing = await prisma.referencePrefix.findUnique({ where: { code: oldCode } });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Prefix not found' });
    }
    const clash = await prisma.referencePrefix.findUnique({ where: { code: clean } });
    if (clash && clean !== oldCode) {
      return res.status(400).json({ status: 'error', message: `Prefix "${clean}" already exists` });
    }
    const updated = await prisma.referencePrefix.create({
      data: { code: clean, createdBy: existing.createdBy }
    });
    await prisma.referencePrefix.delete({ where: { code: oldCode } });
    res.json({ status: 'success', data: updated });
  } catch (error) {
    console.error('Error updating reference prefix:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update prefix' });
  }
};

// ─── DAILY REPORT (NEW) ───
const IST_OFFSET_MS_REPORT = 5.5 * 60 * 60 * 1000;

function getISTDayBounds(dateStr) {
  const istDateStr = dateStr || new Date(Date.now() + IST_OFFSET_MS_REPORT).toISOString().split('T')[0];
  const start = new Date(`${istDateStr}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { istDateStr, start, end };
}

async function buildDailyReport(dateStr) {
  const { istDateStr, start, end } = getISTDayBounds(dateStr);

  const newShipments = await prisma.shipment.findMany({
    where: { isDeleted: false, createdAt: { gte: start, lt: end } },
    select: { id: true, refNo: true, shipmentType: true, createdByName: true }
  });

  const deliveredHistory = await prisma.statusHistory.findMany({
    where: { status: { in: ['DELIVERED', 'HAND_OVER'] }, createdAt: { gte: start, lt: end } },
    select: { shipmentId: true }
  });
  const invoicedHistory = await prisma.statusHistory.findMany({
    where: { status: { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] }, createdAt: { gte: start, lt: end } },
    select: { shipmentId: true }
  });
  const statusChangesCount = await prisma.statusHistory.count({
    where: { createdAt: { gte: start, lt: end } }
  });

  const deliveredIds = [...new Set(deliveredHistory.map((h) => h.shipmentId))];
  const invoicedIds = [...new Set(invoicedHistory.map((h) => h.shipmentId))];

  const [deliveredShipments, invoicedShipments] = await Promise.all([
    deliveredIds.length > 0
      ? prisma.shipment.findMany({ where: { id: { in: deliveredIds } }, select: { id: true, refNo: true, createdByName: true } })
      : [],
    invoicedIds.length > 0
      ? prisma.shipment.findMany({ where: { id: { in: invoicedIds } }, select: { id: true, refNo: true, createdByName: true } })
      : []
  ]);

  const employeeMap = {};
  const bump = (name, field) => {
    const key = name || 'Unknown';
    if (!employeeMap[key]) employeeMap[key] = { name: key, created: 0, delivered: 0, invoiced: 0 };
    employeeMap[key][field] += 1;
  };
  newShipments.forEach((s) => bump(s.createdByName, 'created'));
  deliveredShipments.forEach((s) => bump(s.createdByName, 'delivered'));
  invoicedShipments.forEach((s) => bump(s.createdByName, 'invoiced'));

  const employeeBreakdown = Object.values(employeeMap).sort((a, b) => b.created - a.created);

  return {
    date: istDateStr,
    newShipments: { count: newShipments.length, items: newShipments },
    delivered: { count: deliveredShipments.length, items: deliveredShipments },
    invoiced: { count: invoicedShipments.length, items: invoicedShipments },
    statusChangesCount,
    employeeBreakdown
  };
}

// ─── GET DAILY REPORT (NEW — visible to everyone) ───
const getDailyReport = async (req, res) => {
  try {
    const { date } = req.query;
    const report = await buildDailyReport(date);
    res.json({ status: 'success', data: report });
  } catch (error) {
    console.error('Error getting daily report:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get daily report' });
  }
};

// ─── GET EMPLOYEE LIST (NEW) ───
const getEmployeeList = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' }
    });
    res.json({ status: 'success', data: users });
  } catch (error) {
    console.error('Error getting employee list:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get employee list' });
  }
};

// ─── PARTY NAMES — MANAGED CONSIGNEE / SHIPPER LIST (NEW) ───
// Same idea as Reference Prefixes/Initials: a real list the company
// maintains directly (bulk-add your existing names, add/rename/delete
// individually), not something guessed from shipment history. Powers
// the searchable dropdown on the Create Shipment page for both fields —
// `type` ('CONSIGNEE' or 'SHIPPER') picks which list.
const getPartyNames = async (req, res) => {
  try {
    const type = (req.query.type || '').toUpperCase();
    if (!['CONSIGNEE', 'SHIPPER'].includes(type)) {
      return res.status(400).json({ status: 'error', message: 'type must be CONSIGNEE or SHIPPER' });
    }
    const rows = await prisma.partyName.findMany({ where: { type }, orderBy: { name: 'asc' } });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    console.error('Error getting party names:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get party names' });
  }
};

// Add one name — used both by the "Manage" panel's Add button, and
// automatically whenever someone types a brand-new name (not already in
// the list) while creating a shipment, so the list grows organically too.
const createPartyName = async (req, res) => {
  try {
    const type = (req.body.type || '').toUpperCase();
    const name = (req.body.name || '').trim();
    if (!['CONSIGNEE', 'SHIPPER'].includes(type)) {
      return res.status(400).json({ status: 'error', message: 'type must be CONSIGNEE or SHIPPER' });
    }
    if (!name) return res.status(400).json({ status: 'error', message: 'Name is required' });
    const existing = await prisma.partyName.findUnique({ where: { type_name: { type, name } } });
    if (existing) return res.json({ status: 'success', data: existing }); // already there — no error, just hand it back
    const created = await prisma.partyName.create({ data: { type, name, createdBy: actorName(req) } });
    res.status(201).json({ status: 'success', data: created });
  } catch (error) {
    console.error('Error creating party name:', error);
    res.status(500).json({ status: 'error', message: 'Failed to add name' });
  }
};

// ✅ NEW — bulk-add many names at once (paste a whole list), for
// importing an existing master list in one go rather than one at a time.
const bulkCreatePartyNames = async (req, res) => {
  try {
    const type = (req.body.type || '').toUpperCase();
    const names = Array.isArray(req.body.names) ? req.body.names : [];
    if (!['CONSIGNEE', 'SHIPPER'].includes(type)) {
      return res.status(400).json({ status: 'error', message: 'type must be CONSIGNEE or SHIPPER' });
    }
    const cleaned = [...new Set(names.map((n) => (n || '').trim()).filter(Boolean))];
    if (cleaned.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No valid names provided' });
    }
    const createdBy = actorName(req);
    let added = 0;
    for (const name of cleaned) {
      const existing = await prisma.partyName.findUnique({ where: { type_name: { type, name } } });
      if (!existing) {
        await prisma.partyName.create({ data: { type, name, createdBy } });
        added++;
      }
    }
    res.json({ status: 'success', message: `Added ${added} new name(s) (${cleaned.length - added} already existed)`, data: { added, skipped: cleaned.length - added } });
  } catch (error) {
    console.error('Error bulk-adding party names:', error);
    res.status(500).json({ status: 'error', message: 'Failed to bulk-add names' });
  }
};

const updatePartyName = async (req, res) => {
  try {
    const { id } = req.params;
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ status: 'error', message: 'Name is required' });
    const updated = await prisma.partyName.update({ where: { id }, data: { name } });
    res.json({ status: 'success', data: updated });
  } catch (error) {
    console.error('Error updating party name:', error);
    res.status(500).json({ status: 'error', message: 'Failed to rename' });
  }
};

const deletePartyName = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.partyName.delete({ where: { id } });
    res.json({ status: 'success', message: 'Deleted' });
  } catch (error) {
    console.error('Error deleting party name:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete' });
  }
};

// ─── GET TEAM OVERVIEW (NEW — visible to everyone) ───
const getTeamOverview = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, team: true }
    });
    const shipments = await prisma.shipment.findMany({
      where: { isDeleted: false },
      select: { createdById: true, currentStatus: true }
    });
    const countMap = {};
    shipments.forEach((s) => {
      if (!s.createdById) return;
      if (!countMap[s.createdById]) countMap[s.createdById] = { total: 0, cleared: 0 };
      countMap[s.createdById].total += 1;
      if (CLOSED_STATUSES.includes(s.currentStatus)) countMap[s.createdById].cleared += 1;
    });
    const data = users
      .map((u) => {
        const c = countMap[u.id] || { total: 0, cleared: 0 };
        return {
          ...u,
          shipmentCount: c.total,
          clearedCount: c.cleared,
          pendingCount: c.total - c.cleared,
        };
      })
      .sort((a, b) => b.shipmentCount - a.shipmentCount);
    res.json({ status: 'success', data });
  } catch (error) {
    console.error('Error getting team overview:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get team overview' });
  }
};

// ─── UPDATE EMPLOYEE TEAM (NEW — visible to everyone) ───
// Sets which of the 3 workflow teams (FREIGHT/CUSTOMS/ACCOUNTS) an
// employee belongs to. This is what the Team Performance report groups
// by — separate from `role` (ADMIN/OPERATIONS/ACCOUNTS), since OPERATIONS
// today covers both Freight and Customs people and this is how we tell
// them apart.
const VALID_TEAMS = ['FREIGHT', 'CUSTOMS', 'ACCOUNTS'];
const updateEmployeeTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { team } = req.body;
    if (team !== null && !VALID_TEAMS.includes(team)) {
      return res.status(400).json({ status: 'error', message: `Team must be one of: ${VALID_TEAMS.join(', ')}` });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { team: team || null },
      select: { id: true, name: true, email: true, role: true, team: true }
    });
    res.json({ status: 'success', data: updated });
  } catch (error) {
    console.error('Error updating employee team:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update team' });
  }
};

// ─── GET EMPLOYEE PERFORMANCE (NEW — visible to everyone) ───
// ─── GET EMPLOYEE PERFORMANCE (FIXED FOR SCALE) ───
// ⚠️ PERFORMANCE FIX: this used to fetch EVERY matching shipment
// (id, createdById, coHandlerId) AND EVERY matching status-history row
// (shipmentId, changedBy, createdAt), then loop through all of it in
// Node to compute per-employee counts. With no date range selected
// ("All Teams", lifetime), that meant pulling the ENTIRE shipments table
// and the ENTIRE status-history table (usually the largest table in the
// database) into memory on every request.
//
// Rewritten to push the counting into the database:
//   - created / coHandled: 2 small groupBy queries, one row per employee
//   - touched (distinct shipments touched) + lastActive: a groupBy on
//     [changedBy, shipmentId] first collapses duplicate actions on the
//     same shipment by the same person down to one row per unique pair
//     — this can still be a meaningful number of rows over a very wide
//     date range, but it's already deduplicated at the database level
//     and is typically far smaller than the raw history table, and gets
//     smaller still the narrower the date range (e.g. one month).
//     lastActive comes from a separate groupBy with _max(createdAt),
//     which Postgres computes directly without returning any rows to sum.
const getEmployeePerformance = async (req, res) => {
  try {
    const { team, from, to } = req.query;

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, team: true }
    });

    let dateFilter = {};
    if (from) dateFilter.gte = new Date(`${from}T00:00:00+05:30`);
    if (to) dateFilter.lt = new Date(`${to}T23:59:59.999+05:30`);
    const hasDateFilter = Object.keys(dateFilter).length > 0;

    const shipmentWhere = { isDeleted: false };
    if (hasDateFilter) shipmentWhere.createdAt = dateFilter;

    const historyWhere = { changedBy: { not: null } };
    if (hasDateFilter) historyWhere.createdAt = dateFilter;

    const [createdGroups, coHandledGroups, distinctTouchedPairs, lastActiveGroups] = await Promise.all([
      prisma.shipment.groupBy({ by: ['createdById'], where: shipmentWhere, _count: { _all: true } }),
      prisma.shipment.groupBy({ by: ['coHandlerId'], where: { ...shipmentWhere, coHandlerId: { not: null } }, _count: { _all: true } }),
      prisma.statusHistory.groupBy({ by: ['changedBy', 'shipmentId'], where: historyWhere }),
      prisma.statusHistory.groupBy({ by: ['changedBy'], where: historyWhere, _max: { createdAt: true } })
    ]);

    const createdMap = {};
    createdGroups.forEach((r) => { if (r.createdById) createdMap[r.createdById] = r._count._all; });

    const coHandledMap = {};
    coHandledGroups.forEach((r) => { coHandledMap[r.coHandlerId] = r._count._all; });

    const touchedCountByName = {};
    distinctTouchedPairs.forEach((r) => {
      touchedCountByName[r.changedBy] = (touchedCountByName[r.changedBy] || 0) + 1;
    });

    const lastActiveMap = {};
    lastActiveGroups.forEach((r) => { lastActiveMap[r.changedBy] = r._max.createdAt; });

    const data = users
      .filter((u) => !team || u.team === team)
      .map((u) => ({
        userId: u.id,
        name: u.name,
        email: u.email,
        team: u.team || null,
        created: createdMap[u.id] || 0,
        coHandled: coHandledMap[u.id] || 0,
        touched: touchedCountByName[u.name] || 0,
        lastActive: lastActiveMap[u.name] || null
      }))
      .sort((a, b) => b.touched - a.touched);

    res.json({ status: 'success', data });
  } catch (error) {
    console.error('Error getting employee performance:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get employee performance' });
  }
};

// ─── GET MONTHLY REPORT (NEW, ADMIN ONLY) ───
// The end-of-month scorecard. For a given calendar month (IST-anchored,
// defaults to the current month), returns per employee:
//   - created   -> shipments they opened this month
//   - touched   -> distinct shipments they logged ANY action on this month
//   - closed    -> of the shipments they touched, how many are currently
//                  DELIVERED/HAND_OVER/INVOICE_GENERATED/INVOICE_SENT
//   - totalActions -> raw count of status-history entries attributed to
//                  them this month (volume, not just breadth)
//   - activeDays -> distinct calendar days (IST) with at least one
//                  logged action this month — the actual "is everyone
//                  working" signal your MD is asking for; low activeDays
//                  against a full working month stands out immediately
//   - lastActive -> most recent action this month
// Grouped by team, same as Team Performance, so the two pages read
// consistently side by side.
// ─── PIPELINE BOARD (NEW) ───
// Powers the Kanban-style "Freight → Customs → Invoice → Done" tab on
// Overview. A shipment's stage isn't a stored field — it's computed live
// from the exact same field-completion rules used by isArchiveEligible
// and the workflow stepper, so all three stay consistent with each
// other automatically. Nobody drags a card between columns; a shipment
// just stops matching one stage's query and starts matching the next
// the moment the relevant fields are filled in.
//
// Simple shipment types (Transport/DO Release/FF Only) skip Freight and
// Customs entirely — same tiering as isArchiveEligible — and go straight
// to Invoice once created.
//
// Built with the same scale discipline as the rest of this file: each
// column is its own small, targeted query (a bounded `take` + a
// `count`), never "load everything and sort in JS".
const SIMPLE_PIPELINE_TYPES = ['Transport', 'DO Release', 'FF Only'];
const PIPELINE_COLUMN_LIMIT = 20;

// ─── CANCELLED / STALE ENQUIRY (NEW) ───
// A shipment that's sat at pure ENQUIRY (nothing at all filled in yet —
// no rates, no nomination, no anything) for more than 7 days is treated
// as effectively cancelled/abandoned. Threshold is deliberately "more
// than 7 days", not "6 days" and not "on day 7" — a shipment created
// today is day 0; it only qualifies once a full 7 days have elapsed.
const CANCELLED_THRESHOLD_DAYS = 7;

function getCancelledThresholdDate() {
  return new Date(Date.now() - CANCELLED_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
}

// Matches shipments that ARE cancelled — used for the Cancelled card itself.
function getCancelledWhere() {
  return {
    isDeleted: false,
    isArchived: false,
    currentStatus: 'ENQUIRY',
    createdAt: { lte: getCancelledThresholdDate() }
  };
}

// The inverse — "definitely NOT cancelled" — meant to be spread into
// other cards/stages (In Progress, the Pipeline's Freight stage) so a
// stale enquiry is excluded from them instead of being counted twice.
// True when EITHER it has progressed past ENQUIRY, OR it's still within
// the 7-day grace window.
function getNotCancelledFilter() {
  return {
    OR: [
      { currentStatus: { not: 'ENQUIRY' } },
      { createdAt: { gt: getCancelledThresholdDate() } }
    ]
  };
}

function freightIncompleteFilter() {
  return {
    OR: [
      { freightForwarding: null },
      { freightForwarding: { fromLocation: null } },
      { freightForwarding: { toLocation: null } },
      { freightForwarding: { terms: null } },
      { freightForwarding: { grossWeight: null } },
      { freightForwarding: { weight: null } },
      { freightForwarding: { hawb: null } }
    ]
  };
}
function freightCompleteFilter() {
  return {
    freightForwarding: {
      fromLocation: { not: null }, toLocation: { not: null }, terms: { not: null },
      grossWeight: { not: null }, weight: { not: null }, hawb: { not: null }
    }
  };
}
function customsIncompleteFilter() {
  return { OR: [{ cha: null }, { cha: { boeNo: null, sbNo: null } }] };
}
function customsCompleteFilter() {
  return { cha: { OR: [{ boeNo: { not: null } }, { sbNo: { not: null } }] } };
}
function invoiceIncompleteFilter() {
  return { OR: [{ accounts: null }, { accounts: { invoiceNumber: null } }, { accounts: { invoiceDate: null } }] };
}
function invoiceCompleteFilter() {
  return { accounts: { invoiceNumber: { not: null }, invoiceDate: { not: null } } };
}

const PIPELINE_CARD_SELECT = {
  id: true, refNo: true, currentStatus: true, shipmentType: true, createdByName: true, createdAt: true,
  freightForwarding: { select: { consigneeName: true, customerName: true } },
  cha: { select: { boeNo: true, sbNo: true } },
  accounts: { select: { invoiceNumber: true } }
};

// ✅ NEW — shared by getPipelineBoard (the Kanban tab) AND getAllShipments
// (so clicking a stat card on the main Dashboard filters to the exact
// same set of shipments the Pipeline board's column shows). One
// definition, used both places, so they can never quietly drift apart.
function getPipelineStageWhere(stage) {
  const baseActive = { isDeleted: false, isArchived: false };
  if (stage === 'freight') {
    return {
      ...baseActive,
      shipmentType: { notIn: [...SIMPLE_PIPELINE_TYPES, 'CHA Only'] },
      ...freightIncompleteFilter(),
      AND: [getNotCancelledFilter()] // ✅ NEW — a stale enquiry belongs in Cancelled, not here
    };
  }
  if (stage === 'customs') {
    return {
      ...baseActive,
      OR: [
        { AND: [{ shipmentType: { notIn: [...SIMPLE_PIPELINE_TYPES, 'CHA Only'] } }, freightCompleteFilter(), customsIncompleteFilter()] },
        { AND: [{ shipmentType: 'CHA Only' }, customsIncompleteFilter()] }
      ]
    };
  }
  if (stage === 'invoice') {
    return {
      ...baseActive,
      OR: [
        { AND: [{ shipmentType: { notIn: SIMPLE_PIPELINE_TYPES } }, customsCompleteFilter(), invoiceIncompleteFilter()] },
        { AND: [{ shipmentType: { in: SIMPLE_PIPELINE_TYPES } }, invoiceIncompleteFilter()] }
      ]
    };
  }
  if (stage === 'done') {
    // "Done" intentionally includes both still-active (within the 30-day
    // grace window) and already-archived shipments whose invoice is
    // complete — the point of this stage is "the work is finished",
    // regardless of exactly which shelf it's currently sitting on.
    return { isDeleted: false, ...invoiceCompleteFilter() };
  }
  return null;
}

const getPipelineBoard = async (req, res) => {
  try {
    const freightWhere = getPipelineStageWhere('freight');
    const customsWhere = getPipelineStageWhere('customs');
    const invoiceWhere = getPipelineStageWhere('invoice');
    const doneWhere = getPipelineStageWhere('done');

    const [freightCount, customsCount, invoiceCount, doneCount, freightItems, customsItems, invoiceItems, doneItems] = await Promise.all([
      prisma.shipment.count({ where: freightWhere }),
      prisma.shipment.count({ where: customsWhere }),
      prisma.shipment.count({ where: invoiceWhere }),
      prisma.shipment.count({ where: doneWhere }),
      prisma.shipment.findMany({ where: freightWhere, select: PIPELINE_CARD_SELECT, orderBy: { createdAt: 'asc' }, take: PIPELINE_COLUMN_LIMIT }),
      prisma.shipment.findMany({ where: customsWhere, select: PIPELINE_CARD_SELECT, orderBy: { createdAt: 'asc' }, take: PIPELINE_COLUMN_LIMIT }),
      prisma.shipment.findMany({ where: invoiceWhere, select: PIPELINE_CARD_SELECT, orderBy: { createdAt: 'asc' }, take: PIPELINE_COLUMN_LIMIT }),
      prisma.shipment.findMany({ where: doneWhere, select: PIPELINE_CARD_SELECT, orderBy: { createdAt: 'desc' }, take: PIPELINE_COLUMN_LIMIT })
    ]);

    res.json({
      status: 'success',
      data: {
        freight: { count: freightCount, items: freightItems },
        customs: { count: customsCount, items: customsItems },
        invoice: { count: invoiceCount, items: invoiceItems },
        done: { count: doneCount, items: doneItems }
      }
    });
  } catch (error) {
    console.error('Error getting pipeline board:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get pipeline board' });
  }
};

const getMonthlyReport = async (req, res) => {
  try {
    const { month } = req.query; // "YYYY-MM", defaults to current IST month
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    let y, m;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      [y, m] = month.split('-').map(Number);
      m -= 1; // 0-indexed
    } else {
      const nowIST = new Date(Date.now() + IST_OFFSET);
      y = nowIST.getUTCFullYear();
      m = nowIST.getUTCMonth();
    }
    const monthStart = new Date(Date.UTC(y, m, 1) - IST_OFFSET);
    const monthEnd = new Date(Date.UTC(y, m + 1, 1) - IST_OFFSET);

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, team: true }
    });

    const createdThisMonth = await prisma.shipment.findMany({
      where: { isDeleted: false, createdAt: { gte: monthStart, lt: monthEnd } },
      select: { id: true, createdById: true }
    });
    const createdMap = {};
    createdThisMonth.forEach((s) => {
      if (s.createdById) createdMap[s.createdById] = (createdMap[s.createdById] || 0) + 1;
    });

    const historyThisMonth = await prisma.statusHistory.findMany({
      where: { createdAt: { gte: monthStart, lt: monthEnd }, changedBy: { not: null } },
      select: { shipmentId: true, changedBy: true, createdAt: true }
    });

    // Per-name aggregation: touched shipment ids, total actions, active
    // days (as IST date strings), last active timestamp.
    const perName = {};
    historyThisMonth.forEach((h) => {
      if (!perName[h.changedBy]) perName[h.changedBy] = { shipmentIds: new Set(), totalActions: 0, activeDays: new Set(), lastActive: h.createdAt };
      const p = perName[h.changedBy];
      p.shipmentIds.add(h.shipmentId);
      p.totalActions += 1;
      const istDay = new Date(h.createdAt.getTime() + IST_OFFSET).toISOString().split('T')[0];
      p.activeDays.add(istDay);
      if (h.createdAt > p.lastActive) p.lastActive = h.createdAt;
    });

    // To compute "closed", we need current status for every touched
    // shipment across all employees — one batch query for the union.
    const allTouchedIds = new Set();
    Object.values(perName).forEach((p) => p.shipmentIds.forEach((id) => allTouchedIds.add(id)));
    const touchedShipments = allTouchedIds.size > 0
      ? await prisma.shipment.findMany({ where: { id: { in: Array.from(allTouchedIds) } }, select: { id: true, currentStatus: true } })
      : [];
    const statusById = {};
    touchedShipments.forEach((s) => { statusById[s.id] = s.currentStatus; });
    const CLOSED = ['DELIVERED', 'HAND_OVER', 'INVOICE_GENERATED', 'INVOICE_SENT'];

    const data = users.map((u) => {
      const p = perName[u.name];
      const touched = p ? p.shipmentIds.size : 0;
      const closed = p ? Array.from(p.shipmentIds).filter((id) => CLOSED.includes(statusById[id])).length : 0;
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        team: u.team || null,
        created: createdMap[u.id] || 0,
        touched,
        closed,
        totalActions: p ? p.totalActions : 0,
        activeDays: p ? p.activeDays.size : 0,
        lastActive: p ? p.lastActive : null
      };
    }).sort((a, b) => b.totalActions - a.totalActions);

    res.json({ status: 'success', data: { month: `${y}-${String(m + 1).padStart(2, '0')}`, employees: data } });
  } catch (error) {
    console.error('Error getting monthly report:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get monthly report' });
  }
};

// ─── GET SINGLE ───
// ✅ Now also computes `contributors` — EVERY person who has ever acted
// on this specific shipment (not just who created it, and not just who
// was first per team), with how many actions each of them logged and
// when their first/last action was. Pulled from the FULL status history
// for this shipment (not the 50-entry-limited slice returned for the
// timeline UI), so the count is always accurate even on very old,
// heavily-worked shipments. This is the real per-shipment "who worked on
// this" answer — Handled By badges only show who was first per team,
// this shows everyone, including handoffs.
const getShipmentById = async (req, res) => {
  try {
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } });
    if (!s) return res.status(404).json({ status: 'error', message: 'Not found' });

    const fullHistory = await prisma.statusHistory.findMany({
      where: { shipmentId: s.id, changedBy: { not: null } },
      select: { changedBy: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });
    const contribMap = {};
    fullHistory.forEach((h) => {
      if (!contribMap[h.changedBy]) contribMap[h.changedBy] = { name: h.changedBy, actionCount: 0, firstAction: h.createdAt, lastAction: h.createdAt };
      contribMap[h.changedBy].actionCount += 1;
      contribMap[h.changedBy].lastAction = h.createdAt;
    });
    // Ensure the creator always appears, even if their earliest history
    // entries predate changedBy tracking and so weren't counted above.
    if (s.createdByName && !contribMap[s.createdByName]) {
      contribMap[s.createdByName] = { name: s.createdByName, actionCount: 0, firstAction: s.createdAt, lastAction: s.createdAt };
    }
    const contributors = Object.values(contribMap).sort((a, b) => b.actionCount - a.actionCount);

    // ✅ HANDLED BY — EVERYONE PER TEAM (FIXED) — same grouping as the
    // Dashboard list, computed from the FULL history for this one
    // shipment. Powers "Freight: A, B" / "Customs: C, D, E" / "Accounts:
    // F, G" badges showing every person who worked that team's part, not
    // just whoever was first.
    const fullHistoryWithStatus = await prisma.statusHistory.findMany({
      where: { shipmentId: s.id, changedBy: { not: null } },
      select: { changedBy: true, status: true }
    });
    const teamContributorsFinal = groupContributorsByTeam(fullHistoryWithStatus);
    if (s.createdByName && !teamContributorsFinal.FREIGHT.includes(s.createdByName)) {
      teamContributorsFinal.FREIGHT.unshift(s.createdByName);
    }

    res.json({ status: 'success', data: { ...s, contributors, teamContributors: teamContributorsFinal } });
  } catch (error) { console.error('Error:', error); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// ─── ALL UPDATE ROUTES ───
const updateRefNo = async (req, res) => {
  try { const { refNo } = req.body; if (!refNo) return res.status(400).json({ status: 'error', message: 'Reference Number is required' }); 
    await prisma.shipment.update({ where: { id: req.params.id }, data: { refNo } }); await upsertStatusEntry(req.params.id, 'REFNO_UPDATED', `Ref No: ${refNo}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateConsignee = async (req, res) => {
  try { const val = req.body.consigneeName; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { consigneeName: val } } } }); await upsertStatusEntry(req.params.id, 'CONSIGNEE_UPDATED', `Consignee: ${val}`, actorName(req)); await checkAndStampFreightComplete(req.params.id, req); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateShipper = async (req, res) => {
  try { const val = req.body.shipperName; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { shipperName: val } } } }); await upsertStatusEntry(req.params.id, 'SHIPPER_UPDATED', `Shipper: ${val}`, actorName(req)); await checkAndStampFreightComplete(req.params.id, req); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateAgent = async (req, res) => {
  try { const val = req.body.agent; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { agent: val } } } }); await upsertStatusEntry(req.params.id, 'AGENT_UPDATED', `Agent: ${val}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateShipmentType = async (req, res) => {
  try { const { shipmentType } = req.body; await prisma.shipment.update({ where: { id: req.params.id }, data: { shipmentType } }); await upsertStatusEntry(req.params.id, 'TYPE_UPDATED', `Mode: ${shipmentType}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateImportExport = async (req, res) => {
  try { const { importExport } = req.body; await prisma.shipment.update({ where: { id: req.params.id }, data: { importExport } }); await upsertStatusEntry(req.params.id, 'IMPORT_EXPORT_UPDATED', `Import/Export: ${importExport}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateStage = async (req, res) => {
  try { const stage = req.body.shipmentStage; await prisma.shipment.update({ where: { id: req.params.id }, data: { shipmentStage: stage } }); await upsertStatusEntry(req.params.id, 'STAGE_CHANGE', `Stage: ${stage}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateRemarks = async (req, res) => {
  try { const remarks = req.body.remarks; await prisma.shipment.update({ where: { id: req.params.id }, data: { remarks } }); await upsertStatusEntry(req.params.id, 'REMARKS', 'Remarks updated', actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateFromLocation = async (req, res) => {
  try { const val = req.body.fromLocation; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { fromLocation: val } } } }); await upsertStatusEntry(req.params.id, 'FROM_LOCATION', `From: ${val}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateToLocation = async (req, res) => {
  try { const val = req.body.toLocation; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { toLocation: val } } } }); await upsertStatusEntry(req.params.id, 'TO_LOCATION', `To: ${val}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateTerms = async (req, res) => {
  try { const val = req.body.terms; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { terms: val } } } }); await upsertStatusEntry(req.params.id, 'TERMS', `Terms: ${val}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateRates = async (req, res) => {
  try { 
    const { sellingRate, weight, cbm, grossWeight, notificationEmail, enquiryDate, noOfPackages, customerName, vehicleType, noOfContainers, containerType, packageType, deliveryDate, fromLocation, toLocation, transportMode, commodityName, preAlertsSentDate } = req.body; 
    const data = {}; const parts = []; 
    // ✅ FIX — parseFloat('') is NaN, and Prisma rejects writing NaN to a
    // Float column, which was silently failing the WHOLE update whenever
    // someone cleared Rate/Weight/CBM/Gross Weight back to blank — the
    // exact "I clear it but it comes back" bug. Empty string now saves
    // as null (a real, valid "cleared" value) instead of invalid NaN.
    if (sellingRate !== undefined) { data.sellingRate = sellingRate === '' ? null : parseFloat(sellingRate); parts.push(`Rate: ₹${sellingRate}`); } 
    if (weight !== undefined) { data.weight = weight === '' ? null : parseFloat(weight); parts.push(`Chargeable Wt: ${weight}kg`); } 
    if (cbm !== undefined) { data.cbm = cbm === '' ? null : parseFloat(cbm); parts.push(`CBM: ${cbm}`); } 
    if (grossWeight !== undefined) { data.grossWeight = grossWeight === '' ? null : parseFloat(grossWeight); parts.push(`Gross Wt: ${grossWeight}kg`); } 
    if (notificationEmail !== undefined) { data.notificationEmail = notificationEmail; } 
    if (enquiryDate !== undefined) { data.enquiryDate = enquiryDate ? new Date(enquiryDate) : null; } 
    if (noOfPackages !== undefined) { data.noOfPackages = noOfPackages ? parseInt(noOfPackages) : null; } 
    if (customerName !== undefined) { data.customerName = customerName; } 
    if (vehicleType !== undefined) { data.vehicleType = vehicleType; } 
    if (noOfContainers !== undefined) { data.noOfContainers = noOfContainers ? parseInt(noOfContainers) : null; } 
    if (containerType !== undefined) { data.containerType = containerType || null; } 
    if (packageType !== undefined) { data.packageType = packageType; } 
    if (deliveryDate !== undefined) { data.deliveryDate = deliveryDate ? new Date(deliveryDate) : null; } 
    if (fromLocation !== undefined) { data.fromLocation = fromLocation; } 
    if (toLocation !== undefined) { data.toLocation = toLocation; } 
    if (transportMode !== undefined) { data.transportMode = transportMode; } 
    if (commodityName !== undefined) { data.commodityName = commodityName || null; } 
    if (preAlertsSentDate !== undefined) { data.preAlertsSentDate = preAlertsSentDate ? new Date(preAlertsSentDate) : null; } 
    if (Object.keys(data).length > 0) { 
      await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: data } } }); 
      if (parts.length > 0) await upsertStatusEntry(req.params.id, 'RATES_UPDATED', parts.join(' | '), actorName(req)); 
      await checkAndStampFreightComplete(req.params.id, req);
      await recomputeCurrentStatus(req.params.id); // ✅ NEW — lets status move through RATES_ADDED, and move back if rate/weight is cleared
    } 
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); 
    sendStatusEmail(s).catch(() => {}); 
    res.json({ status: 'success', data: s }); 
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateCBM = async (req, res) => {
  try { const val = req.body.cbm; const cbmVal = val === '' ? null : parseFloat(val); await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { cbm: cbmVal } } } }); await upsertStatusEntry(req.params.id, 'CBM_UPDATED', `CBM: ${val}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updatePortLocation = async (req, res) => {
  try { const val = req.body.portLocation; await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { portLocation: val } } } }); await upsertStatusEntry(req.params.id, 'PORT_LOCATION', `Port: ${val}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateSchedule = async (req, res) => {
  try {
    const data = {}; const parts = [];
    // ✅ FIX — was `if (req.body.etd)`, which silently ignored attempts to
    // CLEAR the date (an empty string is falsy). Now `!== undefined`
    // catches both "a real date was given" and "the field was cleared",
    // writing null for the latter instead of doing nothing.
    if (req.body.etd !== undefined) { data.etd = req.body.etd ? new Date(req.body.etd) : null; if (req.body.etd) parts.push(`ETD: ${req.body.etd}`); }
    if (req.body.eta !== undefined) { data.eta = req.body.eta ? new Date(req.body.eta) : null; if (req.body.eta) parts.push(`ETA: ${req.body.eta}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: data } } });
      if (parts.length > 0) await upsertStatusEntry(req.params.id, 'SCHEDULED', parts.join(' | '), actorName(req));
      await recomputeCurrentStatus(req.params.id); // ✅ NEW — moves status forward OR back based on what's actually filled in now
    }
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } });
    sendStatusEmail(s).catch(() => {});
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateNomination = async (req, res) => {
  try {
    if (req.body.nominationDate !== undefined) {
      const val = req.body.nominationDate ? new Date(req.body.nominationDate) : null;
      await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { nominationDate: val } } } });
      await upsertStatusEntry(req.params.id, 'NOMINATED', val ? `Nomination: ${req.body.nominationDate}` : 'Nomination date cleared', actorName(req));
      await recomputeCurrentStatus(req.params.id); // ✅ NEW
    }
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } });
    sendStatusEmail(s).catch(() => {});
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateBooking = async (req, res) => {
  try {
    if (req.body.bookingDate !== undefined) {
      const val = req.body.bookingDate ? new Date(req.body.bookingDate) : null;
      await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { bookingDate: val } } } });
      await upsertStatusEntry(req.params.id, 'BOOKED', val ? `Booking: ${req.body.bookingDate}` : 'Booking date cleared', actorName(req));
      await recomputeCurrentStatus(req.params.id); // ✅ NEW
    }
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } });
    sendStatusEmail(s).catch(() => {});
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// ─── UPDATE PICKUP DATE (NEW) ───
// Sits between Booking and Schedule in the Freight workflow. Built with
// the `!== undefined` + ternary-to-null pattern from the start (learned
// from the earlier bug where other date fields silently failed to
// clear) — so clearing this one back to blank works correctly from day
// one, no separate fix needed later.
const updatePickup = async (req, res) => {
  try {
    if (req.body.pickupDate !== undefined) {
      const val = req.body.pickupDate ? new Date(req.body.pickupDate) : null;
      await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: { pickupDate: val } } } });
      await upsertStatusEntry(req.params.id, 'PICKUP_UPDATED', val ? `Pickup Date: ${req.body.pickupDate}` : 'Pickup date cleared', actorName(req));
    }
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } });
    sendStatusEmail(s).catch(() => {});
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateAWB = async (req, res) => {
  try {
    const data = {}; const parts = [];
    if (req.body.mawb !== undefined) { data.mawb = req.body.mawb; parts.push(`MAWB: ${req.body.mawb}`); }
    if (req.body.hawb !== undefined) { data.hawb = req.body.hawb; parts.push(`HAWB: ${req.body.hawb}`); }
    if (req.body.awbDate !== undefined) { data.awbDate = req.body.awbDate ? new Date(req.body.awbDate) : null; if (req.body.awbDate) parts.push(`AWB Date: ${req.body.awbDate}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id: req.params.id }, data: { freightForwarding: { update: data } } });
      if (parts.length > 0) await upsertStatusEntry(req.params.id, 'AWB_GENERATED', parts.join(' | '), actorName(req));
      await recomputeCurrentStatus(req.params.id); // ✅ NEW
    }
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } });
    sendStatusEmail(s).catch(() => {});
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { 
  recomputeCurrentStatus, // ✅ NEW — shared by cha.controller.js and accounts.controller.js
  createShipment, 
  deleteShipment, 
  deleteAllShipments, 
  softDeleteShipment,
  restoreShipment,
  getBinShipments,
  getBinCount,
  bulkRestoreShipments,
  exportShipments, 
  exportSelectedForClient,
  getAllShipments, 
  getShipmentStats,
  getReferenceCodeStats,
  getShipmentsByReferenceCode,
  getEmployeeStats,
  getShipmentsByEmployee,
  getReferencePrefixes,
  createReferencePrefix,
  deleteReferencePrefix,
  updateReferencePrefix,
  setPrefixCounter, // ✅ NEW
  getReferenceInitials,
  createReferenceInitial,
  updateReferenceInitial,
  deleteReferenceInitial,
  generateReferenceNumber,
  getTeamOverview,
  updateEmployeeTeam, // ✅ NEW (re-added — was lost in an earlier rebuild)
  getEmployeeList,
  getPartyNames, // ✅ NEW
  createPartyName, // ✅ NEW
  bulkCreatePartyNames, // ✅ NEW
  updatePartyName, // ✅ NEW
  deletePartyName, // ✅ NEW
  buildDailyReport,
  getDailyReport,
  getEmployeePerformance,
  getMonthlyReport, // ✅ NEW
  getPipelineBoard, // ✅ NEW
  autoArchiveMatured, // back-compat alias (== archiveMaturedInvoices)
  archiveMaturedInvoices, // ✅ NEW — lightweight, safe to call per-request
  restoreIneligibleArchives, // ✅ NEW — heavy full-archive scan, SCHEDULED ONLY (call from server.js, not per-request)
  runArchiveCleanupNow, // ✅ NEW — on-demand trigger, no NODE_ENV dependency
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
  updatePickup, // ✅ NEW
  updateSchedule, 
  updateAWB 
};