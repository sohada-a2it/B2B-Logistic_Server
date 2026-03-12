// models/warehouseInventoryModel.js - ক্লিন ভার্সন

const mongoose = require('mongoose');

// Common package types enum (এক জায়গায় define করুন)
const PACKAGE_TYPES = [
    'pallet', 'carton', 'crate', 'wooden_box', 'container',
    'envelope', 'loose_cargo', 'loose_tires', '20ft_container', '40ft_container'
];

const warehouseInventorySchema = new mongoose.Schema({
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    },
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true
    },
    
    packageType: {
        type: String,
        enum: [...PACKAGE_TYPES, 'Box', 'Other'],  // ✅ Clean enum
        default: 'carton'
    },
    
    packageId: {
        type: String,
        required: true
    },
    
    quantity: {
        type: Number,
        default: 1,
        min: 1
    },
    
    description: String,
    
    weight: {
        type: Number,
        default: 0
    },
    
    volume: {
        type: Number,
        default: 0
    },
    
    dimensions: {
        length: { type: Number, default: 0 },
        width: { type: Number, default: 0 },
        height: { type: Number, default: 0 },
        unit: { type: String, default: 'cm' }
    },
    
    location: {
        zone: { type: String, required: true },
        aisle: { type: String, required: true },
        rack: { type: String, required: true },
        bin: { type: String, required: true }
    },
    
    condition: {
        type: String,
        enum: ['Good',              // ✅ Good condition
                'Damaged',            // ✅ Damaged (general)
                'Partial',            // ✅ Partially damaged
                'Shortage',           // ✅ Shortage
                'Excess',             // ✅ Excess
                'Minor Damage',       // ✅ Minor Damage যোগ করুন
                'Major Damage' ],
        default: 'Good'
    },
    
    status: {
        type: String,
        enum: ['received', 'inspected', 'stored', 'damaged', 'consolidated', 'loaded', 'shipped'],
        default: 'received'
    },
    
    receivedAt: {
        type: Date,
        default: Date.now
    },
    inspectedAt: Date,
    storedAt: Date,
    
    consolidationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consolidation'
    },
    
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

module.exports = mongoose.model('WarehouseInventory', warehouseInventorySchema);