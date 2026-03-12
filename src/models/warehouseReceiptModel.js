// models/warehouseReceiptModel.js - আপডেটেড ভার্সন

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
    packages: [{
        packageType: {
            type: String,
            enum: [  // ✅ Inventory-এর সাথে match করুন
                'pallet', 'carton', 'crate', 'wooden_box', 'container',
                'envelope', 'loose_cargo', 'loose_tires', '20ft_container', '40ft_container',
                'Pallet', 'Carton', 'Crate', 'Wooden Box', 'Container',
                'Envelope', 'Loose Cargo', 'Loose Tires', '20ft Container', '40ft Container',
                'Box', 'Other'
            ],
            default: 'carton'
        },
        quantity: {
            type: Number,
            required: true,
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
            length: Number,
            width: Number,
            height: Number,
            unit: { type: String, default: 'cm' }
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
        remarks: String
    }],

    // Storage Location
    storageLocation: {
        zone: { type: String, required: true },
        aisle: { type: String, required: true },
        rack: { type: String, required: true },
        bin: { type: String, required: true }
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
        photos: [String],
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