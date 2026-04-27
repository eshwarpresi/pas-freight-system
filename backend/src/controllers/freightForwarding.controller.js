const prisma = require('../utils/prisma');

// ==========================================
// CREATE NEW SHIPMENT (ENQUIRY)
// ==========================================
const createShipment = async (req, res) => {
  try {
    const {
      refNo,
      enquiryDate,
      noOfPackages,
      consigneeName,
      shipperName,
      agent
    } = req.body;

    // Validate required fields
    if (!refNo) {
      return res.status(400).json({
        status: 'error',
        message: 'Reference Number (refNo) is required'
      });
    }

    // Check if shipment with this refNo already exists
    const existingShipment = await prisma.shipment.findUnique({
      where: { refNo }
    });

    if (existingShipment) {
      return res.status(400).json({
        status: 'error',
        message: 'Shipment with this Reference Number already exists'
      });
    }

    // Create shipment with freight forwarding details
    const shipment = await prisma.shipment.create({
      data: {
        refNo,
        currentStatus: 'ENQUIRY',
        freightForwarding: {
          create: {
            enquiryDate: enquiryDate ? new Date(enquiryDate) : null,
            noOfPackages: noOfPackages ? parseInt(noOfPackages) : null,
            consigneeName,
            shipperName,
            agent
          }
        },
        statusHistory: {
          create: {
            status: 'ENQUIRY',
            remarks: 'Shipment enquiry created'
          }
        }
      },
      include: {
        freightForwarding: true,
        statusHistory: true
      }
    });

    res.status(201).json({
      status: 'success',
      data: shipment
    });

  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create shipment'
    });
  }
};

// ==========================================
// EXPORT SHIPMENTS TO EXCEL
// ==========================================
const exportShipments = async (req, res) => {
  try {
    const { status, search, isArchived } = req.query;
    
    const where = {
      isArchived: isArchived === 'true' ? true : false
    };

    if (status) where.currentStatus = status;
    
    if (search) {
      where.OR = [
        { refNo: { contains: search } },
        { freightForwarding: { consigneeName: { contains: search } } },
        { freightForwarding: { shipperName: { contains: search } } }
      ];
    }

    const shipments = await prisma.shipment.findMany({
      where,
      include: {
        freightForwarding: true,
        cha: true,
        accounts: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const { exportShipmentsToExcel } = require('../utils/excelExport');
    await exportShipmentsToExcel(shipments, res);

  } catch (error) {
    console.error('Error exporting shipments:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to export shipments'
    });
  }
};

// ==========================================
// GET ALL SHIPMENTS (WITH FILTERS)
// ==========================================
const getAllShipments = async (req, res) => {
  try {
    const { status, search, isArchived, page = 1, limit = 20 } = req.query;
    
    // Build where clause
    const where = {
      isArchived: isArchived === 'true' ? true : false
    };

    // Filter by status
    if (status) {
      where.currentStatus = status;
    }

    // Search by refNo, consignee, shipper
    if (search) {
      where.OR = [
        { refNo: { contains: search } },
        { 
          freightForwarding: {
            consigneeName: { contains: search }
          }
        },
        {
          freightForwarding: {
            shipperName: { contains: search }
          }
        }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: {
          freightForwarding: true,
          cha: true,
          accounts: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.shipment.count({ where })
    ]);

    res.json({
      status: 'success',
      data: shipments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch shipments'
    });
  }
};

// ==========================================
// GET SINGLE SHIPMENT BY ID
// ==========================================
const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        freightForwarding: true,
        cha: true,
        accounts: true,
        statusHistory: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!shipment) {
      return res.status(404).json({
        status: 'error',
        message: 'Shipment not found'
      });
    }

    res.json({
      status: 'success',
      data: shipment
    });

  } catch (error) {
    console.error('Error fetching shipment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch shipment'
    });
  }
};

// ==========================================
// UPDATE RATES
// ==========================================
const updateRates = async (req, res) => {
  try {
    const { id } = req.params;
    const { sellingRate, weight } = req.body;

    if (!sellingRate || !weight) {
      return res.status(400).json({
        status: 'error',
        message: 'Selling Rate and Weight are required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'RATES_ADDED',
        freightForwarding: {
          update: {
            sellingRate: parseFloat(sellingRate),
            weight: parseFloat(weight)
          }
        },
        statusHistory: {
          create: {
            status: 'RATES_ADDED',
            remarks: `Rates added - Selling Rate: ${sellingRate}, Weight: ${weight}`
          }
        }
      },
      include: {
        freightForwarding: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating rates:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update rates'
    });
  }
};

// ==========================================
// UPDATE NOMINATION
// ==========================================
const updateNomination = async (req, res) => {
  try {
    const { id } = req.params;
    const { nominationDate } = req.body;

    if (!nominationDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Nomination Date is required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'NOMINATED',
        freightForwarding: {
          update: {
            nominationDate: new Date(nominationDate)
          }
        },
        statusHistory: {
          create: {
            status: 'NOMINATED',
            remarks: `Nominated on ${nominationDate}`
          }
        }
      },
      include: {
        freightForwarding: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating nomination:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update nomination'
    });
  }
};

// ==========================================
// UPDATE BOOKING
// ==========================================
const updateBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate } = req.body;

    if (!bookingDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Booking Date is required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'BOOKED',
        freightForwarding: {
          update: {
            bookingDate: new Date(bookingDate)
          }
        },
        statusHistory: {
          create: {
            status: 'BOOKED',
            remarks: `Booked on ${bookingDate}`
          }
        }
      },
      include: {
        freightForwarding: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update booking'
    });
  }
};

// ==========================================
// UPDATE SCHEDULE (ETD/ETA)
// ==========================================
const updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { etd, eta } = req.body;

    if (!etd || !eta) {
      return res.status(400).json({
        status: 'error',
        message: 'ETD and ETA are required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'SCHEDULED',
        freightForwarding: {
          update: {
            etd: new Date(etd),
            eta: new Date(eta)
          }
        },
        statusHistory: {
          create: {
            status: 'SCHEDULED',
            remarks: `Scheduled - ETD: ${etd}, ETA: ${eta}`
          }
        }
      },
      include: {
        freightForwarding: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update schedule'
    });
  }
};

// ==========================================
// UPDATE AWB DETAILS
// ==========================================
const updateAWB = async (req, res) => {
  try {
    const { id } = req.params;
    const { mawb, hawb, awbDate } = req.body;

    if (!mawb || !hawb) {
      return res.status(400).json({
        status: 'error',
        message: 'MAWB and HAWB are required'
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        currentStatus: 'AWB_GENERATED',
        freightForwarding: {
          update: {
            mawb,
            hawb,
            awbDate: awbDate ? new Date(awbDate) : new Date()
          }
        },
        statusHistory: {
          create: {
            status: 'AWB_GENERATED',
            remarks: `AWB Generated - MAWB: ${mawb}, HAWB: ${hawb}`
          }
        }
      },
      include: {
        freightForwarding: true,
        statusHistory: true
      }
    });

    res.json({
      status: 'success',
      data: updatedShipment
    });

  } catch (error) {
    console.error('Error updating AWB:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update AWB details'
    });
  }
};

module.exports = {
  createShipment,
  exportShipments,
  getAllShipments,
  getShipmentById,
  updateRates,
  updateNomination,
  updateBooking,
  updateSchedule,
  updateAWB
};