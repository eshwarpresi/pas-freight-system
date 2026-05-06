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

// UPDATE CHECKLIST
const updateChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const data = {};
    const parts = [];
    if (req.body.jobNo !== undefined) { data.jobNo = req.body.jobNo; parts.push(`Job No: ${req.body.jobNo}`); }
    if (req.body.checklistDate) { data.checklistDate = new Date(req.body.checklistDate); parts.push(`Checklist Date: ${req.body.checklistDate}`); }
    if (req.body.checklistApprovalDate) { data.checklistApprovalDate = new Date(req.body.checklistApprovalDate); parts.push(`Approval Date: ${req.body.checklistApprovalDate}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'CHECKLIST_APPROVED', cha: { update: { data } }, statusHistory: { create: { status: 'CHECKLIST_APPROVED', remarks: parts.join(' | ') } } } });
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
    if (req.body.boeDate) { data.boeDate = new Date(req.body.boeDate); parts.push(`BOE Date: ${req.body.boeDate}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'BOE_FILED', cha: { update: { data } }, statusHistory: { create: { status: 'BOE_FILED', remarks: parts.join(' | ') } } } });
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
    if (req.body.doCollectionDate) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'DO_COLLECTED', cha: { update: { doCollectionDate: new Date(req.body.doCollectionDate) } }, statusHistory: { create: { status: 'DO_COLLECTED', remarks: `DO Collection Date: ${req.body.doCollectionDate}` } } } });
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
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'OOC_DONE', cha: { update: { oocDate: new Date(req.body.oocDate) } }, statusHistory: { create: { status: 'OOC_DONE', remarks: `OOC Date: ${req.body.oocDate}` } } } });
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
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'GATE_PASS', cha: { update: { gatePassDate: new Date(req.body.gatePassDate) } }, statusHistory: { create: { status: 'GATE_PASS', remarks: `Gate Pass Date: ${req.body.gatePassDate}` } } } });
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
    if (req.body.deliveryDate) { data.deliveryDate = new Date(req.body.deliveryDate); parts.push(`Delivery Date: ${req.body.deliveryDate}`); }
    if (req.body.trackingNumber !== undefined) { data.trackingNumber = req.body.trackingNumber; parts.push(`Tracking No: ${req.body.trackingNumber}`); }
    if (Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id }, data: { currentStatus: 'DELIVERED', cha: { update: { data } }, statusHistory: { create: { status: 'DELIVERED', remarks: parts.join(' | ') } } } });
    }
    const s = await getFullShipment(id);
    res.json({ status: 'success', data: s });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { updateChecklist, updateBOE, updateDOCollection, updateOOC, updateGatePass, updatePOD };