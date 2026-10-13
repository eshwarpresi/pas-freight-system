// "Rate request" button on a shipment: builds the details from the DSR and asks the
// mailer to prepare a draft for the logged-in employee. The employee then reviews and sends it there.
// Needs env on Render:  MAILER_URL (https://pasfreight-mailer.onrender.com)  and  MAILER_KEY (same value as MAILER_KEY in the mailer)
const express = require('express');
const prisma = require('../utils/prisma');
const router = express.Router();

const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => (v == null || v === '' ? '' : String(Number(v)));

router.post('/:id/draft', async (req, res) => {
  try {
    const base = str(process.env.MAILER_URL).replace(/\/$/, '');
    const key = str(process.env.MAILER_KEY);
    if (!base || !key) return res.status(503).json({ status: 'error', message: 'Rate request is not connected yet (MAILER_URL / MAILER_KEY missing on the server).' });

    const sh = await prisma.shipment.findUnique({
      where: { id: req.params.id },
      include: { freightForwarding: true, statusHistory: { where: { status: 'RATE_REQUEST' }, orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    if (!sh || sh.isDeleted) return res.status(404).json({ status: 'error', message: 'Shipment not found' });
    const ff = sh.freightForwarding || {};
    const me = req.user?.id ? await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, email: true, phone: true } }) : null;
    const email = me?.email || req.user?.email;
    if (!email) return res.status(400).json({ status: 'error', message: 'Could not tell who you are. Please log in again.' });

    const front = str(process.env.FRONTEND_URL || 'https://pas-freight-system.onrender.com').replace(/\/$/, '');
    const body = {
      employee: { name: me?.name || req.user?.name || '', email, phone: me?.phone || '' },
      shipment: {
        refNo: sh.refNo,
        importExport: str(sh.importExport),
        mode: str(ff.transportMode) || str(sh.shipmentType),
        terms: str(ff.terms),
        from: str(ff.fromLocation),
        to: str(ff.toLocation),
        packages: ff.noOfPackages != null ? String(ff.noOfPackages) : '',
        packageType: str(ff.packageType),
        grossWeight: num(ff.grossWeight),
        weight: num(ff.weight),
        cbm: num(ff.cbm),
        containerType: str(ff.containerType),
        noOfContainers: ff.noOfContainers != null ? String(ff.noOfContainers) : '',
        commodity: str(ff.commodityName),
        dsrUrl: `${front}/shipment/${sh.id}`,
      },
      previous: (sh.statusHistory || []).map((h) => ({ by: h.changedBy || '', when: new Date(h.createdAt).toISOString().slice(0, 16).replace('T', ' '), count: (String(h.remarks).match(/(\d+)\s+agent/) || [])[1] || '' })),
    };

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45000);
    let r;
    try {
      r = await fetch(`${base}/api/rate/draft`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key }, body: JSON.stringify(body), signal: ctl.signal });
    } finally { clearTimeout(timer); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) return res.status(502).json({ status: 'error', message: j.error || 'The mailer did not accept the request. Try again in a moment.' });
    res.json({ status: 'success', data: { url: j.url } });
  } catch (err) {
    console.error('Rate request draft failed:', err.message);
    res.status(502).json({ status: 'error', message: 'Could not reach the mailer. It may be waking up — try again in a few seconds.' });
  }
});

module.exports = router;