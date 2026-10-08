const prisma = require('../utils/prisma');
const { exportShipmentsToExcel, exportShipmentsForClient } = require('../utils/excelExport');
const { sendStatusEmail, sendEnquiryReceivedEmail, sendFreightConfirmedEmail, sendInvoiceReadyEmail, sendMilestoneEmail } = require('../utils/emailService');

// ✅ NEW — lightweight in-memory cache for the Dashboard stats endpoint.
// This is your most frequently-hit endpoint, and its numbers don't need
// to be millisecond-fresh — if 20 employees have the Dashboard open at
// once, they've historically each triggered their own full recomputation
// of the same numbers. This makes the database do that work once every
// few seconds instead of once per person per request, which matters a
// lot as concurrent users grow.
//
// Simple TTL-based expiry (8 seconds) — not invalidated on every write,
// since wiring that into every single create/update endpoint across 3
// large controller files would be a much bigger, riskier change for
// modest extra benefit. In practice this means a stat can be up to 8
// seconds stale right after a change — an acceptable tradeoff for
// summary numbers on a dashboard, not something that needs to be exact
// to the second.
const STATS_CACHE_TTL_MS = 8000;
const statsCache = new Map(); // key -> { data, expiresAt }

// Lets the server tell every open browser "shipments changed" when IT changes them
// (automatic archiving, sweeps). Without this nobody found out until their next refresh.
let socketServer = null;
function setSocketServer(io) { socketServer = io; }
function broadcastShipmentChange(refNo) {
  try { if (socketServer) socketServer.emit('shipment:archiveUpdate', { refNo: refNo || 'Several shipments', auto: true }); } catch (e) { /* never block a save over a notification */ }
}
function clearStatsCache() { statsCache.clear(); }

function getStatsCacheKey(query) {
  return JSON.stringify(query);
}

function getCachedStats(query) {
  const key = getStatsCacheKey(query);
  const entry = statsCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  return null;
}

function setCachedStats(query, data) {
  const key = getStatsCacheKey(query);
  statsCache.set(key, { data, expiresAt: Date.now() + STATS_CACHE_TTL_MS });
  // keep the cache from growing unbounded across many different filter
  // combinations over a long-running process
  if (statsCache.size > 200) {
    const oldestKey = statsCache.keys().next().value;
    statsCache.delete(oldestKey);
  }
}


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
const FULL_STEP_ORDER = ['ENQUIRY', 'RATES_ADDED', 'NOMINATED', 'BOOKED', 'PICKUP_DONE', 'SCHEDULED', 'DRAFT', 'PRE_ALERTS', 'CHECKLIST_APPROVED', 'BOE_FILED', 'DO_COLLECTED', 'OOC_DONE', 'GATE_PASS', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const CHA_IMPORT_STEP_ORDER = ['ENQUIRY', 'CHECKLIST_APPROVED', 'BOE_FILED', 'DO_COLLECTED', 'OOC_DONE', 'GATE_PASS', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const CHA_EXPORT_STEP_ORDER = ['ENQUIRY', 'CHECKLIST_APPROVED', 'SB_FILED', 'LEO_DONE', 'HAND_OVER', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const TRANSPORT_STEP_ORDER = ['ENQUIRY', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const DO_RELEASE_STEP_ORDER = ['ENQUIRY', 'DO_COLLECTED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
const FF_ONLY_STEP_ORDER = ['ENQUIRY', 'PICKUP_DONE', 'AWB_GENERATED', 'DO_COLLECTED', 'INVOICE_GENERATED', 'INVOICE_SENT'];
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
    case 'PICKUP_DONE': return !!ff.pickupDate;
    case 'SCHEDULED': return !!(ff.etd || ff.eta);
    case 'AWB_GENERATED': return !!(ff.mawb || ff.hawb);
    case 'DRAFT': {
      // no date field of its own: done once the Stage is Draft or anything after it
      const i = STAGE_ORDER_FOR_STATUS.indexOf(shipmentStage);
      return i !== -1 && i >= STAGE_ORDER_FOR_STATUS.indexOf('Draft');
    }
    case 'PRE_ALERTS': return !!ff.preAlertsSentDate;
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
    select: { refNo: true, isArchived: true, shipmentType: true, importExport: true, shipmentStage: true, currentStatus: true, freightForwarding: true, cha: true, accounts: true }
  });
  if (!s) return;
  // ✅ NEW — a manually cancelled shipment stays cancelled no matter what
  // else gets edited on it. Without this guard, saving any other field
  // afterward would silently recompute the status back to whatever the
  // data implies, un-cancelling it behind the employee's back. Cancelling
  // is only ever reversed by explicitly picking a different status.
  if (s.currentStatus === 'CANCELLED') return;
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
  // ✅ NEW — after ANY field is saved (Freight, Customs or Invoice tab), check
  // whether the shipment is now fully complete and archive it on the spot.
  // Before, this only ran when an invoice field was saved, so a shipment whose
  // last missing field was on another tab sat in Active indefinitely.
  if (!s.isArchived && s.accounts && !s.accounts.completedAt && isArchiveEligible(s)) {
    await archiveIfComplete(shipmentId);
  }
}

// ─── MILESTONE EMAILS, BY SHIPMENT MODE ───
// Every mode sends "Enquiry Received" at creation and "Invoice Ready" when the
// shipment completes. In between:
//   Freight (all 3 tabs) : Pre-Alerts, then BOE number (Import) / Hand Over (Export)
//   FF Only              : Pre-Alerts
//   CHA Import           : BOE number
//   CHA Export           : Hand Over
//   Transport, DO Release: nothing in between
const MILESTONES = {
  PRE_ALERTS: {
    label: 'Pre-Alerts',
    applies: (s) => !['DO Release', 'Transport', 'CHA Only'].includes(s.shipmentType),
    isSet: (s) => !!(s.freightForwarding && s.freightForwarding.preAlertsSentDate)
  },
  BOE: {
    label: 'BOE number',
    applies: (s) => !['FF Only', 'DO Release', 'Transport'].includes(s.shipmentType) && s.importExport !== 'Export',
    isSet: (s) => !!(s.cha && s.cha.boeNo)
  },
  HAND_OVER: {
    label: 'Hand Over',
    applies: (s) => !['FF Only', 'DO Release', 'Transport'].includes(s.shipmentType) && s.importExport === 'Export',
    isSet: (s) => !!(s.cha && s.cha.handOverDate)
  }
};

// Sends one milestone email, at most once per shipment EVER. Does nothing unless
// the shipment has automatic emails switched on, has a Notification Email, the
// milestone applies to its mode, and the field has actually been filled in. The
// history entry is the permanent "already sent" record (and shows on the timeline).
async function sendMilestoneEmailOnce(shipmentId, milestone) {
  try {
    const rule = MILESTONES[milestone];
    if (!rule) return;
    const s = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { freightForwarding: true, cha: true, accounts: true } });
    if (!s || s.isDeleted || s.currentStatus === 'CANCELLED') return;
    const ff = s.freightForwarding;
    if (!ff || !ff.autoEmailEnabled || !ff.notificationEmail) return;
    if (!rule.applies(s) || !rule.isSet(s)) return;
    const key = `EMAIL_${milestone}`;
    const already = await prisma.statusHistory.findFirst({ where: { shipmentId, status: key }, select: { id: true } });
    if (already) return;
    await prisma.statusHistory.create({ data: { shipmentId, status: key, remarks: `${rule.label} email sent to ${ff.notificationEmail}` } });
    sendMilestoneEmail(s, milestone).catch(() => {});
  } catch (err) {
    console.error('sendMilestoneEmailOnce failed:', err.message);
  }
}

