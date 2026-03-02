const mongoose = require('mongoose');

// ==================== ENUMS ====================

// Shipment Types (Main Category)
const shipmentTypes = ['sea_freight', 'air_freight', 'inland_trucking', 'multimodal'];

// Type of Shipment (Sub-category)
const shipmentSubTypes = [
    'sea_freight_fcl',      // Full Container Load
    'sea_freight_lcl',      // Less than Container Load
    'air_freight',          // Air Freight
    'rail_freight',         // Rail Freight
    'express_delivery',     // Express Delivery
    'inland_transport',     // Inland Transport
    'door_to_door'          // Door to Door
];

// Shipment Status
const shipmentStatuses = [
    'pending',
    'picked_up_from_warehouse',
    'departed_port_of_origin',
    'in_transit_sea_freight',
    'arrived_at_destination_port',
    'customs_cleared',
    'out_for_delivery',
    'delivered',
    'on_hold',
    'cancelled',
    'returned'
];

// Payment Modes
const paymentModes = [
    'bank_transfer',
    'credit_card',
    'cash',
    'wire_transfer'
];

// Packaging Types
const packagingTypes = [
    'pallet',
    'carton',
    'crate',
    'wooden_box',
    'container',
    'envelope',
    'loose_cargo',
    'loose_tires',
    '20ft_container',
    '40ft_container'
];

// Origins
const origins = ['China Warehouse', 'Thailand Warehouse'];

// Destinations
const destinations = ['USA', 'UK', 'Canada'];

// Shipping Modes (Incoterms)
const shippingModes = ['DDP', 'DDU', 'FOB', 'CIF'];

// Booking Statuses
const bookingStatuses = [
    'booking_requested',
    'price_quoted',
    'booking_confirmed',
    'cancelled',
    'rejected'
];

// Courier Service Types
const courierServiceTypes = ['standard', 'express', 'overnight', 'economy'];

// Currencies
const currencies = ['USD', 'GBP', 'CAD', 'THB', 'CNY', 'EUR', 'BDT'];

// ==================== PACKAGE ITEM SCHEMA ====================
const packageItemSchema = new mongoose.Schema({
    description: {
        type: String,
        required: [true, 'Package description is required']
    },
    packagingType: {
        type: String,
        enum: packagingTypes,
        default: 'carton'
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Minimum 1 item required']
    },
    weight: {
        type: Number,
        required: true,
        min: [0, 'Weight cannot be negative']
    },
    dimensions: {
        length: { type: Number, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        unit: { type: String, enum: ['cm', 'in'], default: 'cm' }
    },
    volume: {
        type: Number,
        required: true,
        min: [0, 'Volume cannot be negative']
    },
    productCategory: {
        type: String,
        required: true,
        enum: [
            'Electronics', 'Furniture', 'Clothing', 'Machinery', 
            'Automotive', 'Pharmaceuticals', 'Food', 'Documents', 
            'Tires', 'Chemicals', 'Others'
        ]
    },
    hsCode: String,
    value: {
        amount: {
            type: Number,
            default: 0
        },
        currency: {
            type: String,
            enum: currencies,
            default: 'USD'
        }
    },
    hazardous: {
        type: Boolean,
        default: false
    },
    temperatureControlled: {
        required: Boolean,
        minTemp: Number,
        maxTemp: Number
    }
});

// ==================== TIMELINE ENTRY SCHEMA ====================
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
        // required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    metadata: mongoose.Schema.Types.Mixed
});

