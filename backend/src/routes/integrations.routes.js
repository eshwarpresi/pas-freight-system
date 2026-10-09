// backend/src/routes/integrations.routes.js
// Server-to-server links from PAS Freight's other software into the DSR.
// Protected by a secret key (env QUOTE_API_KEY) sent in the "x-api-key" header.
//
// POST /api/integrations/quotation/nominated
//   Called by the Quotation software when a customer NOMINATES. Creates the shipment in the DSR
//   (stage "Nomination") with every detail already filled in, so nobody re-types it.
//   Safe to call twice for the same quote — the second call returns the existing shipment.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const prisma = require('../utils/prisma');

function keyOk(req) {
  const expected = process.env.QUOTE_API_KEY || '';
  const got = String(req.headers['x-api-key'] || '');
  if (!expected || expected.length < 16) return false; // not configured → closed
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const hits = new Map(); // 60 calls / 10 min per IP
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 600000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 2000) hits.clear();
  return arr.length > 60;
}

const s = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
const i = (v) => { const x = parseInt(v, 10); return Number.isFinite(x) ? x : null; };
const d = (v) => { if (!v) return null; const x = new Date(v); return isNaN(x) ? null : x; };

// Same shared-counter rule as "Generate reference number" (skips numbers ending in 3 or 7).
async function nextRefNo(prefix, initials) {
  const code = String(prefix || '').trim().toUpperCase();
  const ini = String(initials || '').trim().toUpperCase();
  if (!code || !ini) return null;
  const [p, a] = await Promise.all([
    prisma.referencePrefix.findUnique({ where: { code } }),
    prisma.referenceInitial.findUnique({ where: { code: ini } }),
  ]);
  if (!p || !a) return null;
  await prisma.referenceCounter.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global', value: 0 } });
  let value;
  for (;;) {
    const u = await prisma.referenceCounter.update({ where: { id: 'global' }, data: { value: { increment: 1 } } });
    const last = u.value % 10;
    if (last !== 3 && last !== 7) { value = u.value; break; }
  }
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const yy = String(ist.getUTCFullYear()).slice(-2);
  return `${code}${yy}${String(value).padStart(4, '0')}-${ini}`;
}

router.post('/quotation/nominated', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    if (limited(ip)) return res.status(429).json({ status: 'error', message: 'Too many requests' });
    if (!keyOk(req)) return res.status(401).json({ status: 'error', message: 'Invalid or missing API key' });

    const b = req.body || {};
    const quoteNo = s(b.quoteNo);
    if (!quoteNo) return res.status(400).json({ status: 'error', message: 'quoteNo is required' });
    const tag = `[QUOTE:${quoteNo}]`;

    // Already created for this quote? return it (no duplicates on double click / retry)
    const existing = await prisma.shipment.findFirst({
      where: { remarks: { contains: tag }, isDeleted: false },
      select: { id: true, refNo: true },
    });
    if (existing) return res.json({ status: 'success', duplicate: true, data: { id: existing.id, refNo: existing.refNo } });

    // Reference number: PAS-style if prefix+initials given and valid, else the quote number
    let refNo = await nextRefNo(b.prefix, b.initials);
    const refFromQuote = !refNo;
    if (!refNo) refNo = quoteNo;

    // Owner of the shipment = the salesperson, if their email matches a DSR user
    let owner = null;
    if (s(b.createdByEmail)) {
      owner = await prisma.user.findFirst({ where: { email: { equals: s(b.createdByEmail), mode: 'insensitive' } }, select: { id: true, name: true, email: true } });
    }
    const createdByName = owner?.name || s(b.createdByName) || 'Quotation system';

    const shipment = await prisma.shipment.create({
      data: {
        refNo,
        currentStatus: 'ENQUIRY',
        shipmentStage: 'Nomination',
        shipmentType: s(b.shipmentType),
        importExport: s(b.importExport),
        remarks: `${tag} Created automatically from quotation ${quoteNo} on nomination.${s(b.remarks) ? ' ' + s(b.remarks) : ''}`,
        createdById: owner?.id || null,
        createdByName,
        freightForwarding: {
          create: {
            enquiryDate: d(b.enquiryDate) || new Date(),
            customerName: s(b.customerName),
            shipperName: s(b.shipperName),
            consigneeName: s(b.consigneeName),
            agent: s(b.agent),
            fromLocation: s(b.fromLocation),
            toLocation: s(b.toLocation),
            portLocation: s(b.portLocation),
            terms: s(b.terms),
            commodityName: s(b.commodityName),
            noOfPackages: i(b.noOfPackages),
            packageType: s(b.packageType),
            grossWeight: n(b.grossWeight),
            weight: n(b.weight),
            cbm: n(b.cbm),
            containerType: s(b.containerType),
            noOfContainers: i(b.noOfContainers),
            notificationEmail: s(b.notificationEmail),
            sellingRate: n(b.sellingRate),
            autoEmailEnabled: false,
          },
        },
        statusHistory: { create: { status: 'ENQUIRY', remarks: `Nominated — created from quotation ${quoteNo}`, changedBy: createdByName } },
      },
      select: { id: true, refNo: true },
    });

    refreshCaches();
    res.status(201).json({ status: 'success', duplicate: false, refNumberFromQuote: refFromQuote, data: shipment });
  } catch (err) {
    console.error('Quotation integration failed:', err);
    res.status(500).json({ status: 'error', message: 'Could not create the shipment' });
  }
});


