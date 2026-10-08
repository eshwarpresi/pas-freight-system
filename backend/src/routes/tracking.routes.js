// backend/src/routes/tracking.routes.js
// PUBLIC (no login) — customers look up a shipment by Job/Ref no, MAWB, HAWB, BOE or SB no.
// Exact match first; if nothing, a "starts with" match (so PPI260506 finds PPI260506-RS).
// Shows shipment facts + milestone dates + activity log. NEVER shows: customer/shipper names,
// emails, rates, invoices, remarks or staff names.
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

    res.json({
      status: 'success',
      data: {
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