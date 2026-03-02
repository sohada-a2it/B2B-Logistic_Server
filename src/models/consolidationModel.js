// models/consolidationModel.js

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
        ref: 'Shipment'
    }],

    // Warehouse
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true
    },

    // Consolidation Details
    containerType: {
        type: String,
        enum: [
            '20ft Container',
            '40ft Container',
            '40ft HC Container',
            'Air Freight Pallet',
            'LCL',
            'Loose'
        ],
        required: true
    },
    containerNumber: String,
    sealNumber: String,

    // Consolidation Stats
    totalShipments: Number,
    totalPackages: Number,
    totalWeight: Number, // kg
    totalVolume: Number, // cbm
    
    // Origin/Destination
    originWarehouse: String,
    destinationPort: String,

    // Dates
    consolidationStarted: Date,
    consolidationCompleted: Date,
    estimatedDeparture: Date,
    actualDeparture: Date,

    // Status
    status: {
        type: String,
        enum: [
            'pending',
            'in_progress',
            'completed',
            'loaded',
            'departed'
        ],
        default: 'pending'
    },

    // Items in consolidation
    items: [{
        inventoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WarehouseInventory'
        },
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

    // Documents
    documents: [{
        type: String, // packing list, container manifest
        url: String,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        uploadedAt: Date
    }],

    notes: String,

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

// Generate consolidation number
consolidationSchema.pre('save', async function(next) {
    if (this.isNew && !this.consolidationNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        
        const count = await this.constructor.countDocuments({
            consolidationNumber: new RegExp(`^CON-${year}${month}`)
        });
        
        this.consolidationNumber = `CON-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
    }
    next();
});
// Add indexes for better performance
consolidationSchema.index({ status: 1 });
consolidationSchema.index({ warehouseId: 1, status: 1 });
consolidationSchema.index({ estimatedDeparture: 1 });

// Add virtual for duration
consolidationSchema.virtual('consolidationDuration').get(function() {
    if (this.consolidationStarted && this.consolidationCompleted) {
        return (this.consolidationCompleted - this.consolidationStarted) / (1000 * 60 * 60); // hours
    }
    return null;
});

// Add method to check if ready to depart
consolidationSchema.methods.isReadyToDepart = function() {
    return this.status === 'completed' && 
           this.containerNumber && 
           this.sealNumber;
};
module.exports = mongoose.model('Consolidation', consolidationSchema);