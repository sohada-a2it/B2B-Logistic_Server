const mongoose = require('mongoose');

const cargoItemSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true
    },
    cartons: {
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

const pickupAddressSchema = new mongoose.Schema({
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
    pickupTime: String,
    specialInstructions: String
});

const deliveryAddressSchema = new mongoose.Schema({
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
    postalCode: String,
    isResidential: {
        type: Boolean,
        default: false
    }
});

const shipmentDetailsSchema = new mongoose.Schema({
    shipmentType: {
        type: String,
        enum: ['air_freight', 'sea_freight', 'express_courier'],
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
    shippingMode: {
        type: String,
        enum: ['DDP', 'DDU', 'FOB', 'CIF'],
        default: 'DDU'
    },
    pickupRequired: {
        type: Boolean,
        default: false
    },
    cargoDetails: [cargoItemSchema],
    totalCartons: Number,
    totalWeight: Number,
    totalVolume: Number,
    specialInstructions: String,
    referenceNumber: String,
    incoterms: String
});

const timelineEntrySchema = new mongoose.Schema({
    status: {
        type: String,
        enum: [
            'booking_requested',
            'booking_confirmed',
            'pickup_scheduled',
            'received_at_warehouse',
            'consolidation_in_progress',
            'loaded_in_container',
            'loaded_on_flight',
            'in_transit',
            'arrived_at_destination',
            'customs_clearance',
            'out_for_delivery',
            'delivered',
            'cancelled',
            'returned'
        ]
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
    },
    metadata: mongoose.Schema.Types.Mixed
});

const bookingSchema = new mongoose.Schema({
    // Booking Identification
    bookingNumber: {
        type: String, 
        unique: true
    },
    trackingNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    
    // Customer Information
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer', 
    },
    customerReference: String,
    
    // Shipment Details
    shipmentDetails: shipmentDetailsSchema,
    
    // Address Information
    pickupAddress: pickupAddressSchema,
    deliveryAddress: deliveryAddressSchema,
    
    // Status Management
    status: {
        type: String,
        enum: [
            'booking_requested',
            'booking_confirmed',
            'pickup_scheduled',
            'received_at_warehouse',
            'consolidation_in_progress',
            'loaded_in_container',
            'loaded_on_flight',
            'in_transit',
            'arrived_at_destination',
            'customs_clearance',
            'out_for_delivery',
            'delivered',
            'cancelled',
            'returned'
        ],
        default: 'booking_requested'
    },
    
    // Timeline
    timeline: [timelineEntrySchema],
    
    // Dates
    requestedPickupDate: Date,
    estimatedDepartureDate: Date,
    estimatedArrivalDate: Date,
    actualPickupDate: Date,
    actualDeliveryDate: Date,
    
    // Shipment Assignment
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    containerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Container'
    },
    airwayBillNumber: String,
    billOfLading: String,
    
    // Warehouse Information
    warehouseLocation: {
        type: String,
        enum: ['China Warehouse', 'Thailand Warehouse']
    },
    warehouseReceiptDate: Date,
    warehouseLocationBin: String,
    
    // Pricing & Quotes
    quotedAmount: {
        type: Number,
        min: 0
    },
    quotedCurrency: {
        type: String,
        enum: ['USD', 'GBP', 'CAD', 'THB', 'CNY'],
        default: 'USD'
    },
    
    // Documents
    documents: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document'
    }],
    
    // Invoice Reference
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
    },
    
    // Tracking Updates
    lastTrackingUpdate: Date,
    currentLocation: {
        city: String,
        country: String,
        coordinates: {
            lat: Number,
            lng: Number
        }
    },
    
    // Audit Fields
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
    },
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
    },
    
    // Cancellation/Return Details
    cancellationReason: String,
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    cancelledAt: Date,
    
    // Additional Fields
    tags: [String],
    notes: [{
        text: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
});

// Generate unique booking number before saving
bookingSchema.pre('save', async function(next) {
    if (!this.bookingNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const count = await mongoose.model('Booking').countDocuments();
        this.bookingNumber = `BKG-${year}${month}-${(count + 1).toString().padStart(5, '0')}`;
    }
    
    // Generate tracking number if not exists and status is confirmed
    if (this.status === 'booking_confirmed' && !this.trackingNumber) {
        const prefix = this.shipmentDetails.shipmentType === 'air_freight' ? 'AF' : 
                      this.shipmentDetails.shipmentType === 'sea_freight' ? 'SF' : 'EX';
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.trackingNumber = `${prefix}-${random}`;
    }
    
    this.updatedAt = Date.now();
    next();
});

// Method to update status with timeline entry
bookingSchema.methods.updateStatus = function(status, userId, location, description) {
    this.status = status;
    this.timeline.push({
        status,
        location,
        description,
        updatedBy: userId,
        timestamp: new Date()
    });
    
    // Update relevant date fields based on status
    switch(status) {
        case 'received_at_warehouse':
            this.warehouseReceiptDate = new Date();
            break;
        case 'delivered':
            this.actualDeliveryDate = new Date();
            break;
        case 'cancelled':
            this.cancelledAt = new Date();
            break;
    }
};

// Method to calculate total shipment value
bookingSchema.methods.calculateTotalValue = function() {
    return this.shipmentDetails.cargoDetails.reduce((total, item) => {
        return total + (item.value?.amount || 0);
    }, 0);
};

// Method to get shipment progress percentage
bookingSchema.methods.getProgressPercentage = function() {
    const statusOrder = [
        'booking_requested',
        'booking_confirmed',
        'pickup_scheduled',
        'received_at_warehouse',
        'consolidation_in_progress',
        'loaded_in_container',
        'loaded_on_flight',
        'in_transit',
        'arrived_at_destination',
        'customs_clearance',
        'out_for_delivery',
        'delivered'
    ];
    
    const currentIndex = statusOrder.indexOf(this.status);
    if (currentIndex === -1) return 0;
    return Math.round((currentIndex / (statusOrder.length - 1)) * 100);
};

// Indexes for better query performance
bookingSchema.index({ bookingNumber: 1 });
bookingSchema.index({ trackingNumber: 1 });
bookingSchema.index({ customer: 1, createdAt: -1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ 'shipmentDetails.origin': 1, 'shipmentDetails.destination': 1 });
bookingSchema.index({ estimatedDepartureDate: 1 });
bookingSchema.index({ estimatedArrivalDate: 1 });

module.exports = mongoose.model('Booking', bookingSchema);