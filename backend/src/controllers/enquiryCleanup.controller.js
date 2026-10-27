// backend/src/controllers/enquiryCleanup.controller.js
// Keeps the enquiry list clean: how long an enquiry has been sitting, the weekly clean-up list,
// "Reopen", duplicate detection when a new shipment is created, and the lost-reason / conversion reports.
// Nothing here needs a database change: a reopen is a row in the shipment history (status 'REOPENED'),
// and a cancel reason is already stored in the history by the cancel flow.
const prisma = require('../utils/prisma');

const DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS = 5;      // still at plain Enquiry after this many full days -> shows as Cancelled
const REMINDER_DAYS = 2;   // owner is reminded from this age
const WARNING_DAYS = 3;    // "N days left" warning is shown from this age

const mainController = () => require('./freightForwarding.controller'); // loaded when needed (it also loads this file)
const actorName = (req) => (req.user && (req.user.name || req.user.email)) || null;

// ---------- how long has an enquiry been waiting ----------
async function lastReopenedMap(ids) {
  const map = {};
  if (!ids.length) return map;
  const rows = await prisma.statusHistory.groupBy({
    by: ['shipmentId'],
    where: { shipmentId: { in: ids }, status: 'REOPENED' },
    _max: { createdAt: true }
  });
  rows.forEach((r) => { map[r.shipmentId] = r._max.createdAt; });
  return map;
}

function clockFor(createdAt, reopenedAt, now) {
  const start = reopenedAt && new Date(reopenedAt) > new Date(createdAt) ? new Date(reopenedAt) : new Date(createdAt);
  const age = Math.max(0, Math.floor(((now || Date.now()) - start.getTime()) / DAY));
  return { age, daysLeft: Math.max(0, STALE_DAYS - age), stale: age >= STALE_DAYS };
}

// Adds enquiryAgeDays / enquiryDaysLeft / enquiryStale to every row that is still at plain Enquiry.
async function attachEnquiryClock(rows) {
  const open = (rows || []).filter((r) => r && r.currentStatus === 'ENQUIRY');
  if (!open.length) return rows;
  const map = await lastReopenedMap(open.map((r) => r.id));
  open.forEach((r) => {
    const c = clockFor(r.createdAt, map[r.id]);
    r.enquiryAgeDays = c.age;
    r.enquiryDaysLeft = c.daysLeft;
    r.enquiryStale = c.stale;
    if (c.stale) r.cancelReason = `No progress for ${STALE_DAYS} days`;
  });
  return rows;
}

// ---------- weekly clean-up list ----------
// GET /shipments/stale-enquiries?minAge=3&mine=true
const getStaleEnquiries = async (req, res) => {
  try {
    const minAge = Math.max(0, parseInt(req.query.minAge, 10) || WARNING_DAYS);
    const where = {
      isDeleted: false, isArchived: false, currentStatus: 'ENQUIRY',
      createdAt: { lte: new Date(Date.now() - minAge * DAY) }
    };
    if (req.query.mine === 'true' && req.user && req.user.id) {
      where.OR = [{ createdById: req.user.id }, { coHandlerId: req.user.id }];
    }
    const rows = await prisma.shipment.findMany({
      where,
      select: {
        id: true, refNo: true, createdAt: true, createdByName: true, coHandlerName: true, currentStatus: true,
        shipmentStage: true, shipmentType: true, importExport: true,
        freightForwarding: { select: { customerName: true, shipperName: true, consigneeName: true, fromLocation: true, toLocation: true, notificationEmail: true } }
      },
      orderBy: { createdAt: 'asc' },
      take: 1000
    });
    await attachEnquiryClock(rows);
    const list = rows.filter((r) => r.enquiryAgeDays >= minAge).sort((a, b) => b.enquiryAgeDays - a.enquiryAgeDays);
    res.json({ status: 'success', data: list, meta: { staleDays: STALE_DAYS, minAge, total: list.length } });
  } catch (err) {
    console.error('getStaleEnquiries failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to load the clean-up list' });
  }
};

