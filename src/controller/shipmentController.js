const Shipment = require('../models/shipmentModel');
const Booking = require('../models/shipmentModel');

// @desc    Create new shipment
// @route   POST /api/shipments
// @access  Private
exports.createShipment = async (req, res) => {
    try {
        const booking = await Booking.findById(req.body.bookingId);
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        const existingShipment = await Shipment.findOne({ bookingId: req.body.bookingId });
        if (existingShipment) {
            return res.status(400).json({
                success: false,
                message: 'Shipment already exists for this booking'
            });
        }

        const shipmentData = {
            ...req.body,
            shipper: {
                name: booking.customer?.companyName || 'N/A',
                company: booking.customer?.companyName,
                address: booking.pickupAddress?.addressLine1,
                city: booking.pickupAddress?.city,
                country: booking.pickupAddress?.country,
                contactPerson: booking.customer?.contactPerson,
                phone: booking.customer?.phone,
                email: booking.customer?.email
            },
            consignee: {
                name: booking.deliveryAddress?.consigneeName,
                company: booking.deliveryAddress?.companyName,
                address: booking.deliveryAddress?.addressLine1,
                city: booking.deliveryAddress?.city,
                country: booking.deliveryAddress?.country,
                contactPerson: booking.deliveryAddress?.consigneeName,
                phone: booking.deliveryAddress?.phone,
                email: booking.deliveryAddress?.email
            },
            origin: {
                location: booking.shipmentDetails?.origin,
                address: booking.pickupAddress?.addressLine1,
                city: booking.pickupAddress?.city,
                country: booking.pickupAddress?.country
            },
            destination: {
                location: booking.shipmentDetails?.destination,
                address: booking.deliveryAddress?.addressLine1,
                city: booking.deliveryAddress?.city,
                country: booking.deliveryAddress?.country
            },
            packages: req.body.packages || [{
                packageType: 'Carton',
                quantity: booking.shipmentDetails?.totalCartons || 1,
                weight: booking.shipmentDetails?.totalWeight || 0,
                volume: booking.shipmentDetails?.totalVolume || 0,
                description: booking.shipmentDetails?.cargoDetails?.[0]?.description || 'General Cargo'
            }],
            createdBy: req.user.id
        };

        const shipment = await Shipment.create(shipmentData);
        
        booking.status = 'booking_confirmed';
        await booking.save();

        await shipment.populate([
            { path: 'bookingId', select: 'bookingNumber' },
            { path: 'createdBy', select: 'name email' }
        ]);

        res.status(201).json({
            success: true,
            data: shipment,
            message: 'Shipment created successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating shipment',
            error: error.message
        });
    }
};

