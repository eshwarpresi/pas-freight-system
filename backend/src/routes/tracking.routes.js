// backend/src/routes/tracking.routes.js
// PUBLIC (no login) — customers look up a shipment by Job/Ref no, MAWB, HAWB, BOE or SB no.
// Exact match first; if nothing, a "starts with" match (so PPI260506 finds PPI260506-RS).
// Shows shipment facts + milestone dates + activity log + WHO IS HANDLING the shipment (name, phone, email of
// the executive and the right team to contact). NEVER shows: customer/shipper names, customer emails,
// rates, invoices or remarks.
const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');

const hits = new Map(); // 40 lookups / 10 min per IP
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 40;
}

const iso = (v) => (v ? new Date(v).toISOString() : null);
const num = (v) => (v === null || v === undefined ? null : Number(v));
const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const SELECT = {
  id: true, refNo: true, createdAt: true, updatedAt: true, currentStatus: true, shipmentStage: true,
  shipmentType: true, importExport: true,
  createdByName: true, coHandlerId: true, coHandlerName: true,
  createdByUser: { select: { name: true, email: true, phone: true } },
  freightForwarding: {
    select: {
      enquiryDate: true, bookingDate: true, pickupDate: true, etd: true, eta: true, preAlertsSentDate: true,
      awbDate: true, deliveryDate: true, fromLocation: true, toLocation: true, portLocation: true, terms: true,
      noOfPackages: true, packageType: true, weight: true, grossWeight: true, cbm: true,
      containerType: true, noOfContainers: true, commodityName: true, mawb: true, hawb: true, transportMode: true,
    },
  },
  cha: {
    select: {
      jobNo: true, checklistDate: true, checklistApprovalDate: true, boeNo: true, boeDate: true, doCollectionDate: true,
      oocDate: true, gatePassDate: true, deliveryDate: true, sbNo: true, sbDate: true, leoDate: true, handOverDate: true,
    },
  },
};

// ── who to contact ──
const COMPANY = {
  phones: (process.env.TRACK_PHONES || '90361 01201,90353 80075').split(',').map((x) => x.trim()).filter(Boolean),
  email: process.env.TRACK_EMAIL || 'info@pasfreight.com',
  customsEmail: process.env.TRACK_CUSTOMS_EMAIL || process.env.TRACK_EMAIL || 'info@pasfreight.com',
  accountsEmail: process.env.TRACK_ACCOUNTS_EMAIL || process.env.TRACK_EMAIL || 'info@pasfreight.com',
  escalationEmail: process.env.TRACK_ESCALATION_EMAIL || '',
};
const CUSTOMS_STEPS = new Set([
  'Customs documents ready', 'Bill of Entry filed', 'Delivery Order collected', 'Customs cleared (OOC)', 'Gate pass issued',
  'Shipping Bill filed', 'Let Export Order (LEO)', 'Handed over',
]);
const digits = (p) => String(p || '').replace(/\D/g, '');
const waNumber = (p) => { const d = digits(p); return d.length === 10 ? '91' + d : d.length >= 11 ? d : null; };
const person = (u, fallbackName) => {
  const name = (u && u.name) || fallbackName || null;
  if (!name) return null;
  return { name, email: (u && u.email) || null, phone: (u && u.phone) || null, whatsapp: waNumber(u && u.phone) };
};
const FRIENDLY = {
  'Enquiry received': 'We have received your enquiry and are preparing your booking.',
  'Booking confirmed': 'Your booking is confirmed. We are arranging the cargo movement.',
  'Cargo picked up': 'Your cargo has been picked up and is on its way.',
  'Departed': 'Your shipment has departed and is in transit.',
  'Pre-alert sent': 'The pre-alert has been sent. Documents are being prepared for arrival.',
  'Arrived at destination': 'Your cargo has arrived. Our customs team is preparing the clearance.',
  'Customs documents ready': 'Customs documents are ready and being filed.',
  'Bill of Entry filed': 'The Bill of Entry is filed. Clearance is in progress.',
  'Delivery Order collected': 'The Delivery Order is collected. Customs clearance is next.',
  'Customs cleared (OOC)': 'Customs clearance is complete. Delivery is being arranged.',
  'Gate pass issued': 'The gate pass is issued. Your cargo is ready for delivery.',
  'Shipping Bill filed': 'The Shipping Bill is filed with customs.',
  'Let Export Order (LEO)': 'Customs has cleared your export (LEO). Handover is next.',
  'Handed over': 'Your cargo has been handed over for shipment.',
  'Delivered': 'Your shipment has been delivered. Thank you for choosing PAS Freight.',
};

