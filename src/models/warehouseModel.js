// models/warehouseModel.js

const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
    // Warehouse Information
    warehouseName: {
        type: String,
        required: true
    },
    warehouseCode: {
        type: String,
        required: true,
        unique: true
    },
    location: {
        address: String,
        city: String,
        state: String,
        country: String,
        postalCode: String
    },
    contactInfo: {
        phone: String,
        email: String,
        manager: String
    },

    // Warehouse Capacity
    capacity: {
        totalArea: Number, // in sq ft
        utilizedArea: Number,
        totalBays: Number,
        availableBays: Number
    },

    // Operating Hours
    operatingHours: {
        monday: { open: String, close: String },
        tuesday: { open: String, close: String },
        wednesday: { open: String, close: String },
        thursday: { open: String, close: String },
        friday: { open: String, close: String },
        saturday: { open: String, close: String },
        sunday: { open: String, close: String }
    },

    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance'],
        default: 'active'
    },

    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Generate warehouse code before saving
warehouseSchema.pre('save', async function(next) {
    if (this.isNew && !this.warehouseCode) {
        const count = await this.constructor.countDocuments();
        this.warehouseCode = `WH${(count + 1).toString().padStart(3, '0')}`;
    }
    next();
});

module.exports = mongoose.model('Warehouse', warehouseSchema);