const Booking = require('../models/bookingModel'); 
const User = require('../models/userModel');
const { validationResult } = require('express-validator');
 
exports.createBooking = async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                errors: errors.array() 
            });
        }

        const bookingData = {
            ...req.body,
            createdBy: req.user.id,
            customer: req.user.role === 'customer' ? req.user.customerId : req.body.customer
        };

        // Calculate totals
        if (bookingData.shipmentDetails?.cargoDetails) {
            bookingData.shipmentDetails.totalCartons = bookingData.shipmentDetails.cargoDetails.reduce(
                (sum, item) => sum + item.cartons, 0
            );
            bookingData.shipmentDetails.totalWeight = bookingData.shipmentDetails.cargoDetails.reduce(
                (sum, item) => sum + item.weight, 0
            );
            bookingData.shipmentDetails.totalVolume = bookingData.shipmentDetails.cargoDetails.reduce(
                (sum, item) => sum + item.volume, 0
            );
        }

        // Add initial timeline entry
        bookingData.timeline = [{
            status: 'booking_requested',
            description: 'Booking request submitted',
            updatedBy: req.user.id,
            timestamp: new Date()
        }];

        const booking = await Booking.create(bookingData);

        // Populate customer and other references
        await booking.populate([
            { path: 'customer', select: 'companyName contactPerson email' },
            { path: 'createdBy', select: 'name email' }
        ]);

        res.status(201).json({
            success: true,
            data: booking,
            message: 'Booking created successfully'
        });

    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating booking',
            error: error.message
        });
    }
};
 
exports.getBookings = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            customer,
            origin,
            destination,
            shipmentType,
            startDate,
            endDate,
            search
        } = req.query;

        // Build filter object
        let filter = {};

        // Role-based filtering
        if (req.user.role === 'customer') {
            filter.customer = req.user.customerId;
        } else if (req.user.role === 'warehouse_manager') {
            filter.status = { $in: ['received_at_warehouse', 'consolidation_in_progress'] };
        }

        // Apply filters
        if (status) filter.status = status;
        if (customer) filter.customer = customer;
        if (origin) filter['shipmentDetails.origin'] = origin;
        if (destination) filter['shipmentDetails.destination'] = destination;
        if (shipmentType) filter['shipmentDetails.shipmentType'] = shipmentType;
        
        // Date range filter
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // Search by booking number or tracking number
        if (search) {
            filter.$or = [
                { bookingNumber: new RegExp(search, 'i') },
                { trackingNumber: new RegExp(search, 'i') },
                { customerReference: new RegExp(search, 'i') }
            ];
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Execute query
        const bookings = await Booking.find(filter)
            .populate('customer', 'companyName contactPerson email')
            .populate('assignedTo', 'name email')
            .populate('createdBy', 'name email')
            .populate('containerId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Get total count
        const total = await Booking.countDocuments(filter);

        // Get statistics
        const stats = await Booking.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalWeight: { $sum: '$shipmentDetails.totalWeight' },
                    totalVolume: { $sum: '$shipmentDetails.totalVolume' },
                    totalValue: { $sum: '$quotedAmount' },
                    avgProcessingTime: { $avg: { 
                        $divide: [
                            { $subtract: ['$actualDeliveryDate', '$createdAt'] },
                            1000 * 60 * 60 * 24 // Convert to days
                        ]
                    }}
                }
            }
        ]);

        res.json({
            success: true,
            data: bookings,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            },
            stats: stats[0] || {},
            message: 'Bookings retrieved successfully'
        });

    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving bookings',
            error: error.message
        });
    }
};

// @desc    Get single booking by ID
// @route   GET /api/bookings/:id
// @access  Private
exports.getBookingById = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('customer', 'companyName contactPerson email phone address')
            .populate('assignedTo', 'name email role')
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .populate('containerId')
            .populate('documents')
            .populate('invoiceId');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check authorization for customers
        if (req.user.role === 'customer' && 
            booking.customer._id.toString() !== req.user.customerId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to view this booking'
            });
        }

        // Calculate progress percentage
        const progress = booking.getProgressPercentage();

        res.json({
            success: true,
            data: {
                ...booking.toObject(),
                progressPercentage: progress
            },
            message: 'Booking retrieved successfully'
        });

    } catch (error) {
        console.error('Get booking by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving booking',
            error: error.message
        });
    }
};