// ─── Shipment already created in the DSR (normal flow: Enquiry → DSR shipment → Quotation → Nomination) ───
const guard = (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  if (limited(ip)) { res.status(429).json({ status: 'error', message: 'Too many requests' }); return false; }
  if (!keyOk(req)) { res.status(401).json({ status: 'error', message: 'Invalid or missing API key' }); return false; }
  return true;
};
const REF_SELECT = { id: true, refNo: true, shipmentType: true, importExport: true, shipmentStage: true, currentStatus: true, remarks: true, freightForwarding: true };
// Exact reference first; if none, a reference that STARTS WITH what was typed (so PPI260506 finds PPI260506-RS)
const findByRef = async (ref) => {
  const q = String(ref || '').trim();
  let sh = await prisma.shipment.findFirst({
    where: { refNo: { equals: q, mode: 'insensitive' }, isDeleted: false },
    orderBy: { createdAt: 'desc' }, select: REF_SELECT,
  });
  if (!sh && q.length >= 8) {
    sh = await prisma.shipment.findFirst({
      where: { refNo: { startsWith: q, mode: 'insensitive' }, isDeleted: false },
      orderBy: { createdAt: 'desc' }, select: REF_SELECT,
    });
  }
  return sh;
};
const refreshCaches = () => {
  try { require('../controllers/freightForwarding.controller').clearStatsCache(); } catch (e) {}
  try { require('../services/reminders.service').clearOverviewCache(); } catch (e) {}
};

// Quotation software asks: "give me the details of this DSR reference" (to pre-fill a quotation)
router.get('/shipment/:ref', async (req, res) => {
  try {
    if (!guard(req, res)) return;
    if (String(req.params.ref || '').trim().length < 5) return res.status(400).json({ status: 'error', message: 'Enter the full reference number' });
    const sh = await findByRef(req.params.ref);
    if (!sh) return res.status(404).json({ status: 'error', message: 'No shipment with this reference in the DSR' });
    const f = sh.freightForwarding || {};
    const isExport = String(sh.importExport || '').toLowerCase() === 'export';
    res.json({
      status: 'success',
      data: {
        refNo: sh.refNo,
        stage: sh.shipmentStage || 'Enquiry',
        shipmentType: sh.shipmentType, importExport: sh.importExport,
        customerName: f.customerName || (isExport ? f.shipperName : f.consigneeName) || null,
        shipperName: f.shipperName || null, consigneeName: f.consigneeName || null,
        fromLocation: f.fromLocation || null, toLocation: f.toLocation || null,
        terms: f.terms || null, commodityName: f.commodityName || null,
        noOfPackages: f.noOfPackages ?? null,
        grossWeight: f.grossWeight == null ? null : Number(f.grossWeight),
        weight: f.weight == null ? null : Number(f.weight),
        cbm: f.cbm == null ? null : Number(f.cbm),
        containerType: f.containerType || null, noOfContainers: f.noOfContainers ?? null,
      },
    });
  } catch (err) {
    console.error('Integration lookup failed:', err);
    res.status(500).json({ status: 'error', message: 'Lookup failed' });
  }
});

