const Booking = require('../models/bookingModel');
const Customer = require('../models/userModel');
const { 
  SHIPMENT_TYPES, 
  PRODUCT_TYPES, 
  PACKAGE_TYPES,
  BOOKING_STATUS,
  COUNTRIES,
  CURRENCIES 
} = require('../constants/productConstants'); 

/**
 * 🔍 Search by Tracking Number
 */
exports.searchByTrackingNumber = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    
    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number is required'
      });
    }

    const booking = await Booking.findOne({ 
      trackingNumber: trackingNumber.trim().toUpperCase()
    })
    .populate('customer', 'companyName contactPerson email phone')
    .populate('assignedTo', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'No booking found with this tracking number'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        bookingNumber: booking.bookingNumber,
        trackingNumber: booking.trackingNumber,
        status: booking.status,
        originCountry: booking.originCountry,
        destinationCountry: booking.destinationCountry,
        estimatedDeparture: booking.estimatedDeparture,
        estimatedArrival: booking.estimatedArrival,
        currentLocation: booking.currentLocation || 'Not available',
        customer: booking.customer,
        shipmentType: booking.shipmentType,
        milestones: booking.milestones || []
      }
    });
  } catch (error) {
    console.error('Search by tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching for booking',
      error: error.message
    });
  }
};

/**
 * 📦 Get Product Options
 */
exports.getProductOptions = async (req, res) => {
  try {
    const productOptions = {
      shipmentTypes: ['AIR_FREIGHT', 'SEA_FREIGHT', 'EXPRESS_COURIER'],
      productTypes: [
        'GENERAL_MERCHANDISE',
        'ELECTRONICS',
        'TEXTILES',
        'FOOD',
        'CHEMICALS',
        'PHARMACEUTICALS',
        'MACHINERY',
        'FURNITURE',
        'AUTO_PARTS',
        'PERISHABLE'
      ],
      packageTypes: [
        'CARTONS',
        'PALLETS',
        'CRATES',
        'DRUMS',
        'BAGS',
        'REELS',
        'BUNDLES',
        'LOOSE'
      ],
      shippingModes: ['DDP', 'DAP', 'EXW', 'FOB', 'CIF'],
      countries: ['CHINA', 'THAILAND', 'USA', 'UK', 'CANADA', 'GERMANY', 'FRANCE', 'JAPAN'],
      currencies: ['USD', 'GBP', 'CAD', 'THB', 'CNY', 'EUR', 'JPY']
    };

    res.status(200).json({
      success: true,
      data: productOptions
    });
  } catch (error) {
    console.error('Get product options error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product options',
      error: error.message
    });
  }
};

/**
 * ✅ Validate Product and Package
 */
exports.validateProductAndPackage = async (req, res) => {
  try {
    const { productType, packageType, weight, volume, hazardous, temperatureControlled } = req.body;

    const errors = [];
    const warnings = [];

    // Weight validation
    if (weight) {
      if (weight < 0.1) {
        errors.push('Weight must be at least 0.1 kg');
      }
      if (weight > 10000) {
        warnings.push('Weight exceeds standard limit. Special handling may be required.');
      }
    }

    // Volume validation
    if (volume) {
      if (volume < 0.001) {
        errors.push('Volume must be at least 0.001 CBM');
      }
      if (volume > 50) {
        warnings.push('Volume exceeds standard limit. May require special container.');
      }
    }

    // Product-package compatibility
    const incompatibleCombinations = {
      'CHEMICALS': ['BAGS', 'LOOSE'],
      'PHARMACEUTICALS': ['LOOSE'],
      'ELECTRONICS': ['BAGS'],
      'FOOD': ['LOOSE', 'BUNDLES']
    };

    if (productType && packageType && incompatibleCombinations[productType]) {
      if (incompatibleCombinations[productType].includes(packageType)) {
        errors.push(`${productType} cannot be packaged as ${packageType}`);
      }
    }

    // Hazardous material restrictions
    if (hazardous === true) {
      if (!['CARTONS', 'DRUMS', 'CRATES'].includes(packageType)) {
        errors.push('Hazardous materials must be packed in CARTONS, DRUMS, or CRATES');
      }
      warnings.push('Hazardous materials require special documentation and handling');
    }

    // Temperature controlled requirements
    if (temperatureControlled === true) {
      if (!['AIR_FREIGHT', 'EXPRESS_COURIER'].includes(req.body.shipmentType)) {
        warnings.push('Temperature controlled items are best shipped via AIR_FREIGHT or EXPRESS_COURIER');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
        warnings
      });
    }

    res.status(200).json({
      success: true,
      message: 'Validation successful',
      data: {
        isValid: true,
        warnings,
        suggestions: warnings.length > 0 ? 'Please review warnings before proceeding' : 'All good!'
      }
    });
  } catch (error) {
    console.error('Validate product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating product',
      error: error.message
    });
  }
};

/**
 * 👤 Get Customer Bookings
 */
exports.getCustomerBookings = async (req, res) => {
  try {
    const customerId = req.user.id || req.user._id;
    const { 
      status, 
      shipmentType,
      page = 1, 
      limit = 10,
      startDate,
      endDate
    } = req.query;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }

    const query = { customer: customerId };

    // Apply filters
    if (status) query.status = status;
    if (shipmentType) query.shipmentType = shipmentType;
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .select('-internalNotes -updatedBy')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('assignedTo', 'firstName lastName email phone'),
      Booking.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        bookings,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get customer bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customer bookings',
      error: error.message
    });
  }
};

