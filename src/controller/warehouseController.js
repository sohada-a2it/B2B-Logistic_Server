// controllers/warehouseController.js

const mongoose = require('mongoose'); 
const Warehouse = require('../models/warehouseModel');
const WarehouseReceipt = require('../models/warehouseReceiptModel');
const WarehouseInventory = require('../models/warehouseInventoryModel');
const Consolidation = require('../models/consolidationModel');
const Shipment = require('../models/shipmentModel');
const Booking = require('../models/bookingModel');
const ConsolidationQueue = require('../models/consolidationQueueModel'); 
const DamageReport = require('../models/damageReportModel'); 
const User = require('../models/userModel');
const { sendEmail } = require('../utils/emailService');

// ========== 1. GET EXPECTED SHIPMENTS (For Warehouse Dashboard) ==========
exports.getExpectedShipments = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        // Find shipments that are pending warehouse receipt
        const shipments = await Shipment.find({
            status: { $in: ['pending', 'booking_confirmed'] }
        })
        .populate('customerId', 'firstName lastName companyName phone email')
        .populate('bookingId', 'bookingNumber shipmentDetails')
        .sort({ createdAt: 1 }) // Oldest first
        .limit(limit * 1)
        .skip((page - 1) * limit);

        const total = await Shipment.countDocuments({
            status: { $in: ['pending', 'booking_confirmed'] }
        });

        res.status(200).json({
            success: true,
            data: shipments,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get expected shipments error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 2. RECEIVE SHIPMENT AT WAREHOUSE ==========    

exports.receiveShipment = async (req, res) => {
    try {
        const { shipmentId } = req.params;
        const { location, notes, packages, condition, receivedAt } = req.body;

        if (!shipmentId || !location || !packages || packages.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        if (!req.user?._id) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const shipment = await Shipment.findById(shipmentId)
            .populate('customerId')
            .populate('bookingId');

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        // Parse location
        const locationParts = location.split('-');
        if (locationParts.length !== 4) {
            return res.status(400).json({
                success: false,
                error: 'Invalid location format. Use Zone-Aisle-Rack-Bin'
            });
        }

        const storageLocation = {
            zone: locationParts[0],
            aisle: locationParts[1],
            rack: locationParts[2],
            bin: locationParts[3]
        };

        // Get or create warehouse
        let warehouse = await Warehouse.findOne({ isActive: true });
        if (!warehouse) {
            warehouse = await Warehouse.create({
                warehouseName: 'Main Warehouse',
                warehouseCode: 'WH001',
                isActive: true,
                createdBy: req.user._id
            });
        }

        // 🔥 FIXED: Declare once
        let mappedPackages = packages.map(pkg => ({
            description: pkg.description || 'Package',
            packagingType: pkg.packagingType,
            quantity: pkg.quantity || 1,
            weight: pkg.weight || 0,
            volume: pkg.volume || 0,
            condition: pkg.condition || condition || 'Good',
            storageLocation,
            packageId: pkg._id || new mongoose.Types.ObjectId()
        }));

        // =========================================
        // STEP 1: Check existing receipt
        // =========================================
        let receipt = await WarehouseReceipt.findOne({ shipmentId: shipment._id });

        if (receipt) {
            receipt.receivedAt = receivedAt || new Date();
            receipt.receivedBy = req.user._id;
            receipt.condition = condition || 'Good';
            receipt.remarks = notes || receipt.remarks;
            receipt.packages = mappedPackages;
            receipt.storageLocation = storageLocation;
            receipt.updatedBy = req.user._id;
            receipt.updatedAt = new Date();

            await receipt.save();
        } else {
            // Generate unique receipt number
            let receiptNumber;
            let isUnique = false;
            let attempts = 0;

            while (!isUnique && attempts < 5) {
                attempts++;
                const date = new Date();
                const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                receiptNumber = `WR-${date.getFullYear()}-${date.getMonth() + 1}${date.getDate()}-${random}`;

                const existing = await WarehouseReceipt.findOne({ receiptNumber });
                if (!existing) isUnique = true;
            }

            if (!isUnique) {
                receiptNumber = `WR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            }

            receipt = new WarehouseReceipt({
                receiptNumber,
                shipmentId: shipment._id,
                bookingId: shipment.bookingId?._id,
                warehouseId: warehouse._id,
                customerId: shipment.customerId?._id,
                receivedBy: req.user._id,
                receivedAt: receivedAt || new Date(),
                packages: mappedPackages,
                condition: condition || 'Good',
                remarks: notes || '',
                storageLocation,
                createdBy: req.user._id,
                createdAt: new Date()
            });

            await receipt.save();
        }

        // =========================================
        // STEP 2: Recreate inventory (clean way)
        // =========================================
        await WarehouseInventory.deleteMany({ shipmentId: shipment._id });

        for (const pkg of mappedPackages) {
            const inventoryItem = new WarehouseInventory({
                warehouseId: warehouse._id,
                shipmentId: shipment._id,
                receiptId: receipt._id,
                bookingId: shipment.bookingId?._id,
                customerId: shipment.customerId?._id,
                packageId: pkg.packageId,
                packageType: pkg.packagingType,
                quantity: pkg.quantity,
                weight: pkg.weight,
                volume: pkg.volume,
                location: storageLocation,
                status: condition === 'Damaged' ? 'damaged' : 'stored',
                condition: pkg.condition,
                notes: notes || '',
                receivedAt: receivedAt || new Date(),
                receivedBy: req.user._id,
                createdBy: req.user._id,
                createdAt: new Date()
            });

            await inventoryItem.save();
        }

        // =========================================
        // STEP 3: Update shipment
        // =========================================
        shipment.status = 'received_at_warehouse';
        shipment.receiptId = receipt._id;
        shipment.receiptNumber = receipt.receiptNumber;
        shipment.receivedAt = receivedAt || new Date();
        shipment.receivedBy = req.user._id;
        shipment.storageLocation = location;
        shipment.receivingNotes = notes;
        shipment.receivingCondition = condition || 'Good';

        shipment.milestones = shipment.milestones || [];
        shipment.milestones.push({
            status: 'received_at_warehouse',
            location,
            description: `Shipment received. Receipt: ${receipt.receiptNumber}`,
            timestamp: new Date(),
            updatedBy: req.user._id
        });

        await shipment.save();

        // =========================================
        // SUCCESS RESPONSE
        // =========================================
        res.status(200).json({
            success: true,
            message: 'Shipment received successfully',
            data: {
                shipmentId: shipment._id,
                trackingNumber: shipment.trackingNumber,
                receiptNumber: receipt.receiptNumber,
                status: shipment.status,
                receivedAt: shipment.receivedAt,
                location,
                packagesReceived: mappedPackages.length,
                inventoryCreated: mappedPackages.length,
                packages: receipt.packages,
                createdBy: req.user._id
            }
        });

    } catch (error) {
        console.error('❌ ERROR:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                error: 'Duplicate receipt number'
            });
        }

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: error.errors
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
// ========== 3. GET WAREHOUSE RECEIPTS ==========
exports.getWarehouseReceipts = async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;

        let query = {};
        if (status) query.status = status;

        const receipts = await WarehouseReceipt.find(query)
            .populate('shipmentId', 'trackingNumber status')
            .populate('customerId', 'firstName lastName companyName')
            .populate('receivedBy', 'firstName lastName')
            .populate('warehouseId', 'warehouseName warehouseCode')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await WarehouseReceipt.countDocuments(query);

        res.status(200).json({
            success: true,
            data: receipts,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 4. GET RECEIPT BY ID ==========
exports.getReceiptById = async (req, res) => {
    try {
        const { id } = req.params;

        const receipt = await WarehouseReceipt.findById(id)
            .populate('shipmentId')
            .populate('bookingId')
            .populate('customerId')
            .populate('receivedBy')
            .populate('warehouseId')
            .populate('inspection.conductedBy');

        if (!receipt) {
            return res.status(404).json({
                success: false,
                message: 'Receipt not found'
            });
        }

        // Get inventory items for this shipment
        const inventory = await WarehouseInventory.find({
            shipmentId: receipt.shipmentId._id
        });

        res.status(200).json({
            success: true,
            data: {
                receipt,
                inventory
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 5. GET WAREHOUSE INVENTORY ==========
exports.getWarehouseInventory = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status,
            zone,
            shipmentId 
        } = req.query;

        let query = {};
        if (status) query.status = status;
        if (zone) query['location.zone'] = zone;
        if (shipmentId) query.shipmentId = shipmentId;

        const inventory = await WarehouseInventory.find(query)
            .populate('shipmentId', 'trackingNumber')
            .populate('bookingId', 'bookingNumber')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await WarehouseInventory.countDocuments(query);

        // Group by status for summary
        const summary = await WarehouseInventory.aggregate([
            { $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalWeight: { $sum: '$weight' },
                totalVolume: { $sum: '$volume' }
            }}
        ]);

        res.status(200).json({
            success: true,
            data: inventory,
            summary,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 6. UPDATE INVENTORY LOCATION ==========
exports.updateInventoryLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { zone, aisle, rack, bin } = req.body;

        const inventory = await WarehouseInventory.findById(id);

        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        inventory.location = {
            zone: zone || inventory.location.zone,
            aisle: aisle || inventory.location.aisle,
            rack: rack || inventory.location.rack,
            bin: bin || inventory.location.bin,
            lastMoved: new Date()
        };

        inventory.updatedBy = req.user._id;
        await inventory.save();

        res.status(200).json({
            success: true,
            message: 'Inventory location updated',
            data: inventory
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 7. START CONSOLIDATION ==========
exports.startConsolidation = async (req, res) => {
    try {
        const { 
            shipmentIds, 
            containerType, 
            containerNumber,
            sealNumber,
            destinationPort,
            estimatedDeparture
        } = req.body;

        console.log('📦 Starting consolidation for shipments:', shipmentIds);

        // Validate shipments
        const shipments = await Shipment.find({
            _id: { $in: shipmentIds },
            status: 'received_at_warehouse'
        }).populate('customerId');

        if (shipments.length !== shipmentIds.length) {
            return res.status(400).json({
                success: false,
                message: 'Some shipments are not ready for consolidation'
            });
        }

        // Calculate totals
        let totalPackages = 0;
        let totalWeight = 0;
        let totalVolume = 0;
        const items = [];

        // Get inventory items for each shipment
        for (const shipment of shipments) {
            const inventory = await WarehouseInventory.find({
                shipmentId: shipment._id,
                status: 'stored'
            });

            for (const item of inventory) {
                totalPackages += item.quantity || 1;
                totalWeight += item.weight || 0;
                totalVolume += item.volume || 0;

                items.push({
                    inventoryId: item._id,
                    shipmentId: shipment._id,
                    packageType: item.packageType,
                    quantity: item.quantity || 1,
                    description: item.description,
                    weight: item.weight,
                    volume: item.volume
                });
            }
        }

        // Create consolidation
        const consolidation = await Consolidation.create({
            shipments: shipmentIds,
            warehouseId: req.user.warehouseId || (await Warehouse.findOne())._id,
            containerType,
            containerNumber,
            sealNumber,
            totalShipments: shipments.length,
            totalPackages,
            totalWeight,
            totalVolume,
            originWarehouse: 'Main Warehouse',
            destinationPort: destinationPort || 'Destination Port',
            consolidationStarted: new Date(),
            estimatedDeparture: estimatedDeparture || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            status: 'in_progress',
            items,
            createdBy: req.user._id
        });

        console.log('✅ Consolidation created:', consolidation.consolidationNumber);

        // Update inventory items
        await WarehouseInventory.updateMany(
            { _id: { $in: items.map(i => i.inventoryId) } },
            { 
                $set: { 
                    consolidationId: consolidation._id,
                    status: 'consolidated',
                    updatedBy: req.user._id
                }
            }
        );

        res.status(201).json({
            success: true,
            message: 'Consolidation started successfully',
            data: consolidation
        });

    } catch (error) {
        console.error('❌ Start consolidation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 8. COMPLETE CONSOLIDATION ==========
// ========== 8. COMPLETE CONSOLIDATION (FIXED) ==========
exports.completeConsolidation = async (req, res) => {
    try {
        const { id } = req.params;
        const { containerNumber, sealNumber, documents } = req.body;

        const consolidation = await Consolidation.findById(id)
            .populate('shipments');

        if (!consolidation) {
            return res.status(404).json({
                success: false,
                message: 'Consolidation not found'
            });
        }

        // Update consolidation
        consolidation.status = 'completed';
        consolidation.consolidationCompleted = new Date();
        if (containerNumber) consolidation.containerNumber = containerNumber;
        if (sealNumber) consolidation.sealNumber = sealNumber;
        if (documents) consolidation.documents = documents;
        consolidation.updatedBy = req.user._id;

        await consolidation.save();

        // Update shipments status and remove from queue
        for (const shipmentId of consolidation.shipments) {
            const shipment = await Shipment.findById(shipmentId);
            
            shipment.status = 'loaded_in_container';
            shipment.milestones.push({
                status: 'loaded_in_container',
                location: 'Warehouse',
                description: `Loaded into container ${consolidation.containerNumber}`,
                updatedBy: req.user._id,
                timestamp: new Date()
            });

            shipment.transport = {
                ...shipment.transport,
                containerNumber: consolidation.containerNumber,
                sealNumber: consolidation.sealNumber,
                consolidationId: consolidation._id
            };

            await shipment.save();

            // Update inventory
            await WarehouseInventory.updateMany(
                { shipmentId: shipment._id },
                { 
                    $set: { 
                        status: 'loaded',
                        loadedAt: new Date(),
                        consolidationId: consolidation._id
                    }
                }
            );

            // ✅ FIX: ConsolidationQueue থেকে রিমুভ করুন
            const receipt = await WarehouseReceipt.findOne({ shipmentId: shipment._id });
            if (receipt) {
                const queueResult = await ConsolidationQueue.deleteMany({ 
                    receiptId: receipt._id 
                });
                
                console.log(`✅ Removed ${queueResult.deletedCount} items from queue for shipment ${shipment.trackingNumber}`);
            }
        }

        // Notify operations team
        const opsTeam = await User.find({ role: 'operations', isActive: true });
        if (opsTeam.length > 0) {
            sendEmail({
                to: opsTeam.map(o => o.email),
                subject: '🚢 Consolidation Ready for Departure',
                template: 'consolidation-ready',
                data: {
                    consolidationNumber: consolidation.consolidationNumber,
                    containerNumber: consolidation.containerNumber,
                    totalShipments: consolidation.shipments.length,
                    dashboardUrl: `${process.env.FRONTEND_URL}/operations/consolidations/${consolidation._id}`
                }
            }).catch(err => console.log('Ops email error:', err.message));
        }

        res.status(200).json({
            success: true,
            message: 'Consolidation completed successfully',
            data: consolidation
        });

    } catch (error) {
        console.error('❌ Complete consolidation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 9. LOAD AND DEPART CONSOLIDATION ==========
// ========== 9. LOAD AND DEPART CONSOLIDATION (FIXED) ==========
exports.loadAndDepart = async (req, res) => {
    try {
        const { id } = req.params;
        const { actualDeparture, transportMode, carrier, vesselInfo } = req.body;

        const consolidation = await Consolidation.findById(id)
            .populate('shipments');

        if (!consolidation) {
            return res.status(404).json({
                success: false,
                message: 'Consolidation not found'
            });
        }

        // Update consolidation
        consolidation.status = 'loaded';
        consolidation.actualDeparture = actualDeparture || new Date();
        consolidation.updatedBy = req.user._id;
        await consolidation.save();

        // Update all shipments in this consolidation
        for (const shipmentId of consolidation.shipments) {
            const shipment = await Shipment.findById(shipmentId);
            
            shipment.status = 'in_transit';
            shipment.milestones.push({
                status: 'in_transit',
                location: 'Departure',
                description: `Departed via ${transportMode || 'vessel'}`,
                updatedBy: req.user._id,
                timestamp: new Date()
            });

            shipment.transport = {
                ...shipment.transport,
                mode: transportMode || 'vessel',
                carrier: carrier || 'Shipping Line',
                vesselName: vesselInfo?.vesselName,
                voyageNumber: vesselInfo?.voyageNumber,
                actualDeparture: actualDeparture || new Date()
            };

            await shipment.save();

            // ✅ FIX: নিশ্চিত করুন যে এগুলো আর কিউতে নেই
            const receipt = await WarehouseReceipt.findOne({ shipmentId: shipment._id });
            if (receipt) {
                await ConsolidationQueue.deleteMany({ 
                    receiptId: receipt._id 
                });
            }

            // Notify customers
            const booking = await Booking.findById(shipment.bookingId)
                .populate('customer', 'email firstName');
            
            if (booking && booking.customer) {
                sendEmail({
                    to: booking.customer.email,
                    subject: '🚢 Your Shipment Is On The Way!',
                    template: 'shipment-departed',
                    data: {
                        customerName: booking.customer.firstName,
                        trackingNumber: shipment.trackingNumber,
                        transportMode: transportMode || 'vessel',
                        estimatedArrival: shipment.transport.estimatedArrival,
                        trackingUrl: `${process.env.FRONTEND_URL}/tracking/${shipment.trackingNumber}`
                    }
                }).catch(err => console.log('Departure email error:', err.message));
            }
        }

        res.status(200).json({
            success: true,
            message: 'Consolidation departed successfully',
            data: consolidation
        });

    } catch (error) {
        console.error('❌ Load and depart error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 10. GET WAREHOUSE DASHBOARD ==========
exports.getWarehouseDashboard = async (req, res) => {
    try {
        // Get counts
        const expectedToday = await Shipment.countDocuments({
            status: 'pending',
            createdAt: { $gte: new Date().setHours(0,0,0,0) }
        });

        const receivedToday = await WarehouseReceipt.countDocuments({
            receivedDate: { $gte: new Date().setHours(0,0,0,0) }
        });

        const pendingReceipt = await Shipment.countDocuments({
            status: { $in: ['pending', 'booking_confirmed'] }
        });

        const inWarehouse = await WarehouseInventory.countDocuments({
            status: { $in: ['received', 'inspected', 'stored'] }
        });

        const readyForConsolidation = await WarehouseInventory.countDocuments({
            status: 'stored',
            consolidationId: null
        });

        const inConsolidation = await WarehouseInventory.countDocuments({
            status: 'consolidated'
        });

        // Get recent receipts
        const recentReceipts = await WarehouseReceipt.find()
            .populate('customerId', 'companyName')
            .populate('shipmentId', 'trackingNumber')
            .sort({ createdAt: -1 })
            .limit(5);

        // Get inventory by zone
        const inventoryByZone = await WarehouseInventory.aggregate([
            { $group: {
                _id: '$location.zone',
                count: { $sum: 1 },
                totalWeight: { $sum: '$weight' },
                totalVolume: { $sum: '$volume' }
            }}
        ]);

        res.status(200).json({
            success: true,
            data: {
                summary: {
                    expectedToday,
                    receivedToday,
                    pendingReceipt,
                    inWarehouse,
                    readyForConsolidation,
                    inConsolidation
                },
                recentReceipts,
                inventoryByZone
            }
        });

    } catch (error) {
        console.error('❌ Warehouse dashboard error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 11. GET CONSOLIDATIONS ==========
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
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 12. GET CONSOLIDATION BY ID ==========
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

        // Get inventory items in this consolidation
        const inventory = await WarehouseInventory.find({
            consolidationId: consolidation._id
        }).populate('shipmentId', 'trackingNumber');

        res.status(200).json({
            success: true,
            data: {
                consolidation,
                inventory
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 13. ADD DOCUMENTS TO CONSOLIDATION ==========
exports.addConsolidationDocuments = async (req, res) => {
    try {
        const { id } = req.params;
        const { documents } = req.body;

        const consolidation = await Consolidation.findById(id);

        if (!consolidation) {
            return res.status(404).json({
                success: false,
                message: 'Consolidation not found'
            });
        }

        consolidation.documents = consolidation.documents || [];
        consolidation.documents.push(...documents.map(doc => ({
            ...doc,
            uploadedBy: req.user._id,
            uploadedAt: new Date()
        })));

        consolidation.updatedBy = req.user._id;
        await consolidation.save();

        res.status(200).json({
            success: true,
            message: 'Documents added',
            data: consolidation.documents
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 14. UPDATE WAREHOUSE ==========
exports.updateWarehouse = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const warehouse = await Warehouse.findById(id);

        if (!warehouse) {
            return res.status(404).json({
                success: false,
                message: 'Warehouse not found'
            });
        }

        Object.assign(warehouse, updateData);
        await warehouse.save();

        res.status(200).json({
            success: true,
            message: 'Warehouse updated',
            data: warehouse
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 15. GET ALL WAREHOUSES ==========
exports.getAllWarehouses = async (req, res) => {
    try {
        const warehouses = await Warehouse.find({ isActive: true });

        res.status(200).json({
            success: true,
            data: warehouses
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 16. CREATE WAREHOUSE ==========
exports.createWarehouse = async (req, res) => {
    try {
        const warehouseData = req.body;

        const warehouse = await Warehouse.create(warehouseData);

        res.status(201).json({
            success: true,
            message: 'Warehouse created',
            data: warehouse
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 17. INSPECT RECEIVED SHIPMENT ========== 
// controllers/warehouseController.js - inspectShipment ফাংশন (FINAL FIXED)

exports.inspectShipment = async (req, res) => {
    try {
        const { receiptId } = req.params;
        const inspectionData = req.body;

        console.log('🔍 Receiving inspection data:', inspectionData);

        // Find receipt with all necessary populated data
        const receipt = await WarehouseReceipt.findById(receiptId)
            .populate('shipmentId')
            .populate('customerId')
            .populate('receivedBy');

        if (!receipt) {
            return res.status(404).json({
                success: false,
                message: 'Receipt not found'
            });
        }

        // ============================================
        // ✅ STEP 1: Update receipt with inspection data
        // ============================================
        
        // Save inspection details
        receipt.inspection = {
            conductedBy: req.user._id,
            conductedAt: new Date(),
            condition: inspectionData.condition,        // 'Good', 'Minor Damage', 'Major Damage'
            findings: inspectionData.findings || '',
            photos: inspectionData.photos || [],
            disposition: inspectionData.disposition || 'restock',
            details: inspectionData.details || [],       // Per package inspection
            summary: inspectionData.summary || {
                totalPackages: receipt.packages.length,
                totalItems: receipt.packages.reduce((sum, p) => sum + (p.quantity || 1), 0),
                goodItems: 0,
                damagedItems: 0
            }
        };

        // Update receipt status based on condition
        if (inspectionData.condition === 'Good') {
            receipt.status = 'inspected';  // Good items ready for storage
        } else {
            receipt.status = 'damaged_report';  // Damaged items need special handling
        }

        // Update package conditions
        if (inspectionData.details && inspectionData.details.length > 0) {
            receipt.packages.forEach((pkg, index) => {
                if (inspectionData.details[index]) {
                    pkg.condition = inspectionData.details[index].condition || pkg.condition;
                    pkg.remarks = inspectionData.details[index].notes || pkg.remarks;
                    if (inspectionData.details[index].passed !== undefined) {
                        pkg.quantity = inspectionData.details[index].passed;
                    }
                }
            });
        }

        await receipt.save();
        console.log('✅ Receipt updated with inspection');

        // ============================================
        // ✅ STEP 2: Update inventory items
        // ============================================
        
        const inventoryItems = await WarehouseInventory.find({ receiptId: receipt._id });
        
        for (let i = 0; i < inventoryItems.length; i++) {
            const inventory = inventoryItems[i];
            const inspectionDetail = inspectionData.details?.[i];
            
            inventory.condition = inspectionData.condition;
            inventory.status = inspectionData.condition === 'Good' ? 'inspected' : 'damaged';
            inventory.inspectedBy = req.user._id;
            inventory.inspectedAt = new Date();
            
            if (inspectionDetail) {
                inventory.remarks = inspectionDetail.notes || '';
                if (inspectionDetail.passed !== undefined) {
                    inventory.quantity = inspectionDetail.passed;
                }
            }
            
            await inventory.save();
        }
        
        console.log(`✅ Updated ${inventoryItems.length} inventory items`);

        // ============================================
        // ✅ STEP 3: Handle Damage Report (DELETE if Good, CREATE if Damaged)
        // ============================================
        
        let damageReport = null;
        const shipment = receipt.shipmentId;

        // Check if there's an existing damage report for this receipt
        const existingDamageReport = await DamageReport.findOne({ 
            receiptId: receipt._id 
        });

        if (inspectionData.condition === 'Good') {
            // ✅ If condition is Good, DELETE any existing damage report
            if (existingDamageReport) {
                await DamageReport.deleteOne({ _id: existingDamageReport._id });
                console.log('✅ Existing damage report deleted');
            }
        } else {
            // ✅ If condition is Damaged, UPDATE or CREATE damage report
            
            const dispositionMap = {
                'restock': 'quarantine',
                'scrap': 'scrap',
                'return': 'return',
                'rework': 'rework',
                'quarantine': 'quarantine',
                'insurance': 'insurance'
            };
            
            const mappedDisposition = dispositionMap[inspectionData.disposition] || 'quarantine';
            
            if (existingDamageReport) {
                // Update existing damage report
                existingDamageReport.condition = inspectionData.condition;
                existingDamageReport.findings = inspectionData.findings || 'Damaged goods detected';
                existingDamageReport.details = inspectionData.details || [];
                existingDamageReport.disposition = mappedDisposition;
                existingDamageReport.location = receipt.storageLocation;
                existingDamageReport.reviewedBy = req.user._id;
                existingDamageReport.reviewedAt = new Date();
                
                await existingDamageReport.save();
                damageReport = existingDamageReport;
                console.log('✅ Damage report updated:', damageReport.reportNumber);
            } else {
                // Create new damage report
                damageReport = await DamageReport.create({
                    receiptId: receipt._id,
                    shipmentId: shipment?._id,
                    reportNumber: `DAM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    condition: inspectionData.condition,
                    findings: inspectionData.findings || 'Damaged goods detected',
                    details: inspectionData.details || [],
                    reportedBy: req.user._id,
                    reportedAt: new Date(),
                    status: 'pending_review',
                    disposition: mappedDisposition,
                    location: receipt.storageLocation
                });
                console.log('✅ Damage report created:', damageReport.reportNumber);
            }
        }

        // ============================================
        // ✅ STEP 4: Handle Consolidation Queue (ADD if Good, REMOVE if Damaged)
        // ============================================
        
// controllers/warehouseController.js - inspectShipment ফাংশনের STEP 4

// ============================================
// ✅ STEP 4: Handle Consolidation Queue (ADD if Good, REMOVE if Damaged)
// ============================================
        
let addedToQueue = false;
let groupKey = null;
let removedFromQueue = false;

console.log('🔍 STEP 4 - Checking queue for receipt:', receipt._id);
console.log('📦 Condition:', inspectionData.condition);

// Check if there's an existing queue entry for this receipt
const existingQueueItem = await ConsolidationQueue.findOne({ 
    receiptId: receipt._id,
    status: { $in: ['pending', 'assigned'] }
});

console.log('📋 Existing queue item:', existingQueueItem ? 'YES' : 'NO');
if (existingQueueItem) {
    console.log('   - Queue ID:', existingQueueItem._id);
    console.log('   - Status:', existingQueueItem.status);
    console.log('   - Group Key:', existingQueueItem.groupKey);
}

if (inspectionData.condition === 'Good') {
    console.log('✅ Condition is GOOD - should add to queue');
    
    if (existingQueueItem) {
        // Already in queue, do nothing
        console.log('ℹ️ Shipment already in queue - skipping');
        addedToQueue = false;
    } else {
        // Add to queue
        console.log('➕ Adding to queue...');
        
        if (shipment) {
            console.log('📦 Shipment found:', shipment._id);
            console.log('   - Tracking:', shipment.trackingNumber);
            console.log('   - MainType:', shipment.shipmentClassification?.mainType);
            console.log('   - SubType:', shipment.shipmentClassification?.subType);
            console.log('   - Origin:', shipment.shipmentDetails?.origin);
            console.log('   - Destination:', shipment.shipmentDetails?.destination);
            
            const mainType = shipment.shipmentClassification?.mainType || 'general';
            const subType = shipment.shipmentClassification?.subType || 'cargo';
            const origin = shipment.shipmentDetails?.origin || 'unknown';
            const destination = shipment.shipmentDetails?.destination || 'unknown';
            
            groupKey = `${mainType}_${subType}_${origin}_${destination}`;
            console.log('🔑 Group Key:', groupKey);
            
            // Calculate totals
            let totalWeight = 0;
            let totalVolume = 0;
            let totalPackages = 0;
            
            receipt.packages.forEach((pkg, idx) => {
                const qty = inspectionData.details?.[idx]?.passed || pkg.quantity || 1;
                totalPackages += qty;
                totalWeight += (pkg.weight || 0) * qty;
                totalVolume += (pkg.volume || 0) * qty;
            });
            
            console.log('📊 Totals:', { totalPackages, totalWeight, totalVolume });
            
            try {
                // Create queue entry
                const queueEntry = await ConsolidationQueue.create({
                    shipmentId: shipment._id,
                    receiptId: receipt._id,
                    warehouseId: receipt.warehouseId,
                    customerId: receipt.customerId?._id,
                    trackingNumber: shipment.trackingNumber,
                    
                    mainType,
                    subType,
                    origin,
                    destination,
                    destinationCountry: shipment.shipmentDetails?.destinationCountry,
                    groupKey,
                    
                    packages: receipt.packages.map((pkg, idx) => ({
                        description: pkg.description,
                        packagingType: pkg.packagingType,
                        quantity: inspectionData.details?.[idx]?.passed || pkg.quantity,
                        weight: pkg.weight,
                        volume: pkg.volume,
                        condition: 'Good'
                    })),
                    
                    totalWeight,
                    totalVolume,
                    totalPackages,
                    
                    status: 'pending',
                    addedBy: req.user._id,
                    addedAt: new Date(),
                    priority: 0
                });
                
                addedToQueue = true;
                console.log('✅ SUCCESS: Shipment added to queue:', queueEntry._id);
                console.log('   - Group Key:', queueEntry.groupKey);
            } catch (queueError) {
                console.error('❌ Queue creation error:', queueError);
                // Don't throw, just log
            }
        } else {
            console.log('❌ No shipment found! Cannot add to queue');
        }
    }
} else {
    console.log('❌ Condition is NOT GOOD - should remove from queue if exists');
    if (existingQueueItem) {
        await ConsolidationQueue.deleteOne({ _id: existingQueueItem._id });
        removedFromQueue = true;
        console.log('✅ Shipment removed from queue (damaged)');
    } else {
        console.log('ℹ️ No existing queue item to remove');
    }
}

console.log('📊 Final - addedToQueue:', addedToQueue, 'removedFromQueue:', removedFromQueue);

        // ============================================
        // ✅ STEP 5: Update Shipment status (FIXED)
        // ============================================
        
// controllers/warehouseController.js - inspectShipment ফাংশনের STEP 5 এ এই কোড যোগ করুন

// ============================================
// ✅ STEP 5: Update Shipment status (FIXED - WITH CLEANUP)
// ============================================
        
if (shipment) {
    // Use appropriate status from model enum
    shipment.status = inspectionData.condition === 'Good' ? 'inspected' : 'damage_reported';
    
    if (damageReport) {
        shipment.damageReportId = damageReport._id;
    }
    
    shipment.milestones = shipment.milestones || [];
    
    // ✅ FIX: আগের invalid milestones সরান
    const validStatuses = [
        'pending', 'picked_up_from_warehouse', 'departed_port_of_origin',
        'in_transit_sea_freight', 'arrived_at_destination_port', 'customs_cleared',
        'out_for_delivery', 'inspected', 'damage_reported', 'delivered',
        'on_hold', 'cancelled', 'returned', 'received_at_warehouse'
    ];
    
    // Filter out invalid milestones
    const invalidMilestones = shipment.milestones.filter(m => 
        !validStatuses.includes(m.status)
    );
    
    if (invalidMilestones.length > 0) {
        console.log('⚠️ Found invalid milestones:', invalidMilestones.map(m => m.status));
        
        // শুধু valid milestones রাখুন
        shipment.milestones = shipment.milestones.filter(m => 
            validStatuses.includes(m.status)
        );
        
        console.log(`✅ Removed ${invalidMilestones.length} invalid milestones`);
    }
    
    // ✅ Always use valid status from enum
    const milestoneStatus = inspectionData.condition === 'Good' ? 'inspected' : 'damage_reported';
    
    // Build description with all information
    let description = `Inspection completed. `;
    description += `Condition: ${inspectionData.condition}. `;
    
    if (inspectionData.condition === 'Good') {
        if (addedToQueue) {
            description += 'Added to consolidation queue.';
        } else if (existingQueueItem) {
            description += 'Already in consolidation queue.';
        }
    } else {
        if (removedFromQueue) {
            description += 'Removed from consolidation queue.';
        }
        if (damageReport) {
            description += ` Damage report: ${damageReport.reportNumber}.`;
        }
    }
    
    // Add findings if any
    if (inspectionData.findings && inspectionData.findings !== 'Inspection completed') {
        description += ` Findings: ${inspectionData.findings}`;
    }
    
    shipment.milestones.push({
        status: milestoneStatus,  // ✅ Always valid: 'inspected' or 'damage_reported'
        location: receipt.storageLocation ? 
            `Zone ${receipt.storageLocation.zone}` : 'Warehouse',
        description: description,
        timestamp: new Date(),
        updatedBy: req.user._id
    });
    
    try {
        await shipment.save();
        console.log('✅ Shipment updated with milestone');
    } catch (shipmentError) {
        console.error('❌ Shipment save error:', shipmentError);
        // Continue even if shipment update fails
    }
}

        // ============================================
        // ✅ STEP 6: Send response with appropriate message
        // ============================================
        
        let message = '';
        if (inspectionData.condition === 'Good') {
            message = addedToQueue 
                ? 'Inspection completed. Shipment added to consolidation queue.'
                : 'Inspection completed. Shipment already in queue.';
        } else {
            message = removedFromQueue
                ? `Inspection completed. Shipment marked as ${inspectionData.condition} and removed from queue.`
                : `Inspection completed. Shipment marked as ${inspectionData.condition}.`;
        }

        const response = {
            success: true,
            message,
            data: {
                receiptId: receipt._id,
                receiptNumber: receipt.receiptNumber,
                condition: inspectionData.condition,
                status: receipt.status,
                inspection: {
                    conductedAt: receipt.inspection.conductedAt,
                    condition: receipt.inspection.condition,
                    findings: receipt.inspection.findings
                },
                trackingNumber: shipment?.trackingNumber,
                storageLocation: receipt.storageLocation,
                addedToQueue,
                removedFromQueue,
                groupKey,
                damageReport: damageReport ? {
                    id: damageReport._id,
                    reportNumber: damageReport.reportNumber,
                    status: damageReport.status
                } : null
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ Inspect shipment error:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: error.errors
            });
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};