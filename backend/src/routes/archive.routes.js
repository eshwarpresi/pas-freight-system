const express = require('express');
const router = express.Router();

// Archive a shipment - keep current status, don't force COMPLETED
router.put('/shipments/:id/archive', async (req, res) => {
  const prisma = require('../utils/prisma');
  try {
    const { id } = req.params;
    
    const shipment = await prisma.shipment.update({
      where: { id },
      data: {
        isArchived: true,
        statusHistory: {
          create: {
            status: 'COMPLETED',
            remarks: 'Shipment archived'
          }
        }
      },
      include: {
        freightForwarding: true,
        cha: true,
        accounts: true,
        statusHistory: true
      }
    });

    res.json({ status: 'success', data: shipment });
  } catch (error) {
    console.error('Error archiving shipment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to archive' });
  }
});

// Unarchive - keep original status
router.put('/shipments/:id/unarchive', async (req, res) => {
  const prisma = require('../utils/prisma');
  try {
    const { id } = req.params;
    
    const shipment = await prisma.shipment.update({
      where: { id },
      data: { isArchived: false },
      include: {
        freightForwarding: true,
        cha: true,
        accounts: true,
        statusHistory: true
      }
    });

    res.json({ status: 'success', data: shipment });
  } catch (error) {
    console.error('Error unarchiving shipment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to unarchive' });
  }
});

module.exports = router;