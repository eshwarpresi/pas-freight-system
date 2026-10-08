// backend/src/routes/tracking.routes.js
// PUBLIC (no login) — customers look up a shipment by Job/Ref no, MAWB or HAWB.
// Returns ONLY milestone dates and a friendly status. No names, amounts, staff or remarks.
const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');

// Simple in-memory rate limit: 30 lookups / 10 min per IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 30;
}

const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);

router.get('/:q', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    if (limited(ip)) return res.status(429).json({ status: 'error', message: 'Too many searches. Please try again in a few minutes.' });

    const q = String(req.params.q || '').trim().slice(0, 40);
    if (q.length < 5) return res.status(400).json({ status: 'error', message: 'Please enter the full Job / Reference / AWB number.' });

    const eq = { equals: q, mode: 'insensitive' };
    const s = await prisma.shipment.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { refNo: eq },
          { cha: { jobNo: eq } },
          { freightForwarding: { mawb: eq } },
          { freightForwarding: { hawb: eq } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        refNo: true, createdAt: true, shipmentType: true, importExport: true, shipmentStage: true,
        freightForwarding: { select: { etd: true, eta: true, preAlertsSentDate: true, deliveryDate: true } },
        cha: { select: { boeDate: true, oocDate: true, gatePassDate: true, deliveryDate: true, sbDate: true, leoDate: true, handOverDate: true } },
      },
    });

    if (!s) return res.status(404).json({ status: 'error', message: 'No shipment found for this number. Please check and try again, or contact your PAS Freight representative.' });

    const ff = s.freightForwarding || {};
    const cha = s.cha || {};
    const isExport = String(s.importExport || '').toLowerCase() === 'export';

    const steps = isExport
      ? [
          ['Booking confirmed', d(s.createdAt)],
          ['Shipping Bill filed', d(cha.sbDate)],
          ['Let Export Order (LEO)', d(cha.leoDate)],
          ['Handed over', d(cha.handOverDate)],
          ['Departed (ETD)', d(ff.etd)],
          ['Delivered', d(ff.deliveryDate || cha.deliveryDate)],
        ]
      : [
          ['Booking confirmed', d(s.createdAt)],
          ['Departed (ETD)', d(ff.etd)],
          ['Pre-alert sent', d(ff.preAlertsSentDate)],
          ['Arrival (ETA)', d(ff.eta)],
          ['Bill of Entry filed', d(cha.boeDate)],
          ['Out of Charge (OOC)', d(cha.oocDate)],
          ['Gate pass issued', d(cha.gatePassDate)],
          ['Delivered', d(ff.deliveryDate || cha.deliveryDate)],
        ];

    const timeline = steps.map(([label, date]) => ({ label, date, done: !!date && (label.includes('(ETA)') || label.includes('(ETD)') ? new Date(date) <= new Date() : true) }));
    const cancelled = /cancel/i.test(s.shipmentStage || '');
    const lastDone = [...timeline].reverse().find((t) => t.done);
    const delivered = timeline.find((t) => t.label === 'Delivered')?.done;

    res.json({
      status: 'success',
      data: {
        reference: s.refNo,
        mode: s.shipmentType || null,
        direction: s.importExport || null,
        headline: cancelled ? 'Cancelled' : delivered ? 'Delivered' : lastDone ? lastDone.label : 'Booking received',
        timeline,
        updatedNote: 'Status is updated by the PAS Freight team. For urgent queries call 90361 01201 or 90353 80075.',
      },
    });
  } catch (err) {
    console.error('Track failed:', err);
    res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;