// ---------- reopen ----------
// PUT /shipments/:id/reopen  -> restarts the enquiry clock (and lifts a manual cancel)
const reopenShipment = async (req, res) => {
  try {
    const id = req.params.id;
    const sh = await prisma.shipment.findUnique({ where: { id }, select: { id: true, refNo: true, currentStatus: true, shipmentStage: true, isDeleted: true } });
    if (!sh || sh.isDeleted) return res.status(404).json({ status: 'error', message: 'Shipment not found' });
    const wasCancelled = sh.currentStatus === 'CANCELLED';
    const data = {};
    if (wasCancelled) {
      data.currentStatus = 'ENQUIRY';
      if (sh.shipmentStage === 'Cancelled') data.shipmentStage = 'Enquiry';
    }
    data.statusHistory = { create: { status: 'REOPENED', remarks: `Reopened${wasCancelled ? ' from Cancelled' : ''} - enquiry timer restarted`, changedBy: actorName(req) } };
    await prisma.shipment.update({ where: { id }, data });
    const main = mainController();
    if (wasCancelled) await main.recomputeCurrentStatus(id);
    main.clearStatsCache();
    const s = await prisma.shipment.findUnique({ where: { id }, include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 } } });
    await attachEnquiryClock([s]);
    res.json({ status: 'success', data: s });
  } catch (err) {
    console.error('reopenShipment failed:', err);
    res.status(500).json({ status: 'error', message: 'Could not reopen the shipment' });
  }
};

// ---------- duplicate check ----------
const SUFFIX = /\b(PRIVATE|PVT|LIMITED|LTD|LLP|INC|CO|COMPANY|CORPORATION|CORP|THE)\b/g;
const normText = (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
const normNum = (v) => { const x = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : null; };
function sameText(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b, long = a.length <= b.length ? b : a;
  return short.length >= 6 && long.includes(short);
}

const PARTY_FIELDS = ['customerName', 'shipperName', 'consigneeName'];
const PLACE_FIELDS = ['fromLocation', 'toLocation'];
const TEXT_FIELDS = ['commodityName', 'terms', 'shipmentType', 'importExport'];
const NUM_FIELDS = ['noOfPackages', 'grossWeight', 'weight', 'cbm'];
const LABEL = {
  customerName: 'Customer', shipperName: 'Shipper', consigneeName: 'Consignee', fromLocation: 'From', toLocation: 'To',
  commodityName: 'Commodity', terms: 'Terms', shipmentType: 'Type', importExport: 'Import/Export',
  noOfPackages: 'Packages', grossWeight: 'Gross weight', weight: 'Chargeable weight', cbm: 'CBM'
};

// Compares the details typed for a new shipment with one that already exists.
function compareDetails(input, ff, sh) {
  const theirParties = PARTY_FIELDS.map((k) => normText(ff[k])).filter(Boolean);
  const matched = [], differs = [];
  let compared = 0;
  PARTY_FIELDS.forEach((k) => {
    const mine = normText(input[k]); if (!mine) return;
    compared++;
    if (theirParties.some((t) => sameText(mine, t))) matched.push(k); else differs.push(k);
  });
  PLACE_FIELDS.forEach((k) => {
    const mine = normText(input[k]); if (!mine) return;
    compared++;
    if (sameText(mine, normText(ff[k]))) matched.push(k); else differs.push(k);
  });
  TEXT_FIELDS.forEach((k) => {
    const mine = normText(input[k]); if (!mine) return;
    const theirs = normText(k === 'shipmentType' || k === 'importExport' ? sh[k] : ff[k]);
    compared++;
    if (sameText(mine, theirs)) matched.push(k); else differs.push(k);
  });
  NUM_FIELDS.forEach((k) => {
    const mine = normNum(input[k]); if (mine === null) return;
    const theirs = normNum(ff[k]);
    compared++;
    if (theirs !== null && theirs === mine) matched.push(k); else differs.push(k);
  });
  const score = compared ? matched.length / compared : 0;
  const partyHit = matched.some((k) => PARTY_FIELDS.includes(k));
  const detailHit = matched.some((k) => !PARTY_FIELDS.includes(k));
  const isDuplicate = compared >= 3 && score >= 0.7 && partyHit && detailHit;
  return { score, compared, matched, differs, isDuplicate };
}

// POST /shipments/check-duplicate   body: the same fields as the Create Shipment form
const checkDuplicate = async (req, res) => {
  try {
    const input = req.body || {};
    const pool = await prisma.shipment.findMany({
      where: { isDeleted: false, isArchived: false, currentStatus: { not: 'CANCELLED' }, createdAt: { gte: new Date(Date.now() - 90 * DAY) } },
      select: {
        id: true, refNo: true, createdAt: true, createdByName: true, currentStatus: true, shipmentStage: true, shipmentType: true, importExport: true,
        freightForwarding: { select: { customerName: true, shipperName: true, consigneeName: true, fromLocation: true, toLocation: true, commodityName: true, terms: true, noOfPackages: true, grossWeight: true, weight: true, cbm: true } }
      },
      take: 3000
    });
    const found = [];
    pool.forEach((sh) => {
      if (input.excludeId && sh.id === input.excludeId) return;
      const r = compareDetails(input, sh.freightForwarding || {}, sh);
      if (r.isDuplicate) {
        found.push({
          id: sh.id, refNo: sh.refNo, createdAt: sh.createdAt, createdByName: sh.createdByName,
          status: sh.currentStatus, stage: sh.shipmentStage, score: Math.round(r.score * 100),
          matched: r.matched.map((k) => LABEL[k]), differs: r.differs.map((k) => LABEL[k])
        });
      }
    });
    found.sort((a, b) => b.score - a.score);
    res.json({ status: 'success', data: found.slice(0, 5) });
  } catch (err) {
    console.error('checkDuplicate failed:', err);
    res.status(500).json({ status: 'error', message: 'Could not check for duplicates' });
  }
};

// ---------- reports ----------
const IST = 5.5 * 60 * 60 * 1000;
function rangeFrom(req, defaultDays) {
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999+05:30`) : new Date();
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00+05:30`) : new Date(to.getTime() - defaultDays * DAY);
  return { from, to };
}
function weekStartIST(date) {   // Monday of that week, as yyyy-mm-dd (India time)
  const d = new Date(date.getTime() + IST);
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  return monday.toISOString().slice(0, 10);
}

