const ConsolidationQueue = require('../models/consolidationQueueModel');
const Consolidation = require('../models/consolidationModel');
const Shipment = require('../models/shipmentModel');
const Warehouse = require('../models/warehouseModel');
const User = require('../models/userModel');
const { sendEmail } = require('../utils/emailService');

// ========== 1. GET CONSOLIDATION QUEUE (Grouped by Destination) ==========
exports.getConsolidationQueue = async (req, res) => {
    try {
        const queue = await ConsolidationQueue.find({ status: 'pending' })
            .populate('shipmentId', 'trackingNumber shipmentDetails')
            .populate('customerId', 'companyName firstName lastName')
            .populate('addedBy', 'firstName lastName')
            .sort({ addedAt: 1 });

        // Group by destination (groupKey)
        const grouped = queue.reduce((acc, item) => {
            const key = item.groupKey;
            
            if (!acc[key]) {
                acc[key] = {
                    groupKey: key,
                    origin: item.origin,
                    destination: item.destination,
                    destinationCountry: item.destinationCountry,
                    shipments: [],
                    totalWeight: 0,
                    totalVolume: 0,
                    totalPackages: 0,
                    count: 0,
                    displayName: `${item.origin || 'Unknown'} → ${item.destination || 'Unknown'}`
                };
            }
            
            acc[key].shipments.push(item);
            acc[key].totalWeight += item.totalWeight || 0;
            acc[key].totalVolume += item.totalVolume || 0;
            acc[key].totalPackages += item.totalPackages || 0;
            acc[key].count++;
            
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            data: {
                grouped: Object.values(grouped),
                totalItems: queue.length,
                totalGroups: Object.keys(grouped).length
            }
        });

    } catch (error) {
        console.error('Get queue error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ========== 2. CREATE CONSOLIDATION ==========
exports.createConsolidation = async (req, res) => {
    try {
        const {
            groupKey,
            destination,
            origin,
            containerNumber,
            containerType,
            sealNumber,
            estimatedDeparture,
            selectedShipmentIds
        } = req.body;

        // Build query for queue items
        let query = { status: 'pending' };
        
        if (groupKey) {
            query.groupKey = groupKey;
        } else if (destination) {
            query.destination = destination;
            if (origin) query.origin = origin;
        }

        // If specific shipments selected
        if (selectedShipmentIds && selectedShipmentIds.length > 0) {
            query.shipmentId = { $in: selectedShipmentIds };
        }

        // Get queue items
        const queueItems = await ConsolidationQueue.find(query)
            .populate('shipmentId');

        if (queueItems.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No shipments found for consolidation'
            });
        }

        // Calculate totals
        let totalPackages = 0;
        let totalWeight = 0;
        let totalVolume = 0;
        const items = [];

        for (const item of queueItems) {
            totalPackages += item.totalPackages || 0;
            totalWeight += item.totalWeight || 0;
            totalVolume += item.totalVolume || 0;

            items.push({
                shipmentId: item.shipmentId._id,
                packageType: 'Mixed',
                quantity: item.totalPackages || 1,
                description: `Shipment ${item.trackingNumber}`,
                weight: item.totalWeight || 0,
                volume: item.totalVolume || 0
            });
        }

        // Get warehouse
        const warehouse = await Warehouse.findOne({ isActive: true });
        if (!warehouse) {
            return res.status(404).json({
                success: false,
                message: 'No active warehouse found'
            });
        }

        // Generate consolidation number
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        const destCode = (queueItems[0]?.destination || 'INT').substring(0, 3).toUpperCase();
        
        const consolidationNumber = `CN-${year}${month}-${destCode}-${random}`;

        // Create consolidation
        const consolidation = await Consolidation.create({
            consolidationNumber,
            shipments: queueItems.map(q => q.shipmentId._id),
            warehouseId: warehouse._id,
            containerNumber: containerNumber || `CNTR-${Date.now()}`,
            containerType: containerType || estimateContainerType(totalVolume),
            sealNumber: sealNumber || '',
            totalShipments: queueItems.length,
            totalPackages,
            totalWeight,
            totalVolume,
            originWarehouse: queueItems[0]?.origin || 'Main Warehouse',
            destinationPort: queueItems[0]?.destination || destination,
            destinationCountry: queueItems[0]?.destinationCountry,
            consolidationStarted: new Date(),
            estimatedDeparture: estimatedDeparture || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            status: 'draft',
            items,
            createdBy: req.user._id
        });

        console.log('✅ Consolidation created:', consolidation.consolidationNumber);

        // Update queue items
        await ConsolidationQueue.updateMany(
            { _id: { $in: queueItems.map(q => q._id) } },
            {
                $set: {
                    status: 'assigned',
                    consolidationId: consolidation._id,
                    assignedAt: new Date()
                }
            }
        );

        // Update shipments
        await Shipment.updateMany(
            { _id: { $in: queueItems.map(q => q.shipmentId._id) } },
            {
                $set: {
                    warehouseStatus: 'consolidated',
                    consolidationId: consolidation._id,
                    'transport.containerNumber': containerNumber,
                    'transport.consolidationId': consolidation._id
                },
                $push: {
                    milestones: {
                        status: 'consolidated',
                        location: warehouse.warehouseName,
                        description: `Shipment consolidated into container ${containerNumber}`,
                        timestamp: new Date(),
                        updatedBy: req.user._id
                    }
                }
            }
        );

        res.status(201).json({
            success: true,
            message: `Consolidation created for ${queueItems.length} shipments`,
            data: consolidation
        });

    } catch (error) {
        console.error('❌ Create consolidation error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Helper function to estimate container type
function estimateContainerType(totalVolume) {
    if (totalVolume <= 28) return '20ft';
    if (totalVolume <= 58) return '40ft';
    if (totalVolume <= 68) return '40ft HC';
    return '40ft HC (Multiple)';
}

// ========== 3. GET ALL CONSOLIDATIONS ==========
exports.getConsolidations = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        let query = {};
        if (status) query.status = status;

        const consolidations = await Consolidation.find(query)
            .populate('shipments', 'trackingNumber status')
            .populate('createdBy', 'firstName lastName')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Consolidation.countDocuments(query);

        res.status(200).json({
            success: true,
            data: consolidations,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get consolidations error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ========== 4. GET CONSOLIDATION BY ID ==========
exports.getConsolidationById = async (req, res) => {
    try {
        const { id } = req.params;

        const consolidation = await Consolidation.findById(id)
            .populate({
                path: 'shipments',
                populate: {
                    path: 'customerId',
                    select: 'firstName lastName companyName'
                }
            })
            .populate('createdBy', 'firstName lastName')
            .populate('updatedBy', 'firstName lastName');

        if (!consolidation) {
            return res.status(404).json({
                success: false,
                message: 'Consolidation not found'
            });
        }

        res.status(200).json({
            success: true,
            data: consolidation
        });

    } catch (error) {
        console.error('Get consolidation error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ========== 5. UPDATE CONSOLIDATION STATUS ==========
exports.updateConsolidationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, containerNumber, sealNumber, actualDeparture } = req.body;

        const consolidation = await Consolidation.findById(id);
        if (!consolidation) {
            return res.status(404).json({
                success: false,
                message: 'Consolidation not found'
            });
        }

        // Update fields
        if (status) consolidation.status = status;
        if (containerNumber) consolidation.containerNumber = containerNumber;
        if (sealNumber) consolidation.sealNumber = sealNumber;
        
        if (status === 'completed') {
            consolidation.consolidationCompleted = new Date();
        }
        
        if (status === 'loaded' || status === 'departed') {
            consolidation.actualDeparture = actualDeparture || new Date();
        }

        consolidation.updatedBy = req.user._id;
        await consolidation.save();

        // If status is 'loaded' or 'departed', update shipments
        if (status === 'loaded' || status === 'departed') {
            await Shipment.updateMany(
                { _id: { $in: consolidation.shipments } },
                {
                    $set: {
                        status: status === 'loaded' ? 'loaded_in_container' : 'in_transit',
                        'transport.actualDeparture': actualDeparture || new Date()
                    },
                    $push: {
                        milestones: {
                            status: status === 'loaded' ? 'loaded_in_container' : 'in_transit',
                            location: 'Port of Departure',
                            description: `Container ${consolidation.containerNumber} has ${status === 'loaded' ? 'been loaded' : 'departed'}`,
                            timestamp: new Date(),
                            updatedBy: req.user._id
                        }
                    }
                }
            );
        }

        res.status(200).json({
            success: true,
            message: 'Consolidation updated successfully',
            data: consolidation
        });

    } catch (error) {
        console.error('Update consolidation error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ========== 6. DELETE FROM QUEUE (if needed) ==========
exports.removeFromQueue = async (req, res) => {
    try {
        const { id } = req.params;

        const queueItem = await ConsolidationQueue.findById(id);
        if (!queueItem) {
            return res.status(404).json({
                success: false,
                message: 'Queue item not found'
            });
        }

        await queueItem.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Shipment removed from queue'
        });

    } catch (error) {
        console.error('Remove from queue error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};