// ==================== MAIN BOOKING SCHEMA ====================
const bookingSchema = new mongoose.Schema({
    // ===== Booking Identification =====
    bookingNumber: {
        type: String,
        unique: true,
    },
    trackingNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    
    // ===== Service Type =====
    serviceType: {
        type: String,
        enum: courierServiceTypes,
        default: 'standard'
    },
    
    // ===== Shipment Classification =====
    shipmentClassification: {
        mainType: {
            type: String,
            enum: shipmentTypes,
            required: [true, 'Main shipment type is required']
        },
        subType: {
            type: String,
            enum: shipmentSubTypes,
            required: [true, 'Shipment sub-type is required']
        }
    },
    
    // ===== Relationships =====
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
    
    // ===== Shipment Details =====
    shipmentDetails: {
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
        packageDetails: [packageItemSchema],
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
        specialInstructions: String,
        referenceNumber: String
    },
    
    // ===== Dates =====
    dates: {
        requested: {
            type: Date,
            default: Date.now
        },
        estimatedDeparture: Date,
        estimatedArrival: Date,
        confirmed: Date,
        cancelled: Date
    },
    
    // ===== Payment Information =====
    payment: {
        mode: {
            type: String,
            enum: paymentModes,
            required: [true, 'Payment mode is required']
        },
        currency: {
            type: String,
            enum: currencies,
            default: 'USD'
        },
        amount: {
            type: Number,
            min: 0
        },
        paidAt: Date,
        transactionId: String,
        notes: String
    },
    
    // ===== Sender Information =====
    sender: {
        name: {
            type: String,
            required: [true, 'Sender name is required']
        },
        companyName: String,
        email: {
            type: String,
            required: [true, 'Sender email is required']
        },
        phone: {
            type: String,
            required: [true, 'Sender phone is required']
        },
        address: {
            addressLine1: {
                type: String,
                required: [true, 'Sender address is required']
            },
            addressLine2: String,
            city: {
                type: String,
                required: [true, 'Sender city is required']
            },
            state: String,
            country: {
                type: String,
                required: [true, 'Sender country is required']
            },
            postalCode: String
        },
        pickupDate: Date,
        pickupInstructions: String
    },
    
    // ===== Receiver Information =====
    receiver: {
        name: {
            type: String,
            required: [true, 'Receiver name is required']
        },
        companyName: String,
        email: {
            type: String,
            required: [true, 'Receiver email is required']
        },
        phone: {
            type: String,
            required: [true, 'Receiver phone is required']
        },
        address: {
            addressLine1: {
                type: String,
                required: [true, 'Receiver address is required']
            },
            addressLine2: String,
            city: {
                type: String,
                required: [true, 'Receiver city is required']
            },
            state: String,
            country: {
                type: String,
                required: [true, 'Receiver country is required']
            },
            postalCode: String
        },
        deliveryInstructions: String,
        isResidential: {
            type: Boolean,
            default: false
        }
    },
    
    // ===== Courier Information =====
    courier: {
        company: {
            type: String,
            enum: ['Cargo Logistics Group', 'DHL', 'FedEx', 'UPS', 'USPS', 'Other'],
            default: 'Cargo Logistics Group'
        },
        serviceType: {
            type: String,
            enum: courierServiceTypes,
            default: 'standard'
        },
        accountNumber: String,
        trackingUrl: String,
        pickupConfirmation: String,
        estimatedPickupDate: Date,
        actualPickupDate: Date,
        estimatedDeliveryDate: Date,
        actualDeliveryDate: Date,
        deliveryConfirmation: String,
        signedBy: String,
        courierNotes: String,
        deliveryPhoto: String
    },
    
    // ===== Status Management =====
    status: {
        type: String,
        enum: bookingStatuses,
        default: 'booking_requested'
    },
    shipmentStatus: {
        type: String,
        enum: shipmentStatuses,
        default: 'pending'
    },
    currentLocation: {
        location: String,
        timestamp: Date,
        status: String
    },
    
    // ===== Pricing Section =====
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
            enum: currencies,
            default: 'USD'
        },
        breakdown: {
            baseRate: { type: Number, default: 0 },
            weightCharge: { type: Number, default: 0 },
            fuelSurcharge: { type: Number, default: 0 },
            residentialSurcharge: { type: Number, default: 0 },
            insurance: { type: Number, default: 0 },
            tax: { type: Number, default: 0 },
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
    
    // ===== Customer Response =====
    customerResponse: {
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected']
        },
        respondedAt: Date,
        notes: String,
        ipAddress: String
    },
    
    // ===== Timeline =====
    timeline: [timelineEntrySchema],
    
    // ===== Cancellation =====
    cancelledAt: Date,
    cancellationReason: String,
    
    // ===== References =====
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment'
    },
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
    },
    
    // ===== Documents =====
    documents: [{
        type: {
            type: String,
            enum: ['label', 'invoice', 'customs_form', 'packing_list', 'bill_of_lading', 'airway_bill', 'proof_of_delivery']
        },
        url: String,
        uploadedAt: Date,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    
    // ===== Warehouse Information =====
    warehouseInfo: {
        expectedAt: Date,
        receivedAt: Date,
        receivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        location: String,
        receiptNumber: String
    },
    
    // ===== Container Information (for sea freight) =====
    containerInfo: {
        containerNumber: String,
        containerType: {
            type: String,
            enum: ['20FT', '40FT', '40FT HC']
        },
        sealNumber: String,
        stuffedAt: Date
    },
    
    // ===== Transport Details =====
    transport: {
        carrierName: String,
        vesselName: String,
        flightNumber: String,
        voyageNumber: String,
        bookingNumber: String
    },
    
    // ===== Audit =====
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// ==================== PRE-SAVE MIDDLEWARE ====================
bookingSchema.pre('save', async function(next) {
    // Generate booking number
    if (!this.bookingNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        
        const count = await mongoose.model('Booking').countDocuments({
            bookingNumber: new RegExp(`^BKG-${year}${month}`)
        });
        
        this.bookingNumber = `BKG-${year}${month}-${(count + 1).toString().padStart(5, '0')}`;
    }
    
    // Calculate totals from package details
    if (this.shipmentDetails.packageDetails && this.shipmentDetails.packageDetails.length > 0) {
        this.shipmentDetails.totalPackages = this.shipmentDetails.packageDetails.length;
        this.shipmentDetails.totalWeight = this.shipmentDetails.packageDetails.reduce(
            (sum, item) => sum + (item.weight * item.quantity), 0
        );
        this.shipmentDetails.totalVolume = this.shipmentDetails.packageDetails.reduce(
            (sum, item) => sum + (item.volume * item.quantity), 0
        );
    }
    
    this.updatedAt = Date.now();
    next();
});

// ==================== METHODS ====================
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

bookingSchema.methods.updateDeliveryStatus = function(status, location, userId) {
    this.currentLocation = {
        location,
        status,
        timestamp: new Date()
    };
    
    let timelineDescription = '';
    switch(status) {
        case 'picked_up':
            timelineDescription = 'Package picked up from sender';
            break;
        case 'in_transit':
            timelineDescription = 'Package in transit';
            break;
        case 'out_for_delivery':
            timelineDescription = 'Package out for delivery';
            break;
        case 'delivered':
            timelineDescription = 'Package delivered';
            this.courier.actualDeliveryDate = new Date();
            break;
    }
    
    this.addTimelineEntry(this.status, timelineDescription, userId, { location });
};

// Get shipment display type
bookingSchema.methods.getShipmentTypeDisplay = function() {
    const mainType = this.shipmentClassification.mainType.replace('_', ' ').toUpperCase();
    const subType = this.shipmentClassification.subType.replace(/_/g, ' ');
    return `${mainType} - ${subType}`;
};

// ==================== INDEXES ====================
bookingSchema.index({ bookingNumber: 1 });
bookingSchema.index({ trackingNumber: 1 });
bookingSchema.index({ customer: 1, createdAt: -1 });
bookingSchema.index({ status: 1, pricingStatus: 1 });
bookingSchema.index({ shipmentStatus: 1 });
bookingSchema.index({ 'sender.email': 1 });
bookingSchema.index({ 'receiver.email': 1 });
bookingSchema.index({ 'shipmentClassification.mainType': 1 });
bookingSchema.index({ 'shipmentClassification.subType': 1 });
bookingSchema.index({ 'payment.mode': 1 });
bookingSchema.index({ 'containerInfo.containerNumber': 1 });

module.exports = mongoose.model('Booking', bookingSchema);