const REASON_RULES = [
  { key: 'Price too high', re: /price|rate|expens|costly|high/i },
  { key: 'No response', re: /no response|not respond|no reply|silent/i },
  { key: 'Went to a competitor', re: /compet|other (agent|forwarder)|another/i },
  { key: 'Cargo not ready', re: /not ready|cargo.*(delay|hold)|postpon|no cargo/i },
  { key: 'No progress (auto)', re: /no progress/i }
];
function classifyReason(text) {
  const t = String(text || '').trim();
  if (!t) return 'No reason given';
  const hit = REASON_RULES.find((r) => r.re.test(t));
  return hit ? hit.key : 'Other';
}

// GET /reports/lost-reasons?from=yyyy-mm-dd&to=yyyy-mm-dd   (default: last 30 days)
const getLostReasons = async (req, res) => {
  try {
    const { from, to } = rangeFrom(req, 30);
    const rows = await prisma.statusHistory.findMany({
      where: { status: 'CANCELLED', createdAt: { gte: from, lte: to } },
      select: { remarks: true, changedBy: true },
      take: 5000
    });
    const counts = {}, byPerson = {};
    rows.forEach((r) => {
      const m = /Reason:\s*(.*)$/i.exec(r.remarks || '');
      const key = classifyReason(m ? m[1] : '');
      counts[key] = (counts[key] || 0) + 1;
      const p = r.changedBy || 'Unknown';
      byPerson[p] = byPerson[p] || {};
      byPerson[p][key] = (byPerson[p][key] || 0) + 1;
    });
    const list = Object.keys(counts).map((reason) => ({ reason, count: counts[reason] })).sort((a, b) => b.count - a.count);
    // enquiries that were never worked on and timed out (not stored as a cancel, so counted live)
    const stale = await prisma.shipment.count({
      where: { isDeleted: false, isArchived: false, currentStatus: 'ENQUIRY', createdAt: { lte: new Date(Date.now() - STALE_DAYS * DAY) } }
    });
    res.json({ status: 'success', data: { from, to, total: rows.length, reasons: list, byPerson, timedOutEnquiries: stale } });
  } catch (err) {
    console.error('getLostReasons failed:', err);
    res.status(500).json({ status: 'error', message: 'Could not build the lost-reason report' });
  }
};