// @desc    Get all shipments
// @route   GET /api/shipments
// @access  Private
exports.getAllShipments = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            mode,
            shipmentType,
            search
        } = req.query;

        let filter = {};

        if (req.user.role === 'customer') {
            filter['shipper.email'] = req.user.email;
        }

        if (status) filter.status = status;
        if (mode) filter.mode = mode;
        if (shipmentType) filter.shipmentType = shipmentType;

        if (search) {
            filter.$or = [
                { shipmentNumber: new RegExp(search, 'i') },
                { trackingNumber: new RegExp(search, 'i') }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const shipments = await Shipment.find(filter)
            .populate('bookingId', 'bookingNumber')
            .populate('assignedTo', 'name email')
            .sort({ createdDate: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Shipment.countDocuments(filter);

        res.json({
            success: true,
            data: shipments,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching shipments',
            error: error.message
        });
    }
};

// @desc    Get single shipment
// @route   GET /api/shipments/:id
// @access  Private
exports.getShipmentById = async (req, res) => {
    try {
        const shipment = await Shipment.findById(req.params.id)
            .populate('bookingId')
            .populate('assignedTo', 'name email')
            .populate('createdBy', 'name email')
            .populate('documents');

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        if (req.user.role === 'customer' && 
            shipment.shipper.email !== req.user.email) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        const progress = shipment.getProgressPercentage();

        res.json({
            success: true,
            data: {
                ...shipment.toObject(),
                progressPercentage: progress,
                isOnTrack: shipment.isOnTrack(),
                eta: shipment.getETA()
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching shipment',
            error: error.message
        });
    }
};

// @desc    Update shipment
// @route   PUT /api/shipments/:id
// @access  Private
exports.updateShipment = async (req, res) => {
    try {
        const shipment = await Shipment.findById(req.params.id);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        if (['Delivered', 'Cancelled'].includes(shipment.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot update ${shipment.status} shipment`
            });
        }

        req.body.updatedBy = req.user.id;
        
        const updatedShipment = await Shipment.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            data: updatedShipment,
            message: 'Shipment updated successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating shipment',
            error: error.message
        });
    }
};

// @desc    Update shipment status
// @route   PATCH /api/shipments/:id/status
// @access  Private
exports.updateShipmentStatus = async (req, res) => {
    try {
        const { status, location, description } = req.body;
        
        const shipment = await Shipment.findById(req.params.id);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        shipment.updateStatus(status, req.user.id, location, description);
        await shipment.save();

        res.json({
            success: true,
            data: shipment,
            message: `Status updated to ${status}`
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating status',
            error: error.message
        });
    }
};

// @desc    Add tracking update
// @route   POST /api/shipments/:id/tracking
// @access  Private
exports.addTrackingUpdate = async (req, res) => {
    try {
        const { location, status, description } = req.body;
        
        const shipment = await Shipment.findById(req.params.id);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        shipment.addTrackingUpdate(location, status, description, req.user.id);
        await shipment.save();

        res.json({
            success: true,
            data: shipment.trackingUpdates,
            message: 'Tracking update added'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error adding tracking update',
            error: error.message
        });
    }
};

// @desc    Add cost to shipment
// @route   POST /api/shipments/:id/costs
// @access  Private
exports.addCost = async (req, res) => {
    try {
        const shipment = await Shipment.findById(req.params.id);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        shipment.addCost(req.body);
        await shipment.save();

        res.json({
            success: true,
            data: shipment.costs,
            message: 'Cost added successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error adding cost',
            error: error.message
        });
    }
};

// @desc    Assign shipment to staff
// @route   POST /api/shipments/:id/assign
// @access  Private
exports.assignShipment = async (req, res) => {
    try {
        const { assignedTo } = req.body;
        
        const shipment = await Shipment.findById(req.params.id);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        shipment.assignedTo = assignedTo;
        shipment.updatedBy = req.user.id;
        await shipment.save();

        await shipment.populate('assignedTo', 'name email');

        res.json({
            success: true,
            data: shipment,
            message: 'Shipment assigned successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error assigning shipment',
            error: error.message
        });
    }
};

// @desc    Add document to shipment
// @route   POST /api/shipments/:id/documents
// @access  Private
exports.addDocument = async (req, res) => {
    try {
        const { documentId, documentType } = req.body;
        
        const shipment = await Shipment.findById(req.params.id);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        shipment.documents.push(documentId);
        
        // Update required documents if exists
        const requiredDoc = shipment.requiredDocuments.find(
            d => d.documentType === documentType
        );
        if (requiredDoc) {
            requiredDoc.status = 'Uploaded';
            requiredDoc.uploadedAt = new Date();
            requiredDoc.uploadedBy = req.user.id;
        }

        await shipment.save();

        res.json({
            success: true,
            data: shipment.documents,
            message: 'Document added to shipment'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error adding document',
            error: error.message
        });
    }
};

// @desc    Add internal note
// @route   POST /api/shipments/:id/notes/internal
// @access  Private
exports.addInternalNote = async (req, res) => {
    try {
        const { text, isPrivate } = req.body;
        
        const shipment = await Shipment.findById(req.params.id);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        shipment.internalNotes.push({
            text,
            createdBy: req.user.id,
            createdAt: new Date(),
            isPrivate: isPrivate || false
        });

        await shipment.save();

        res.json({
            success: true,
            data: shipment.internalNotes,
            message: 'Note added successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error adding note',
            error: error.message
        });
    }
};

// @desc    Add customer note
// @route   POST /api/shipments/:id/notes/customer
// @access  Private
exports.addCustomerNote = async (req, res) => {
    try {
        const { text } = req.body;
        
        const shipment = await Shipment.findById(req.params.id);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        shipment.customerNotes.push({
            text,
            createdBy: req.user.id,
            createdAt: new Date(),
            isRead: false
        });

        await shipment.save();

        res.json({
            success: true,
            data: shipment.customerNotes,
            message: 'Customer note added successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error adding customer note',
            error: error.message
        });
    }
};

// @desc    Get shipment timeline
// @route   GET /api/shipments/:id/timeline
// @access  Private
exports.getShipmentTimeline = async (req, res) => {
    try {
        const shipment = await Shipment.findById(req.params.id)
            .select('shipmentNumber trackingNumber status milestones currentMilestone');

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        const timeline = shipment.getCustomerTimeline();

        res.json({
            success: true,
            data: {
                shipmentNumber: shipment.shipmentNumber,
                trackingNumber: shipment.trackingNumber,
                currentStatus: shipment.status,
                currentMilestone: shipment.currentMilestone,
                timeline
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching timeline',
            error: error.message
        });
    }
};

// @desc    Track shipment by tracking number
// @route   GET /api/shipments/track/:trackingNumber
// @access  Public
exports.trackShipment = async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ 
            trackingNumber: req.params.trackingNumber 
        })
        .select('shipmentNumber trackingNumber status milestones transport origin destination estimatedDelivery actualDelivery');

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        const timeline = shipment.getCustomerTimeline();
        const progress = shipment.getProgressPercentage();

        res.json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                shipmentNumber: shipment.shipmentNumber,
                currentStatus: shipment.status,
                origin: shipment.origin,
                destination: shipment.destination,
                eta: shipment.getETA(),
                progressPercentage: progress,
                isOnTrack: shipment.isOnTrack(),
                timeline: timeline.slice(0, 10)
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error tracking shipment',
            error: error.message
        });
    }
};

// @desc    Get shipment statistics
// @route   GET /api/shipments/stats/dashboard
// @access  Private
exports.getShipmentStats = async (req, res) => {
    try {
        const stats = await Shipment.aggregate([
            {
                $facet: {
                    statusBreakdown: [
                        {
                            $group: {
                                _id: '$status',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    modeBreakdown: [
                        {
                            $group: {
                                _id: '$mode',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    monthlyTrends: [
                        {
                            $group: {
                                _id: {
                                    year: { $year: '$createdDate' },
                                    month: { $month: '$createdDate' }
                                },
                                count: { $sum: 1 },
                                totalValue: { $sum: '$totalCost' }
                            }
                        },
                        { $sort: { '_id.year': -1, '_id.month': -1 } },
                        { $limit: 12 }
                    ],
                    routePerformance: [
                        {
                            $group: {
                                _id: {
                                    origin: '$origin.country',
                                    destination: '$destination.country'
                                },
                                count: { $sum: 1 },
                                avgTransitTime: {
                                    $avg: {
                                        $cond: [
                                            { $and: ['$transport.actualDeparture', '$transport.actualArrival'] },
                                            {
                                                $divide: [
                                                    { $subtract: ['$transport.actualArrival', '$transport.actualDeparture'] },
                                                    1000 * 60 * 60 * 24
                                                ]
                                            },
                                            null
                                        ]
                                    }
                                }
                            }
                        }
                    ],
                    overallMetrics: [
                        {
                            $group: {
                                _id: null,
                                totalShipments: { $sum: 1 },
                                activeShipments: {
                                    $sum: {
                                        $cond: [
                                            { $in: ['$status', ['Delivered', 'Cancelled', 'Returned']] },
                                            0,
                                            1
                                        ]
                                    }
                                },
                                totalRevenue: { $sum: '$totalCost' },
                                totalWeight: { $sum: '$totalWeight' },
                                totalVolume: { $sum: '$totalVolume' },
                                onTimeDelivery: {
                                    $avg: {
                                        $cond: [
                                            { 
                                                $and: [
                                                    '$promisedDeliveryDate',
                                                    '$actualDeliveryDate',
                                                    { $lte: ['$actualDeliveryDate', '$promisedDeliveryDate'] }
                                                ]
                                            },
                                            100,
                                            0
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
            data: stats[0]
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics',
            error: error.message
        });
    }
};

// @desc    Cancel shipment
// @route   POST /api/shipments/:id/cancel
// @access  Private
exports.cancelShipment = async (req, res) => {
    try {
        const { reason } = req.body;
        
        const shipment = await Shipment.findById(req.params.id);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        const cancellableStatuses = ['Pending', 'Picked Up from Warehouse'];
        if (!cancellableStatuses.includes(shipment.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel shipment in ${shipment.status} status`
            });
        }

        shipment.cancellation = {
            reason,
            requestedBy: req.user.id,
            requestedAt: new Date()
        };
        
        shipment.updateStatus('Cancelled', req.user.id, '', reason);
        await shipment.save();

        res.json({
            success: true,
            data: shipment,
            message: 'Shipment cancelled successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error cancelling shipment',
            error: error.message
        });
    }
};

// @desc    Delete shipment
// @route   DELETE /api/shipments/:id
// @access  Private
exports.deleteShipment = async (req, res) => {
    try {
        const shipment = await Shipment.findById(req.params.id);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        if (shipment.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: 'Can only delete pending shipments'
            });
        }

        await shipment.deleteOne();

        res.json({
            success: true,
            message: 'Shipment deleted successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting shipment',
            error: error.message
        });
    }
};