// @desc    Update booking
// @route   PUT /api/bookings/:id
// @access  Private (Admin, Operations Staff)
exports.updateBooking = async (req, res) => {
    try {
        let booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Prevent updates to delivered/cancelled bookings
        if (['delivered', 'cancelled', 'returned'].includes(booking.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot update booking in ${booking.status} status`
            });
        }

        // Add updatedBy
        req.body.updatedBy = req.user.id;
        req.body.updatedAt = Date.now();

        // Recalculate totals if cargo details changed
        if (req.body.shipmentDetails?.cargoDetails) {
            req.body.shipmentDetails.totalCartons = req.body.shipmentDetails.cargoDetails.reduce(
                (sum, item) => sum + item.cartons, 0
            );
            req.body.shipmentDetails.totalWeight = req.body.shipmentDetails.cargoDetails.reduce(
                (sum, item) => sum + item.weight, 0
            );
            req.body.shipmentDetails.totalVolume = req.body.shipmentDetails.cargoDetails.reduce(
                (sum, item) => sum + item.volume, 0
            );
        }

        // Update booking
        booking = await Booking.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('customer', 'companyName contactPerson')
         .populate('assignedTo', 'name email');

        res.json({
            success: true,
            data: booking,
            message: 'Booking updated successfully'
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

// @desc    Update booking status
// @route   PATCH /api/bookings/:id/status
// @access  Private (Operations Staff, Warehouse Manager)
exports.updateBookingStatus = async (req, res) => {
    try {
        const { status, location, description } = req.body;
        
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check if status transition is allowed
        const allowedTransitions = {
            'booking_requested': ['booking_confirmed', 'cancelled'],
            'booking_confirmed': ['pickup_scheduled', 'received_at_warehouse', 'cancelled'],
            'pickup_scheduled': ['received_at_warehouse', 'cancelled'],
            'received_at_warehouse': ['consolidation_in_progress', 'cancelled'],
            'consolidation_in_progress': ['loaded_in_container', 'loaded_on_flight', 'cancelled'],
            'loaded_in_container': ['in_transit'],
            'loaded_on_flight': ['in_transit'],
            'in_transit': ['arrived_at_destination'],
            'arrived_at_destination': ['customs_clearance', 'out_for_delivery'],
            'customs_clearance': ['out_for_delivery', 'returned'],
            'out_for_delivery': ['delivered'],
            'delivered': [],
            'cancelled': [],
            'returned': []
        };

        if (!allowedTransitions[booking.status].includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot transition from ${booking.status} to ${status}`
            });
        }

        // Update status with timeline entry
        booking.updateStatus(status, req.user.id, location, description);
        await booking.save();

        await booking.populate([
            { path: 'customer', select: 'companyName' },
            { path: 'assignedTo', select: 'name email' }
        ]);

        res.json({
            success: true,
            data: booking,
            message: `Booking status updated to ${status}`
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

// @desc    Assign booking to staff or container
// @route   POST /api/bookings/:id/assign
// @access  Private (Admin, Operations Staff)
exports.assignBooking = async (req, res) => {
    try {
        const { assignedTo, containerId, airwayBillNumber } = req.body;
        
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        if (assignedTo) {
            const user = await User.findById(assignedTo);
            if (!user || !['operations', 'warehouse_manager'].includes(user.role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid staff assignment'
                });
            }
            booking.assignedTo = assignedTo;
        }

        if (containerId) {
            booking.containerId = containerId;
        }

        if (airwayBillNumber) {
            booking.airwayBillNumber = airwayBillNumber;
        }

        booking.updatedBy = req.user.id;
        await booking.save();

        await booking.populate('assignedTo', 'name email');

        res.json({
            success: true,
            data: booking,
            message: 'Booking assigned successfully'
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

// @desc    Add note to booking
// @route   POST /api/bookings/:id/notes
// @access  Private
exports.addBookingNote = async (req, res) => {
    try {
        const { text } = req.body;
        
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        booking.notes.push({
            text,
            createdBy: req.user.id,
            createdAt: new Date()
        });

        await booking.save();

        res.json({
            success: true,
            data: booking.notes,
            message: 'Note added successfully'
        });

    } catch (error) {
        console.error('Add booking note error:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding note',
            error: error.message
        });
    }
};

// @desc    Cancel booking
// @route   POST /api/bookings/:id/cancel
// @access  Private
exports.cancelBooking = async (req, res) => {
    try {
        const { reason } = req.body;
        
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check if booking can be cancelled
        const cancellableStatuses = ['booking_requested', 'booking_confirmed', 'pickup_scheduled'];
        if (!cancellableStatuses.includes(booking.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel booking in ${booking.status} status`
            });
        }

        booking.status = 'cancelled';
        booking.cancellationReason = reason;
        booking.cancelledBy = req.user.id;
        booking.cancelledAt = new Date();
        
        booking.timeline.push({
            status: 'cancelled',
            description: reason || 'Booking cancelled',
            updatedBy: req.user.id,
            timestamp: new Date()
        });

        await booking.save();

        res.json({
            success: true,
            data: booking,
            message: 'Booking cancelled successfully'
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

// @desc    Get booking timeline
// @route   GET /api/bookings/:id/timeline
// @access  Private
exports.getBookingTimeline = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .select('timeline status bookingNumber trackingNumber')
            .populate('timeline.updatedBy', 'name');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        res.json({
            success: true,
            data: {
                bookingNumber: booking.bookingNumber,
                trackingNumber: booking.trackingNumber,
                currentStatus: booking.status,
                timeline: booking.timeline.sort((a, b) => b.timestamp - a.timestamp)
            },
            message: 'Timeline retrieved successfully'
        });

    } catch (error) {
        console.error('Get booking timeline error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving timeline',
            error: error.message
        });
    }
};

// @desc    Get booking statistics
// @route   GET /api/bookings/stats/dashboard
// @access  Private (Admin, Operations Staff)
exports.getBookingStats = async (req, res) => {
    try {
        const stats = await Booking.aggregate([
            {
                $facet: {
                    // Status breakdown
                    statusBreakdown: [
                        {
                            $group: {
                                _id: '$status',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    
                    // Monthly trends
                    monthlyTrends: [
                        {
                            $group: {
                                _id: {
                                    year: { $year: '$createdAt' },
                                    month: { $month: '$createdAt' }
                                },
                                count: { $sum: 1 },
                                totalValue: { $sum: '$quotedAmount' }
                            }
                        },
                        { $sort: { '_id.year': -1, '_id.month': -1 } },
                        { $limit: 12 }
                    ],
                    
                    // Route performance
                    routePerformance: [
                        {
                            $group: {
                                _id: {
                                    origin: '$shipmentDetails.origin',
                                    destination: '$shipmentDetails.destination'
                                },
                                count: { $sum: 1 },
                                avgTransitTime: {
                                    $avg: {
                                        $divide: [
                                            { $subtract: ['$actualDeliveryDate', '$estimatedDepartureDate'] },
                                            1000 * 60 * 60 * 24
                                        ]
                                    }
                                }
                            }
                        }
                    ],
                    
                    // Shipment type distribution
                    typeDistribution: [
                        {
                            $group: {
                                _id: '$shipmentDetails.shipmentType',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    
                    // Overall metrics
                    overallMetrics: [
                        {
                            $group: {
                                _id: null,
                                totalBookings: { $sum: 1 },
                                activeBookings: {
                                    $sum: {
                                        $cond: [
                                            { $in: ['$status', ['delivered', 'cancelled', 'returned']] },
                                            0,
                                            1
                                        ]
                                    }
                                },
                                totalRevenue: { $sum: '$quotedAmount' },
                                avgProcessingTime: {
                                    $avg: {
                                        $cond: [
                                            { $ne: ['$actualDeliveryDate', null] },
                                            {
                                                $divide: [
                                                    { $subtract: ['$actualDeliveryDate', '$createdAt'] },
                                                    1000 * 60 * 60 * 24
                                                ]
                                            },
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

        res.json({
            success: true,
            data: stats[0],
            message: 'Statistics retrieved successfully'
        });

    } catch (error) {
        console.error('Get booking stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving statistics',
            error: error.message
        });
    }
};

// @desc    Bulk update bookings
// @route   POST /api/bookings/bulk-update
// @access  Private (Admin, Operations Staff)
exports.bulkUpdateBookings = async (req, res) => {
    try {
        const { bookingIds, updateData } = req.body;

        if (!bookingIds || !bookingIds.length) {
            return res.status(400).json({
                success: false,
                message: 'No bookings selected'
            });
        }

        // Add audit fields
        updateData.updatedBy = req.user.id;
        updateData.updatedAt = Date.now();

        const result = await Booking.updateMany(
            { _id: { $in: bookingIds } },
            updateData,
            { runValidators: true }
        );

        res.json({
            success: true,
            data: result,
            message: `Updated ${result.modifiedCount} bookings successfully`
        });

    } catch (error) {
        console.error('Bulk update bookings error:', error);
        res.status(500).json({
            success: false,
            message: 'Error performing bulk update',
            error: error.message
        });
    }
};

// @desc    Search bookings by tracking number
// @route   GET /api/bookings/track/:trackingNumber
// @access  Public
exports.trackBooking = async (req, res) => {
    try {
        const booking = await Booking.findOne({ 
            trackingNumber: req.params.trackingNumber 
        })
        .select('bookingNumber trackingNumber status timeline estimatedArrivalDate currentLocation shipmentDetails.origin shipmentDetails.destination')
        .populate('timeline.updatedBy', 'name');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found with this tracking number'
            });
        }

        // Get latest location update
        const latestTimeline = booking.timeline.sort((a, b) => b.timestamp - a.timestamp)[0];

        res.json({
            success: true,
            data: {
                trackingNumber: booking.trackingNumber,
                bookingNumber: booking.bookingNumber,
                currentStatus: booking.status,
                origin: booking.shipmentDetails.origin,
                destination: booking.shipmentDetails.destination,
                estimatedArrival: booking.estimatedArrivalDate,
                currentLocation: booking.currentLocation || latestTimeline?.location,
                lastUpdate: latestTimeline?.timestamp,
                timeline: booking.timeline.slice(0, 10) // Last 10 updates
            },
            message: 'Tracking information retrieved successfully'
        });

    } catch (error) {
        console.error('Track booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Error tracking booking',
            error: error.message
        });
    }
};