// controllers/trackingController.js

const Shipment = require('../models/shipmentModel');
const Booking = require('../models/bookingModel');
const Consolidation = require('../models/consolidationModel');
const User = require('../models/userModel');
const { sendEmail } = require('../utils/emailService');
const { generateTrackingNumber } = require('../utils/trackingGenerator');

// ==================== HELPER FUNCTIONS ====================

const calculateProgress = (status) => {
    const order = [
        'pending',
        'booking_requested',
        'booking_confirmed',
        'picked_up_from_warehouse',
        'received_at_warehouse',
        'consolidated',
        'ready_for_dispatch',
        'loaded',
        'dispatched',
        'departed_port_of_origin',
        'in_transit_sea_freight',
        'arrived_at_destination_port',
        'arrived',
        'customs_cleared',
        'out_for_delivery',
        'delivered',
        'completed'
    ];
    
    const index = order.indexOf(status);
    if (index === -1) return 0;
    return Math.round((index / (order.length - 1)) * 100);
};

const formatStatus = (status) => {
    if (!status) return 'Unknown';
    return status.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
};

const getStatusDescription = (status) => {
    const descriptions = {
        'pending': 'Shipment created and pending processing',
        'booking_requested': 'Booking request submitted',
        'price_quoted': 'Price quote sent to customer',
        'booking_confirmed': 'Booking confirmed by customer',
        'picked_up_from_warehouse': 'Package picked up from warehouse',
        'received_at_warehouse': 'Package received at warehouse',
        'consolidated': 'Shipment consolidated with other cargo',
        'departed_port_of_origin': 'Vessel/flight departed from origin port',
        'in_transit_sea_freight': 'Shipment in transit',
        'arrived_at_destination_port': 'Arrived at destination port',
        'customs_cleared': 'Customs clearance completed',
        'out_for_delivery': 'Out for delivery',
        'delivered': 'Successfully delivered',
        'on_hold': 'Shipment on hold',
        'cancelled': 'Shipment cancelled',
        'returned': 'Shipment returned to sender'
    };
    return descriptions[status] || `Status updated to ${formatStatus(status)}`;
};

