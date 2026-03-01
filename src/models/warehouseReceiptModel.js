// models/warehouseReceiptModel.js

const mongoose = require('mongoose');

const warehouseReceiptSchema = new mongoose.Schema({
    receiptNumber: {
        type: String,
        required: true,
        unique: true
    },
    
    // References
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
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true
    },

    // Receipt Details
    receivedDate: {
        type: Date,
        default: Date.now
    },
    receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Cargo Information at Receipt
    receivedPackages: [{
        packageType: {
            type: String,
            enum: ['Carton', 'Pallet', 'Crate', 'Box', 'Drum', 'Bag', 'Loose'],
            default: 'Carton'
        },
        quantity: Number,
        description: String,
        weight: Number, // kg
        volume: Number, // cbm
        condition: {
            type: String,
            enum: ['Good', 'Damaged', 'Shortage', 'Excess'],
            default: 'Good'
        },
        remarks: String
    }],

    // Storage Location
    storageLocation: {
        zone: String,
        aisle: String,
        rack: String,
        bin: String
    },

    // Receipt Status
    status: {
        type: String,
        enum: [
            'expected',
            'received',
            'inspected',
            'stored',
            'damaged_report',
            'shortage_report'
        ],
        default: 'received'
    },

    // Inspection Details
    inspection: {
        conductedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        conductedAt: Date,
        findings: String,
        photos: [String], // URLs to photos
        condition: {
            type: String,
            enum: ['Good', 'Minor Damage', 'Major Damage'],
            default: 'Good'
        }
    },

    // Documents
    documents: [{
        name: String,
        type: String,
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
    }
}, {
    timestamps: true
});

// Generate receipt number before saving
warehouseReceiptSchema.pre('save', async function(next) {
    if (this.isNew && !this.receiptNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        
        const count = await this.constructor.countDocuments({
            receiptNumber: new RegExp(`^RCP-${year}${month}`)
        });
        
        this.receiptNumber = `RCP-${year}${month}-${(count + 1).toString().padStart(5, '0')}`;
    }
    next();
});

module.exports = mongoose.model('WarehouseReceipt', warehouseReceiptSchema);