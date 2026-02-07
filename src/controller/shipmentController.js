// controllers/shipmentController.js
const Shipment = require('../models/shipmentModel');
const User = require('../models/userModel');

// ==================== CUSTOMER FUNCTIONS ====================

/**
 * Create new shipment request (Customer only)
 */
const createShipmentRequest = async (req, res) => {
  try {
    const {
      shipmentType,
      shippingMode,
      origin,
      destination,
      cargoDetails,
      pickupRequired,
      pickupDetails,
      customerNotes
    } = req.body;

    // Get customer from authenticated user
    const customer = await User.findById(req.user.userId);
    if (!customer || customer.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: "Only customers can create shipment requests"
      });
    }

    // Validation
    if (!shipmentType || !origin || !destination || !cargoDetails) {
      return res.status(400).json({
        success: false,
        message: "Shipment type, origin, destination, and cargo details are required"
      });
    }

    // Create shipment
    const shipment = new Shipment({
      customer: customer._id,
      customerName: `${customer.firstName} ${customer.lastName}`,
      customerEmail: customer.email,
      shipmentType,
      shippingMode: shippingMode || 'DDP',
      origin,
      destination,
      cargoDetails,
      pickupRequired: pickupRequired || false,
      pickupDetails: pickupRequired ? pickupDetails : null,
      customerNotes: customerNotes || "",
      currentStatus: 'Booking Requested',
      createdBy: customer._id,
      
      // Add initial milestone
      milestones: [{
        status: 'Booking Requested',
        location: origin.warehouse,
        notes: 'Shipment booking requested by customer',
        updatedBy: customer._id
      }]
    });

    await shipment.save();

    res.status(201).json({
      success: true,
      message: "Shipment request created successfully",
      data: {
        shipmentNumber: shipment.shipmentNumber,
        trackingNumber: shipment.trackingNumber,
        currentStatus: shipment.currentStatus,
        estimatedDeparture: shipment.estimatedDeparture,
        estimatedArrival: shipment.estimatedArrival
      }
    });

  } catch (error) {
    console.error("Create shipment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create shipment request",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

/**
 * Get customer's own shipments
 */
const getMyShipments = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { status, page = 1, limit = 10 } = req.query;

    // Build query
    const query = { customer: customerId, isActive: true };
    if (status) {
      query.currentStatus = status;
    }

    // Pagination
    const skip = (page - 1) * limit;

    const shipments = await Shipment.find(query)
      .select('-internalNotes -updatedBy -assignedOperator')
      .sort({ bookingDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('assignedTo', 'firstName lastName email phone');

    const total = await Shipment.countDocuments(query);

    res.status(200).json({
      success: true,
      count: shipments.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: shipments
    });

  } catch (error) {
    console.error("Get my shipments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get shipments",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

/**
 * Get shipment details (Customer view)
 */
const getShipmentDetails = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const customerId = req.user.userId;

    const shipment = await Shipment.findOne({
      _id: shipmentId,
      customer: customerId,
      isActive: true
    })
    .select('-internalNotes')
    .populate('assignedTo', 'firstName lastName email phone department')
    .populate('customer', 'firstName lastName email phone companyName');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found or access denied"
      });
    }

    res.status(200).json({
      success: true,
      data: shipment
    });

  } catch (error) {
    console.error("Get shipment details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get shipment details",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

/**
 * Cancel shipment request (Customer only, before confirmation)
 */
const cancelShipmentRequest = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const customerId = req.user.userId;

    const shipment = await Shipment.findOne({
      _id: shipmentId,
      customer: customerId,
      currentStatus: 'Booking Requested'
    });

    if (!shipment) {
      return res.status(400).json({
        success: false,
        message: "Shipment not found or cannot be cancelled"
      });
    }

    shipment.currentStatus = 'Cancelled';
    shipment.isActive = false;
    await shipment.addMilestone(
      'Cancelled',
      shipment.origin.warehouse,
      'Shipment cancelled by customer',
      customerId
    );

    await shipment.save();

    res.status(200).json({
      success: true,
      message: "Shipment cancelled successfully",
      data: {
        shipmentNumber: shipment.shipmentNumber,
        currentStatus: shipment.currentStatus
      }
    });

  } catch (error) {
    console.error("Cancel shipment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel shipment",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

// ==================== STAFF FUNCTIONS ====================

/**
 * Get all shipments (Staff/Admin view)
 */
const getAllShipments = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!['admin', 'operations'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin or operations staff only."
      });
    }

    const { 
      status, 
      customer, 
      originCountry, 
      destinationCountry,
      shipmentType,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    const query = { isActive: true };
    
    if (status) query.currentStatus = status;
    if (customer) query.customer = customer;
    if (shipmentType) query.shipmentType = shipmentType;
    if (originCountry) query['origin.country'] = originCountry;
    if (destinationCountry) query['destination.country'] = destinationCountry;
    
    // Date range filter
    if (startDate || endDate) {
      query.bookingDate = {};
      if (startDate) query.bookingDate.$gte = new Date(startDate);
      if (endDate) query.bookingDate.$lte = new Date(endDate);
    }

    // Pagination
    const skip = (page - 1) * limit;

    const shipments = await Shipment.find(query)
      .select('-internalNotes')
      .sort({ bookingDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('customer', 'firstName lastName email companyName')
      .populate('assignedTo', 'firstName lastName email department')
      .populate('createdBy', 'firstName lastName');

    const total = await Shipment.countDocuments(query);

    res.status(200).json({
      success: true,
      count: shipments.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: shipments
    });

  } catch (error) {
    console.error("Get all shipments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get shipments",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

/**
 * Approve/confirm shipment booking (Staff only)
 */
const approveShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { estimatedDeparture, estimatedArrival, quotationAmount } = req.body;
    const staffId = req.user.userId;

    const staff = await User.findById(staffId);
    if (!['admin', 'operations'].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin or operations staff only."
      });
    }

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found"
      });
    }

    if (shipment.currentStatus !== 'Booking Requested') {
      return res.status(400).json({
        success: false,
        message: "Shipment is not in 'Booking Requested' status"
      });
    }

    // Update shipment
    shipment.currentStatus = 'Confirmed';
    shipment.estimatedDeparture = estimatedDeparture || shipment.estimatedDeparture;
    shipment.estimatedArrival = estimatedArrival || shipment.estimatedArrival;
    shipment.quotationAmount = quotationAmount || shipment.quotationAmount;
    shipment.assignedTo = staffId;
    shipment.updatedBy = staffId;

    await shipment.addMilestone(
      'Confirmed',
      shipment.origin.warehouse,
      'Shipment confirmed by operations',
      staffId
    );

    await shipment.save();

    res.status(200).json({
      success: true,
      message: "Shipment approved successfully",
      data: {
        shipmentNumber: shipment.shipmentNumber,
        currentStatus: shipment.currentStatus,
        assignedTo: staffId,
        estimatedDeparture: shipment.estimatedDeparture,
        estimatedArrival: shipment.estimatedArrival
      }
    });

  } catch (error) {
    console.error("Approve shipment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve shipment",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

/**
 * Update shipment status/milestone (Staff only)
 */
const updateShipmentStatus = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { status, location, notes } = req.body;
    const staffId = req.user.userId;

    const staff = await User.findById(staffId);
    if (!['admin', 'operations', 'warehouse'].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Staff only."
      });
    }

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found"
      });
    }

    // Validate status transition
    const validStatuses = [
      'Booking Requested',
      'Confirmed',
      'Received at Warehouse',
      'Consolidation in Progress',
      'Loaded in Container/Flight',
      'In Transit',
      'Arrived at Destination',
      'Customs Clearance',
      'Out for Delivery',
      'Delivered'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    await shipment.addMilestone(status, location, notes, staffId);
    shipment.updatedBy = staffId;

    // Update specific dates based on status
    const now = new Date();
    switch (status) {
      case 'Loaded in Container/Flight':
        shipment.actualDeparture = now;
        break;
      case 'Arrived at Destination':
        shipment.actualArrival = now;
        break;
      case 'Delivered':
        shipment.deliveryDate = now;
        break;
    }

    await shipment.save();

    res.status(200).json({
      success: true,
      message: "Shipment status updated successfully",
      data: {
        shipmentNumber: shipment.shipmentNumber,
        currentStatus: shipment.currentStatus,
        lastMilestone: shipment.milestones[shipment.milestones.length - 1]
      }
    });

  } catch (error) {
    console.error("Update shipment status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update shipment status",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

/**
 * Assign tracking number (Staff only)
 */
const assignTrackingNumber = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { trackingNumber } = req.body;
    const staffId = req.user.userId;

    const staff = await User.findById(staffId);
    if (!['admin', 'operations'].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin or operations staff only."
      });
    }

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found"
      });
    }

    if (shipment.trackingNumber) {
      return res.status(400).json({
        success: false,
        message: "Tracking number already assigned"
      });
    }

    shipment.trackingNumber = trackingNumber || shipment.trackingNumber;
    shipment.updatedBy = staffId;

    await shipment.save();

    res.status(200).json({
      success: true,
      message: "Tracking number assigned successfully",
      data: {
        shipmentNumber: shipment.shipmentNumber,
        trackingNumber: shipment.trackingNumber
      }
    });

  } catch (error) {
    console.error("Assign tracking number error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to assign tracking number",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

/**
 * Assign shipment to container (Staff only)
 */
// shipmentController.js-এ একটি নতুন ফাংশন যোগ করুন
const activateShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const staffId = req.user.userId;

    const staff = await User.findById(staffId);
    if (!['admin', 'operations'].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin or operations staff only."
      });
    }

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found"
      });
    }

    // Activate shipment
    shipment.isActive = true;
    shipment.updatedBy = staffId;
    
    await shipment.addMilestone(
      shipment.currentStatus,
      shipment.origin.warehouse,
      'Shipment reactivated by staff',
      staffId
    );

    await shipment.save();

    res.status(200).json({
      success: true,
      message: "Shipment activated successfully",
      data: {
        shipmentNumber: shipment.shipmentNumber,
        isActive: shipment.isActive,
        currentStatus: shipment.currentStatus
      }
    });

  } catch (error) {
    console.error("Activate shipment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to activate shipment",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};
const assignToContainer = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { containerId, containerType, vesselFlightNumber } = req.body;
    const staffId = req.user.userId;

    const staff = await User.findById(staffId);
    if (!['admin', 'operations'].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin or operations staff only."
      });
    }

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found"
      });
    }

    // Check if shipment is active
    if (!shipment.isActive) {
      return res.status(400).json({
        success: false,
        message: "Cannot assign inactive shipment to container. Please activate shipment first."
      });
    }

    // Check if already assigned to container
    if (shipment.containerDetails?.containerId) {
      return res.status(400).json({
        success: false,
        message: `Shipment already assigned to container: ${shipment.containerDetails.containerId}`,
        data: {
          shipmentNumber: shipment.shipmentNumber,
          existingContainerId: shipment.containerDetails.containerId,
          currentStatus: shipment.currentStatus
        }
      });
    }

    // Check if shipment is in correct status for container assignment
    const allowedStatuses = ['Confirmed', 'Received at Warehouse', 'Consolidation in Progress'];
    if (!allowedStatuses.includes(shipment.currentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot assign container to shipment in '${shipment.currentStatus}' status. Shipment must be in: ${allowedStatuses.join(', ')}`,
        allowedStatuses: allowedStatuses
      });
    }

    // Update container details
    shipment.containerDetails = {
      containerId,
      containerType,
      vesselFlightNumber
    };
    shipment.updatedBy = staffId;

    // Update status
    await shipment.addMilestone(
      'Loaded in Container/Flight',
      shipment.origin.warehouse,
      `Assigned to ${containerType} - ${containerId}. ${vesselFlightNumber ? 'Vessel/Flight: ' + vesselFlightNumber : ''}`,
      staffId
    );

    await shipment.save();

    res.status(200).json({
      success: true,
      message: "Shipment assigned to container successfully",
      data: {
        shipmentNumber: shipment.shipmentNumber,
        containerId: shipment.containerDetails.containerId,
        currentStatus: shipment.currentStatus,
        containerType: shipment.containerDetails.containerType
      }
    });

  } catch (error) {
    console.error("Assign to container error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to assign to container",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

// ==================== ADMIN FUNCTIONS ====================

/**
 * Get shipment statistics
 */
const getShipmentStats = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    // Get current month stats
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get current year stats
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);

    // Aggregation pipeline for statistics
    const stats = await Shipment.aggregate([
      {
        $facet: {
          // Total shipments
          total: [
            { $match: { isActive: true } },
            { $count: "count" }
          ],
          
          // This month shipments
          thisMonth: [
            { 
              $match: { 
                isActive: true,
                bookingDate: { $gte: startOfMonth }
              } 
            },
            { $count: "count" }
          ],
          
          // This year shipments
          thisYear: [
            { 
              $match: { 
                isActive: true,
                bookingDate: { $gte: startOfYear }
              } 
            },
            { $count: "count" }
          ],
          
          // Status breakdown
          byStatus: [
            { $match: { isActive: true } },
            { $group: { _id: "$currentStatus", count: { $sum: 1 } } }
          ],
          
          // Shipment type breakdown
          byType: [
            { $match: { isActive: true } },
            { $group: { _id: "$shipmentType", count: { $sum: 1 } } }
          ],
          
          // Route performance
          byRoute: [
            { $match: { isActive: true } },
            { 
              $group: { 
                _id: { 
                  origin: "$origin.country", 
                  destination: "$destination.country" 
                }, 
                count: { $sum: 1 },
                avgTransitDays: { 
                  $avg: { 
                    $cond: [
                      { $and: ["$actualDeparture", "$actualArrival"] },
                      { $divide: [
                        { $subtract: ["$actualArrival", "$actualDeparture"] },
                        1000 * 60 * 60 * 24
                      ]},
                      null
                    ]
                  }
                }
              } 
            }
          ]
        }
      }
    ]);

    // Process results
    const result = {
      totalShipments: stats[0].total[0]?.count || 0,
      thisMonth: stats[0].thisMonth[0]?.count || 0,
      thisYear: stats[0].thisYear[0]?.count || 0,
      byStatus: stats[0].byStatus.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      byType: stats[0].byType.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      byRoute: stats[0].byRoute.map(route => ({
        route: `${route._id.origin} → ${route._id.destination}`,
        count: route.count,
        avgTransitDays: route.avgTransitDays ? Math.round(route.avgTransitDays) : null
      }))
    };

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("Get shipment stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get shipment statistics",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

/**
 * Delete shipment (Admin only)
 */
const deleteShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const adminId = req.user.userId;

    const admin = await User.findById(adminId);
    if (admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found"
      });
    }

    // Soft delete
    shipment.isActive = false;
    shipment.currentStatus = 'Cancelled';
    shipment.updatedBy = adminId;

    await shipment.addMilestone(
      'Cancelled',
      'System',
      'Shipment deleted by admin',
      adminId
    );

    await shipment.save();

    res.status(200).json({
      success: true,
      message: "Shipment deleted successfully",
      data: {
        shipmentNumber: shipment.shipmentNumber,
        status: shipment.currentStatus
      }
    });

  } catch (error) {
    console.error("Delete shipment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete shipment",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};
/**
 * Update specific milestone (Staff only)
 */
const updateMilestone = async (req, res) => {
  try {
    const { shipmentId, milestoneId } = req.params;
    const { status, location, notes, date } = req.body;
    const staffId = req.user.userId;

    const staff = await User.findById(staffId);
    if (!['admin', 'operations', 'warehouse'].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Staff only."
      });
    }

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found"
      });
    }

    // Find the milestone
    const milestone = shipment.milestones.id(milestoneId);
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: "Milestone not found"
      });
    }

    // Update milestone
    if (status) milestone.status = status;
    if (location) milestone.location = location;
    if (notes) milestone.notes = notes;
    if (date) milestone.date = new Date(date);
    
    milestone.updatedBy = staffId;
    milestone.updatedAt = new Date();

    // If this is the latest milestone, update currentStatus
    const latestMilestone = shipment.milestones[shipment.milestones.length - 1];
    if (milestone._id.equals(latestMilestone._id) && status) {
      shipment.currentStatus = status;
    }

    shipment.updatedBy = staffId;
    await shipment.save();

    res.status(200).json({
      success: true,
      message: "Milestone updated successfully",
      data: {
        shipmentNumber: shipment.shipmentNumber,
        milestone: milestone
      }
    });

  } catch (error) {
    console.error("Update milestone error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update milestone",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

/**
 * Get shipment timeline with milestone details
 */
const getShipmentTimeline = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Find shipment
    const query = { _id: shipmentId, isActive: true };
    
    // If user is customer, restrict to their shipments only
    if (userRole === 'customer') {
      query.customer = userId;
    }

    const shipment = await Shipment.findOne(query)
      .select('shipmentNumber trackingNumber currentStatus milestones')
      .populate('milestones.updatedBy', 'firstName lastName email role');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found or access denied"
      });
    }

    // Prepare timeline data
    const timeline = shipment.milestones.map(milestone => ({
      id: milestone._id,
      status: milestone.status,
      location: milestone.location,
      notes: milestone.notes,
      date: milestone.date,
      updatedBy: milestone.updatedBy ? {
        name: `${milestone.updatedBy.firstName} ${milestone.updatedBy.lastName}`,
        email: milestone.updatedBy.email,
        role: milestone.updatedBy.role
      } : null,
      updatedAt: milestone.updatedAt
    }));

    // Sort by date (newest first)
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
      success: true,
      data: {
        shipmentNumber: shipment.shipmentNumber,
        trackingNumber: shipment.trackingNumber,
        currentStatus: shipment.currentStatus,
        timeline: timeline,
        totalMilestones: timeline.length
      }
    });

  } catch (error) {
    console.error("Get shipment timeline error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get shipment timeline",
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
};

module.exports = {
  // Customer functions
  createShipmentRequest,
  getMyShipments,
  getShipmentDetails,
  cancelShipmentRequest,
  
  // Staff functions
  getAllShipments,
  approveShipment,
  updateShipmentStatus,
  assignTrackingNumber,
  activateShipment,
 assignToContainer,
  // Milestone functions
    updateMilestone,        
  getShipmentTimeline,   
  // Admin functions
  getShipmentStats,
  deleteShipment
};