/**
 * ✏️ Update Booking
 */
exports.updateBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user.id;

    // Check if booking exists
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user has permission to update
    const isAdmin = req.user.role === 'admin';
    const isOperations = req.user.role === 'operations';
    const isCustomer = req.user.role === 'customer' && booking.customer.toString() === userId;

    if (!isAdmin && !isOperations && !isCustomer) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this booking'
      });
    }

    // If customer, restrict what they can update
    if (isCustomer) {
      const allowedUpdates = ['pickupAddress', 'pickupDate', 'destinationAddress', 'specialInstructions'];
      const customerUpdateData = {};
      
      Object.keys(updateData).forEach(key => {
        if (allowedUpdates.includes(key)) {
          customerUpdateData[key] = updateData[key];
        }
      });

      // If status is being changed to CANCELLED
      if (updateData.status === 'CANCELLED' && booking.status === 'REQUESTED') {
        customerUpdateData.status = 'CANCELLED';
        customerUpdateData.cancellationReason = updateData.cancellationReason;
      }

      updateData = customerUpdateData;
    }

    // Update booking
    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { 
        ...updateData,
        updatedBy: userId,
        lastUpdated: new Date()
      },
      { new: true, runValidators: true }
    )
    .populate('customer', 'companyName contactPerson email phone')
    .populate('assignedTo', 'firstName lastName email phone');

    res.status(200).json({
      success: true,
      message: 'Booking updated successfully',
      data: updatedBooking
    });
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating booking',
      error: error.message
    });
  }
};

/**
 * ❌ Delete Booking
 */
exports.deleteBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Only admin can delete bookings
    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can delete bookings'
      });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Soft delete - mark as inactive instead of actually deleting
    booking.isActive = false;
    booking.status = 'DELETED';
    booking.updatedBy = userId;
    booking.lastUpdated = new Date();
    
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking deleted successfully',
      data: {
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        deletedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting booking',
      error: error.message
    });
  }
};

/**
 * 🔄 Update Booking Status
 */
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, location } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check permissions - only staff can update status
    if (!['admin', 'operations', 'warehouse'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only staff can update booking status'
      });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Validate status transition
    const validStatuses = [
      'REQUESTED',
      'CONFIRMED',
      'PROCESSING',
      'PICKED_UP',
      'AT_WAREHOUSE',
      'CONSOLIDATED',
      'IN_TRANSIT',
      'ARRIVED',
      'CUSTOMS_CLEARANCE',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
      'ON_HOLD'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Update status
    booking.status = status;
    booking.updatedBy = userId;
    booking.lastUpdated = new Date();

    // Add status history
    if (!booking.statusHistory) {
      booking.statusHistory = [];
    }

    booking.statusHistory.push({
      status,
      notes: notes || `Status updated to ${status}`,
      updatedBy: userId,
      location: location || booking.currentLocation,
      timestamp: new Date()
    });

    // Update specific dates based on status
    const now = new Date();
    switch (status) {
      case 'PICKED_UP':
        booking.actualPickupDate = now;
        break;
      case 'IN_TRANSIT':
        booking.actualDeparture = now;
        break;
      case 'ARRIVED':
        booking.actualArrival = now;
        break;
      case 'DELIVERED':
        booking.deliveryDate = now;
        break;
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking status updated successfully',
      data: {
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        lastStatusUpdate: booking.statusHistory[booking.statusHistory.length - 1]
      }
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating booking status',
      error: error.message
    });
  }
};

/**
 * 📜 Get Booking Status History
 */
exports.getBookingStatusHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const booking = await Booking.findById(id)
      .select('bookingNumber status statusHistory customer')
      .populate('statusHistory.updatedBy', 'firstName lastName role');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check permissions
    const isCustomer = userRole === 'customer' && booking.customer.toString() === userId;
    const isStaff = ['admin', 'operations', 'warehouse'].includes(userRole);

    if (!isCustomer && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this booking history'
      });
    }

    // Format status history
    const formattedHistory = booking.statusHistory.map(history => ({
      status: history.status,
      notes: history.notes,
      location: history.location,
      timestamp: history.timestamp,
      updatedBy: history.updatedBy ? {
        name: `${history.updatedBy.firstName} ${history.updatedBy.lastName}`,
        role: history.updatedBy.role
      } : null
    }));

    res.status(200).json({
      success: true,
      data: {
        bookingNumber: booking.bookingNumber,
        currentStatus: booking.status,
        history: formattedHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      }
    });
  } catch (error) {
    console.error('Get status history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching status history',
      error: error.message
    });
  }
};

/**
 * 👥 Assign Booking to Staff
 */