// Quotation software tells the DSR: quotation sent ("Quoted") / customer nominated ("Nomination"),
// and optionally sends back details entered in the quotation:
//   updates: { fromLocation, toLocation, terms, commodityName, noOfPackages, grossWeight, weight, cbm }
//   - fields that are EMPTY in the DSR are filled in;
//   - fields that already have a value are only replaced when overwrite === true.
// "stage" is optional (omit it to send details only).
const UPDATE_FIELDS = {
  fromLocation: s, toLocation: s, terms: (v) => (s(v) ? s(v).toUpperCase() : null), commodityName: s,
  noOfPackages: i, grossWeight: n, weight: n, cbm: n,
};
router.post('/shipment/:ref/stage', async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const stage = req.body?.stage ? String(req.body.stage) : '';
    if (stage && !['Quoted', 'Nomination'].includes(stage)) return res.status(400).json({ status: 'error', message: 'stage must be Quoted or Nomination' });
    const quoteNo = s(req.body?.quoteNo);
    const sh = await findByRef(req.params.ref);
    if (!sh) return res.status(404).json({ status: 'error', message: 'No shipment with this reference in the DSR' });

    // 1) details coming back from the quotation
    const ff = sh.freightForwarding || null;
    const overwrite = req.body?.overwrite === true;
    const applied = [], skipped = [], ffData = {};
    const upd = req.body?.updates && typeof req.body.updates === 'object' ? req.body.updates : {};
    if (ff) {
      for (const key of Object.keys(UPDATE_FIELDS)) {
        if (!(key in upd)) continue;
        const val = UPDATE_FIELDS[key](upd[key]);
        if (val === null || val === undefined) continue;
        const cur = ff[key];
        const empty = cur === null || cur === undefined || cur === '';
        if (empty || overwrite) { ffData[key] = val; applied.push(key); } else skipped.push(key);
      }
    }

    // 2) stage (only moves forward)
    let moved = false, finalStage = sh.shipmentStage || '';
    const data = {};
    const notes = [];
    if (stage) {
      const allowedFrom = stage === 'Quoted' ? ['', 'Enquiry'] : ['', 'Enquiry', 'Quoted'];
      moved = allowedFrom.includes(finalStage);
      if (moved) { data.shipmentStage = stage; finalStage = stage; }
      notes.push(stage === 'Quoted'
        ? `Quotation${quoteNo ? ' ' + quoteNo : ''} prepared and sent`
        : `Customer nominated${quoteNo ? ' (quotation ' + quoteNo + ')' : ''}`);
    }
    if (applied.length) notes.push(`Details updated from quotation${quoteNo ? ' ' + quoteNo : ''}: ${applied.join(', ')}`);

    if (Object.keys(ffData).length) {
      await prisma.freightForwarding.update({ where: { shipmentId: sh.id }, data: ffData });
    }
    if (notes.length || Object.keys(data).length) {
      await prisma.shipment.update({
        where: { id: sh.id },
        data: {
          ...data,
          statusHistory: { create: notes.map((r) => ({ status: sh.currentStatus || 'ENQUIRY', remarks: r, changedBy: 'Quotation software' })) },
        },
      });
    }
    refreshCaches();
    res.json({ status: 'success', data: { refNo: sh.refNo, stage: finalStage, moved, applied, skipped } });
  } catch (err) {
    console.error('Integration stage update failed:', err);
    res.status(500).json({ status: 'error', message: 'Could not update the shipment' });
  }
});

module.exports = router;