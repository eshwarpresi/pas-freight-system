const express = require('express');
const router = express.Router();
const chaController = require('../controllers/cha.controller');

// UPDATE - Checklist
router.put('/shipments/:id/checklist', chaController.updateChecklist);

// UPDATE - BOE (Bill of Entry)
router.put('/shipments/:id/boe', chaController.updateBOE);

// UPDATE - DO Collection
router.put('/shipments/:id/do-collection', chaController.updateDOCollection);

// UPDATE - Status (Manual text)
router.put('/shipments/:id/status', chaController.updateStatus);

// UPDATE - OOC (Out of Charge)
router.put('/shipments/:id/ooc', chaController.updateOOC);

// UPDATE - Gate Pass
router.put('/shipments/:id/gate-pass', chaController.updateGatePass);

// UPDATE - POD (Proof of Delivery)
router.put('/shipments/:id/pod', chaController.updatePOD);

module.exports = router;