exports.assignBookingToStaff = async (req, res) => {
  try {
    const { bookingId, staffId, assignmentNotes } = req.body;
    const assignedBy = req.user.id;

    // Check if user is admin or operations
    if (!['admin', 'operations'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or operations can assign bookings'
      });
    }

    // Check if booking exists
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if staff exists
    const staff = await User.findById(staffId);
    if (!staff || !['operations', 'warehouse'].includes(staff.role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid staff member'
      });
    }

    // Assign booking
    booking.assignedTo = staffId;
    booking.updatedBy = assignedBy;
    booking.lastUpdated = new Date();

    // Add to assignment history
    if (!booking.assignmentHistory) {
      booking.assignmentHistory = [];
    }

    booking.assignmentHistory.push({
      assignedTo: staffId,
      assignedBy: assignedBy,
      notes: assignmentNotes || `Assigned to ${staff.firstName} ${staff.lastName}`,
      timestamp: new Date()
    });

    await booking.save();

    // Populate for response
    const populatedBooking = await Booking.findById(bookingId)
      .populate('customer', 'companyName contactPerson email phone')
      .populate('assignedTo', 'firstName lastName email phone role')
      .populate('assignmentHistory.assignedTo', 'firstName lastName role')
      .populate('assignmentHistory.assignedBy', 'firstName lastName role');

    res.status(200).json({
      success: true,
      message: 'Booking assigned successfully',
      data: {
        bookingNumber: populatedBooking.bookingNumber,
        assignedTo: {
          id: populatedBooking.assignedTo._id,
          name: `${populatedBooking.assignedTo.firstName} ${populatedBooking.assignedTo.lastName}`,
          role: populatedBooking.assignedTo.role
        },
        assignmentNotes: assignmentNotes,
        assignmentDate: new Date()
      }
    });
  } catch (error) {
    console.error('Assign booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning booking',
      error: error.message
    });
  }
};

/**
 * 🏢 Get Warehouse Pending Bookings
 */
exports.getWarehousePendingBookings = async (req, res) => {
  try {
    const { 
      warehouse,
      page = 1,
      limit = 20
    } = req.query;

    // Check if user is warehouse staff
    if (req.user.role !== 'warehouse') {
      return res.status(403).json({
        success: false,
        message: 'Only warehouse staff can access this endpoint'
      });
    }

    const query = {
      status: { $in: ['CONFIRMED', 'AT_WAREHOUSE', 'CONSOLIDATION_PENDING'] },
      originWarehouse: warehouse || req.user.assignedWarehouse
    };

    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .select('bookingNumber shipmentType cargoDetails status estimatedDeparture containerId')
        .populate('customer', 'companyName contactPerson')
        .populate('assignedTo', 'firstName lastName')
        .sort({ estimatedDeparture: 1, createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Booking.countDocuments(query)
    ]);

    // Calculate consolidation suggestions
    const consolidationGroups = {};
    bookings.forEach(booking => {
      const key = `${booking.shipmentType}_${booking.originWarehouse}_${booking.destinationCountry}`;
      if (!consolidationGroups[key]) {
        consolidationGroups[key] = {
          shipmentType: booking.shipmentType,
          origin: booking.originWarehouse,
          destination: booking.destinationCountry,
          bookings: [],
          totalWeight: 0,
          totalVolume: 0
        };
      }
      consolidationGroups[key].bookings.push(booking.bookingNumber);
      consolidationGroups[key].totalWeight += (booking.cargoDetails?.weight || 0);
      consolidationGroups[key].totalVolume += (booking.cargoDetails?.volume || 0);
    });

    const consolidationSuggestions = Object.values(consolidationGroups)
      .filter(group => group.bookings.length > 1)
      .map(group => ({
        ...group,
        canConsolidate: group.totalWeight <= 20000 && group.totalVolume <= 30 // Example limits
      }));

    res.status(200).json({
      success: true,
      data: {
        bookings,
        consolidationSuggestions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get warehouse pending error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching warehouse pending bookings',
      error: error.message
    });
  }
};

/**
 * 📦 Consolidate Shipments
 */
exports.consolidateShipments = async (req, res) => {
  try {
    const { 
      bookingIds,
      consolidationNumber,
      containerId,
      vesselFlightNumber,
      departureDate,
      notes
    } = req.body;

    const userId = req.user.id;

    // Check if user is warehouse staff
    if (req.user.role !== 'warehouse') {
      return res.status(403).json({
        success: false,
        message: 'Only warehouse staff can consolidate shipments'
      });
    }

    if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least 2 booking IDs are required for consolidation'
      });
    }

    // Validate all bookings exist and are eligible for consolidation
    const bookings = await Booking.find({
      _id: { $in: bookingIds },
      status: { $in: ['CONFIRMED', 'AT_WAREHOUSE', 'CONSOLIDATION_PENDING'] }
    });

    if (bookings.length !== bookingIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some bookings are not eligible for consolidation'
      });
    }

    // Check if all bookings have same origin, destination, and shipment type
    const firstBooking = bookings[0];
    const isValidConsolidation = bookings.every(booking => 
      booking.originWarehouse === firstBooking.originWarehouse &&
      booking.destinationCountry === firstBooking.destinationCountry &&
      booking.shipmentType === firstBooking.shipmentType
    );

    if (!isValidConsolidation) {
      return res.status(400).json({
        success: false,
        message: 'Bookings must have same origin, destination, and shipment type for consolidation'
      });
    }

    // Update all bookings
    const updatePromises = bookings.map(booking => {
      booking.status = 'CONSOLIDATED';
      booking.containerId = containerId;
      booking.consolidationNumber = consolidationNumber;
      booking.updatedBy = userId;
      booking.lastUpdated = new Date();
      
      // Add to consolidation history
      if (!booking.consolidationHistory) {
        booking.consolidationHistory = [];
      }
      
      booking.consolidationHistory.push({
        consolidationNumber,
        containerId,
        vesselFlightNumber,
        departureDate,
        notes,
        consolidatedBy: userId,
        timestamp: new Date(),
        bookingsInConsolidation: bookingIds
      });

      return booking.save();
    });

    await Promise.all(updatePromises);

    // Calculate totals for response
    const totalWeight = bookings.reduce((sum, booking) => sum + (booking.cargoDetails?.weight || 0), 0);
    const totalVolume = bookings.reduce((sum, booking) => sum + (booking.cargoDetails?.volume || 0), 0);

    res.status(200).json({
      success: true,
      message: 'Shipments consolidated successfully',
      data: {
        consolidationNumber,
        containerId,
        bookingsConsolidated: bookings.length,
        bookingNumbers: bookings.map(b => b.bookingNumber),
        totalWeight,
        totalVolume,
        shipmentType: firstBooking.shipmentType,
        origin: firstBooking.originWarehouse,
        destination: firstBooking.destinationCountry,
        estimatedDeparture: departureDate
      }
    });
  } catch (error) {
    console.error('Consolidate shipments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error consolidating shipments',
      error: error.message
    });
  }
};

