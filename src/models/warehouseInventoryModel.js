// models/warehouseInventoryModel.js

const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
    // Reference
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true
    },

    // Package Details
    packageType: {
        type: String,
        enum: ['Carton', 'Pallet', 'Crate', 'Box', 'Drum', 'Bag'],
        required: true
    },
    packageId: String, // Barcode or QR code
    quantity: Number,
    description: String,
    
    // Physical Details
    weight: Number, // kg
    volume: Number, // cbm
    dimensions: {
        length: Number,
        width: Number,
        height: Number,
        unit: { type: String, default: 'cm' }
    },

    // Storage Location
    location: {
        zone: String,
        aisle: String,
        rack: String,
        bin: String,
        lastMoved: Date
    },

    // Status
    status: {
        type: String,
        enum: [
            'received',
            'inspected',
            'stored',
            'consolidated',
            'loaded',
            'shipped',
            'damaged',
            'quarantine'
        ],
        default: 'received'
    },

    // Handling Instructions
    handlingInstructions: [String],
    hazardous: {
        type: Boolean,
        default: false
    },
    temperatureControlled: {
        required: Boolean,
        minTemp: Number,
        maxTemp: Number
    },

    // Consolidation Information
    consolidationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consolidation'
    },

    // Timeline
    receivedAt: Date,
    storedAt: Date,
    loadedAt: Date,
    shippedAt: Date,

    // Audit
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Index for quick search
inventoryItemSchema.index({ location: 1, status: 1 });
inventoryItemSchema.index({ shipmentId: 1 });
inventoryItemSchema.index({ consolidationId: 1 });

module.exports = mongoose.model('WarehouseInventory', inventoryItemSchema);