// ==================== 1. GET ALL TRACKINGS (Admin Only) ====================
exports.getAllTrackings = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status, 
            search,
            customerId,
            startDate,
            endDate,
            sort = '-createdAt' 
        } = req.query;

        console.log('📋 Admin fetching all trackings...');

        // Build filter query for shipments
        let shipmentFilter = {};
        let bookingFilter = {};

        if (status) {
            shipmentFilter.status = status;
            bookingFilter.status = status;
        }

        if (customerId) {
            shipmentFilter.customerId = customerId;
            bookingFilter.customer = customerId;
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            shipmentFilter.$or = [
                { trackingNumber: searchRegex },
                { shipmentNumber: searchRegex },
                { 'customerId.companyName': searchRegex }
            ];
            bookingFilter.$or = [
                { trackingNumber: searchRegex },
                { bookingNumber: searchRegex },
                { 'customer.companyName': searchRegex }
            ];
        }

        if (startDate || endDate) {
            const dateFilter = {};
            if (startDate) dateFilter.$gte = new Date(startDate);
            if (endDate) dateFilter.$lte = new Date(endDate);
            
            shipmentFilter.createdAt = dateFilter;
            bookingFilter.createdAt = dateFilter;
        }

        // Get shipments with pagination
        const shipments = await Shipment.find(shipmentFilter)
            .populate('customerId', 'firstName lastName companyName email phone')
            .populate('bookingId', 'bookingNumber')
            .populate('consolidationId', 'consolidationNumber containerNumber')
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        // Get bookings with pagination
        const bookings = await Booking.find(bookingFilter)
            .populate('customer', 'firstName lastName companyName email phone')
            .populate('shipmentId', 'shipmentNumber trackingNumber')
            .populate('invoiceId', 'invoiceNumber')
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        // Get total counts
        const totalShipments = await Shipment.countDocuments(shipmentFilter);
        const totalBookings = await Booking.countDocuments(bookingFilter);
        const total = totalShipments + totalBookings;

        // Combine and format results
        const trackings = [];

        // Format shipments
        shipments.forEach(s => {
            trackings.push({
                id: s._id,
                type: 'shipment',
                trackingNumber: s.trackingNumber,
                referenceNumber: s.shipmentNumber,
                bookingNumber: s.bookingId?.bookingNumber,
                consolidationNumber: s.consolidationId?.consolidationNumber,
                containerNumber: s.consolidationId?.containerNumber,
                status: s.status,
                statusDisplay: formatStatus(s.status),
                progress: calculateProgress(s.status),
                origin: s.shipmentDetails?.origin || s.origin || 'N/A',
                destination: s.shipmentDetails?.destination || s.destination || 'N/A',
                currentLocation: s.transport?.currentLocation?.location || 'N/A',
                customer: s.customerId ? {
                    id: s.customerId._id,
                    name: s.customerId.companyName || 
                          `${s.customerId.firstName || ''} ${s.customerId.lastName || ''}`.trim(),
                    email: s.customerId.email,
                    phone: s.customerId.phone
                } : null,
                totalPackages: s.shipmentDetails?.totalPackages || s.totalPackages || 0,
                totalWeight: s.shipmentDetails?.totalWeight || s.totalWeight || 0,
                totalVolume: s.shipmentDetails?.totalVolume || s.totalVolume || 0,
                estimatedArrival: s.dates?.estimatedArrival || s.transport?.estimatedArrival,
                actualDelivery: s.dates?.delivered,
                lastUpdate: s.updatedAt,
                createdBy: s.createdBy,
                createdAt: s.createdAt
            });
        });

        // Format bookings
        bookings.forEach(b => {
            trackings.push({
                id: b._id,
                type: 'booking',
                trackingNumber: b.trackingNumber,
                referenceNumber: b.bookingNumber,
                shipmentNumber: b.shipmentId?.shipmentNumber,
                invoiceNumber: b.invoiceId?.invoiceNumber,
                status: b.status,
                statusDisplay: formatStatus(b.status),
                progress: calculateProgress(b.status),
                origin: b.shipmentDetails?.origin || 'N/A',
                destination: b.shipmentDetails?.destination || 'N/A',
                currentLocation: b.currentLocation?.location || 'N/A',
                customer: b.customer ? {
                    id: b.customer._id,
                    name: b.customer.companyName || 
                          `${b.customer.firstName || ''} ${b.customer.lastName || ''}`.trim(),
                    email: b.customer.email,
                    phone: b.customer.phone
                } : null,
                totalPackages: b.shipmentDetails?.totalPackages || 0,
                totalWeight: b.shipmentDetails?.totalWeight || 0,
                totalVolume: b.shipmentDetails?.totalVolume || 0,
                estimatedArrival: b.dates?.estimatedArrival,
                quotedPrice: b.quotedPrice,
                pricingStatus: b.pricingStatus,
                lastUpdate: b.updatedAt,
                createdAt: b.createdAt
            });
        });

        // Sort combined results
        trackings.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));

        // Paginate combined results
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const endIndex = startIndex + parseInt(limit);
        const paginatedTrackings = trackings.slice(startIndex, endIndex);

        // Calculate summary statistics
        const summary = {
            totalTrackings: total,
            totalShipments: totalShipments,
            totalBookings: totalBookings,
            
            // Status breakdown
            byStatus: await Shipment.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            
            // Recent activity
            recentActivity: trackings.slice(0, 10).map(t => ({
                trackingNumber: t.trackingNumber,
                type: t.type,
                status: t.status,
                customer: t.customer?.name,
                time: t.lastUpdate
            })),
            
            // Delivery stats
            deliveredCount: await Shipment.countDocuments({ status: 'delivered' }),
            inTransitCount: await Shipment.countDocuments({ 
                status: { $in: ['in_transit_sea_freight', 'out_for_delivery'] } 
            }),
            pendingCount: await Shipment.countDocuments({ 
                status: { $in: ['pending', 'booking_confirmed'] } 
            })
        };

        res.status(200).json({
            success: true,
            message: 'Trackings fetched successfully',
            data: paginatedTrackings,
            summary,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit),
                totalShipments,
                totalBookings
            }
        });

    } catch (error) {
        console.error('❌ Get all trackings error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ==================== 2. GET TRACKING BY ID ====================
exports.getTrackingById = async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.query; // 'shipment' or 'booking'

        console.log(`🔍 Fetching tracking details for ${type}:`, id);

        let trackingData = null;

        if (type === 'shipment' || !type) {
            // Try shipment first
            trackingData = await Shipment.findById(id)
                .populate('customerId', 'firstName lastName companyName email phone address')
                .populate('bookingId')
                .populate('consolidationId')
                .populate('createdBy', 'firstName lastName email')
                .populate('milestones.updatedBy', 'firstName lastName')
                .lean();

            if (trackingData) {
                trackingData.type = 'shipment';
                
                // Get timeline from milestones
                trackingData.timeline = (trackingData.milestones || []).map(m => ({
                    status: m.status,
                    location: m.location,
                    description: m.description,
                    date: m.timestamp,
                    formattedDate: new Date(m.timestamp).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    }),
                    updatedBy: m.updatedBy
                }));

                // Get package details
                trackingData.packages = (trackingData.packages || []).map((pkg, index) => ({
                    id: index + 1,
                    description: pkg.description,
                    type: pkg.packagingType,
                    quantity: pkg.quantity,
                    weight: pkg.weight,
                    volume: pkg.volume,
                    dimensions: pkg.dimensions,
                    hazardous: pkg.hazardous,
                    temperatureControlled: pkg.temperatureControlled?.required
                }));
            }
        }

        if (type === 'booking' || (!trackingData && type !== 'shipment')) {
            // Try booking
            trackingData = await Booking.findById(id)
                .populate('customer', 'firstName lastName companyName email phone address')
                .populate('quotedPrice.quotedBy', 'firstName lastName')
                .populate('shipmentId')
                .populate('invoiceId')
                .populate('timeline.updatedBy', 'firstName lastName')
                .lean();

            if (trackingData) {
                trackingData.type = 'booking';
                
                // Get timeline
                trackingData.timeline = (trackingData.timeline || []).map(t => ({
                    status: t.status,
                    location: t.location,
                    description: t.description,
                    date: t.timestamp,
                    formattedDate: new Date(t.timestamp).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    }),
                    updatedBy: t.updatedBy
                }));

                // Get package details
                trackingData.packages = (trackingData.shipmentDetails?.packageDetails || []).map((pkg, index) => ({
                    id: index + 1,
                    description: pkg.description,
                    type: pkg.packagingType,
                    quantity: pkg.quantity,
                    weight: pkg.weight,
                    volume: pkg.volume,
                    dimensions: pkg.dimensions,
                    hazardous: pkg.hazardous,
                    temperatureControlled: pkg.temperatureControlled?.required
                }));
            }
        }

        if (!trackingData) {
            return res.status(404).json({
                success: false,
                message: 'Tracking not found'
            });
        }

        // Calculate additional info
        trackingData.progress = calculateProgress(trackingData.status);
        trackingData.statusDisplay = formatStatus(trackingData.status);
        
        if (trackingData.estimatedArrival) {
            const daysRemaining = Math.ceil(
                (new Date(trackingData.estimatedArrival) - new Date()) / (1000 * 60 * 60 * 24)
            );
            trackingData.daysRemaining = daysRemaining > 0 ? daysRemaining : 0;
        }

        res.status(200).json({
            success: true,
            data: trackingData
        });

    } catch (error) {
        console.error('❌ Get tracking by id error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ==================== 3. UPDATE TRACKING STATUS ====================
exports.updateTrackingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            type, 
            status, 
            location, 
            description,
            estimatedArrival,
            currentLocation 
        } = req.body;

        console.log(`📝 Updating ${type} status:`, { id, status, location });

        let updatedDoc = null;
        let previousStatus = '';

        if (type === 'shipment') {
            const shipment = await Shipment.findById(id);
            if (!shipment) {
                return res.status(404).json({
                    success: false,
                    message: 'Shipment not found'
                });
            }

            previousStatus = shipment.status;
            
            // Update status
            if (status) shipment.status = status;
            
            // Update location
            if (location || currentLocation) {
                shipment.transport = shipment.transport || {};
                shipment.transport.currentLocation = {
                    location: location || currentLocation,
                    updatedAt: new Date(),
                    updatedBy: req.user._id
                };
            }

            // Update estimated arrival
            if (estimatedArrival) {
                shipment.dates = shipment.dates || {};
                shipment.dates.estimatedArrival = new Date(estimatedArrival);
            }

            // Add milestone
            shipment.milestones = shipment.milestones || [];
            shipment.milestones.push({
                status: status || shipment.status,
                location: location || currentLocation || 'Unknown',
                description: description || getStatusDescription(status || shipment.status),
                timestamp: new Date(),
                updatedBy: req.user._id
            });

            await shipment.save();
            updatedDoc = shipment;

        } else if (type === 'booking') {
            const booking = await Booking.findById(id);
            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: 'Booking not found'
                });
            }

            previousStatus = booking.status;
            
            // Update status
            if (status) {
                booking.status = status;
                
                // Update delivery status if delivered
                if (status === 'delivered') {
                    booking.dates = booking.dates || {};
                    booking.dates.delivered = new Date();
                }
            }
            
            // Update location
            if (location || currentLocation) {
                booking.currentLocation = {
                    location: location || currentLocation,
                    updatedAt: new Date()
                };
            }

            // Update estimated arrival
            if (estimatedArrival) {
                booking.dates = booking.dates || {};
                booking.dates.estimatedArrival = new Date(estimatedArrival);
            }

            // Add timeline entry
            booking.addTimelineEntry(
                status || booking.status,
                description || getStatusDescription(status || booking.status),
                req.user._id,
                { location: location || currentLocation }
            );

            await booking.save();
            updatedDoc = booking;

            // If status changed to delivered, update associated shipment
            if (status === 'delivered' && booking.shipmentId) {
                await Shipment.findByIdAndUpdate(booking.shipmentId, {
                    status: 'delivered',
                    $push: {
                        milestones: {
                            status: 'delivered',
                            location: location || 'Destination',
                            description: 'Shipment delivered successfully',
                            timestamp: new Date(),
                            updatedBy: req.user._id
                        }
                    }
                });
            }
        }

        if (!updatedDoc) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tracking type or ID'
            });
        }

        // Send email notification to customer
        try {
            const customerEmail = updatedDoc.customerId?.email || updatedDoc.customer?.email;
            const customerName = updatedDoc.customerId?.firstName || 
                                updatedDoc.customer?.firstName || 
                                'Customer';

            if (customerEmail) {
                await sendEmail({
                    to: customerEmail,
                    subject: `🚚 Tracking Update: ${updatedDoc.trackingNumber}`,
                    template: 'tracking-update',
                    data: {
                        customerName,
                        trackingNumber: updatedDoc.trackingNumber,
                        oldStatus: previousStatus,
                        newStatus: status || updatedDoc.status,
                        location: location || currentLocation,
                        description: description || getStatusDescription(status || updatedDoc.status),
                        trackingUrl: `${process.env.FRONTEND_URL}/tracking/${updatedDoc.trackingNumber}`,
                        estimatedArrival: estimatedArrival || updatedDoc.estimatedArrival
                    }
                });
            }
        } catch (emailError) {
            console.error('Email notification error:', emailError);
        }

        res.status(200).json({
            success: true,
            message: 'Tracking status updated successfully',
            data: {
                id: updatedDoc._id,
                type,
                trackingNumber: updatedDoc.trackingNumber,
                status: updatedDoc.status,
                location: location || currentLocation,
                estimatedArrival: estimatedArrival || updatedDoc.estimatedArrival,
                updatedAt: new Date()
            }
        });

    } catch (error) {
        console.error('❌ Update tracking status error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ==================== 4. BULK UPDATE TRACKINGS ====================
exports.bulkUpdateTrackings = async (req, res) => {
    try {
        const { trackingIds, updateData } = req.body;

        if (!trackingIds || !Array.isArray(trackingIds) || trackingIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide tracking IDs array'
            });
        }

        console.log(`📦 Bulk updating ${trackingIds.length} trackings`);

        const results = {
            shipments: [],
            bookings: [],
            failed: []
        };

        for (const item of trackingIds) {
            try {
                if (item.type === 'shipment') {
                    const shipment = await Shipment.findByIdAndUpdate(
                        item.id,
                        {
                            $set: {
                                status: updateData.status,
                                'transport.currentLocation': {
                                    location: updateData.location,
                                    updatedAt: new Date(),
                                    updatedBy: req.user._id
                                }
                            },
                            $push: {
                                milestones: {
                                    status: updateData.status,
                                    location: updateData.location,
                                    description: updateData.description || 
                                               getStatusDescription(updateData.status),
                                    timestamp: new Date(),
                                    updatedBy: req.user._id
                                }
                            }
                        },
                        { new: true }
                    );
                    
                    if (shipment) {
                        results.shipments.push({
                            id: shipment._id,
                            trackingNumber: shipment.trackingNumber,
                            status: shipment.status
                        });
                    }
                } 
                else if (item.type === 'booking') {
                    const booking = await Booking.findById(item.id);
                    
                    if (booking) {
                        booking.status = updateData.status;
                        booking.currentLocation = {
                            location: updateData.location,
                            updatedAt: new Date()
                        };
                        
                        booking.addTimelineEntry(
                            updateData.status,
                            updateData.description || getStatusDescription(updateData.status),
                            req.user._id,
                            { location: updateData.location }
                        );
                        
                        await booking.save();
                        
                        results.bookings.push({
                            id: booking._id,
                            trackingNumber: booking.trackingNumber,
                            status: booking.status
                        });
                    }
                }
            } catch (err) {
                results.failed.push({
                    id: item.id,
                    type: item.type,
                    error: err.message
                });
            }
        }

        res.status(200).json({
            success: true,
            message: `Updated ${results.shipments.length + results.bookings.length} trackings`,
            data: results
        });

    } catch (error) {
        console.error('❌ Bulk update error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ==================== 5. DELETE TRACKING ====================
exports.deleteTracking = async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.query;

        console.log(`🗑️ Deleting ${type} tracking:`, id);

        if (type === 'shipment') {
            const shipment = await Shipment.findById(id);
            
            if (!shipment) {
                return res.status(404).json({
                    success: false,
                    message: 'Shipment not found'
                });
            }

            // Check if shipment can be deleted (only pending or cancelled)
            if (!['pending', 'cancelled'].includes(shipment.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Only pending or cancelled shipments can be deleted'
                });
            }

            // Remove reference from booking
            if (shipment.bookingId) {
                await Booking.findByIdAndUpdate(shipment.bookingId, {
                    $unset: { shipmentId: 1 }
                });
            }

            // Delete shipment
            await Shipment.findByIdAndDelete(id);

        } else if (type === 'booking') {
            const booking = await Booking.findById(id);
            
            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: 'Booking not found'
                });
            }

            // Check if booking can be deleted
            if (!['booking_requested', 'cancelled'].includes(booking.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Only requested or cancelled bookings can be deleted'
                });
            }

            // Delete associated shipment if exists
            if (booking.shipmentId) {
                await Shipment.findByIdAndDelete(booking.shipmentId);
            }

            // Delete booking
            await Booking.findByIdAndDelete(id);

        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid tracking type'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Tracking deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete tracking error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ==================== 6. BULK DELETE TRACKINGS ====================
