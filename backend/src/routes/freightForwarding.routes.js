const express = require('express');
const router = express.Router();
const freightController = require('../controllers/freightForwarding.controller');

// ─── CREATE ───
router.post('/shipments', freightController.createShipment);

// ─── EXPORT (MUST be before /:id route) ───
router.get('/export', freightController.exportShipments);

// ─── GET ALL SHIPMENTS (with filters) ───
router.get('/shipments', freightController.getAllShipments);

// ─── GET BIN (DELETED) SHIPMENTS ───
router.get('/shipments/bin', freightController.getBinShipments);

// ─── GET BIN COUNT ───
router.get('/shipments/bin/count', freightController.getBinCount);

// ─── GET SHIPMENT STATS (must stay before /:id route) ───
router.get('/shipments/stats', freightController.getShipmentStats);

// ─── GET REFERENCE CODE STATS (must stay before /:id route) ───
router.get('/shipments/reference-codes', freightController.getReferenceCodeStats);

// ─── GET SHIPMENTS FOR A REFERENCE CODE (NEW — must stay before /:id route) ───
router.get('/shipments/by-reference-code', freightController.getShipmentsByReferenceCode);

// ─── REFERENCE NUMBER AUTO-GENERATION (NEW) ───
router.get('/reference-prefixes', freightController.getReferencePrefixes);
router.post('/reference-prefixes', freightController.createReferencePrefix);
router.put('/reference-prefixes/:code', freightController.updateReferencePrefix);
router.delete('/reference-prefixes/:code', freightController.deleteReferencePrefix);
router.post('/reference-number/generate', freightController.generateReferenceNumber);

// ─── TEMPORARY ONE-TIME SEED ROUTE — DELETE AFTER USE ───
router.get('/temp-seed-counter/:value', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const startValue = parseInt(req.params.value, 10);
    if (isNaN(startValue)) return res.status(400).json({ status: 'error', message: 'Invalid number' });
    const existing = await prisma.referenceCounter.findUnique({ where: { id: 'global' } });
    if (existing) {
      return res.json({ status: 'success', message: `Counter already exists at ${existing.value}. Not changed.` });
    }
    const created = await prisma.referenceCounter.create({ data: { id: 'global', value: startValue } });
    res.json({ status: 'success', message: `Counter seeded at ${created.value}. Next generated number will be ${created.value + 1}.` });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ─── GET SINGLE SHIPMENT ───
router.get('/shipments/:id', freightController.getShipmentById);

// ─── SOFT DELETE (MOVE TO BIN) ───
router.delete('/shipments/:id/delete', freightController.softDeleteShipment);

// ─── RESTORE FROM BIN ───
router.put('/shipments/:id/restore', freightController.restoreShipment);

// ─── BULK RESTORE FROM BIN ───
router.put('/shipments/bin/restore-bulk', freightController.bulkRestoreShipments);

// ─── DELETE SINGLE (Original - keeping for backward compatibility) ───
// This is a hard delete - use with caution or remove entirely
router.delete('/shipments/:id', freightController.deleteShipment);

// ─── DELETE ALL ───
router.delete('/shipments', freightController.deleteAllShipments);

// ─── UPDATE ROUTES ───
router.put('/shipments/:id/refno', freightController.updateRefNo);
router.put('/shipments/:id/rates', freightController.updateRates);
router.put('/shipments/:id/cbm', freightController.updateCBM);
router.put('/shipments/:id/nomination', freightController.updateNomination);
router.put('/shipments/:id/booking', freightController.updateBooking);
router.put('/shipments/:id/schedule', freightController.updateSchedule);
router.put('/shipments/:id/awb', freightController.updateAWB);
router.put('/shipments/:id/stage', freightController.updateStage);
router.put('/shipments/:id/remarks', freightController.updateRemarks);
router.put('/shipments/:id/fromlocation', freightController.updateFromLocation);
router.put('/shipments/:id/tolocation', freightController.updateToLocation);
router.put('/shipments/:id/terms', freightController.updateTerms);
router.put('/shipments/:id/portlocation', freightController.updatePortLocation);
router.put('/shipments/:id/shipmenttype', freightController.updateShipmentType);
router.put('/shipments/:id/importexport', freightController.updateImportExport);
router.put('/shipments/:id/consignee', freightController.updateConsignee);
router.put('/shipments/:id/shipper', freightController.updateShipper);
router.put('/shipments/:id/agent', freightController.updateAgent);

module.exports = router;