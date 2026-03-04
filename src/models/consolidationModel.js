const mongoose = require('mongoose');

const consolidationSchema = new mongoose.Schema({
    consolidationNumber: {
        type: String,
        required: true,
        unique: true
    },
    // Shipments in this consolidation
    shipments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true
    }],
    // Container Information
    containerNumber: {
        type: String,
        required: true
    },
    containerType: {
        type: String,
        enum: ['20ft', '40ft', '40ft HC', '45ft', 'LCL'],
        default: '20ft'
    },
    sealNumber: String,
    
    // Route Information
    originWarehouse: {
        type: String,
        default: 'Main Warehouse'
    },
    destinationPort: {
        type: String,
        required: true
    },
    destinationCountry: String,
    
    // Dates
    consolidationStarted: {
        type: Date,
        default: Date.now
    },
    consolidationCompleted: Date,
    estimatedDeparture: Date,
    actualDeparture: Date,
    estimatedArrival: Date,
    
    // Shipment Details
    totalShipments: {
        type: Number,
        default: 0
    },
    totalPackages: {
        type: Number,
        default: 0
    },
    totalWeight: {
        type: Number,
        default: 0
    },
    totalVolume: {
        type: Number,
        default: 0
    },
    
    // Items in consolidation
    items: [{
        shipmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shipment'
        },
        packageType: String,
        quantity: Number,
        description: String,
        weight: Number,
        volume: Number
    }],
    
    // Status
    status: {
        type: String,
        enum: ['draft', 'in_progress', 'completed', 'loaded', 'departed'],
        default: 'draft'
    },
    
    // Documents
    documents: [{
        type: {
            type: String,
            enum: ['packing_list', 'container_manifest', 'bill_of_lading']
        },
        url: String,
        uploadedAt: Date,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    
    // Tracking
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Generate consolidation number before saving
consolidationSchema.pre('save', async function(next) {
    if (this.isNew && !this.consolidationNumber) {
        const count = await this.constructor.countDocuments();
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        this.consolidationNumber = `CN-${year}${month}-${String(count + 1).padStart(4, '0')}`;
    }
    next();
});

module.exports = mongoose.model('Consolidation', consolidationSchema);