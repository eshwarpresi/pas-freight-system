const express = require('express');
const router = express.Router();
const accountsController = require('../controllers/accounts.controller');

// UPDATE - Generate Invoice
router.put('/shipments/:id/invoice', accountsController.updateInvoice);

// UPDATE - Invoice Sending
router.put('/shipments/:id/invoice-send', accountsController.updateInvoiceSending);

// GET - All invoices (for tracking)
router.get('/invoices', accountsController.getAllInvoices);

module.exports = router;