/**
 * 📄 Generate Booking PDF
 */
exports.generateBookingPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate('customer', 'companyName contactPerson email phone address')
      .populate('assignedTo', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Mock PDF generation - in real app, use libraries like pdfkit
    const pdfData = {
      bookingNumber: booking.bookingNumber,
      trackingNumber: booking.trackingNumber,
      date: new Date().toLocaleDateString(),
      customer: {
        company: booking.customer?.companyName || 'N/A',
        contact: booking.customer?.contactPerson || 'N/A',
        email: booking.customer?.email || 'N/A',
        phone: booking.customer?.phone || 'N/A'
      },
      shipmentDetails: {
        type: booking.shipmentType,
        origin: booking.originCountry,
        destination: booking.destinationCountry,
        status: booking.status,
        shippingMode: booking.shippingMode
      },
      cargoDetails: booking.cargoDetails,
      dates: {
        booking: booking.createdAt,
        estimatedDeparture: booking.estimatedDeparture,
        estimatedArrival: booking.estimatedArrival
      },
      financial: booking.quotation,
      assignedTo: booking.assignedTo ? {
        name: `${booking.assignedTo.firstName} ${booking.assignedTo.lastName}`,
        contact: booking.assignedTo.phone,
        email: booking.assignedTo.email
      } : null
    };

    // In real implementation, generate actual PDF
    // const pdfBuffer = await generatePDF(pdfData);
    // res.contentType('application/pdf');
    // res.send(pdfBuffer);

    // For now, return JSON data
    res.status(200).json({
      success: true,
      message: 'PDF generated successfully',
      data: {
        pdfUrl: `/downloads/booking-${booking.bookingNumber}.pdf`, // Mock URL
        bookingData: pdfData,
        downloadLink: `/api/bookings/${id}/download/file`
      }
    });
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF',
      error: error.message
    });
  }
};

/**
 * 📊 Get Monthly Report
 */
exports.getMonthlyReport = async (req, res) => {
  try {
    const { 
      year = new Date().getFullYear(),
      month = new Date().getMonth() + 1
    } = req.query;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Check if user has permission
    if (!['admin', 'operations'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or operations can view monthly reports'
      });
    }

    const report = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            day: { $dayOfMonth: '$createdAt' },
            shipmentType: '$shipmentType',
            status: '$status'
          },
          count: { $sum: 1 },
          totalRevenue: { $sum: '$quotation.totalAmount' },
          totalWeight: { $sum: '$cargoDetails.weight' },
          totalVolume: { $sum: '$cargoDetails.volume' }
        }
      },
      {
        $group: {
          _id: '$_id.day',
          day: { $first: '$_id.day' },
          totalBookings: { $sum: '$count' },
          totalRevenue: { $sum: '$totalRevenue' },
          totalWeight: { $sum: '$totalWeight' },
          totalVolume: { $sum: '$totalVolume' },
          byShipmentType: {
            $push: {
              type: '$_id.shipmentType',
              count: '$count',
              revenue: '$totalRevenue'
            }
          },
          byStatus: {
            $push: {
              status: '$_id.status',
              count: '$count'
            }
          }
        }
      },
      {
        $sort: { day: 1 }
      },
      {
        $project: {
          _id: 0,
          day: 1,
          totalBookings: 1,
          totalRevenue: 1,
          totalWeight: 1,
          totalVolume: 1,
          shipmentTypeBreakdown: {
            $arrayToObject: {
              $map: {
                input: '$byShipmentType',
                as: 'item',
                in: {
                  k: '$$item.type',
                  v: {
                    count: '$$item.count',
                    revenue: '$$item.revenue'
                  }
                }
              }
            }
          },
          statusBreakdown: {
            $arrayToObject: {
              $map: {
                input: '$byStatus',
                as: 'item',
                in: {
                  k: '$$item.status',
                  v: '$$item.count'
                }
              }
            }
          }
        }
      }
    ]);

    // Calculate summary
    const summary = report.reduce((acc, day) => ({
      totalBookings: acc.totalBookings + day.totalBookings,
      totalRevenue: acc.totalRevenue + day.totalRevenue,
      totalWeight: acc.totalWeight + day.totalWeight,
      totalVolume: acc.totalVolume + day.totalVolume
    }), { totalBookings: 0, totalRevenue: 0, totalWeight: 0, totalVolume: 0 });

    // Calculate averages
    const daysInMonth = new Date(year, month, 0).getDate();
    const averageBookingsPerDay = summary.totalBookings / daysInMonth;
    const averageRevenuePerDay = summary.totalRevenue / daysInMonth;

    res.status(200).json({
      success: true,
      data: {
        period: `${year}-${String(month).padStart(2, '0')}`,
        summary: {
          ...summary,
          averageBookingsPerDay: Math.round(averageBookingsPerDay * 100) / 100,
          averageRevenuePerDay: Math.round(averageRevenuePerDay * 100) / 100
        },
        dailyReport: report,
        month,
        year,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating monthly report',
      error: error.message
    });
  }
};

