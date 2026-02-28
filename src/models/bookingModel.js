const mongoose = require('mongoose');

// Enums
const shipmentTypes = ['air_freight', 'sea_freight', 'express_courier'];
const origins = ['China Warehouse', 'Thailand Warehouse'];
const destinations = ['USA', 'UK', 'Canada'];
const shippingModes = ['DDP', 'DDU', 'FOB', 'CIF'];
const bookingStatuses = [
    'booking_requested',
    'price_quoted',
    'booking_confirmed',
    'cancelled',
    'rejected'
];

// Cargo Item Schema
const cargoItemSchema = new mongoose.Schema({
    description: {
        type: String,
        required: [true, 'Cargo description is required']
    },
    cartons: {
        type: Number,
        required: true,
        min: [1, 'Minimum 1 carton required']
    },
    weight: {
        type: Number,
        required: true,
        min: [0, 'Weight cannot be negative']
    },
    volume: {
        type: Number,
        required: true,
        min: [0, 'Volume cannot be negative']
    },
    productCategory: {
        type: String,
        required: true
    },
    hsCode: String,
    value: {
        amount: Number,
        currency: {
            type: String,
            enum: ['USD', 'GBP', 'CAD', 'THB', 'CNY'],
            default: 'USD'
        }
    }
});

// Timeline Entry Schema
const timelineEntrySchema = new mongoose.Schema({
    status: {
        type: String,
        enum: bookingStatuses,
        required: true
    },
    description: String,
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    metadata: mongoose.Schema.Types.Mixed
});

// Main Booking Schema
const bookingSchema = new mongoose.Schema({
    // Booking Identification
    bookingNumber: {
        type: String,
        unique: true, 
    },
    trackingNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    
    // Relationships
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Customer is required']
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Shipment Details
    shipmentDetails: {
        shipmentType: {
            type: String,
            enum: shipmentTypes,
            required: true
        },
        origin: {
            type: String,
            enum: origins,
            required: true
        },
        destination: {
            type: String,
            enum: destinations,
            required: true
        },
        shippingMode: {
            type: String,
            enum: shippingModes,
            default: 'DDU'
        },
        pickupRequired: {
            type: Boolean,
            default: false
        },
        cargoDetails: [cargoItemSchema],
        totalCartons: {
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
        specialInstructions: String,
        referenceNumber: String
    },
    
    // Address Information
    pickupAddress: {
        companyName: String,
        contactPerson: String,
        phone: String,
        addressLine1: String,
        addressLine2: String,
        city: String,
        state: String,
        country: String,
        postalCode: String,
        pickupDate: Date,
        specialInstructions: String
    },
    deliveryAddress: {
        consigneeName: {
            type: String,
            required: true
        },
        companyName: String,
        phone: String,
        email: String,
        addressLine1: {
            type: String,
            required: true
        },
        addressLine2: String,
        city: {
            type: String,
            required: true
        },
        state: String,
        country: {
            type: String,
            required: true
        },
        postalCode: String
    },
    
    // Status Management
    status: {
        type: String,
        enum: bookingStatuses,
        default: 'booking_requested'
    },
    
    // Pricing Section
    pricingStatus: {
        type: String,
        enum: ['pending', 'quoted', 'accepted', 'rejected', 'expired'],
        default: 'pending'
    },
    
    quotedPrice: {
        amount: {
            type: Number,
            min: 0
        },
        currency: {
            type: String,
            enum: ['USD', 'GBP', 'CAD', 'THB', 'CNY'],
            default: 'USD'
        },
        breakdown: {
            freightCost: { type: Number, default: 0 },
            handlingFee: { type: Number, default: 0 },
            warehouseFee: { type: Number, default: 0 },
            customsFee: { type: Number, default: 0 },
            insurance: { type: Number, default: 0 },
            otherCharges: { type: Number, default: 0 }
        },
        quotedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        quotedAt: Date,
        validUntil: Date,
        notes: String
    },
    
    // Customer Response
    customerResponse: {
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected']
        },
        respondedAt: Date,
        notes: String,
        ipAddress: String
    },
    
    // Timeline
    timeline: [timelineEntrySchema],
    
    // Dates
    requestedDate: {
        type: Date,
        default: Date.now
    },
    confirmedAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
    
    // References
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment'
    },
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
    },
    
    // Audit
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Pre-save middleware to generate booking number
bookingSchema.pre('save', async function(next) {
    if (!this.bookingNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        
        // Count bookings for this month
        const count = await mongoose.model('Booking').countDocuments({
            bookingNumber: new RegExp(`^BKG-${year}${month}`)
        });
        
        this.bookingNumber = `BKG-${year}${month}-${(count + 1).toString().padStart(5, '0')}`;
    }
    
    // Calculate totals
    if (this.shipmentDetails.cargoDetails && this.shipmentDetails.cargoDetails.length > 0) {
        this.shipmentDetails.totalCartons = this.shipmentDetails.cargoDetails.reduce(
            (sum, item) => sum + item.cartons, 0
        );
        this.shipmentDetails.totalWeight = this.shipmentDetails.cargoDetails.reduce(
            (sum, item) => sum + (item.weight * item.cartons), 0
        );
        this.shipmentDetails.totalVolume = this.shipmentDetails.cargoDetails.reduce(
            (sum, item) => sum + (item.volume * item.cartons), 0
        );
    }
    
    this.updatedAt = Date.now();
    next();
});

// Methods
bookingSchema.methods.addTimelineEntry = function(status, description, userId, metadata = {}) {
    this.timeline.push({
        status,
        description,
        updatedBy: userId,
        timestamp: new Date(),
        metadata
    });
};

bookingSchema.methods.isQuoteValid = function() {
    if (!this.quotedPrice || !this.quotedPrice.validUntil) return false;
    return new Date() <= this.quotedPrice.validUntil;
};

// Indexes
bookingSchema.index({ bookingNumber: 1 });
bookingSchema.index({ trackingNumber: 1 });
bookingSchema.index({ customer: 1, createdAt: -1 });
bookingSchema.index({ status: 1, pricingStatus: 1 });
bookingSchema.index({ 'shipmentDetails.origin': 1, 'shipmentDetails.destination': 1 });

module.exports = mongoose.model('Booking', bookingSchema);