// Sends the "Invoice Ready" email at most once per shipment, EVER. Restoring a
// finished shipment from Archive clears its completion stamp (so it stays open
// while someone edits it), which meant it could send this email a second time
// when it completed again. This permanent history entry is the record that stops that.
async function sendInvoiceReadyOnce(full) {
  try {
    if (!full || !full.freightForwarding || !full.freightForwarding.autoEmailEnabled || !full.freightForwarding.notificationEmail) return;
    const already = await prisma.statusHistory.findFirst({ where: { shipmentId: full.id, status: 'EMAIL_INVOICE_READY' }, select: { id: true } });
    if (already) return;
    await prisma.statusHistory.create({ data: { shipmentId: full.id, status: 'EMAIL_INVOICE_READY', remarks: `Invoice Ready email sent to ${full.freightForwarding.notificationEmail}` } });
    sendInvoiceReadyEmail(full).catch(() => {});
  } catch (err) {
    console.error('sendInvoiceReadyOnce failed:', err.message);
  }
}

// Archives a shipment the moment every required field is filled in. Returns
// true if it archived. Stamps completedAt so it only ever happens once, and
// sends the "Invoice Ready" email (if enabled for the shipment) at that moment.
async function archiveIfComplete(shipmentId, actor) {
  try {
    const sh = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { refNo: true, shipmentType: true, importExport: true, isArchived: true, isDeleted: true, currentStatus: true, freightForwarding: true, cha: true, accounts: true }
    });
    if (!sh || sh.isArchived || sh.isDeleted || sh.currentStatus === 'CANCELLED') return false;
    if (!sh.accounts || sh.accounts.completedAt) return false;
    if (!isArchiveEligible(sh)) return false;
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        isArchived: true,
        accounts: { update: { completedAt: new Date() } },
        statusHistory: { create: { status: 'INVOICE_COMPLETE', remarks: 'All required fields complete — moved to Archive', ...(actor ? { changedBy: actor } : {}) } }
      }
    });
    statsCache.clear();
    broadcastShipmentChange(sh.refNo);
    if (sh.freightForwarding?.autoEmailEnabled && sh.freightForwarding.notificationEmail) {
      const full = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { freightForwarding: true, cha: true, accounts: true } });
      await sendInvoiceReadyOnce(full);
    }
    return true;
  } catch (err) {
    console.error('archiveIfComplete failed:', err.message);
    return false;
  }
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
    // (The old "Shipment Is Moving" email that used to go here is retired — the
    // second customer email now goes after Pre-Alerts is saved. See sendMilestoneEmailOnce.)
  }
}

// ─── ARCHIVE ELIGIBILITY CHECK (NEW) ───
// Duplicated from accounts.controller.js (kept in sync manually — small
// pure function, not worth a shared-module require cycle between the two
// controllers). See that file's copy for the full field-by-type
// rationale. A shipment is only allowed to be archived — or to STAY
// archived — while all of these are true.
// ✅ UPDATED — matches the same accurate, full field-list criteria as
// freightCompleteFilter/customsCompleteFilter/invoiceCompleteFilter
// above, just written as plain boolean checks against one shipment's
// actual values instead of a Prisma where-clause.
function isArchiveEligible(shipment, debug) {
  const ff = shipment.freightForwarding || {};
  const cha = shipment.cha || {};
  const accounts = shipment.accounts || {};
  const missing = [];

  if (!accounts.invoiceNumber) missing.push('Invoice Number');
  if (!accounts.invoiceDate) missing.push('Invoice Date');
  if (!accounts.sendingDate) missing.push('Invoice Sending Date');
  if (missing.length) { if (debug) console.log(`🔍 ARCHIVE CHECK [${shipment.refNo}] — missing:`, missing); return false; }

  const simpleTypes = ['Transport', 'DO Release', 'FF Only'];
  if (simpleTypes.includes(shipment.shipmentType)) return true;

  const isExport = shipment.importExport === 'Export';
  if (!cha.jobNo) missing.push('Job No');
  if (!cha.checklistDate) missing.push('Checklist Date');
  if (!cha.checklistApprovalDate) missing.push('Checklist Approval Date');
  if (isExport) {
    if (!cha.sbNo) missing.push('SB No');
    if (!cha.sbDate) missing.push('SB Date');
    if (!cha.leoDate) missing.push('LEO Date');
    if (!cha.handOverDate) missing.push('Hand Over Date');
  } else {
    if (!cha.boeNo) missing.push('BOE No');
    if (!cha.boeDate) missing.push('BOE Date');
    if (!cha.oocDate) missing.push('OOC Date');
    if (!cha.gatePassDate) missing.push('Gate Pass Date');
    if (!cha.deliveryDate) missing.push('Delivery Date');
  }
  if (!cha.trackingNumber) missing.push('Tracking Number');
  if (missing.length) { if (debug) console.log(`🔍 ARCHIVE CHECK [${shipment.refNo}] — missing:`, missing); return false; }

  if (shipment.shipmentType === 'CHA Only') return true;

  if (!ff.consigneeName) missing.push('Consignee Name');
  if (!ff.shipperName) missing.push('Shipper Name');
  if (!ff.grossWeight) missing.push('Gross Weight');
  if (!ff.weight) missing.push('Chargeable Weight');
  if (!ff.nominationDate) missing.push('Nomination Date');
  if (!ff.bookingDate) missing.push('Booking Date');
  if (!ff.pickupDate) missing.push('Pickup Date');
  if (!ff.etd) missing.push('ETD');
  if (!ff.eta) missing.push('ETA');
  if (!ff.mawb) missing.push('MAWB');
  if (!ff.hawb) missing.push('HAWB');
  if (!ff.awbDate) missing.push('AWB Date');
  if (!ff.preAlertsSentDate) missing.push('Pre-Alerts Sent Date');
  if (!cha.doCollectionDate) missing.push('DO Collection Date');
  if (missing.length) { if (debug) console.log(`🔍 ARCHIVE CHECK [${shipment.refNo}] — missing:`, missing); return false; }

  return true;
}