// GET /reports/conversion?from=&to=   (default: last 28 days) - enquiries, quotations and wins per person per week
const getConversionReport = async (req, res) => {
  try {
    const { from, to } = rangeFrom(req, 28);
    const rows = await prisma.shipment.findMany({
      where: { isDeleted: false, createdAt: { gte: from, lte: to } },
      select: {
        id: true, createdAt: true, createdByName: true, currentStatus: true, shipmentStage: true,
        freightForwarding: { select: { sellingRate: true, nominationDate: true } }
      },
      take: 10000
    });
    const map = await lastReopenedMap(rows.filter((r) => r.currentStatus === 'ENQUIRY').map((r) => r.id));
    const people = {}, weeks = {};
    const bump = (bucket, key, field) => {
      bucket[key] = bucket[key] || { enquiries: 0, quoted: 0, won: 0, lost: 0 };
      bucket[key][field]++;
    };
    rows.forEach((r) => {
      const ff = r.freightForwarding || {};
      const person = r.createdByName || 'Unknown';
      const week = weekStartIST(r.createdAt);
      const won = !!ff.nominationDate || r.shipmentStage === 'Nomination';
      const quoted = won || !!ff.sellingRate || r.shipmentStage === 'Quoted' || !['ENQUIRY', 'RATES_REQUESTED', 'CANCELLED'].includes(r.currentStatus);
      const lost = r.currentStatus === 'CANCELLED' || (r.currentStatus === 'ENQUIRY' && clockFor(r.createdAt, map[r.id]).stale);
      weeks[week] = weeks[week] || {};
      [[people, person], [weeks[week], person]].forEach(([bucket, key]) => {
        bump(bucket, key, 'enquiries');
        if (quoted) bump(bucket, key, 'quoted');
        if (won) bump(bucket, key, 'won');
        if (lost && !won) bump(bucket, key, 'lost');
      });
    });
    const withRate = (o) => Object.assign({}, o, { winRate: o.enquiries ? Math.round((o.won / o.enquiries) * 100) : 0 });
    const peopleList = Object.keys(people).map((name) => withRate(Object.assign({ name }, people[name]))).sort((a, b) => b.enquiries - a.enquiries);
    const weekList = Object.keys(weeks).sort().map((weekStart) => ({
      weekStart,
      people: Object.keys(weeks[weekStart]).map((name) => withRate(Object.assign({ name }, weeks[weekStart][name]))).sort((a, b) => b.enquiries - a.enquiries)
    }));
    const totals = withRate(peopleList.reduce((t, p) => ({ enquiries: t.enquiries + p.enquiries, quoted: t.quoted + p.quoted, won: t.won + p.won, lost: t.lost + p.lost }), { enquiries: 0, quoted: 0, won: 0, lost: 0 }));
    res.json({ status: 'success', data: { from, to, totals, people: peopleList, weeks: weekList } });
  } catch (err) {
    console.error('getConversionReport failed:', err);
    res.status(500).json({ status: 'error', message: 'Could not build the conversion report' });
  }
};

module.exports = {
  STALE_DAYS, REMINDER_DAYS, WARNING_DAYS,
  clockFor, lastReopenedMap, attachEnquiryClock,
  compareDetails, classifyReason,
  getStaleEnquiries, reopenShipment, checkDuplicate, getLostReasons, getConversionReport
};