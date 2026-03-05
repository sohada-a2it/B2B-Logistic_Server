const mongoose = require('mongoose');

const consolidationQueueSchema = new mongoose.Schema({
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true
    },
    trackingNumber: {
        type: String,
        required: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // ===== গ্রুপিং কী (Shipment Classification + Origin + Destination) =====
    groupKey: {
        type: String,
        required: true,
        index: true
    },
    
    // গ্রুপিং কম্পোনেন্ট (individual fields for easier querying)
    mainType: {
        type: String,
        enum: ['sea_freight', 'air_freight', 'inland_trucking', 'multimodal'],
        required: true
    },
    subType: {
        type: String,
        enum: [
            'sea_freight_fcl', 'sea_freight_lcl', 'air_freight',
            'rail_freight', 'express_delivery', 'inland_transport', 'door_to_door'
        ],
        required: true
    },
    origin: {
        type: String,
        enum: ['China Warehouse', 'Thailand Warehouse'],
        required: true
    },
    destination: {
        type: String,
        enum: ['USA', 'UK', 'Canada'],
        required: true
    },
    destinationCountry: String,
    
    // Shipment Details
    totalPackages: Number,
    totalWeight: Number,
    totalVolume: Number,
    
    // Status
    status: {
        type: String,
        enum: ['pending', 'assigned', 'consolidated', 'removed'],
        default: 'pending'
    },
    
    // Reference to consolidation when assigned
    consolidationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consolidation'
    },
    assignedAt: Date,
    
    // Tracking
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    
    // Expiry (auto-remove after 7 days if not consolidated)
    expiresAt: {
        type: Date,
        default: () => new Date(+new Date() + 7*24*60*60*1000) // 7 days
    }
});

// Compound index for efficient grouping
consolidationQueueSchema.index({ 
    mainType: 1, 
    subType: 1, 
    origin: 1, 
    destination: 1, 
    status: 1 
});

module.exports = mongoose.model('ConsolidationQueue', consolidationQueueSchema);