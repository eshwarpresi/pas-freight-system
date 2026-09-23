const prisma = require('../utils/prisma');

async function ensureCHA(shipmentId) {
  const existing = await prisma.cHA.findUnique({ where: { shipmentId } });
  if (!existing) {
    await prisma.shipment.update({ where: { id: shipmentId }, data: { cha: { create: {} } } });
  }
}

async function getFullShipment(id) {
  return await prisma.shipment.findUnique({
    where: { id },
    include: { freightForwarding: true, cha: true, accounts: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 } }
  });
}

// Same pattern as freightForwarding.controller.js — resolves the logged-in
// user's display name for status-history attribution.
function actorName(req) {
  return req.user?.name || req.user?.email || null;
}

// ─── PREVENT CLEARING A FIELD THAT ALREADY HAS A VALUE (NEW) ───
// Same rule as freightForwarding.controller.js: once a field has real
// data, it can only be REPLACED, never wiped back to blank. This matters
// most here for jobNo, boeNo, sbNo, and trackingNumber — the only CHA
// fields where the frontend can send an empty string to explicitly clear
// them (everything else here only writes when a real value is given).
function isBlank(v) {
  return v === undefined || v === null || v === '';
}
function guardAgainstClearing(currentRecord, incomingData) {
  const safeData = {};
  const blockedFields = [];
  for (const [key, newVal] of Object.entries(incomingData)) {
    const currentVal = currentRecord ? currentRecord[key] : undefined;
    if (!isBlank(currentVal) && isBlank(newVal)) {
      blockedFields.push(key);
    } else {
      safeData[key] = newVal;
    }
  }
  return { safeData, blockedFields };
}

// ─── CUSTOMS "HANDLED BY" AUTO-STAMP (NEW) ───
// The first time anyone in Customs acts on a shipment, this stamps their
// id+name onto the shipment permanently — powers the visible "Customs:
// <name>" badge and the Team Performance report. Only fires once per
// shipment (checks customsHandledById is still null) so a later handoff
// to a second Customs person doesn't overwrite who originally picked it
// up; that handoff is still fully captured via statusHistory.changedBy.
async function stampCustomsHandler(id, req) {
  if (!req.user?.id) return;
  const shipment = await prisma.shipment.findUnique({ where: { id }, select: { customsHandledById: true } });
  if (shipment && !shipment.customsHandledById) {
    await prisma.shipment.update({
      where: { id },
      data: { customsHandledById: req.user.id, customsHandledByName: actorName(req) }
    });
  }
}

// UPDATE CHECKLIST
const updateChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const rawData = {};
    const parts = [];
    if (req.body.jobNo !== undefined) { rawData.jobNo = req.body.jobNo; }
    if (req.body.checklistDate) { rawData.checklistDate = new Date(req.body.checklistDate); parts.push(`Checklist Date: ${req.body.checklistDate}`); }
    if (req.body.checklistApprovalDate) { rawData.checklistApprovalDate = new Date(req.body.checklistApprovalDate); parts.push(`Approval Date: ${req.body.checklistApprovalDate}`); }

    const current = await prisma.cHA.findUnique({ where: { shipmentId: id }, select: { jobNo: true } });
    const { safeData: data, blockedFields } = guardAgainstClearing(current, rawData);
    if (data.jobNo !== undefined) parts.push(`Job No: ${data.jobNo}`);

    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'CHECKLIST_APPROVED', cha: { update: data }, statusHistory: { create: { status: 'CHECKLIST_APPROVED', remarks: parts.join(' | '), changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s, ...(blockedFields.length > 0 && { message: 'Already-filled fields cannot be cleared — only changed.' }) });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE BOE