/**
 * 📤 Export Bookings
 */
exports.exportBookings = async (req, res) => {
  try {
    const { 
      format = 'json',
      startDate,
      endDate,
      status,
      shipmentType
    } = req.query;

    // Check if user has permission
    if (!['admin', 'operations'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or operations can export bookings'
      });
    }

    const query = {};

    // Apply filters
    if (status) query.status = status;
    if (shipmentType) query.shipmentType = shipmentType;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const bookings = await Booking.find(query)
      .populate('customer', 'companyName contactPerson email phone')
      .populate('assignedTo', 'firstName lastName email phone')
      .select('-internalNotes -__v')
      .sort({ createdAt: -1 });

    if (format === 'csv') {
      // Convert to CSV format
      const csvData = convertToCSV(bookings);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=bookings-${Date.now()}.csv`);
      return res.send(csvData);
    }

    // Default to JSON
    res.status(200).json({
      success: true,
      data: bookings,
      metadata: {
        exportDate: new Date(),
        totalRecords: bookings.length,
        filtersApplied: { status, shipmentType, startDate, endDate }
      }
    });
  } catch (error) {
    console.error('Export bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting bookings',
      error: error.message
    });
  }
};

// Helper function to convert to CSV
const convertToCSV = (bookings) => {
  const headers = [
    'Booking Number',
    'Tracking Number',
    'Customer',
    'Shipment Type',
    'Origin',
    'Destination',
    'Status',
    'Weight (kg)',
    'Volume (CBM)',
    'Total Amount',
    'Currency',
    'Created Date',
    'Estimated Departure',
    'Estimated Arrival'
  ];

  const rows = bookings.map(booking => [
    booking.bookingNumber,
    booking.trackingNumber || '',
    booking.customer?.companyName || '',
    booking.shipmentType,
    booking.originCountry,
    booking.destinationCountry,
    booking.status,
    booking.cargoDetails?.weight || 0,
    booking.cargoDetails?.volume || 0,
    booking.quotation?.totalAmount || 0,
    booking.quotation?.currency || 'USD',
    booking.createdAt.toISOString(),
    booking.estimatedDeparture?.toISOString() || '',
    booking.estimatedArrival?.toISOString() || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
};

// Make sure to add the calculateShippingCost function if not already present
// This should already be in your existing code
exports.createAirFreightBooking = async (req, res) => {
  try {
    const {
      customerId,
      originCountry,
      originWarehouse,
      destinationCountry,
      destinationAddress,
      productType,
      packageType,
      cargoDetails,
      shippingMode,
      pickupRequired,
      pickupAddress,
      pickupDate,
      specialInstructions
    } = req.body;

    // Validate customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    // Create booking
    const booking = new Booking({
      customer: customerId,
      shipmentType: SHIPMENT_TYPES.AIR_FREIGHT,
      originCountry,
      originWarehouse,
      destinationCountry,
      destinationAddress,
      productType,
      packageType,
      cargoDetails,
      shippingMode,
      pickupRequired,
      pickupAddress,
      pickupDate,
      specialInstructions,
      status: BOOKING_STATUS.REQUESTED
    });

    // Generate quotation
    booking.quotation = await calculateShippingCost({
      shipmentType: SHIPMENT_TYPES.AIR_FREIGHT,
      origin: originCountry,
      destination: destinationCountry,
      weight: cargoDetails.weight,
      volume: cargoDetails.volume,
      productType
    });

    await booking.save();

    res.status(201).json({
      success: true,
      message: 'Air freight booking created successfully',
      data: {
        bookingNumber: booking.bookingNumber,
        bookingId: booking._id,
        quotation: booking.quotation,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Air freight booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating air freight booking',
      error: error.message 
    });
  }
};

/**
 * 🚢 Create Sea Freight Booking
 */
exports.createSeaFreightBooking = async (req, res) => {
  try {
    const {
      customerId,
      originCountry,
      originWarehouse,
      destinationCountry,
      destinationAddress,
      productType,
      packageType,
      cargoDetails,
      shippingMode,
      pickupRequired,
      pickupAddress,
      pickupDate,
      containerType,
      specialInstructions
    } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    const booking = new Booking({
      customer: customerId,
      shipmentType: SHIPMENT_TYPES.SEA_FREIGHT,
      originCountry,
      originWarehouse,
      destinationCountry,
      destinationAddress,
      productType,
      packageType,
      cargoDetails: {
        ...cargoDetails,
        containerType: containerType || '20FT'
      },
      shippingMode,
      pickupRequired,
      pickupAddress,
      pickupDate,
      specialInstructions,
      status: BOOKING_STATUS.REQUESTED
    });

    // Generate quotation for sea freight
    booking.quotation = await calculateShippingCost({
      shipmentType: SHIPMENT_TYPES.SEA_FREIGHT,
      origin: originCountry,
      destination: destinationCountry,
      weight: cargoDetails.weight,
      volume: cargoDetails.volume,
      productType,
      containerType: containerType || '20FT'
    });

    await booking.save();

    res.status(201).json({
      success: true,
      message: 'Sea freight booking created successfully',
      data: {
        bookingNumber: booking.bookingNumber,
        bookingId: booking._id,
        quotation: booking.quotation,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Sea freight booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating sea freight booking',
      error: error.message 
    });
  }
};

/**
 * 📦 Create Express Courier Booking
 */
exports.createExpressCourierBooking = async (req, res) => {
  try {
    const {
      customerId,
      originCountry,
      originWarehouse,
      destinationCountry,
      destinationAddress,
      productType,
      packageType,
      cargoDetails,
      shippingMode,
      pickupRequired,
      pickupAddress,
      pickupDate,
      deliverySpeed,
      specialInstructions
    } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    const booking = new Booking({
      customer: customerId,
      shipmentType: SHIPMENT_TYPES.EXPRESS_COURIER,
      originCountry,
      originWarehouse,
      destinationCountry,
      destinationAddress,
      productType,
      packageType,
      cargoDetails,
      shippingMode,
      pickupRequired,
      pickupAddress,
      pickupDate,
      specialInstructions,
      status: BOOKING_STATUS.REQUESTED
    });

    // Generate quotation for express
    booking.quotation = await calculateShippingCost({
      shipmentType: SHIPMENT_TYPES.EXPRESS_COURIER,
      origin: originCountry,
      destination: destinationCountry,
      weight: cargoDetails.weight,
      volume: cargoDetails.volume,
      productType,
      deliverySpeed: deliverySpeed || 'STANDARD'
    });

    await booking.save();

    res.status(201).json({
      success: true,
      message: 'Express courier booking created successfully',
      data: {
        bookingNumber: booking.bookingNumber,
        bookingId: booking._id,
        quotation: booking.quotation,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Express courier booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating express courier booking',
      error: error.message 
    });
  }
};

/**
 * 💰 Get Booking Quotation
 */
exports.getBookingQuotation = async (req, res) => {
  try {
    const {
      shipmentType,
      origin,
      destination,
      weight,
      volume,
      productType,
      packageType,
      hazardous,
      temperatureControlled,
      deliverySpeed
    } = req.body;

    // Validate required fields
    if (!shipmentType || !origin || !destination || !weight || !volume) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const quotation = await calculateShippingCost({
      shipmentType,
      origin,
      destination,
      weight: parseFloat(weight),
      volume: parseFloat(volume),
      productType,
      packageType,
      hazardous: hazardous === 'true',
      temperatureControlled: temperatureControlled === 'true',
      deliverySpeed
    });

    res.status(200).json({
      success: true,
      message: 'Quotation generated successfully',
      data: quotation
    });
  } catch (error) {
    console.error('Quotation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating quotation',
      error: error.message 
    });
  }
};

/**
 * 🧮 Calculate Shipping Cost
 */
exports.calculateShippingCost = async (params) => {
  const {
    shipmentType,
    origin,
    destination,
    weight,
    volume,
    productType,
    containerType,
    deliverySpeed,
    hazardous = false,
    temperatureControlled = false
  } = params;

  // Base rates (in USD)
  const baseRates = {
    [SHIPMENT_TYPES.AIR_FREIGHT]: 5.50, // per kg
    [SHIPMENT_TYPES.SEA_FREIGHT]: 1200, // per container (20FT)
    [SHIPMENT_TYPES.EXPRESS_COURIER]: 8.00 // per kg
  };

  // Route multipliers
  const routeMultipliers = {
    'CHINA-USA': 1.2,
    'CHINA-UK': 1.3,
    'CHINA-CANADA': 1.1,
    'THAILAND-USA': 1.4,
    'THAILAND-UK': 1.5,
    'THAILAND-CANADA': 1.3,
    'CHINA-THAILAND': 0.8,
    'THAILAND-CHINA': 0.8
  };

  // Product type multipliers
  const productMultipliers = {
    [PRODUCT_TYPES.GENERAL_MERCHANDISE]: 1.0,
    [PRODUCT_TYPES.ELECTRONICS]: 1.2,
    [PRODUCT_TYPES.TEXTILES]: 0.9,
    [PRODUCT_TYPES.FOOD]: 1.5,
    [PRODUCT_TYPES.CHEMICALS]: 2.0,
    [PRODUCT_TYPES.PHARMACEUTICALS]: 2.5,
    [PRODUCT_TYPES.MACHINERY]: 1.3,
    [PRODUCT_TYPES.FURNITURE]: 1.1,
    [PRODUCT_TYPES.AUTO_PARTS]: 1.4,
    [PRODUCT_TYPES.PERISHABLE]: 2.0
  };

  // Calculate base cost
  let freightCost = 0;
  const routeKey = `${origin}-${destination}`;
  const routeMultiplier = routeMultipliers[routeKey] || 1.0;
  const productMultiplier = productMultipliers[productType] || 1.0;

  switch (shipmentType) {
    case SHIPMENT_TYPES.AIR_FREIGHT:
      freightCost = baseRates[shipmentType] * weight * routeMultiplier * productMultiplier;
      break;
    
    case SHIPMENT_TYPES.SEA_FREIGHT:
      freightCost = baseRates[shipmentType] * routeMultiplier * productMultiplier;
      if (containerType === '40FT') freightCost *= 1.8;
      break;
    
    case SHIPMENT_TYPES.EXPRESS_COURIER:
      let speedMultiplier = 1.0;
      if (deliverySpeed === 'EXPRESS') speedMultiplier = 1.5;
      if (deliverySpeed === 'SAME_DAY') speedMultiplier = 2.0;
      
      freightCost = baseRates[shipmentType] * weight * routeMultiplier * productMultiplier * speedMultiplier;
      break;
  }

  // Additional charges
  const handlingFee = freightCost * 0.10; // 10% of freight cost
  const warehouseFee = volume * 25; // $25 per CBM
  const customsFee = freightCost * 0.15; // 15% of freight cost for customs processing
  let insuranceFee = freightCost * 0.02; // 2% insurance

  // Additional risk charges
  if (hazardous) {
    freightCost *= 1.5;
    insuranceFee *= 2;
  }
  
  if (temperatureControlled) {
    freightCost *= 1.3;
  }

  // Calculate total
  const totalAmount = freightCost + handlingFee + warehouseFee + customsFee + insuranceFee;

  // Determine currency based on destination
  let currency = CURRENCIES.USD;
  if (destination === COUNTRIES.UK) currency = CURRENCIES.GBP;
  if (destination === COUNTRIES.CANADA) currency = CURRENCIES.CAD;
  if (destination === COUNTRIES.THAILAND) currency = CURRENCIES.THB;
  if (destination === COUNTRIES.CHINA) currency = CURRENCIES.CNY;

  // Currency conversion rates (mock)
  const conversionRates = {
    [CURRENCIES.USD]: 1,
    [CURRENCIES.GBP]: 0.79,
    [CURRENCIES.CAD]: 1.36,
    [CURRENCIES.THB]: 35.5,
    [CURRENCIES.CNY]: 7.2
  };

  const convertToCurrency = (amount, targetCurrency) => {
    const rate = conversionRates[targetCurrency] || 1;
    return Math.round(amount * rate * 100) / 100;
  };

  return {
    freightCost: convertToCurrency(freightCost, currency),
    handlingFee: convertToCurrency(handlingFee, currency),
    warehouseFee: convertToCurrency(warehouseFee, currency),
    customsFee: convertToCurrency(customsFee, currency),
    insuranceFee: convertToCurrency(insuranceFee, currency),
    totalAmount: convertToCurrency(totalAmount, currency),
    currency,
    exchangeRate: conversionRates[currency],
    baseCurrency: CURRENCIES.USD
  };
};

/**
 * ✅ Validate Booking Data
 */
exports.validateBookingData = async (req, res, next) => {
  try {
    const errors = [];
    const data = req.body;

    // Required field validation
    const requiredFields = [
      'customerId', 'originCountry', 'destinationCountry', 
      'productType', 'packageType', 'cargoDetails'
    ];
    
    requiredFields.forEach(field => {
      if (!data[field]) {
        errors.push(`${field} is required`);
      }
    });

    // Cargo details validation
    if (data.cargoDetails) {
      const { numberOfCartons, weight, volume } = data.cargoDetails;
      
      if (!numberOfCartons || numberOfCartons < 1) {
        errors.push('Number of cartons must be at least 1');
      }
      
      if (!weight || weight < 0.1) {
        errors.push('Weight must be at least 0.1 kg');
      }
      
      if (!volume || volume < 0.01) {
        errors.push('Volume must be at least 0.01 CBM');
      }
    }

    // Country validation
    if (data.originCountry && !Object.values(COUNTRIES).includes(data.originCountry)) {
      errors.push('Invalid origin country');
    }
    
    if (data.destinationCountry && !Object.values(COUNTRIES).includes(data.destinationCountry)) {
      errors.push('Invalid destination country');
    }

    // Product type validation
    if (data.productType && !Object.values(PRODUCT_TYPES).includes(data.productType)) {
      errors.push('Invalid product type');
    }

    // Package type validation
    if (data.packageType && !Object.values(PACKAGE_TYPES).includes(data.packageType)) {
      errors.push('Invalid package type');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Validation error',
      error: error.message 
    });
  }
};

/**
 * ⚙️ Set Shipping Mode
 */
exports.setShippingMode = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { shippingMode } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }

    booking.shippingMode = shippingMode;
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Shipping mode updated successfully',
      data: booking
    });
  } catch (error) {
    console.error('Set shipping mode error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating shipping mode',
      error: error.message 
    });
  }
};

/**
 * 🚚 Set Pickup Required
 */
exports.setPickupRequired = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { pickupRequired, pickupAddress, pickupDate } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }

    booking.pickupRequired = pickupRequired;
    
    if (pickupRequired) {
      booking.pickupAddress = pickupAddress;
      booking.pickupDate = pickupDate;
    } else {
      booking.pickupAddress = null;
      booking.pickupDate = null;
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Pickup details updated successfully',
      data: booking
    });
  } catch (error) {
    console.error('Set pickup error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating pickup details',
      error: error.message 
    });
  }
};

/**
 * 📦 Set Cargo Details
 */
exports.setCargoDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const cargoDetails = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }

    // Update cargo details
    booking.cargoDetails = {
      ...booking.cargoDetails,
      ...cargoDetails
    };

    // Recalculate quotation
    booking.quotation = await calculateShippingCost({
      shipmentType: booking.shipmentType,
      origin: booking.originCountry,
      destination: booking.destinationCountry,
      weight: booking.cargoDetails.weight,
      volume: booking.cargoDetails.volume,
      productType: booking.productType,
      packageType: booking.packageType,
      hazardous: booking.cargoDetails.hazardous,
      temperatureControlled: booking.cargoDetails.temperatureControlled
    });

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Cargo details updated successfully',
      data: {
        cargoDetails: booking.cargoDetails,
        quotation: booking.quotation
      }
    });
  } catch (error) {
    console.error('Set cargo details error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating cargo details',
      error: error.message 
    });
  }
};

/**
 * 📋 Get All Bookings
 */
exports.getAllBookings = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      shipmentType,
      originCountry,
      destinationCountry,
      dateFrom,
      dateTo,
      customerId
    } = req.query;

    const query = {};

    // Apply filters
    if (status) query.status = status;
    if (shipmentType) query.shipmentType = shipmentType;
    if (originCountry) query.originCountry = originCountry;
    if (destinationCountry) query.destinationCountry = destinationCountry;
    if (customerId) query.customer = customerId;
    
    // Date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('customer', 'companyName contactPerson email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Booking.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        bookings,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching bookings',
      error: error.message 
    });
  }
};

/**
 * 🔍 Get Booking by ID
 */
exports.getBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate('customer', 'companyName contactPerson email phone address')
      .populate('assignedTo', 'name email role');

    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching booking',
      error: error.message 
    });
  }
};

/**
 * ✅ Confirm Booking
 */
exports.confirmBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { 
      trackingNumber, 
      estimatedDeparture, 
      estimatedArrival,
      assignedTo,
      containerId,
      airwayBillNumber 
    } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }

    // Update booking
    booking.status = BOOKING_STATUS.CONFIRMED;
    booking.trackingNumber = trackingNumber;
    booking.estimatedDeparture = estimatedDeparture;
    booking.estimatedArrival = estimatedArrival;
    booking.assignedTo = assignedTo;
    
    if (containerId) booking.containerId = containerId;
    if (airwayBillNumber) booking.airwayBillNumber = airwayBillNumber;

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking confirmed successfully',
      data: booking
    });
  } catch (error) {
    console.error('Confirm booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error confirming booking',
      error: error.message 
    });
  }
};

/**
 * ❌ Cancel Booking
 */
exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { cancellationReason } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }

    booking.status = BOOKING_STATUS.CANCELLED;
    booking.notes = `Cancelled: ${cancellationReason}`;
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: booking
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cancelling booking',
      error: error.message 
    });
  }
};

/**
 * 📄 Upload Document to Booking
 */
exports.uploadDocument = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { name, type, url } = req.body;
    const uploadedBy = req.user.id; // Assuming user is authenticated

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }

    booking.documents.push({
      name,
      type,
      url,
      uploadedBy
    });

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Document uploaded successfully',
      data: booking.documents
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error uploading document',
      error: error.message 
    });
  }
};

/**
 * 📊 Get Booking Statistics
 */
exports.getBookingStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const stats = await Booking.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: '$quotation.totalAmount' },
          averageBookingValue: { $avg: '$quotation.totalAmount' },
          byShipmentType: {
            $push: {
              type: '$shipmentType',
              amount: '$quotation.totalAmount'
            }
          },
          byStatus: {
            $push: {
              status: '$status',
              count: 1
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalBookings: 1,
          totalRevenue: 1,
          averageBookingValue: 1,
          shipmentTypeBreakdown: {
            $arrayToObject: {
              $map: {
                input: '$byShipmentType',
                as: 'item',
                in: {
                  k: '$$item.type',
                  v: { $sum: '$$item.amount' }
                }
              }
            }
          },
          statusBreakdown: {
            $arrayToObject: {
              $map: {
                input: '$byStatus',
                as: 'item',
                in: {
                  k: '$$item.status',
                  v: { $sum: '$$item.count' }
                }
              }
            }
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: stats[0] || {
        totalBookings: 0,
        totalRevenue: 0,
        averageBookingValue: 0,
        shipmentTypeBreakdown: {},
        statusBreakdown: {}
      }
    });
  } catch (error) {
    console.error('Statistics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching statistics',
      error: error.message 
    });
  }
};