// ─── IMMEDIATE AUTO-ARCHIVE — SAFETY-NET SWEEP (FIXED) ───
// Runs on every shipment list/stats request. Catches any shipment whose
// invoice is complete but hasn't been archived yet (normally this
// already happens instantly via markInvoiceCompleteIfReady the moment
// completion happens — this is just a safety net for anything that
// slips through, e.g. older shipments from before that change).
// ✅ REWRITTEN — grandfathers shipments that were already verified complete.
// completedAt is stamped only at the moment a shipment passed the
// completeness check in force AT THAT TIME. Re-judging those shipments
// against the newer, stricter field list (Pickup Date, Pre-Alerts,
// Checklist Approval Date, Tracking No...) is what pushed ~1,300 finished
// shipments back into Active and bloated every dashboard query. The
// stricter list now applies only to NEW completions (see
// markInvoiceCompleteIfReady). This is also one bulk query instead of
// loading every shipment with all its relations and updating one by one.
const INVOICE_PRESENT = { not: null, notIn: [''] };
async function archiveMaturedInvoices() {
  let archivedCount = 0;
  try {
    const ready = await prisma.shipment.findMany({
      where: {
        isArchived: false, isDeleted: false,
        accounts: { completedAt: { not: null }, invoiceNumber: INVOICE_PRESENT, invoiceDate: { not: null } }
      },
      select: { id: true }
    });
    if (ready.length > 0) {
      const ids = ready.map((r) => r.id);
      await prisma.shipment.updateMany({ where: { id: { in: ids } }, data: { isArchived: true } });
      await prisma.statusHistory.createMany({
        data: ids.map((shipmentId) => ({ shipmentId, status: 'COMPLETED', remarks: 'Auto-archived — invoice complete' }))
      });
      archivedCount = ids.length;
      console.log(`📦 Archive sweep: moved ${archivedCount} completed shipment(s) to Archive`);
      statsCache.clear();
      broadcastShipmentChange();
    }
  } catch (error) {
    console.error('Error in archiveMaturedInvoices sweep:', error);
  }
  return archivedCount;
}

// Startup-only backfill: shipments that are ALREADY fully complete but were
// never stamped (their last missing field was saved before the save-time check
// existed). Deliberately NOT run per request — that would also undo anyone
// who restores a finished shipment on purpose.
async function archiveNewlyCompleted() {
  let n = 0;
  try {
    const candidates = await prisma.shipment.findMany({
      where: {
        isArchived: false, isDeleted: false, currentStatus: { not: 'CANCELLED' },
        accounts: { completedAt: null, invoiceNumber: INVOICE_PRESENT, invoiceDate: { not: null }, sendingDate: { not: null } }
      },
      select: { id: true }
    });
    for (const c of candidates) { if (await archiveIfComplete(c.id)) n++; }
    if (n > 0) console.log(`📦 Backfill: archived ${n} already-complete shipment(s)`);
  } catch (error) {
    console.error('Error in archiveNewlyCompleted:', error);
  }
  return n;
}

// ─── ONE-TIME CLEANUP OF OLD FINISHED WORK (startup only, off by default) ───
// The stricter "complete" rules pushed ~1,400 old, already-invoiced shipments
// back into Active. They have no completion stamp, so the normal sweep leaves
// them alone — and they can never meet the new field list. This reports how
// many there are (always) and archives them ONLY when you ask, via Render env:
//   ARCHIVE_LEGACY_BEFORE=YYYY-MM-DD      archive those invoiced before that date
//   ARCHIVE_LEGACY_AUTO_RESTORED=true     archive only the ones the system itself
//                                         moved out of Archive
//   ARCHIVE_LEGACY_DRY_RUN=true           just log the count, change nothing
// Remove the variables afterwards.
async function archiveLegacyInvoiced() {
  try {
    const rows = await prisma.shipment.findMany({
      where: {
        isArchived: false, isDeleted: false, currentStatus: { not: 'CANCELLED' },
        accounts: { completedAt: null, invoiceNumber: INVOICE_PRESENT, invoiceDate: { not: null } }
      },
      select: { id: true, accounts: { select: { invoiceDate: true } } }
    });
    const byMonth = {};
    rows.forEach((r) => {
      const d = r.accounts && r.accounts.invoiceDate;
      const k = d ? new Date(d).toISOString().slice(0, 7) : 'unknown';
      byMonth[k] = (byMonth[k] || 0) + 1;
    });
    console.log(`ℹ️ [LEGACY] ${rows.length} active shipment(s) have an invoice but no completion stamp. By invoice month: ${JSON.stringify(byMonth)}`);

    const autoRestored = new Set();
    try {
      const hist = await prisma.statusHistory.findMany({
        where: { status: 'RESTORED', changedBy: null, shipmentId: { in: rows.map((r) => r.id) } },
        select: { shipmentId: true }
      });
      hist.forEach((h) => autoRestored.add(h.shipmentId));
      console.log(`ℹ️ [LEGACY] Of those, ${autoRestored.size} were moved out of Archive automatically by the system`);
    } catch (e) {
      console.log('ℹ️ [LEGACY] could not check the auto-restore history:', e.message);
    }

    const before = process.env.ARCHIVE_LEGACY_BEFORE;
    const wantRestored = process.env.ARCHIVE_LEGACY_AUTO_RESTORED === 'true';
    if (!before && !wantRestored) return 0; // nothing requested

    let chosen;
    if (wantRestored) {
      chosen = rows.filter((r) => autoRestored.has(r.id));
    } else {
      const cutoff = new Date(`${before}T00:00:00+05:30`);
      if (isNaN(cutoff.getTime())) { console.error('[LEGACY] ARCHIVE_LEGACY_BEFORE must look like 2026-09-15'); return 0; }
      chosen = rows.filter((r) => r.accounts && r.accounts.invoiceDate && new Date(r.accounts.invoiceDate) < cutoff);
    }
    const dry = process.env.ARCHIVE_LEGACY_DRY_RUN === 'true';
    console.log(`📦 [LEGACY] ${chosen.length} shipment(s) selected${dry ? ' — DRY RUN, nothing changed' : ''}`);
    if (dry || chosen.length === 0) return 0;

    const ids = chosen.map((r) => r.id);
    await prisma.shipment.updateMany({ where: { id: { in: ids } }, data: { isArchived: true } });
    await prisma.statusHistory.createMany({
      data: ids.map((shipmentId) => ({ shipmentId, status: 'COMPLETED', remarks: 'Archived — finished before the stricter completeness rules' }))
    });
    statsCache.clear();
    console.log(`📦 [LEGACY] moved ${ids.length} shipment(s) to Archive`);
    broadcastShipmentChange();
    return ids.length;
  } catch (error) {
    console.error('archiveLegacyInvoiced failed:', error.message);
    return 0;
  }
}

