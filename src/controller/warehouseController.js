// controllers/warehouseController.js

const Warehouse = require('../models/warehouseModel');
const WarehouseReceipt = require('../models/warehouseReceiptModel');
const WarehouseInventory = require('../models/warehouseInventoryModel');
const Consolidation = require('../models/consolidationModel');
const Shipment = require('../models/shipmentModel');
const Booking = require('../models/bookingModel');
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
        const {
            receivedPackages,
            storageLocation,
            condition,
            notes,
            warehouseId
        } = req.body;

        console.log('📦 Receiving shipment:', shipmentId);

        // Find shipment
        const shipment = await Shipment.findById(shipmentId)
            .populate('customerId', 'email firstName lastName companyName')
            .populate('bookingId');

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        // Check if already received
        const existingReceipt = await WarehouseReceipt.findOne({ shipmentId });
        if (existingReceipt) {
            return res.status(400).json({
                success: false,
                message: 'Shipment already received at warehouse'
            });
        }

        // ===== STEP 1: Create Warehouse Receipt =====
        const receiptData = {
            shipmentId: shipment._id,
            bookingId: shipment.bookingId._id,
            customerId: shipment.customerId._id,
            warehouseId: warehouseId || req.user.warehouseId,
            receivedDate: new Date(),
            receivedBy: req.user._id,
            receivedPackages: receivedPackages || shipment.packages,
            storageLocation: storageLocation || {
                zone: 'A',
                aisle: '1',
                rack: '1',
                bin: '1'
            },
            status: condition === 'Good' ? 'received' : 'inspected',
            inspection: {
                conductedBy: req.user._id,
                conductedAt: new Date(),
                condition: condition || 'Good',
                findings: notes || ''
            },
            notes: notes,
            createdBy: req.user._id
        };

        const receipt = await WarehouseReceipt.create(receiptData);
        console.log('✅ Receipt created:', receipt.receiptNumber);

        // ===== STEP 2: Create Inventory Items =====
        const inventoryItems = [];
        
        for (const pkg of (receivedPackages || shipment.packages)) {
            for (let i = 0; i < (pkg.quantity || 1); i++) {
                const inventoryItem = await WarehouseInventory.create({
                    shipmentId: shipment._id,
                    bookingId: shipment.bookingId._id,
                    warehouseId: warehouseId || req.user.warehouseId,
                    packageType: pkg.packageType || 'Carton',
                    packageId: `${shipment.trackingNumber}-${i + 1}`,
                    quantity: 1,
                    description: pkg.description || 'Cargo',
                    weight: pkg.weight || 0,
                    volume: pkg.volume || 0,
                    dimensions: pkg.dimensions || {},
                    location: storageLocation || {
                        zone: 'A',
                        aisle: '1',
                        rack: '1',
                        bin: '1'
                    },
                    status: condition === 'Good' ? 'received' : 'inspected',
                    receivedAt: new Date(),
                    createdBy: req.user._id
                });
                inventoryItems.push(inventoryItem);
            }
        }
        console.log(`✅ ${inventoryItems.length} inventory items created`);

        // ===== STEP 3: Update Shipment Status =====
        shipment.status = condition === 'Good' ? 'received_at_warehouse' : 'damaged_report';
        shipment.warehouseInfo = {
            receivedDate: new Date(),
            receivedBy: req.user._id,
            location: storageLocation?.zone || 'A',
            receiptId: receipt._id,
            notes: notes
        };

        // Add milestone
        shipment.milestones.push({
            status: 'received_at_warehouse',
            location: storageLocation?.zone || 'Warehouse',
            description: `Shipment received at warehouse. ${condition === 'Good' ? 'All good' : 'Issues found: ' + condition}`,
            updatedBy: req.user._id,
            timestamp: new Date()
        });

        await shipment.save();
        console.log('✅ Shipment status updated');

        // ===== STEP 4: Notify Customer =====
        if (shipment.customerId && shipment.customerId.email) {
            await sendEmail({
                to: shipment.customerId.email,
                subject: '📦 Your Shipment Has Reached Our Warehouse',
                template: 'shipment-received-warehouse',
                data: {
                    customerName: shipment.customerId.firstName || 'Customer',
                    trackingNumber: shipment.trackingNumber,
                    receiptNumber: receipt.receiptNumber,
                    receivedDate: new Date().toLocaleDateString(),
                    packages: receivedPackages?.length || shipment.packages?.length,
                    condition: condition || 'Good',
                    trackingUrl: `${process.env.FRONTEND_URL}/tracking/${shipment.trackingNumber}`,
                    dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`
                }
            }).catch(err => console.log('Customer email error:', err.message));
        }

        // ===== STEP 5: Notify Admin =====
        const admins = await User.find({ role: 'admin', isActive: true });
        if (admins.length > 0) {
            await sendEmail({
                to: admins.map(a => a.email),
                subject: '📦 Shipment Received at Warehouse',
                template: 'warehouse-receipt-notification',
                data: {
                    trackingNumber: shipment.trackingNumber,
                    customerName: shipment.customerId?.companyName || 'Customer',
                    receiptNumber: receipt.receiptNumber,
                    warehouseId: warehouseId || 'Main Warehouse',
                    dashboardUrl: `${process.env.FRONTEND_URL}/admin/shipments/${shipment._id}`
                }
            }).catch(err => console.log('Admin email error:', err.message));
        }

        // ===== STEP 6: Return Response =====
        res.status(200).json({
            success: true,
            message: 'Shipment received at warehouse successfully',
            data: {
                receipt: {
                    _id: receipt._id,
                    receiptNumber: receipt.receiptNumber,
                    receivedDate: receipt.receivedDate
                },
                inventoryItems: inventoryItems.length,
                shipment: {
                    _id: shipment._id,
                    trackingNumber: shipment.trackingNumber,
                    status: shipment.status
                }
            }
        });

    } catch (error) {
        console.error('❌ Receive shipment error:', error);
        res.status(500).json({ success: false, error: error.message });
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

        // Update shipments status
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
exports.inspectShipment = async (req, res) => {
    try {
        const { receiptId } = req.params;
        const { condition, findings, photos } = req.body;

        const receipt = await WarehouseReceipt.findById(receiptId)
            .populate('shipmentId');

        if (!receipt) {
            return res.status(404).json({
                success: false,
                message: 'Receipt not found'
            });
        }

        // Update receipt
        receipt.status = 'inspected';
        receipt.inspection = {
            conductedBy: req.user._id,
            conductedAt: new Date(),
            condition,
            findings,
            photos: photos || []
        };

        await receipt.save();

        // Update inventory items
        await WarehouseInventory.updateMany(
            { shipmentId: receipt.shipmentId._id },
            { 
                $set: { 
                    status: condition === 'Good' ? 'stored' : 'damaged',
                    condition: condition
                }
            }
        );

        // Update shipment if damaged
        if (condition !== 'Good') {
            const shipment = await Shipment.findById(receipt.shipmentId._id);
            shipment.status = 'damaged_report';
            shipment.milestones.push({
                status: 'damaged_report',
                location: 'Warehouse',
                description: `Inspection found: ${findings || condition}`,
                updatedBy: req.user._id,
                timestamp: new Date()
            });
            await shipment.save();
        }

        res.status(200).json({
            success: true,
            message: 'Inspection completed',
            data: receipt
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};