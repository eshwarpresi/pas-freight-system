const prisma = require('../utils/prisma');

// ==========================================
// UPDATE CHECKLIST
// ==========================================
const updateChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    const { jobNo, checklistDate, checklistApprovalDate } = req.body;

    if (!jobNo || !checklistDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Job No and Checklist Date are required'
      });
    }

    // First check if CHA record exists, if not create it
    const existingCHA = await prisma.cHA.findUnique({
      where: { shipmentId: id }
    });

    let updatedShipment;

    if (existingCHA) {
      updatedShipment = await prisma.shipment.update({
        where: { id },
        data: {
          currentStatus: 'CHECKLIST_APPROVED',
          cha: {
            update: {
              jobNo,
              checklistDate: new Date(checklistDate),
              checklistApprovalDate: checklistApprovalDate ? new Date(checklistApprovalDate) : null
            }
          },
          statusHistory: {
            create: {
              status: 'CHECKLIST_APPROVED',
              remarks: `Checklist approved - Job No: ${jobNo}`
            }
          }
        },
        include: {
          cha: true,
          statusHistory: true
        }
      });
    } else {
      updatedShipment = await prisma.shipment.update({
        where: { id },
        data: {
          currentStatus: 'CHECKLIST_APPROVED',
          cha: {
            create: {
              jobNo,
              checklistDate: new Date(checklistDate),
              checklistApprovalDate: checklistApprovalDate ? new Date(checklistApprovalDate) : null
            }
          },
          statusHistory: {
            create: {
              status: 'CHECKLIST_APPROVED',
              remarks: `Checklist approved - Job No: ${jobNo}`
            }
          }
        },
        include: {
          cha: true,
          statusHistory: true
        }
      });
    }

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating checklist:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update checklist'
    });
  }
};

// ==========================================
// UPDATE BOE (Bill of Entry)
// ==========================================
const updateBOE = async (req, res) => {
  try {
    const { id } = req.params;
    const { boeNo, boeDate } = req.body;

    if (!boeNo || !boeDate) {
      return res.status(400).json({
        status: 'error',
        message: 'BOE Number and Date are required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'BOE_FILED',
        cha: {
          update: {
            boeNo,
            boeDate: new Date(boeDate)
          }
        },
        statusHistory: {
          create: {
            status: 'BOE_FILED',
            remarks: `BOE Filed - BOE No: ${boeNo}`
          }
        }
      },
      include: {
        cha: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating BOE:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update BOE'
    });
  }
};

// ==========================================
// UPDATE DO COLLECTION
// ==========================================
const updateDOCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const { doCollectionDate } = req.body;

    if (!doCollectionDate) {
      return res.status(400).json({
        status: 'error',
        message: 'DO Collection Date is required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'DO_COLLECTED',
        cha: {
          update: {
            doCollectionDate: new Date(doCollectionDate)
          }
        },
        statusHistory: {
          create: {
            status: 'DO_COLLECTED',
            remarks: `DO Collected on ${doCollectionDate}`
          }
        }
      },
      include: {
        cha: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating DO Collection:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update DO Collection'
    });
  }
};

// ==========================================
// UPDATE STATUS (Manual Text)
// ==========================================
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        status: 'error',
        message: 'Status text is required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        cha: {
          update: {
            status: status
          }
        },
        statusHistory: {
          create: {
            status: 'CHECKLIST_APPROVED', // Keeps current status
            remarks: `Customs Status Update: ${status}`
          }
        }
      },
      include: {
        cha: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update status'
    });
  }
};

// ==========================================
// UPDATE OOC (Out of Charge)
// ==========================================
const updateOOC = async (req, res) => {
  try {
    const { id } = req.params;
    const { oocDate } = req.body;

    if (!oocDate) {
      return res.status(400).json({
        status: 'error',
        message: 'OOC Date is required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'OOC_DONE',
        cha: {
          update: {
            oocDate: new Date(oocDate)
          }
        },
        statusHistory: {
          create: {
            status: 'OOC_DONE',
            remarks: `Out of Charge on ${oocDate}`
          }
        }
      },
      include: {
        cha: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating OOC:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update OOC'
    });
  }
};

// ==========================================
// UPDATE GATE PASS
// ==========================================
const updateGatePass = async (req, res) => {
  try {
    const { id } = req.params;
    const { gatePassDate } = req.body;

    if (!gatePassDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Gate Pass Date is required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'GATE_PASS',
        cha: {
          update: {
            gatePassDate: new Date(gatePassDate)
          }
        },
        statusHistory: {
          create: {
            status: 'GATE_PASS',
            remarks: `Gate Pass issued on ${gatePassDate}`
          }
        }
      },
      include: {
        cha: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating Gate Pass:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update Gate Pass'
    });
  }
};

// ==========================================
// UPDATE POD (Proof of Delivery)
// ==========================================
const updatePOD = async (req, res) => {
  try {
    const { id } = req.params;
    const { deliveryDate, trackingNumber } = req.body;

    if (!deliveryDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Delivery Date is required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'DELIVERED',
        cha: {
          update: {
            deliveryDate: new Date(deliveryDate),
            trackingNumber: trackingNumber || null
          }
        },
        statusHistory: {
          create: {
            status: 'DELIVERED',
            remarks: `Delivered on ${deliveryDate}${trackingNumber ? ' - Tracking: ' + trackingNumber : ''}`
          }
        }
      },
      include: {
        cha: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating POD:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update POD'
    });
  }
};

module.exports = {
  updateChecklist,
  updateBOE,
  updateDOCollection,
  updateStatus,
  updateOOC,
  updateGatePass,
  updatePOD
};