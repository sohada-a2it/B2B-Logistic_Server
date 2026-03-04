const mongoose = require('mongoose');

const consolidationQueueSchema = new mongoose.Schema({
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true
    },
    receiptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WarehouseReceipt'
    },
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Shipment Details
    trackingNumber: String,
    origin: String,           // China/Thailand
    destination: String,       // USA/UK/Canada
    destinationCountry: String,
    
    // Package Summary
    packages: [{
        description: String,
        packagingType: String,
        quantity: Number,
        weight: Number,
        volume: Number,
        condition: String
    }],
    
    // Totals
    totalWeight: Number,
    totalVolume: Number,
    totalPackages: Number,
    
    // Grouping Key (for destination-wise grouping)
    groupKey: {
        type: String,
        required: true
    },
    
    // Status
    status: {
        type: String,
        enum: ['pending', 'assigned', 'consolidated'],
        default: 'pending'
    },
    
    // Assignment
    consolidationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consolidation'
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    assignedAt: Date,
    
    // Priority (for sorting)
    priority: {
        type: Number,
        default: 0
    },
    
    notes: String
});

// Compound index for fast grouping
consolidationQueueSchema.index({ groupKey: 1, status: 1, addedAt: 1 });
// Index for destination-based queries
consolidationQueueSchema.index({ destination: 1, status: 1 });

module.exports = mongoose.model('ConsolidationQueue', consolidationQueueSchema);