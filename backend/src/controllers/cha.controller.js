const prisma = require('../utils/prisma');

// Helper: ensure CHA record exists
async function ensureCHA(shipmentId) {
  const existing = await prisma.cHA.findUnique({ where: { shipmentId } });
  if (!existing) {
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { cha: { create: {} } }
    });
  }
}

// UPDATE CHECKLIST (partial)
const updateChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const data = {};
    if (req.body.jobNo !== undefined) data.jobNo = req.body.jobNo;
    if (req.body.checklistDate) data.checklistDate = new Date(req.body.checklistDate);
    if (req.body.checklistApprovalDate) data.checklistApprovalDate = new Date(req.body.checklistApprovalDate);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { cha: { update: { data } } }, select: { id: true, cha: true } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE BOE (partial)
const updateBOE = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const data = {};
    if (req.body.boeNo !== undefined) data.boeNo = req.body.boeNo;
    if (req.body.boeDate) data.boeDate = new Date(req.body.boeDate);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { cha: { update: { data } } }, select: { id: true, cha: true } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE DO COLLECTION (partial)
const updateDOCollection = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const data = {};
    if (req.body.doCollectionDate) data.doCollectionDate = new Date(req.body.doCollectionDate);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { cha: { update: { data } } }, select: { id: true, cha: true } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE OOC (partial)
const updateOOC = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const data = {};
    if (req.body.oocDate) data.oocDate = new Date(req.body.oocDate);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { cha: { update: { data } } }, select: { id: true, cha: true } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE GATE PASS (partial)
const updateGatePass = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const data = {};
    if (req.body.gatePassDate) data.gatePassDate = new Date(req.body.gatePassDate);
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { cha: { update: { data } } }, select: { id: true, cha: true } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

// UPDATE POD (partial)
const updatePOD = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureCHA(id);
    const data = {};
    if (req.body.deliveryDate) data.deliveryDate = new Date(req.body.deliveryDate);
    if (req.body.trackingNumber !== undefined) data.trackingNumber = req.body.trackingNumber;
    if (Object.keys(data).length === 0) return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    const u = await prisma.shipment.update({ where: { id }, data: { cha: { update: { data } } }, select: { id: true, cha: true } });
    res.json({ status: 'success', data: u });
  } catch (e) { console.error(e); res.status(500).json({ status: 'error', message: 'Failed' }); }
};

module.exports = { updateChecklist, updateBOE, updateDOCollection, updateOOC, updateGatePass, updatePOD };