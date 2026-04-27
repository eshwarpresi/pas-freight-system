const express = require('express');
const router = express.Router();
const freightController = require('../controllers/freightForwarding.controller');

// CREATE - New Shipment Enquiry
router.post('/shipments', freightController.createShipment);

// GET - Export to Excel (MUST be before /:id route)
router.get('/export', freightController.exportShipments);

// GET - All Shipments (with filters)
router.get('/shipments', freightController.getAllShipments);

// GET - Single Shipment by ID
router.get('/shipments/:id', freightController.getShipmentById);

// UPDATE - Rates
router.put('/shipments/:id/rates', freightController.updateRates);

// UPDATE - Nomination
router.put('/shipments/:id/nomination', freightController.updateNomination);

// UPDATE - Booking
router.put('/shipments/:id/booking', freightController.updateBooking);

// UPDATE - Schedule (ETD/ETA)
router.put('/shipments/:id/schedule', freightController.updateSchedule);

// UPDATE - AWB Details
router.put('/shipments/:id/awb', freightController.updateAWB);

module.exports = router;