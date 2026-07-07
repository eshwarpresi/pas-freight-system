const express = require('express');
const router = express.Router();
const accountsController = require('../controllers/accounts.controller');

// ─── UPDATE - Generate Invoice ───
router.put('/shipments/:id/invoice', accountsController.updateInvoice);

// ─── UPDATE - Invoice Sending ───
router.put('/shipments/:id/invoice-send', accountsController.updateInvoiceSending);

// ─── GET - All invoices (for tracking) ───
router.get('/invoices', accountsController.getAllInvoices);

// ─── UPDATE - Auto-Archive when invoice is complete ───
// This is handled inside the controllers above

module.exports = router;