async function find(q) {
  const eq = { equals: q, mode: 'insensitive' };
  const fields = (m) => [
    { refNo: m }, { cha: { jobNo: m } }, { cha: { boeNo: m } }, { cha: { sbNo: m } },
    { freightForwarding: { mawb: m } }, { freightForwarding: { hawb: m } },
  ];
  let s = await prisma.shipment.findFirst({ where: { isDeleted: false, OR: fields(eq) }, orderBy: { createdAt: 'desc' }, select: SELECT });
  if (!s && q.length >= 8) {
    const sw = { startsWith: q, mode: 'insensitive' };
    s = await prisma.shipment.findFirst({ where: { isDeleted: false, OR: fields(sw) }, orderBy: { createdAt: 'desc' }, select: SELECT });
  }
  return s;
}

router.get('/:q', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    if (limited(ip)) return res.status(429).json({ status: 'error', message: 'Too many searches. Please try again in a few minutes.' });

    const q = String(req.params.q || '').trim().slice(0, 40);
    if (q.length < 5) return res.status(400).json({ status: 'error', message: 'Please enter your Job / Reference / AWB number.' });

    const s = await find(q);
    if (!s) return res.status(404).json({ status: 'error', message: 'No shipment found for this number. Please check and try again, or contact your PAS Freight representative.' });

    const ff = s.freightForwarding || {};
    const cha = s.cha || {};
    const isExport = String(s.importExport || '').toLowerCase() === 'export';
    const now = Date.now();

    // [label, date, kind]  kind 'plan' = ETD/ETA (counts as done only when the date has passed)
    const raw = isExport
      ? [
          ['Enquiry received', ff.enquiryDate],
          ['Booking confirmed', ff.bookingDate || s.createdAt],
          ['Cargo picked up', ff.pickupDate],
          ['Shipping Bill filed', cha.sbDate],
          ['Let Export Order (LEO)', cha.leoDate],
          ['Handed over', cha.handOverDate],
          ['Departed', ff.etd, 'plan'],
          ['Arrived at destination', ff.eta, 'plan'],
          ['Delivered', ff.deliveryDate || cha.deliveryDate],
        ]
      : [
          ['Enquiry received', ff.enquiryDate],
          ['Booking confirmed', ff.bookingDate || s.createdAt],
          ['Cargo picked up', ff.pickupDate],
          ['Departed', ff.etd, 'plan'],
          ['Pre-alert sent', ff.preAlertsSentDate],
          ['Arrived at destination', ff.eta, 'plan'],
          ['Customs documents ready', cha.checklistApprovalDate || cha.checklistDate],
          ['Bill of Entry filed', cha.boeDate],
          ['Delivery Order collected', cha.doCollectionDate],
          ['Customs cleared (OOC)', cha.oocDate],
          ['Gate pass issued', cha.gatePassDate],
          ['Delivered', ff.deliveryDate || cha.deliveryDate],
        ];

    const timeline = raw.map(([label, date, kind]) => {
      const t = date ? new Date(date).getTime() : null;
      const done = !!t && (kind === 'plan' ? t <= now : true);
      return { label, date: iso(date), done, estimated: !!t && kind === 'plan' && t > now };
    });
    // Drop steps nobody has dates for AND that sit before the last completed step (e.g. skipped steps)
    const lastDoneIdx = timeline.map((t) => t.done).lastIndexOf(true);
    const shown = timeline.filter((t, i) => t.done || t.estimated || i > lastDoneIdx);
    const cancelled = /cancel/i.test(s.shipmentStage || '') || /cancel/i.test(s.currentStatus || '');
    const delivered = timeline.find((t) => t.label === 'Delivered')?.done;
    const lastDone = shown.filter((t) => t.done).pop();
    const next = shown.find((t) => !t.done);
    const doneCount = shown.filter((t) => t.done).length;

    const history = await prisma.statusHistory.findMany({
      where: { shipmentId: s.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { status: true, createdAt: true },
    });

    // ── who is handling now + how to reach them ──
    const handlingNow = cancelled ? null : delivered ? 'ACCOUNTS' : next ? (CUSTOMS_STEPS.has(next.label) ? 'CUSTOMS' : 'FREIGHT') : 'FREIGHT';
    let coUser = null;
    if (s.coHandlerId) coUser = await prisma.user.findUnique({ where: { id: s.coHandlerId }, select: { name: true, email: true, phone: true } }).catch(() => null);
    const owner = person(s.createdByUser, s.createdByName);
    const co = person(coUser, s.coHandlerName);
    const phones = COMPANY.phones.map((p) => ({ display: p, tel: digits(p), whatsapp: waNumber(p) }));
    const teams = [
      { key: 'FREIGHT', title: 'Your freight executive', blurb: 'Bookings, flights/vessels, pickup, pre-alerts and arrival updates',
        people: [owner, co && co.name !== (owner && owner.name) ? co : null].filter(Boolean), email: COMPANY.email },
      { key: 'CUSTOMS', title: 'Customs clearance team', blurb: 'Bill of Entry / Shipping Bill, duty, clearance and delivery orders', people: [], email: COMPANY.customsEmail },
      { key: 'ACCOUNTS', title: 'Accounts & billing', blurb: 'Invoices, payments and statements', people: [], email: COMPANY.accountsEmail },
    ].map((t) => ({ ...t, active: t.key === handlingNow }));
    const etaMs = ff.eta ? new Date(ff.eta).getTime() : null;
    const delayed = !cancelled && !delivered && !!next && next.label === 'Arrived at destination' && !!etaMs && etaMs < now - 24 * 3600 * 1000;
    const message = cancelled
      ? 'This shipment has been cancelled. Please contact us if you have any questions.'
      : delayed
        ? 'Your cargo is taking a little longer than planned. Your executive is following up and will keep you informed.'
        : (lastDone && FRIENDLY[lastDone.label]) || 'We are working on your shipment.';

    res.json({
      status: 'success',
      data: {
        message,
        delayed,
        handlingNow,
        contacts: { teams, company: { phones, email: COMPANY.email, escalationEmail: COMPANY.escalationEmail || null } },
        reference: s.refNo,
        mode: s.shipmentType || ff.transportMode || null,
        direction: s.importExport || null,
        headline: cancelled ? 'Cancelled' : delivered ? 'Delivered' : lastDone ? lastDone.label : 'Booking received',
        nextStep: !cancelled && !delivered && next ? { label: next.label, date: next.date, estimated: next.estimated } : null,
        progress: cancelled ? 0 : Math.round((doneCount / Math.max(shown.length, 1)) * 100),
        cancelled, delivered: !!delivered,
        route: { from: ff.fromLocation || null, to: ff.toLocation || null, port: ff.portLocation || null, terms: ff.terms || null },
        details: {
          packages: ff.noOfPackages ?? null,
          packageType: ff.packageType || null,
          grossWeight: num(ff.grossWeight),
          chargeableWeight: num(ff.weight),
          cbm: num(ff.cbm),
          containers: ff.noOfContainers ?? null,
          containerType: ff.containerType || null,
          commodity: ff.commodityName || null,
          mawb: ff.mawb || null,
          hawb: ff.hawb || null,
          jobNo: cha.jobNo || null,
          boeNo: cha.boeNo || null,
          sbNo: cha.sbNo || null,
          etd: iso(ff.etd),
          eta: iso(ff.eta),
        },
        timeline: shown,
        activity: history.map((h) => ({ status: pretty(h.status), at: iso(h.createdAt) })),
        lastUpdated: iso(s.updatedAt),
        contact: 'For urgent queries call 90361 01201 / 90353 80075 or email info@pasfreight.com',
      },
    });
  } catch (err) {
    console.error('Track failed:', err);
    res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;