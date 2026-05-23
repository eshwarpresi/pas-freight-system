const express = require('express');
const router = express.Router();
const chaController = require('../controllers/cha.controller');

// UPDATE - Checklist
router.put('/shipments/:id/checklist', chaController.updateChecklist);

// UPDATE - BOE (Bill of Entry)
router.put('/shipments/:id/boe', chaController.updateBOE);

// UPDATE - DO Collection
router.put('/shipments/:id/do-collection', chaController.updateDOCollection);

// UPDATE - OOC (Out of Charge)
router.put('/shipments/:id/ooc', chaController.updateOOC);

// UPDATE - Gate Pass
router.put('/shipments/:id/gate-pass', chaController.updateGatePass);

// UPDATE - POD (Proof of Delivery)
router.put('/shipments/:id/pod', chaController.updatePOD);

// UPDATE - Shipping Bill (SB)
router.put('/shipments/:id/shipping-bill', chaController.updateShippingBill);

// UPDATE - LEO
router.put('/shipments/:id/leo', chaController.updateLEO);

// UPDATE - Hand Over
router.put('/shipments/:id/hand-over', chaController.updateHandOver);

module.exports = router;