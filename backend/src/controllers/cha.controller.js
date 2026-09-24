const prisma = require('../utils/prisma');
const { recomputeCurrentStatus } = require('./freightForwarding.controller'); // ✅ NEW — shared dynamic status logic

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

function actorName(req) {
  return req.user?.name || req.user?.email || null;
}

// ─── CUSTOMS "HANDLED BY" AUTO-STAMP ───
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

// ✅ Every function below now calls recomputeCurrentStatus after saving,
// instead of manually forcing currentStatus forward — so clearing a date
// correctly moves the shipment's status back too, not just the frontend
// stepper icons.

// UPDATE CHECKLIST
const updateChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const data = {};
    const parts = [];
    if (req.body.jobNo !== undefined) { data.jobNo = req.body.jobNo; parts.push(`Job No: ${req.body.jobNo}`); }
    if (req.body.checklistDate !== undefined) { data.checklistDate = req.body.checklistDate ? new Date(req.body.checklistDate) : null; if (req.body.checklistDate) parts.push(`Checklist Date: ${req.body.checklistDate}`); }
    if (req.body.checklistApprovalDate !== undefined) { data.checklistApprovalDate = req.body.checklistApprovalDate ? new Date(req.body.checklistApprovalDate) : null; if (req.body.checklistApprovalDate) parts.push(`Approval Date: ${req.body.checklistApprovalDate}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { cha: { update: data }, statusHistory: { create: { status: 'CHECKLIST_APPROVED', remarks: parts.join(' | ') || 'Updated', changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
      await recomputeCurrentStatus(id);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE BOE
const updateBOE = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const data = {};
    const parts = [];
    if (req.body.boeNo !== undefined) { data.boeNo = req.body.boeNo; parts.push(`BOE No: ${req.body.boeNo}`); }
    if (req.body.boeDate !== undefined) { data.boeDate = req.body.boeDate ? new Date(req.body.boeDate) : null; if (req.body.boeDate) parts.push(`BOE Date: ${req.body.boeDate}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { cha: { update: data }, statusHistory: { create: { status: 'BOE_FILED', remarks: parts.join(' | ') || 'Updated', changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
      await recomputeCurrentStatus(id);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE DO COLLECTION
const updateDOCollection = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    if (req.body.doCollectionDate !== undefined) {
      const val = req.body.doCollectionDate ? new Date(req.body.doCollectionDate) : null;
      await prisma.shipment.update({ where: { id }, data: { cha: { update: { doCollectionDate: val } }, statusHistory: { create: { status: 'DO_COLLECTED', remarks: val ? `DO Collection Date: ${req.body.doCollectionDate}` : 'DO Collection date cleared', changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
      await recomputeCurrentStatus(id);
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
    if (req.body.oocDate !== undefined) {
      const val = req.body.oocDate ? new Date(req.body.oocDate) : null;
      await prisma.shipment.update({ where: { id }, data: { cha: { update: { oocDate: val } }, statusHistory: { create: { status: 'OOC_DONE', remarks: val ? `OOC Date: ${req.body.oocDate}` : 'OOC date cleared', changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
      await recomputeCurrentStatus(id);
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
    if (req.body.gatePassDate !== undefined) {
      const val = req.body.gatePassDate ? new Date(req.body.gatePassDate) : null;
      await prisma.shipment.update({ where: { id }, data: { cha: { update: { gatePassDate: val } }, statusHistory: { create: { status: 'GATE_PASS', remarks: val ? `Gate Pass Date: ${req.body.gatePassDate}` : 'Gate Pass date cleared', changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
      await recomputeCurrentStatus(id);
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
    const data = {};
    const parts = [];
    if (req.body.deliveryDate !== undefined) { data.deliveryDate = req.body.deliveryDate ? new Date(req.body.deliveryDate) : null; if (req.body.deliveryDate) parts.push(`Delivery Date: ${req.body.deliveryDate}`); }
    if (req.body.trackingNumber !== undefined) { data.trackingNumber = req.body.trackingNumber; parts.push(`Tracking No: ${req.body.trackingNumber}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { cha: { update: data }, statusHistory: { create: { status: 'DELIVERED', remarks: parts.join(' | ') || 'Updated', changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
      await recomputeCurrentStatus(id);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE SHIPPING BILL (SB)
const updateShippingBill = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const data = {};
    const parts = [];
    if (req.body.sbNo !== undefined) { data.sbNo = req.body.sbNo; parts.push(`SB No: ${req.body.sbNo}`); }
    if (req.body.sbDate !== undefined) { data.sbDate = req.body.sbDate ? new Date(req.body.sbDate) : null; if (req.body.sbDate) parts.push(`SB Date: ${req.body.sbDate}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { cha: { update: data }, statusHistory: { create: { status: 'SB_FILED', remarks: parts.join(' | ') || 'Updated', changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
      await recomputeCurrentStatus(id);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE LEO
const updateLEO = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    if (req.body.leoDate !== undefined) {
      const val = req.body.leoDate ? new Date(req.body.leoDate) : null;
      await prisma.shipment.update({ where: { id }, data: { cha: { update: { leoDate: val } }, statusHistory: { create: { status: 'LEO_DONE', remarks: val ? `LEO Date: ${req.body.leoDate}` : 'LEO date cleared', changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
      await recomputeCurrentStatus(id);
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
    if (req.body.handOverDate !== undefined) {
      const val = req.body.handOverDate ? new Date(req.body.handOverDate) : null;
      await prisma.shipment.update({ where: { id }, data: { cha: { update: { handOverDate: val } }, statusHistory: { create: { status: 'HAND_OVER', remarks: val ? `Hand Over Date: ${req.body.handOverDate}` : 'Hand Over date cleared', changedBy: actorName(req) } } } });
      await stampCustomsHandler(id, req);
      await recomputeCurrentStatus(id);
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { updateChecklist, updateBOE, updateDOCollection, updateOOC, updateGatePass, updatePOD, updateShippingBill, updateLEO, updateHandOver };