exports.bulkDeleteTrackings = async (req, res) => {
    try {
        const { trackingIds } = req.body;

        if (!trackingIds || !Array.isArray(trackingIds) || trackingIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide tracking IDs array'
            });
        }

        console.log(`🗑️ Bulk deleting ${trackingIds.length} trackings`);

        const results = {
            deleted: [],
            failed: []
        };

        for (const item of trackingIds) {
            try {
                if (item.type === 'shipment') {
                    const shipment = await Shipment.findById(item.id);
                    
                    if (shipment && ['pending', 'cancelled'].includes(shipment.status)) {
                        // Remove reference from booking
                        if (shipment.bookingId) {
                            await Booking.findByIdAndUpdate(shipment.bookingId, {
                                $unset: { shipmentId: 1 }
                            });
                        }
                        
                        await Shipment.findByIdAndDelete(item.id);
                        results.deleted.push(item);
                    } else {
                        results.failed.push({
                            ...item,
                            reason: 'Shipment cannot be deleted in current status'
                        });
                    }
                } 
                else if (item.type === 'booking') {
                    const booking = await Booking.findById(item.id);
                    
                    if (booking && ['booking_requested', 'cancelled'].includes(booking.status)) {
                        if (booking.shipmentId) {
                            await Shipment.findByIdAndDelete(booking.shipmentId);
                        }
                        await Booking.findByIdAndDelete(item.id);
                        results.deleted.push(item);
                    } else {
                        results.failed.push({
                            ...item,
                            reason: 'Booking cannot be deleted in current status'
                        });
                    }
                }
            } catch (err) {
                results.failed.push({
                    ...item,
                    error: err.message
                });
            }
        }

        res.status(200).json({
            success: true,
            message: `Deleted ${results.deleted.length} trackings`,
            data: results
        });

    } catch (error) {
        console.error('❌ Bulk delete error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ==================== 7. GET TRACKING STATS ====================
exports.getTrackingStats = async (req, res) => {
    try {
        console.log('📊 Generating tracking statistics...');

        // Get shipment statistics
        const shipmentStats = await Shipment.aggregate([
            {
                $facet: {
                    byStatus: [
                        { $group: { _id: '$status', count: { $sum: 1 } } }
                    ],
                    byMonth: [
                        {
                            $group: {
                                _id: {
                                    year: { $year: '$createdAt' },
                                    month: { $month: '$createdAt' }
                                },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { '_id.year': -1, '_id.month': -1 } },
                        { $limit: 12 }
                    ],
                    deliveryPerformance: [
                        {
                            $match: { status: 'delivered' }
                        },
                        {
                            $project: {
                                deliveryTime: {
                                    $divide: [
                                        { $subtract: ['$dates.delivered', '$createdAt'] },
                                        1000 * 60 * 60 * 24 // Convert to days
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                avgDeliveryTime: { $avg: '$deliveryTime' },
                                minDeliveryTime: { $min: '$deliveryTime' },
                                maxDeliveryTime: { $max: '$deliveryTime' }
                            }
                        }
                    ],
                    totals: [
                        {
                            $group: {
                                _id: null,
                                totalShipments: { $sum: 1 },
                                totalWeight: { $sum: '$shipmentDetails.totalWeight' },
                                totalVolume: { $sum: '$shipmentDetails.totalVolume' }
                            }
                        }
                    ]
                }
            }
        ]);

        // Get booking statistics
        const bookingStats = await Booking.aggregate([
            {
                $facet: {
                    byStatus: [
                        { $group: { _id: '$status', count: { $sum: 1 } } }
                    ],
                    byPricingStatus: [
                        { $group: { _id: '$pricingStatus', count: { $sum: 1 } } }
                    ],
                    totals: [
                        { $group: { _id: null, totalBookings: { $sum: 1 } } }
                    ]
                }
            }
        ]);

        // Get recent activity
        const recentActivity = await Shipment.find()
            .sort('-updatedAt')
            .limit(10)
            .populate('customerId', 'companyName firstName lastName')
            .select('trackingNumber status updatedAt customerId')
            .lean();

        const formattedActivity = recentActivity.map(a => ({
            trackingNumber: a.trackingNumber,
            status: a.status,
            customer: a.customerId?.companyName || 
                      `${a.customerId?.firstName || ''} ${a.customerId?.lastName || ''}`.trim(),
            time: a.updatedAt
        }));

        res.status(200).json({
            success: true,
            data: {
                shipments: shipmentStats[0] || {
                    byStatus: [],
                    byMonth: [],
                    deliveryPerformance: {},
                    totals: { totalShipments: 0, totalWeight: 0, totalVolume: 0 }
                },
                bookings: bookingStats[0] || {
                    byStatus: [],
                    byPricingStatus: [],
                    totals: { totalBookings: 0 }
                },
                recentActivity: formattedActivity,
                summary: {
                    totalActive: await Shipment.countDocuments({ 
                        status: { $nin: ['delivered', 'cancelled'] } 
                    }),
                    totalDelivered: await Shipment.countDocuments({ status: 'delivered' }),
                    totalInTransit: await Shipment.countDocuments({ 
                        status: { $in: ['in_transit_sea_freight', 'out_for_delivery'] } 
                    }),
                    totalPending: await Shipment.countDocuments({ 
                        status: { $in: ['pending', 'booking_confirmed'] } 
                    })
                }
            }
        });

    } catch (error) {
        console.error('❌ Get tracking stats error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ==================== 8. SEARCH TRACKINGS ====================
exports.searchTrackings = async (req, res) => {
    try {
        const { q, type, status, customerId, startDate, endDate } = req.query;

        console.log('🔍 Searching trackings with query:', q);

        const searchRegex = new RegExp(q, 'i');
        let results = [];

        // Search in shipments
        const shipmentQuery = {
            $or: [
                { trackingNumber: searchRegex },
                { shipmentNumber: searchRegex },
                { 'sender.name': searchRegex },
                { 'sender.companyName': searchRegex },
                { 'receiver.name': searchRegex },
                { 'receiver.companyName': searchRegex }
            ]
        };

        if (type === 'shipment' || !type) {
            if (status) shipmentQuery.status = status;
            if (customerId) shipmentQuery.customerId = customerId;
            if (startDate || endDate) {
                shipmentQuery.createdAt = {};
                if (startDate) shipmentQuery.createdAt.$gte = new Date(startDate);
                if (endDate) shipmentQuery.createdAt.$lte = new Date(endDate);
            }

            const shipments = await Shipment.find(shipmentQuery)
                .populate('customerId', 'companyName firstName lastName email')
                .limit(20)
                .lean();

            shipments.forEach(s => {
                results.push({
                    id: s._id,
                    type: 'shipment',
                    trackingNumber: s.trackingNumber,
                    referenceNumber: s.shipmentNumber,
                    status: s.status,
                    customer: s.customerId?.companyName || 
                              `${s.customerId?.firstName || ''} ${s.customerId?.lastName || ''}`.trim(),
                    origin: s.shipmentDetails?.origin,
                    destination: s.shipmentDetails?.destination,
                    lastUpdate: s.updatedAt
                });
            });
        }

        // Search in bookings
        if (type === 'booking' || !type) {
            const bookingQuery = {
                $or: [
                    { trackingNumber: searchRegex },
                    { bookingNumber: searchRegex },
                    { 'sender.name': searchRegex },
                    { 'sender.companyName': searchRegex },
                    { 'receiver.name': searchRegex },
                    { 'receiver.companyName': searchRegex }
                ]
            };

            if (status) bookingQuery.status = status;
            if (customerId) bookingQuery.customer = customerId;
            if (startDate || endDate) {
                bookingQuery.createdAt = {};
                if (startDate) bookingQuery.createdAt.$gte = new Date(startDate);
                if (endDate) bookingQuery.createdAt.$lte = new Date(endDate);
            }

            const bookings = await Booking.find(bookingQuery)
                .populate('customer', 'companyName firstName lastName email')
                .limit(20)
                .lean();

            bookings.forEach(b => {
                results.push({
                    id: b._id,
                    type: 'booking',
                    trackingNumber: b.trackingNumber,
                    referenceNumber: b.bookingNumber,
                    status: b.status,
                    customer: b.customer?.companyName || 
                              `${b.customer?.firstName || ''} ${b.customer?.lastName || ''}`.trim(),
                    origin: b.shipmentDetails?.origin,
                    destination: b.shipmentDetails?.destination,
                    lastUpdate: b.updatedAt
                });
            });
        }

        // Sort by last update
        results.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));

        res.status(200).json({
            success: true,
            data: results,
            total: results.length
        });

    } catch (error) {
        console.error('❌ Search trackings error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ==================== 9. EXPORT TRACKINGS ====================
exports.exportTrackings = async (req, res) => {
    try {
        const { format = 'csv', type, status, startDate, endDate } = req.query;

        console.log(`📤 Exporting trackings in ${format} format...`);

        // Build query
        let shipmentQuery = {};
        let bookingQuery = {};

        if (status) {
            shipmentQuery.status = status;
            bookingQuery.status = status;
        }

        if (startDate || endDate) {
            const dateFilter = {};
            if (startDate) dateFilter.$gte = new Date(startDate);
            if (endDate) dateFilter.$lte = new Date(endDate);
            
            shipmentQuery.createdAt = dateFilter;
            bookingQuery.createdAt = dateFilter;
        }

        let allTrackings = [];

        // Get shipments
        if (type === 'shipment' || !type) {
            const shipments = await Shipment.find(shipmentQuery)
                .populate('customerId', 'companyName firstName lastName email phone')
                .lean();

            shipments.forEach(s => {
                allTrackings.push({
                    'Tracking Number': s.trackingNumber,
                    'Type': 'Shipment',
                    'Reference': s.shipmentNumber,
                    'Status': s.status,
                    'Customer': s.customerId?.companyName || 
                                `${s.customerId?.firstName || ''} ${s.customerId?.lastName || ''}`.trim(),
                    'Customer Email': s.customerId?.email || '',
                    'Customer Phone': s.customerId?.phone || '',
                    'Origin': s.shipmentDetails?.origin || s.origin,
                    'Destination': s.shipmentDetails?.destination || s.destination,
                    'Packages': s.shipmentDetails?.totalPackages || s.totalPackages || 0,
                    'Weight (kg)': s.shipmentDetails?.totalWeight || s.totalWeight || 0,
                    'Volume (m³)': s.shipmentDetails?.totalVolume || s.totalVolume || 0,
                    'Created Date': new Date(s.createdAt).toLocaleDateString(),
                    'Last Update': new Date(s.updatedAt).toLocaleDateString(),
                    'Estimated Arrival': s.dates?.estimatedArrival ? 
                        new Date(s.dates.estimatedArrival).toLocaleDateString() : 'N/A',
                    'Actual Delivery': s.dates?.delivered ? 
                        new Date(s.dates.delivered).toLocaleDateString() : 'N/A'
                });
            });
        }

        // Get bookings
        if (type === 'booking' || !type) {
            const bookings = await Booking.find(bookingQuery)
                .populate('customer', 'companyName firstName lastName email phone')
                .lean();

            bookings.forEach(b => {
                allTrackings.push({
                    'Tracking Number': b.trackingNumber,
                    'Type': 'Booking',
                    'Reference': b.bookingNumber,
                    'Status': b.status,
                    'Customer': b.customer?.companyName || 
                                `${b.customer?.firstName || ''} ${b.customer?.lastName || ''}`.trim(),
                    'Customer Email': b.customer?.email || '',
                    'Customer Phone': b.customer?.phone || '',
                    'Origin': b.shipmentDetails?.origin,
                    'Destination': b.shipmentDetails?.destination,
                    'Packages': b.shipmentDetails?.totalPackages || 0,
                    'Weight (kg)': b.shipmentDetails?.totalWeight || 0,
                    'Volume (m³)': b.shipmentDetails?.totalVolume || 0,
                    'Created Date': new Date(b.createdAt).toLocaleDateString(),
                    'Last Update': new Date(b.updatedAt).toLocaleDateString(),
                    'Estimated Arrival': b.dates?.estimatedArrival ? 
                        new Date(b.dates.estimatedArrival).toLocaleDateString() : 'N/A'
                });
            });
        }

        if (format === 'csv') {
            // Generate CSV
            const headers = Object.keys(allTrackings[0] || {}).join(',');
            const rows = allTrackings.map(row => 
                Object.values(row).map(val => 
                    typeof val === 'string' && val.includes(',') ? `"${val}"` : val
                ).join(',')
            ).join('\n');
            
            const csv = `${headers}\n${rows}`;
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=trackings-${Date.now()}.csv`);
            
            return res.status(200).send(csv);
        }

        res.status(200).json({
            success: true,
            data: allTrackings,
            total: allTrackings.length
        });

    } catch (error) {
        console.error('❌ Export trackings error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ==================== 10. TRACK BY NUMBER (Public) ====================
// ==================== 10. TRACK BY NUMBER (Public) ====================
exports.trackByNumber = async (req, res) => {
    try {
        const { trackingNumber } = req.params;

        console.log('🔍 Public tracking search:', trackingNumber);

        // Search in shipments
        let shipment = await Shipment.findOne({ trackingNumber })
            .populate({
                path: 'bookingId',
                select: 'bookingNumber sender receiver payment shipmentClassification courier'
            })
            .populate('customerId', 'companyName firstName lastName')
            .populate({
                path: 'consolidationId',
                select: 'consolidationNumber containerNumber containerType sealNumber status timeline originWarehouse destinationPort'
            })
            .lean();

        // If not found in shipments, search in bookings
        if (!shipment) {
            const booking = await Booking.findOne({ trackingNumber })
                .populate('customer', 'companyName firstName lastName')
                .populate('shipmentId')
                .lean();

            if (booking) {
                shipment = {
                    ...booking,
                    type: 'booking',
                    trackingNumber: booking.trackingNumber,
                    referenceNumber: booking.bookingNumber,
                    customer: booking.customer,
                    packages: booking.shipmentDetails?.packageDetails || [],
                    milestones: booking.timeline || []
                };
            }
        }

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Tracking number not found'
            });
        }

        console.log('✅ Shipment found:', {
            trackingNumber: shipment.trackingNumber,
            status: shipment.status,
            hasMilestones: !!(shipment.milestones?.length),
            hasConsolidation: !!shipment.consolidationId,
            consolidationStatus: shipment.consolidationId?.status
        });

        // প্রথমে shipment milestones নিন
        let timeline = [];

        // Shipment milestones যোগ করুন
        if (shipment.milestones && shipment.milestones.length > 0) {
            console.log(`📋 Found ${shipment.milestones.length} shipment milestones`);
            const shipmentEvents = shipment.milestones.map(m => ({
                status: m.status,
                location: m.location || shipment.shipmentDetails?.origin || 'Unknown',
                description: m.description || getStatusDescription(m.status),
                date: m.timestamp || m.createdAt || new Date(),
                formattedDate: m.timestamp ? new Date(m.timestamp).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'N/A',
                source: 'shipment'
            }));
            timeline = [...timeline, ...shipmentEvents];
        }

        // Consolidation timeline events যোগ করুন
        // controllers/trackingController.js - trackByNumber function-এ

// Consolidation timeline events যোগ করুন
if (shipment.consolidationId && shipment.consolidationId.timeline) {
    console.log(`📦 Found ${shipment.consolidationId.timeline.length} consolidation events`);
    
    const consolidationEvents = shipment.consolidationId.timeline.map(event => {
        // Status mapping dictionary
        const statusMap = {
            'draft': 'pending',
            'pending_consolidation': 'pending',
            'in_progress': 'consolidating',
            'consolidating': 'consolidating',
            'consolidated': 'consolidated',
            'ready_for_dispatch': 'ready_for_dispatch',
            'loaded': 'loaded_in_container',
            'loaded_in_container': 'loaded_in_container',
            'dispatched': 'dispatched',
            'in_transit': 'in_transit',
            'departed': 'departed_port_of_origin',
            'departed_port_of_origin': 'departed_port_of_origin',
            'arrived': 'arrived_at_destination_port',
            'arrived_at_destination_port': 'arrived_at_destination_port',
            'customs_cleared': 'customs_cleared',
            'out_for_delivery': 'out_for_delivery',
            'delivered': 'delivered',
            'completed': 'completed'
        };
        
        const displayStatus = statusMap[event.status] || event.status;
        
        return {
            status: displayStatus,
            location: event.location || 
                     shipment.consolidationId.originWarehouse || 
                     'China Warehouse',
            description: event.description || this.getStatusDescription(displayStatus),
            date: event.timestamp || new Date(),
            formattedDate: event.timestamp ? new Date(event.timestamp).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A'
        };
    });
    
    timeline = [...timeline, ...consolidationEvents];
}

        // Tracking updates যোগ করুন (যদি থাকে)
        if (shipment.trackingUpdates && shipment.trackingUpdates.length > 0) {
            console.log(`📍 Found ${shipment.trackingUpdates.length} tracking updates`);
            const trackingEvents = shipment.trackingUpdates.map(t => ({
                status: t.status,
                location: t.location || 'Unknown',
                description: t.description || 'Tracking update',
                date: t.timestamp || t.createdAt || new Date(),
                formattedDate: t.timestamp ? new Date(t.timestamp).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'N/A',
                source: 'tracking'
            }));
            timeline = [...timeline, ...trackingEvents];
        }

        // Booking timeline যোগ করুন (যদি booking থেকে আসে)
        if (shipment.timeline && shipment.timeline.length > 0) {
            console.log(`📅 Found ${shipment.timeline.length} booking timeline events`);
            const bookingEvents = shipment.timeline.map(t => ({
                status: t.status,
                location: t.location || 'Unknown',
                description: t.description || 'Booking update',
                date: t.timestamp || t.createdAt || new Date(),
                formattedDate: t.timestamp ? new Date(t.timestamp).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'N/A',
                source: 'booking'
            }));
            timeline = [...timeline, ...bookingEvents];
        }

        // Sort timeline by date (newest first)
        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

        console.log(`⏰ Final timeline has ${timeline.length} events`);
        if (timeline.length > 0) {
            console.log('📊 Latest event:', {
                status: timeline[0].status,
                location: timeline[0].location,
                date: timeline[0].formattedDate
            });
        }

        // Format response for public view
        const publicTrackingInfo = {
            trackingNumber: shipment.trackingNumber,
            bookingNumber: shipment.bookingId?.bookingNumber,
            shipmentNumber: shipment.shipmentNumber,
            status: shipment.status,
            statusDisplay: formatStatus(shipment.status),
            progress: calculateProgress(shipment.status),
            origin: shipment.shipmentDetails?.origin || shipment.origin || 'China',
            destination: shipment.shipmentDetails?.destination || shipment.destination || 'USA',
            currentLocation: timeline[0]?.location || 
                            shipment.transport?.currentLocation?.location || 
                            shipment.currentLocation?.location || 
                            'Unknown',
            lastUpdate: timeline[0]?.date || shipment.updatedAt,
            estimatedArrival: shipment.dates?.estimatedArrival || shipment.estimatedArrival,
            
            // Package info
            totalPackages: shipment.shipmentDetails?.totalPackages || 
                          shipment.totalPackages || 
                          (shipment.packages?.length || 0),
            totalWeight: shipment.shipmentDetails?.totalWeight || shipment.totalWeight || 0,
            
            // Consolidation info
            consolidation: shipment.consolidationId ? {
                number: shipment.consolidationId.consolidationNumber,
                containerNumber: shipment.consolidationId.containerNumber,
                containerType: shipment.consolidationId.containerType,
                sealNumber: shipment.consolidationId.sealNumber,
                status: shipment.consolidationId.status
            } : null,
            
            // Timeline (all events)
            timeline: timeline.slice(0, 30) // Last 30 events
        };

        res.status(200).json({
            success: true,
            data: publicTrackingInfo
        });

    } catch (error) {
        console.error('❌ Public track by number error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

module.exports = exports;