// The Freight workflow no longer has an "AWB" step (it is Draft -> Pre-Alerts now).
// Freight shipments still saved as AWB Generated get their status re-derived once,
// at startup, so they land on the right step. FF Only etc. keep AWB and are skipped.
async function migrateFreightWorkflowStatuses() {
  try {
    const rows = await prisma.shipment.findMany({
      where: {
        isDeleted: false, currentStatus: 'AWB_GENERATED',
        OR: [{ shipmentType: null }, { shipmentType: { notIn: ['FF Only', 'DO Release', 'Transport', 'CHA Only'] } }]
      },
      select: { id: true }
    });
    for (const r of rows) { await recomputeCurrentStatus(r.id); }
    if (rows.length > 0) {
      console.log(`🔁 Workflow update: re-derived the status of ${rows.length} Freight shipment(s)`);
      statsCache.clear();
      broadcastShipmentChange();
    }
    return rows.length;
  } catch (error) {
    console.error('migrateFreightWorkflowStatuses failed:', error.message);
    return 0;
  }
}

// Per-request callers (list + stats) use this instead: at most once a
// minute, and never blocks the response. Running the sweep on EVERY
// request was a large part of the slowness.
let lastArchiveSweepAt = 0;
const ARCHIVE_SWEEP_MIN_INTERVAL_MS = 60 * 1000;
function archiveMaturedInvoicesThrottled() {
  const now = Date.now();
  if (now - lastArchiveSweepAt < ARCHIVE_SWEEP_MIN_INTERVAL_MS) return;
  lastArchiveSweepAt = now;
  archiveMaturedInvoices().catch(() => {});
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
  // ✅ REWRITTEN — only moves a shipment back to Active if its invoice
  // number or invoice date is actually missing. It used to re-judge every
  // archived shipment against the full strict field list, which silently
  // un-archived ~1,300 shipments that had been correctly completed under
  // the rules that applied when they were archived.
  let restoredCount = 0;
  try {
    const rows = await prisma.shipment.findMany({
      where: {
        isArchived: true, isDeleted: false,
        OR: [{ accounts: null }, { accounts: { invoiceNumber: null } }, { accounts: { invoiceNumber: '' } }, { accounts: { invoiceDate: null } }]
      },
      select: { id: true }
    });
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      await prisma.shipment.updateMany({ where: { id: { in: ids } }, data: { isArchived: false } });
      await prisma.statusHistory.createMany({
        data: ids.map((shipmentId) => ({ shipmentId, status: 'RESTORED', remarks: 'Moved back to Active — invoice details missing (auto-corrected)' }))
      });
      restoredCount = ids.length;
      statsCache.clear();
      broadcastShipmentChange();
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
  archiveMaturedInvoicesThrottled(); // non-blocking, at most once a minute
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
    archiveMaturedInvoicesThrottled(); // non-blocking, at most once a minute
    const { status, search, isArchived, shipmentType, mine, userId, pendingOnly, today, date, thisMonthOnly, inProgressOnly, deliveredOnly, invoicedOnly, invoicedThisMonthOnly, invoicedTodayOnly, pipelineStage, cancelledOnly, createdFrom, createdTo, employeeId, referenceGroup, page = 1, limit = 25 } = req.query;
    
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
      Object.assign(where, getCancelledWhere(isArchived === 'true'));
    }
    // ✅ NEW — "This Month Invoice" card click. The card's NUMBER counts
    // shipments whose invoice status-change happened this month (matches
    // getShipmentStats' monthlyInvoiced calc exactly) — this is different
    // from invoicedOnly above, which matches CURRENT status lifetime-wide
    // regardless of when. Using invoicedOnly here would show a different,
    // usually much larger, set than the number on the card.
    if (invoicedThisMonthOnly === 'true' && !status) {
      delete where.isArchived; // ✅ FIXED — an invoiced shipment archives immediately now, so this must show both active and archived, not just one
      const { start, end } = getISTMonthBounds();
      const monthlyInvoiceHistory = await prisma.statusHistory.findMany({
        where: { status: { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] }, createdAt: { gte: start, lt: end } },
        select: { shipmentId: true }
      });
      const invoicedIds = [...new Set(monthlyInvoiceHistory.map((h) => h.shipmentId))];
      where.id = { in: invoicedIds.length > 0 ? invoicedIds : ['__none__'] };
    }
    // ✅ NEW — "Today's Invoice" stat card click. Same pattern as
    // invoicedThisMonthOnly above, just scoped to today (IST).
    if (invoicedTodayOnly === 'true' && !status) {
      delete where.isArchived; // ✅ FIXED — same reasoning as invoicedThisMonthOnly above
      const { start, end } = getISTDayBounds();
      const todayInvoiceHistory = await prisma.statusHistory.findMany({
        where: { status: { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] }, createdAt: { gte: start, lt: end } },
        select: { shipmentId: true }
      });
      const invoicedTodayIds = [...new Set(todayInvoiceHistory.map((h) => h.shipmentId))];
      where.id = { in: invoicedTodayIds.length > 0 ? invoicedTodayIds : ['__none__'] };
    }
    // ✅ NEW — "Pending Customs" / "Pending Invoice" style stat card
    // clicks on the main Dashboard. Reuses the EXACT same stage
    // definition as the Pipeline board, so a card's count and what you
    // see after clicking it always match precisely.
    if (pipelineStage && !status) {
      const stageWhere = getPipelineStageWhere(pipelineStage, isArchived === 'true');
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

// ─── TOTAL SHIPMENTS BREAKDOWN ───
// Answers "where exactly do all shipments actually sit" with a
// mathematical guarantee: every bucket below is mutually exclusive (a
// shipment can only land in exactly one), and they are built to sum to
// the grand total exactly — the endpoint checks this itself and reports
// it, rather than asking you to trust that the numbers add up.
const getShipmentBreakdown = async (req, res) => {
  try {
    const total = await prisma.shipment.count({ where: { isDeleted: false } });
    const archived = await prisma.shipment.count({ where: { isDeleted: false, isArchived: true } });
    const active = await prisma.shipment.count({ where: { isDeleted: false, isArchived: false } });

    // Within Active, every shipment should land in exactly one of these
    // 5 buckets. "simpleTypesInProgress" is FF Only/Transport/DO
    // Release — types with no separate Freight/Customs stage of their
    // own, which used to be invisible to every bucket here except
    // Cancelled, making the total look like it didn't add up.
    const inProgress = await prisma.shipment.count({ where: getPipelineStageWhere('freight', false) });
    const pendingCustoms = await prisma.shipment.count({ where: getPipelineStageWhere('customs', false) });
    const pendingInvoice = await prisma.shipment.count({ where: getPipelineStageWhere('invoice', false) });
    const simpleTypesInProgress = await prisma.shipment.count({ where: getPipelineStageWhere('simple', false) });
    const cancelled = await prisma.shipment.count({ where: getCancelledWhere(false) });

    // ✅ The honest reconciliation check — if these 5 buckets don't sum
    // to the full Active count, this surfaces exactly how many
    // shipments are unaccounted for, instead of silently hiding a gap.
    const accountedFor = inProgress + pendingCustoms + pendingInvoice + simpleTypesInProgress + cancelled;
    const otherActive = Math.max(0, active - accountedFor);

    res.json({
      status: 'success',
      data: {
        total,
        archived,
        active,
        breakdown: {
          inProgress,
          pendingCustoms,
          pendingInvoice,
          simpleTypesInProgress,
          cancelled,
          otherActive
        },
        reconciliation: {
          activeBucketsSum: accountedFor + otherActive,
          matchesActiveTotal: (accountedFor + otherActive) === active
        }
      }
    });
  } catch (error) {
    console.error('Error computing shipment breakdown:', error);
    res.status(500).json({ status: 'error', message: 'Failed to compute breakdown' });
  }
};

const getShipmentStats = async (req, res) => {
  try {
    // ✅ NEW — serve from cache if another request with the exact same
    // filters answered this within the last few seconds.
    const cached = getCachedStats(req.query);
    if (cached) {
      return res.json({ status: 'success', data: cached });
    }

    archiveMaturedInvoicesThrottled(); // non-blocking, at most once a minute
    const { status, search, isArchived, shipmentType, mine, userId, referenceGroup, createdFrom, createdTo, employeeId } = req.query;

    const where = {
      isArchived: isArchived === 'true',
      isDeleted: false
    };
    // ✅ FIX — these extra conditions used to only ever apply to `where`
    // (used for Total/Delivered/Invoiced/etc), while Pending Customs,
    // Pending Invoice, and Cancelled were computed with NO scoping at
    // all — always company-wide, ignoring whatever search/employee/date/
    // type filter was actually active. That's why filtering the list
    // never changed those three numbers. Collecting the same conditions
    // here, separately from isArchived/isDeleted (which each pipeline
    // stage defines its own rule for), lets every stat card — including
    // those three — respect the exact same active filters as the list.
    const scopeConditions = [];
    if (referenceGroup && REFERENCE_GROUPS[referenceGroup]) {
      scopeConditions.push({ OR: REFERENCE_GROUPS[referenceGroup].map((code) => ({ refNo: { startsWith: code } })) });
    }
    if (status) scopeConditions.push({ currentStatus: status });
    if (shipmentType) {
      if (shipmentType === 'CHA_ONLY') scopeConditions.push({ shipmentType: 'CHA Only' });
      else if (shipmentType === 'TRANSPORT') scopeConditions.push({ shipmentType: 'Transport' });
      else if (shipmentType === 'DO_RELEASE') scopeConditions.push({ shipmentType: 'DO Release' });
      else if (shipmentType === 'FF_ONLY') scopeConditions.push({ shipmentType: 'FF Only' });
      else if (shipmentType === 'FULL_SHIPMENT') scopeConditions.push({ NOT: { shipmentType: { in: ['CHA Only', 'Transport', 'DO Release', 'FF Only'] } } });
    }
    if (createdFrom || createdTo) {
      const createdAtCond = {};
      if (createdFrom) createdAtCond.gte = new Date(`${createdFrom}T00:00:00+05:30`);
      if (createdTo) createdAtCond.lte = new Date(`${createdTo}T23:59:59.999+05:30`);
      scopeConditions.push({ createdAt: createdAtCond });
    }
    if (employeeId) {
      scopeConditions.push({ OR: [{ createdById: employeeId }, { coHandlerId: employeeId }] });
    }
    if (search) {
      scopeConditions.push({
        OR: [
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
        ]
      });
    }
    if (mine === 'true' && req.user?.id) {
      scopeConditions.push({ OR: [{ createdById: req.user.id }, { coHandlerId: req.user.id }] });
    } else if (userId) {
      scopeConditions.push({ createdById: userId });
    }
    // Apply the same conditions onto `where` too, exactly as before —
    // this preserves the existing Total/Delivered/Invoiced/etc behavior
    // unchanged.
    if (scopeConditions.length > 0) where.AND = [...(where.AND || []), ...scopeConditions];

    // Helper — merges the active filters above into any base where
    // clause (like a pipeline stage's own definition) without disturbing
    // that base clause's own isArchived/isDeleted/OR logic.
    function withScope(baseWhere) {
      if (scopeConditions.length === 0) return baseWhere;
      return { ...baseWhere, AND: [...(baseWhere.AND || []), ...scopeConditions] };
    }

    // ✅ THIS MONTH STATS (NEW) — replaces the old lifetime "Invoiced"
    // card's meaning on the frontend with a calendar-month-scoped number,
    // plus a new "shipments created this month" count. Both respect the
    // same scope (mine/team/search/status/etc) as everything else here.
    const { start: monthStart, end: monthEnd } = getISTMonthBounds();

    const [total, delivered, invoiced, weightAgg, monthlyShipments, pipelineFreight, pipelineCustoms, pipelineInvoice, pipelineSimple, cancelled] = await Promise.all([
      prisma.shipment.count({ where }),
      prisma.shipment.count({ where: { ...where, currentStatus: { in: ['DELIVERED', 'HAND_OVER'] } } }),
      prisma.shipment.count({ where: { ...where, currentStatus: { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] } } }),
      prisma.freightForwarding.aggregate({
        where: { shipment: where },
        _sum: { noOfPackages: true, grossWeight: true }
      }),
      prisma.shipment.count({ where: { ...where, createdAt: { gte: monthStart, lt: monthEnd } } }),
      // ✅ FIXED — "Pending Customs" / "Pending Invoice" now respect both
      // the active filters (search, employee, date range, type, mine)
      // AND which tab you're actually viewing (Active vs Archive) —
      // previously these always showed the active-only count regardless
      // of tab, which meant Archive showed the exact same number as
      // Active, looking broken. Now Archive correctly shows 0 (nothing
      // archived is ever still "pending" anything). The Pipeline board
      // TAB itself is untouched — it's a separate, deliberately
      // whole-company-active view.
      prisma.shipment.count({ where: withScope(getPipelineStageWhere('freight', isArchived === 'true')) }),
      prisma.shipment.count({ where: withScope(getPipelineStageWhere('customs', isArchived === 'true')) }),
      prisma.shipment.count({ where: withScope(getPipelineStageWhere('invoice', isArchived === 'true')) }),
      // ✅ NEW — FF Only / Transport / DO Release, counted on their own
      // instead of being invisible to every card (see 'simple' stage
      // definition above for the full reasoning).
      prisma.shipment.count({ where: withScope(getPipelineStageWhere('simple', isArchived === 'true')) }),
      // ✅ FIXED — "Cancelled" now also respects which tab you're
      // viewing, same reasoning as the pipeline counts above.
      prisma.shipment.count({ where: withScope(getCancelledWhere(isArchived === 'true')) })
    ]);

    // Monthly invoiced = shipments matching the current filter whose
    // INVOICE_GENERATED/INVOICE_SENT status change happened THIS month —
    // detected via status history timestamp, not currentStatus, so it
    // reflects when the invoice action actually happened.
    // ✅ PERFORMANCE FIX — this used to first fetch EVERY matching
    // shipment's id (hundreds, and growing) with a separate findMany,
    // then query StatusHistory with a giant `shipmentId IN (...)` list
    // built from those ids — two round trips, one of them pulling far
    // more data than needed, on an endpoint that fires on nearly every
    // page load. Filtering StatusHistory directly through its shipment
    // relation does the same job as a single, properly indexed query —
    // no bulk id fetch, no giant IN list, and it scales flat as the
    // shipment count grows instead of getting slower.
    // ✅ FIXED — these used to filter through the full `where` object,
    // which includes isArchived. Since invoicing a shipment now archives
    // it immediately, that meant a shipment invoiced TODAY would already
    // be archived by the time this ran — making it invisible while
    // viewing the Active tab, so this card could show close to 0 even on
    // a busy invoicing day. "Was it invoiced in this time period" is a
    // historical fact that shouldn't depend on where the shipment
    // happens to sit right now — withScope(...) keeps your other active
    // filters (search, employee, date range, type) but drops the
    // isArchived restriction specifically for this count.
    const monthlyInvoiceHistory = await prisma.statusHistory.findMany({
      where: {
        status: { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] },
        createdAt: { gte: monthStart, lt: monthEnd },
        shipment: withScope({ isDeleted: false })
      },
      select: { shipmentId: true }
    });
    const monthlyInvoiced = new Set(monthlyInvoiceHistory.map((h) => h.shipmentId)).size;

    // ✅ FIXED — same reasoning as monthlyInvoiced above.
    const { start: todayStart, end: todayEnd } = getISTDayBounds();
    const todayInvoiceHistory = await prisma.statusHistory.findMany({
      where: {
        status: { in: ['INVOICE_GENERATED', 'INVOICE_SENT'] },
        createdAt: { gte: todayStart, lt: todayEnd },
        shipment: withScope({ isDeleted: false })
      },
      select: { shipmentId: true }
    });
    const todayInvoiced = new Set(todayInvoiceHistory.map((h) => h.shipmentId)).size;

    const statsPayload = {
      total,
      delivered,
      invoiced,
      deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
      totalPkgs: weightAgg._sum.noOfPackages || 0,
      totalWt: weightAgg._sum.grossWeight || 0,
      monthlyShipments,
      monthlyInvoiced,
      todayInvoiced,
      pipelineFreight,
      pipelineCustoms,
      pipelineInvoice,
      pipelineSimple,
      cancelled
    };
    setCachedStats(req.query, statsPayload); // ✅ NEW
    res.json({ status: 'success', data: statsPayload });
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
      select: { id: true, name: true, email: true, role: true, team: true, phone: true }
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
// ✅ UPDATED — now also recognizes an EXPLICIT manual cancellation
// (currentStatus === 'CANCELLED', set by an employee picking "Cancelled"
// from the Status or Stage dropdown), in addition to the existing
// automatic "stuck at Enquiry for 7+ days" detection. Either path lands
// a shipment here.
// ✅ FIXED — now takes the actual tab you're viewing (isArchivedFlag)
// instead of always hardcoding "active only" regardless of which tab is
// open. That's what caused "Cancelled" to show the exact same number on
// both the Active and Archive tabs — now it correctly reflects each
// tab's own shipments. Callers that genuinely want "active only no
// matter what" (none currently do for Cancelled) can still pass false.
function getCancelledWhere(isArchivedFlag = false) {
  return {
    isDeleted: false,
    isArchived: isArchivedFlag,
    OR: [
      { currentStatus: 'CANCELLED' },
      { currentStatus: 'ENQUIRY', createdAt: { lte: getCancelledThresholdDate() } }
    ]
  };
}

// The inverse — "definitely NOT cancelled" — meant to be spread into
// other cards/stages (In Progress, the Pipeline's Freight stage) so a
// cancelled or stale-enquiry shipment is excluded from them instead of
// being counted twice.
function getNotCancelledFilter() {
  return {
    AND: [
      { currentStatus: { not: 'CANCELLED' } },
      { OR: [
        { currentStatus: { not: 'ENQUIRY' } },
        { createdAt: { gt: getCancelledThresholdDate() } }
      ] }
    ]
  };
}

// ✅ UPDATED — "Freight done" now requires the FULL set of pre-customs
// fields, not just Consignee+Shipper+a weight. A standard Freight
// shipment only counts as ready for Customs once every one of these is
// filled: Consignee, Shipper, Notification Email, Gross Weight,
// Chargeable Weight, Nomination Date, Booking Date, Pickup Date, ETD,
// ETA, MAWB, HAWB, AWB Date, Pre-Alerts Sent, and DO Collection Date
// (which lives on the CHA relation, not FreightForwarding).
function freightIncompleteFilter() {
  return {
    OR: [
      { freightForwarding: null },
      { freightForwarding: { consigneeName: null } },
      { freightForwarding: { shipperName: null } },
      { freightForwarding: { grossWeight: null } },
      { freightForwarding: { weight: null } },
      { freightForwarding: { nominationDate: null } },
      { freightForwarding: { bookingDate: null } },
      { freightForwarding: { pickupDate: null } },
      { freightForwarding: { etd: null } },
      { freightForwarding: { eta: null } },
      { freightForwarding: { mawb: null } },
      { freightForwarding: { hawb: null } },
      { freightForwarding: { awbDate: null } },
      { freightForwarding: { preAlertsSentDate: null } },
      { cha: null },
      { cha: { doCollectionDate: null } }
    ]
  };
}
function freightCompleteFilter() {
  return {
    freightForwarding: {
      consigneeName: { not: null }, shipperName: { not: null },
      grossWeight: { not: null }, weight: { not: null },
      nominationDate: { not: null }, bookingDate: { not: null }, pickupDate: { not: null },
      etd: { not: null }, eta: { not: null },
      mawb: { not: null }, hawb: { not: null }, awbDate: { not: null },
      preAlertsSentDate: { not: null }
    },
    cha: { doCollectionDate: { not: null } }
  };
}
// ✅ UPDATED — "Customs done" now requires the FULL set of customs
// fields, not just a BOE/SB number. Import shipments need the
// Checklist/BOE/OOC/Gate Pass/Delivery chain; Export shipments need
// Checklist/SB/LEO/Hand Over instead — each type's actual real-world
// fields, not a one-size-fits-all check.
function customsIncompleteFilter() {
  return {
    OR: [
      { cha: null },
      {
        OR: [{ importExport: null }, { importExport: { not: 'Export' } }], // blank I/E counts as Import, same as everywhere else
        cha: { OR: [
          { jobNo: null }, { checklistDate: null }, { checklistApprovalDate: null },
          { boeNo: null }, { boeDate: null }, { oocDate: null }, { gatePassDate: null },
          { deliveryDate: null }, { trackingNumber: null }
        ] }
      },
      {
        importExport: 'Export',
        cha: { OR: [
          { jobNo: null }, { checklistDate: null }, { checklistApprovalDate: null },
          { sbNo: null }, { sbDate: null }, { leoDate: null }, { handOverDate: null },
          { trackingNumber: null }
        ] }
      }
    ]
  };
}
function customsCompleteFilter() {
  return {
    OR: [
      {
        OR: [{ importExport: null }, { importExport: { not: 'Export' } }], // blank I/E counts as Import, same as everywhere else
        cha: {
          jobNo: { not: null }, checklistDate: { not: null }, checklistApprovalDate: { not: null },
          boeNo: { not: null }, boeDate: { not: null }, oocDate: { not: null }, gatePassDate: { not: null },
          deliveryDate: { not: null }, trackingNumber: { not: null }
        }
      },
      {
        importExport: 'Export',
        cha: {
          jobNo: { not: null }, checklistDate: { not: null }, checklistApprovalDate: { not: null },
          sbNo: { not: null }, sbDate: { not: null }, leoDate: { not: null }, handOverDate: { not: null },
          trackingNumber: { not: null }
        }
      }
    ]
  };
}
// ✅ UPDATED — "Invoice done" now also requires Sending Date, not just
// Invoice No + Date, matching the full Invoice section (No, Date,
// Sending) that should all be filled before archiving.
function invoiceIncompleteFilter() {
  return { OR: [{ accounts: null }, { accounts: { invoiceNumber: null } }, { accounts: { invoiceDate: null } }, { accounts: { sendingDate: null } }] };
}
function invoiceCompleteFilter() {
  return { accounts: { invoiceNumber: { not: null }, invoiceDate: { not: null }, sendingDate: { not: null } } };
}

const PIPELINE_CARD_SELECT = {
  id: true, refNo: true, currentStatus: true, shipmentType: true, createdByName: true, createdAt: true,
  freightForwarding: { select: { consigneeName: true, customerName: true } },
  cha: { select: { boeNo: true, sbNo: true } },
  accounts: { select: { invoiceNumber: true } }
};

// ✅ FIXED — now takes the actual tab you're viewing (isArchivedFlag)
// for the freight/customs/invoice stages, instead of always hardcoding
// "active only". That's what caused "Pending Customs" and "Pending
// Invoice" to show the exact same number on both the Active and Archive
// tabs — now they correctly reflect each tab's own shipments (and, in
// practice, will normally show 0 on the Archive tab, since an archived
// shipment's invoice is by definition already complete — nothing left
// pending). The Pipeline board (Kanban tab) still always wants active
// only regardless of any Dashboard toggle, so it explicitly passes
// false — only the Dashboard stats/list pass the real toggle.
function getPipelineStageWhere(stage, isArchivedFlag = false) {
  const baseActive = { isDeleted: false, isArchived: isArchivedFlag };
  if (stage === 'freight') {
    return {
      ...baseActive,
      ...freightIncompleteFilter(),
      AND: [getNotCancelledFilter(), { OR: [{ shipmentType: null }, { shipmentType: { notIn: [...SIMPLE_PIPELINE_TYPES, 'CHA Only'] } }] }] // ✅ NEW — a stale enquiry belongs in Cancelled, not here
    };
  }
  if (stage === 'customs') {
    return {
      ...baseActive,
      OR: [
        { AND: [{ OR: [{ shipmentType: null }, { shipmentType: { notIn: [...SIMPLE_PIPELINE_TYPES, 'CHA Only'] } }] }, freightCompleteFilter(), customsIncompleteFilter()] },
        { AND: [{ shipmentType: 'CHA Only' }, customsIncompleteFilter()] }
      ]
    };
  }
  if (stage === 'invoice') {
    // ✅ FIXED — narrowed to standard Freight + CHA Only only. FF Only,
    // Transport, and DO Release used to ALSO silently count here (any of
    // them with an incomplete invoice, regardless of their own actual
    // progress), which would have double-counted them once the dedicated
    // 'simple' stage below exists for them specifically.
    return {
      ...baseActive,
      AND: [{ OR: [{ shipmentType: null }, { shipmentType: { notIn: SIMPLE_PIPELINE_TYPES } }] }, customsCompleteFilter(), invoiceIncompleteFilter()]
    };
  }
  if (stage === 'simple') {
    // ✅ NEW — FF Only / Transport / DO Release have no separate
    // Freight/Customs stage of their own (their workflow goes straight
    // from Enquiry to Invoice), so without this they were invisible to
    // every stat card except Cancelled and the invoice ones — making
    // Total Shipments look like it didn't add up to anything. This
    // covers every active, non-cancelled shipment of these 3 types that
    // hasn't completed its invoice yet, whatever stage of its own short
    // workflow it's actually at.
    return {
      ...baseActive,
      shipmentType: { in: SIMPLE_PIPELINE_TYPES },
      AND: [invoiceIncompleteFilter(), getNotCancelledFilter()]
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
  try { const { shipmentType } = req.body; await prisma.shipment.update({ where: { id: req.params.id }, data: { shipmentType } }); await upsertStatusEntry(req.params.id, 'TYPE_UPDATED', `Mode: ${shipmentType}`, actorName(req)); await recomputeCurrentStatus(req.params.id); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateImportExport = async (req, res) => {
  try { const { importExport } = req.body; await prisma.shipment.update({ where: { id: req.params.id }, data: { importExport } }); await upsertStatusEntry(req.params.id, 'IMPORT_EXPORT_UPDATED', `Import/Export: ${importExport}`, actorName(req)); const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } }); res.json({ status: 'success', data: s }); } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

const updateStage = async (req, res) => {
  try {
    const stage = req.body.shipmentStage;
    // ✅ NEW — picking "Cancelled" from the Stage dropdown cancels the
    // shipment outright (sets currentStatus to CANCELLED), the same
    // outcome as picking it from the Status dropdown. One unified
    // cancellation mechanism, two entry points.
    const data = { shipmentStage: stage };
    if (stage === 'Cancelled') data.currentStatus = 'CANCELLED';
    await prisma.shipment.update({ where: { id: req.params.id }, data });
    await upsertStatusEntry(req.params.id, stage === 'Cancelled' ? 'CANCELLED' : 'STAGE_CHANGE', stage === 'Cancelled' ? 'Shipment cancelled' : `Stage: ${stage}`, actorName(req));
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// ✅ NEW — manual Status dropdown. Dropdown-only on the frontend (no
// free text), listing every real workflow status plus "Cancelled".
// Picking "Cancelled" cancels the shipment directly. Picking any other
// status sets it directly too — this is an explicit manual override, so
// it intentionally does NOT go through recomputeCurrentStatus (which
// would just recalculate from the underlying fields and likely undo
// the manual choice).
const VALID_MANUAL_STATUSES = [
  'ENQUIRY', 'RATES_ADDED', 'NOMINATED', 'BOOKED', 'PICKUP_DONE', 'SCHEDULED', 'DRAFT', 'PRE_ALERTS', 'AWB_GENERATED',
  'CHECKLIST_APPROVED', 'BOE_FILED', 'SB_FILED', 'DO_COLLECTED', 'OOC_DONE', 'LEO_DONE', 'GATE_PASS',
  'HAND_OVER', 'DELIVERED', 'INVOICE_GENERATED', 'INVOICE_SENT', 'CANCELLED'
];
const updateManualStatus = async (req, res) => {
  try {
    const status = req.body.status;
    if (!VALID_MANUAL_STATUSES.includes(status)) {
      return res.status(400).json({ status: 'error', message: 'Invalid status value' });
    }
    await prisma.shipment.update({ where: { id: req.params.id }, data: { currentStatus: status } });
    await upsertStatusEntry(req.params.id, status === 'CANCELLED' ? 'CANCELLED' : 'MANUAL_STATUS', status === 'CANCELLED' ? 'Shipment cancelled' : `Status manually set: ${status.replace(/_/g, ' ')}`, actorName(req));
    const s = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } });
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// ─── BULK STATUS / STAGE CHANGE (NEW) ───
// One request changes many shipments at once, instead of one request (and
// one database round trip) per shipment. Accepts a list of ids plus a new
// status, a new stage, or both. Same rules as the single-shipment
// versions: status is a manual override (it does NOT re-derive from the
// filled-in fields), and choosing Cancelled — as a status OR a stage —
// cancels the shipment, which then stays cancelled until someone picks a
// different status.
const VALID_STAGES = ['Enquiry', 'Quoted', 'Nomination', 'Draft', 'Pre-alerts', 'Checklist', 'BOE', 'OOC', 'POD', 'Invoice', 'Cancelled'];
const BULK_STATUS_MAX = 500;
const bulkUpdateStatus = async (req, res) => {
  try {
    const { ids, status, stage } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No shipments selected' });
    }
    if (ids.length > BULK_STATUS_MAX) {
      return res.status(400).json({ status: 'error', message: `Too many at once — select ${BULK_STATUS_MAX} or fewer` });
    }
    if (!status && !stage) {
      return res.status(400).json({ status: 'error', message: 'Choose a status or a stage to apply' });
    }
    if (status && !VALID_MANUAL_STATUSES.includes(status)) {
      return res.status(400).json({ status: 'error', message: 'Invalid status value' });
    }
    if (stage && !VALID_STAGES.includes(stage)) {
      return res.status(400).json({ status: 'error', message: 'Invalid stage value' });
    }

    const data = {};
    if (status) data.currentStatus = status;
    if (stage) {
      data.shipmentStage = stage;
      if (stage === 'Cancelled') data.currentStatus = 'CANCELLED';
    }
    const cancelling = data.currentStatus === 'CANCELLED';

    // only touch shipments that actually exist and aren't in the Bin
    const targets = await prisma.shipment.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true } });
    const targetIds = targets.map((t) => t.id);
    if (targetIds.length === 0) {
      return res.status(404).json({ status: 'error', message: 'None of the selected shipments could be found' });
    }

    await prisma.shipment.updateMany({ where: { id: { in: targetIds } }, data });

    const label = [status && `status ${status.replace(/_/g, ' ')}`, stage && `stage ${stage}`].filter(Boolean).join(' and ');
    const actor = actorName(req);
    await prisma.statusHistory.createMany({
      data: targetIds.map((shipmentId) => ({
        shipmentId,
        status: cancelling ? 'CANCELLED' : 'MANUAL_STATUS',
        remarks: cancelling ? 'Shipment cancelled (bulk change)' : `Bulk change — set ${label}`,
        changedBy: actor
      }))
    });

    // dashboard numbers must reflect this immediately, not after the cache expires
    statsCache.clear();

    res.json({ status: 'success', data: { updated: targetIds.length, skipped: ids.length - targetIds.length } });
  } catch (e) {
    console.error('Error in bulk status change:', e);
    res.status(500).json({ status: 'error', message: 'Bulk change failed' });
  }
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
      if (preAlertsSentDate) sendMilestoneEmailOnce(req.params.id, 'PRE_ALERTS'); // 2nd customer email — fire and forget
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
      await recomputeCurrentStatus(req.params.id); // ✅ NEW — Pickup is now a tracked workflow step
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
  getShipmentBreakdown, // ✅ NEW — full Total Shipments reconciliation
  recomputeCurrentStatus, // ✅ NEW — shared by cha.controller.js and accounts.controller.js
  updateManualStatus, // ✅ NEW — manual Status dropdown, including Cancelled
  bulkUpdateStatus, // ✅ NEW — change status/stage for many shipments at once
  getShipmentBreakdown, // ✅ NEW — full reconciled breakdown of Total Shipments
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
  archiveNewlyCompleted, // ✅ NEW — startup-only backfill
  archiveLegacyInvoiced, // ✅ NEW — startup-only, env-controlled cleanup of old finished work
  migrateFreightWorkflowStatuses, // ✅ NEW — startup-only, moves old AWB-status Freight shipments onto the new steps
  archiveIfComplete, // ✅ NEW — archive one shipment the moment it is complete
  sendInvoiceReadyOnce, // ✅ NEW — Invoice Ready email, at most once per shipment ever
  sendMilestoneEmailOnce, // ✅ NEW — Pre-Alerts / BOE / Hand Over emails, once each
  clearStatsCache, // ✅ NEW — used by app.js to drop cached dashboard numbers on every write
  setSocketServer, // ✅ NEW — lets the server broadcast changes it makes itself
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