// models/shipmentModel.js - আপডেটেড ভার্সন

const mongoose = require('mongoose');

// Enums
const shipmentStatuses = [
    'pending',
    'received_at_warehouse',
    'consolidation_in_progress',
    'loaded_in_container',
    'in_transit',
    'arrived_at_destination',
    'customs_clearance',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'returned'
];

// Package Schema - Booking-এর packageDetails-এর সাথে মিল রেখে
const packageSchema = new mongoose.Schema({
    description: String,           // Booking থেকে আসবে
    packageType: {
        type: String,
        enum: ['Pallet', 'Carton', 'Crate', 'Box', 'Container'],
        default: 'Carton'
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    weight: {
        type: Number,
        required: true,
        min: 0
    },
    volume: {
        type: Number,
        required: true,
        min: 0
    },
    dimensions: {                   // Booking থেকে আসবে
        length: Number,
        width: Number,
        height: Number,
        unit: { type: String, default: 'cm' }
    },
    productCategory: String,        // Booking থেকে আসবে
    hsCode: String,                  // Booking থেকে আসবে
    value: {                         // Booking থেকে আসবে
        amount: Number,
        currency: { type: String, default: 'USD' }
    },
    warehouseLocation: String,
    condition: {
        type: String,
        enum: ['Excellent', 'Good', 'Fair', 'Damaged'],
        default: 'Good'
    },
    inspectionNotes: String
});

// Milestone Schema
const milestoneSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: shipmentStatuses,
        required: true
    },
    location: String,
    description: String,
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Main Shipment Schema
const shipmentSchema = new mongoose.Schema({
    // Identification
    shipmentNumber: {
        type: String,
        required: true,
        unique: true
    },
    trackingNumber: {
        type: String,
        required: true,
        unique: true
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    
    // Customer Reference - Booking-এর customer-এর সাথে মিল রেখে
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Shipment Details (copied from booking)
    shipmentDetails: {
        shipmentType: {
            type: String,
            enum: ['air_freight', 'sea_freight', 'express_courier']
        },
        origin: String,
        destination: String,
        shippingMode: {
            type: String,
            enum: ['DDP', 'DDU', 'FOB', 'CIF']
        }
    },
    
    // Addresses - Booking-এর sender/receiver format-এ
    sender: {                        // pickupAddress-এর পরিবর্তে
        name: String,
        companyName: String,
        email: String,
        phone: String,
        address: {
            addressLine1: String,
            addressLine2: String,
            city: String,
            state: String,
            country: String,
            postalCode: String
        }
    },
    receiver: {                      // deliveryAddress-এর পরিবর্তে
        name: String,
        companyName: String,
        email: String,
        phone: String,
        address: {
            addressLine1: String,
            addressLine2: String,
            city: String,
            state: String,
            country: String,
            postalCode: String
        },
        isResidential: Boolean
    },
    
    // Status
    status: {
        type: String,
        enum: shipmentStatuses,
        default: 'pending'
    },
    
    // Packages
    packages: [packageSchema],
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
    
    // Courier Information - Booking থেকে আসবে
    courier: {
        company: { type: String, default: 'Cargo Logistics Group' },
        serviceType: String
    },
    
    // Container Details
    containerInfo: {
        containerNumber: String,
        containerType: {
            type: String,
            enum: ['20FT', '40FT', '40FT HC']
        },
        sealNumber: String,
        stuffedAt: Date,
        stuffedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    
    // Transport Details
    transport: {
        mode: {
            type: String,
            enum: ['Sea Freight', 'Air Freight', 'Inland Trucking']
        },
        carrierName: String,
        vesselName: String,
        flightNumber: String,
        voyageNumber: String,
        bookingNumber: String,
        estimatedDeparture: Date,
        estimatedArrival: Date,
        actualDeparture: Date,
        actualArrival: Date,
        currentLocation: {
            address: String,
            lastUpdated: Date
        }
    },
    
    // Milestones
    milestones: [milestoneSchema],
    currentMilestone: {
        type: String,
        enum: shipmentStatuses
    },
    
    // Warehouse Info
    warehouseInfo: {
        receivedDate: Date,
        receivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        location: String,
        receiptId: String,
        notes: String
    },
    
    consolidationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consolidation'
    },
    
    // Notes
    internalNotes: [{
        note: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: Date
    }],
    
    customerNotes: [{
        note: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: Date
    }],
    
    // Costs
    costs: [{
        type: {
            type: String,
            enum: ['freight', 'handling', 'warehouse', 'customs', 'insurance', 'other']
        },
        amount: Number,
        currency: { type: String, default: 'USD' },
        description: String,
        vendor: String,
        incurredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        incurredAt: Date
    }],
    
    // Cancellation
    cancelledAt: Date,
    cancellationReason: String,
    
    // Documents
    documents: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document'
    }],
    
    // Assignment
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Dates
    estimatedDepartureDate: Date,    // Booking থেকে আসবে
    estimatedArrivalDate: Date,      // Booking থেকে আসবে
    actualDeliveryDate: Date,
    
    // Audit
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

// Pre-save middleware
shipmentSchema.pre('save', function(next) {
    if (this.packages && this.packages.length > 0) {
        this.totalPackages = this.packages.reduce((sum, pkg) => sum + pkg.quantity, 0);
        this.totalWeight = this.packages.reduce((sum, pkg) => sum + (pkg.weight * pkg.quantity), 0);
        this.totalVolume = this.packages.reduce((sum, pkg) => sum + (pkg.volume * pkg.quantity), 0);
    }
    
    if (this.milestones && this.milestones.length > 0) {
        const latest = this.milestones[this.milestones.length - 1];
        this.currentMilestone = latest.status;
    }
    
    this.updatedAt = Date.now();
    next();
});

// Methods
shipmentSchema.methods.addMilestone = function(status, location, description, userId) {
    this.milestones.push({
        status,
        location,
        description,
        updatedBy: userId,
        timestamp: new Date()
    });
    this.status = status;
    this.currentMilestone = status;
};

shipmentSchema.methods.getProgress = function() {
    const order = [
        'pending',
        'received_at_warehouse',
        'consolidation_in_progress',
        'loaded_in_container',
        'in_transit',
        'arrived_at_destination',
        'customs_clearance',
        'out_for_delivery',
        'delivered'
    ];
    
    const currentIndex = order.indexOf(this.status);
    if (currentIndex === -1) return 0;
    return Math.round((currentIndex / (order.length - 1)) * 100);
};

// Indexes
shipmentSchema.index({ shipmentNumber: 1 });
shipmentSchema.index({ trackingNumber: 1 });
shipmentSchema.index({ bookingId: 1 });
shipmentSchema.index({ customerId: 1, status: 1 });
shipmentSchema.index({ 'warehouseInfo.location': 1, status: 1 });

module.exports = mongoose.model('Shipment', shipmentSchema);