const updateBOE = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const rawData = {};
    const parts = [];
    if (req.body.boeNo !== undefined) { rawData.boeNo = req.body.boeNo; }
    if (req.body.boeDate) { rawData.boeDate = new Date(req.body.boeDate); parts.push(`BOE Date: ${req.body.boeDate}`); }

    const current = await prisma.cHA.findUnique({ where: { shipmentId: id }, select: { boeNo: true } });
    const { safeData: data, blockedFields } = guardAgainstClearing(current, rawData);
    if (data.boeNo !== undefined) parts.push(`BOE No: ${data.boeNo}`);

    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'BOE_FILED', cha: { update: data }, statusHistory: { create: { status: 'BOE_FILED', remarks: parts.join(' | '), changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s, ...(blockedFields.length > 0 && { message: 'Already-filled fields cannot be cleared — only changed.' }) });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE DO COLLECTION
const updateDOCollection = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    if (req.body.doCollectionDate) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'DO_COLLECTED', cha: { update: { doCollectionDate: new Date(req.body.doCollectionDate) } }, statusHistory: { create: { status: 'DO_COLLECTED', remarks: `DO Collection Date: ${req.body.doCollectionDate}`, changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE OOC
const updateOOC = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    if (req.body.oocDate) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'OOC_DONE', cha: { update: { oocDate: new Date(req.body.oocDate) } }, statusHistory: { create: { status: 'OOC_DONE', remarks: `OOC Date: ${req.body.oocDate}`, changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE GATE PASS
const updateGatePass = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    if (req.body.gatePassDate) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'GATE_PASS', cha: { update: { gatePassDate: new Date(req.body.gatePassDate) } }, statusHistory: { create: { status: 'GATE_PASS', remarks: `Gate Pass Date: ${req.body.gatePassDate}`, changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE POD
const updatePOD = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const rawData = {};
    const parts = [];
    if (req.body.deliveryDate) { rawData.deliveryDate = new Date(req.body.deliveryDate); parts.push(`Delivery Date: ${req.body.deliveryDate}`); }
    if (req.body.trackingNumber !== undefined) { rawData.trackingNumber = req.body.trackingNumber; }

    const current = await prisma.cHA.findUnique({ where: { shipmentId: id }, select: { trackingNumber: true } });
    const { safeData: data, blockedFields } = guardAgainstClearing(current, rawData);
    if (data.trackingNumber !== undefined) parts.push(`Tracking No: ${data.trackingNumber}`);

    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'DELIVERED', cha: { update: data }, statusHistory: { create: { status: 'DELIVERED', remarks: parts.join(' | '), changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s, ...(blockedFields.length > 0 && { message: 'Already-filled fields cannot be cleared — only changed.' }) });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE SHIPPING BILL (SB)
const updateShippingBill = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const rawData = {};
    const parts = [];
    if (req.body.sbNo !== undefined) { rawData.sbNo = req.body.sbNo; }
    if (req.body.sbDate) { rawData.sbDate = new Date(req.body.sbDate); parts.push(`SB Date: ${req.body.sbDate}`); }

    const current = await prisma.cHA.findUnique({ where: { shipmentId: id }, select: { sbNo: true } });
    const { safeData: data, blockedFields } = guardAgainstClearing(current, rawData);
    if (data.sbNo !== undefined) parts.push(`SB No: ${data.sbNo}`);

    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'SB_FILED', cha: { update: data }, statusHistory: { create: { status: 'SB_FILED', remarks: parts.join(' | '), changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s, ...(blockedFields.length > 0 && { message: 'Already-filled fields cannot be cleared — only changed.' }) });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE LEO
const updateLEO = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    if (req.body.leoDate) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'LEO_DONE', cha: { update: { leoDate: new Date(req.body.leoDate) } }, statusHistory: { create: { status: 'LEO_DONE', remarks: `LEO Date: ${req.body.leoDate}`, changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE HAND OVER
const updateHandOver = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    if (req.body.handOverDate) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'HAND_OVER', cha: { update: { handOverDate: new Date(req.body.handOverDate) } }, statusHistory: { create: { status: 'HAND_OVER', remarks: `Hand Over Date: ${req.body.handOverDate}`, changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { updateChecklist, updateBOE, updateDOCollection, updateOOC, updateGatePass, updatePOD, updateShippingBill, updateLEO, updateHandOver };