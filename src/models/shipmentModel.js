const mongoose = require('mongoose');

// Enums
const packagingTypes = [
    'Pallet', 'Carton', 'Crate', 'Wooden Box', 'Container', 
    'Envelope', 'Loose Cargo', 'Loose Tires', '20FT Container', '40FT Container'
];

const shipmentModes = [
    'Sea Freight', 'Air Freight', 'Inland Trucking', 'Multimodal'
];

const shipmentTypes = [
    'Sea Freight (FCL)', 'Sea Freight (LCL)', 'Air Freight', 
    'Rail Freight', 'Express Delivery', 'Inland Transport', 'Door to Door'
];

const shipmentStatuses = [
    'Pending',
    'Picked Up from Warehouse',
    'Departed Port of Origin',
    'In Transit (Sea Freight)',
    'Arrived at Destination Port',
    'Customs Cleared',
    'Out for Delivery',
    'Delivered',
    'On Hold',
    'Cancelled',
    'Returned'
];

const paymentModes = [
    'Bank Transfer', 'Credit Card', 'Cash', 'Wire Transfer'
];

// Package Schema
const packageSchema = new mongoose.Schema({
    packageType: {
        type: String,
        enum: packagingTypes,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    description: String,
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
    length: Number,
    width: Number,
    height: Number,
    marksAndNumbers: String,
    hsCode: String,
    declaredValue: Number,
    currency: {
        type: String,
        enum: ['USD', 'GBP', 'CAD', 'THB', 'CNY'],
        default: 'USD'
    },
    sealNumber: String,
    containerNumber: String,
    warehouseLocation: String,
    condition: {
        type: String,
        enum: ['Excellent', 'Good', 'Fair', 'Damaged'],
        default: 'Good'
    },
    inspectionNotes: String,
    photos: [String]
});

// Milestone Schema
const milestoneSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: shipmentStatuses,
        required: true
    },
    location: {
        type: String,
        required: true
    },
    description: String,
    timestamp: {
        type: Date,
        default: Date.now
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    documents: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document'
    }],
    delayReason: String,
    estimatedCompletionTime: Date,
    actualCompletionTime: Date,
    metadata: mongoose.Schema.Types.Mixed
});

// FCL Container Schema
const fclContainerSchema = new mongoose.Schema({
    containerNumber: {
        type: String,
        required: true
    },
    containerType: {
        type: String,
        enum: ['20FT', '40FT', '40FT HC', '45FT'],
        required: true
    },
    sealNumber: String,
    weight: Number,
    volume: Number,
    packages: [packageSchema],
    stuffingDate: Date,
    stuffingLocation: String,
    stuffingCompletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isStuffed: {
        type: Boolean,
        default: false
    },
    stuffingNotes: String,
    containerCondition: String,
    photos: [String]
});

// LCL Cargo Schema
const lclCargoSchema = new mongoose.Schema({
    consolidationId: String,
    packages: [packageSchema],
    warehouseReceipt: String,
    palletId: String,
    storageLocation: String,
    receivedDate: Date,
    receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    shippedDate: Date,
    shippingNotes: String
});

// Transport Details Schema
const transportDetailsSchema = new mongoose.Schema({
    mode: {
        type: String,
        enum: shipmentModes,
        required: true
    },
    shipmentType: {
        type: String,
        enum: shipmentTypes,
        required: true
    },
    carrierName: String,
    carrierCode: String,
    
    // Air Freight
    flightNumber: String,
    airline: String,
    airwayBillNumber: String,
    masterAirwayBill: String,
    airportOfDeparture: String,
    airportOfArrival: String,
    
    // Sea Freight
    vesselName: String,
    voyageNumber: String,
    billOfLading: String,
    masterBillOfLading: String,
    portOfLoading: String,
    portOfDischarge: String,
    shippingLine: String,
    bookingNumber: String,
    
    // Rail Freight
    trainNumber: String,
    railCompany: String,
    railWaybill: String,
    railTerminalOrigin: String,
    railTerminalDestination: String,
    railWagonNumber: String,
    
    // Inland Trucking
    truckNumber: String,
    trailerNumber: String,
    driverName: String,
    driverContact: String,
    transportCompany: String,
    truckingCompany: String,
    route: String,
    
    // Dates
    estimatedDeparture: Date,
    estimatedArrival: Date,
    actualDeparture: Date,
    actualArrival: Date,
    
    // Location
    currentLocation: {
        lat: Number,
        lng: Number,
        address: String,
        city: String,
        country: String,
        lastUpdated: Date
    },
    
    transitNotes: String,
    delayReasons: [String],
    routeMap: String,
    stops: [{
        location: String,
        arrivalTime: Date,
        departureTime: Date,
        notes: String
    }]
});

// Cost Schema
const costSchema = new mongoose.Schema({
    costType: {
        type: String,
        enum: [
            'Freight Cost', 'Handling Fee', 'Warehouse Fee', 'Customs Processing Fee',
            'Documentation Fee', 'Insurance', 'Fuel Surcharge', 'Port Charges',
            'Terminal Handling', 'Inland Transportation', 'Door Delivery', 'Packaging Fee',
            'Storage Fee', 'Demurrage', 'Detention', 'Other'
        ],
        required: true
    },
    description: String,
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        enum: ['USD', 'GBP', 'CAD', 'THB', 'CNY'],
        default: 'USD'
    },
    paidBy: {
        type: String,
        enum: ['Shipper', 'Consignee', 'Third Party'],
        default: 'Shipper'
    },
    invoiceReference: String,
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Overdue', 'Cancelled'],
        default: 'Pending'
    },
    dueDate: Date,
    paymentDate: Date,
    paymentMode: {
        type: String,
        enum: paymentModes
    },
    transactionReference: String,
    notes: String
});

// Main Shipment Schema
const shipmentSchema = new mongoose.Schema({
    // Identification
    shipmentNumber: {
        type: String,
        required: true,
        unique: true
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    trackingNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    referenceNumber: String,
    
    // Status
    status: {
        type: String,
        enum: shipmentStatuses,
        default: 'Pending'
    },
    
    // Classification
    mode: {
        type: String,
        enum: shipmentModes,
        required: true
    },
    shipmentType: {
        type: String,
        enum: shipmentTypes,
        required: true
    },
    
    // Parties
    shipper: {
        name: { type: String, required: true },
        company: String,
        address: String,
        city: String,
        country: String,
        contactPerson: String,
        phone: String,
        email: String,
        taxId: String
    },
    consignee: {
        name: { type: String, required: true },
        company: String,
        address: String,
        city: String,
        country: String,
        contactPerson: String,
        phone: String,
        email: String,
        taxId: String
    },
    notifyParty: {
        name: String,
        company: String,
        address: String,
        contactPerson: String,
        phone: String,
        email: String
    },
    
    // Routes
    origin: {
        location: { type: String, required: true },
        port: String,
        warehouse: String,
        address: String,
        city: String,
        country: String,
        departureDate: Date
    },
    destination: {
        location: { type: String, required: true },
        port: String,
        warehouse: String,
        address: String,
        city: String,
        country: String,
        arrivalDate: Date
    },
    
    // Package Details
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
    packagingSummary: {
        byType: [{
            type: String,
            count: Number,
            weight: Number,
            volume: Number
        }]
    },
    
    // Container Details
    fclContainers: [fclContainerSchema],
    lclCargo: lclCargoSchema,
    
    // Transport
    transport: transportDetailsSchema,
    
    // Milestones
    milestones: [milestoneSchema],
    currentMilestone: {
        type: String,
        enum: shipmentStatuses
    },
    
    // Documents
    documents: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document'
    }],
    requiredDocuments: [{
        documentType: String,
        status: {
            type: String,
            enum: ['Required', 'Uploaded', 'Approved', 'Rejected'],
            default: 'Required'
        },
        uploadedAt: Date,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    
    // Costs
    costs: [costSchema],
    totalCost: {
        type: Number,
        default: 0
    },
    totalPaid: {
        type: Number,
        default: 0
    },
    balanceDue: {
        type: Number,
        default: 0
    },
    paymentStatus: {
        type: String,
        enum: ['Unpaid', 'Partially Paid', 'Paid', 'Overdue'],
        default: 'Unpaid'
    },
    paymentTerms: String,
    
    // Customs
    customsInfo: {
        entryNumber: String,
        bondNumber: String,
        brokerName: String,
        brokerContact: String,
        clearanceDate: Date,
        customsValue: Number,
        dutiesAmount: Number,
        dutiesCurrency: String,
        dutiesPaid: Boolean,
        holds: [{
            reason: String,
            placedBy: String,
            placedDate: Date,
            resolvedDate: Date,
            resolvedBy: String
        }],
        inspectionRequired: Boolean,
        inspectionDate: Date,
        inspectionResult: String,
        notes: String
    },
    
    // Insurance
    insurance: {
        policyNumber: String,
        provider: String,
        coverageAmount: Number,
        currency: String,
        premium: Number,
        validFrom: Date,
        validTo: Date,
        status: {
            type: String,
            enum: ['Not Insured', 'Insured', 'Expired', 'Claimed'],
            default: 'Not Insured'
        },
        claims: [{
            claimNumber: String,
            date: Date,
            amount: Number,
            reason: String,
            status: String,
            resolution: String
        }]
    },
    
    // Tracking
    trackingUpdates: [{
        location: String,
        status: String,
        description: String,
        timestamp: Date,
        source: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    
    // Alerts
    alerts: [{
        type: {
            type: String,
            enum: ['Delay', 'Damage', 'Customs Hold', 'Weather', 'Document Issue', 'Other']
        },
        severity: {
            type: String,
            enum: ['Low', 'Medium', 'High', 'Critical']
        },
        message: String,
        triggeredAt: Date,
        acknowledgedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        acknowledgedAt: Date,
        resolvedAt: Date,
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    
    // Assignment
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedTeam: String,
    
    // Dates
    shipmentDate: Date,
    promisedDeliveryDate: Date,
    actualDeliveryDate: Date,
    createdDate: {
        type: Date,
        default: Date.now
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    
    // Audit
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Notes
    specialInstructions: String,
    internalNotes: [{
        text: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        isPrivate: Boolean
    }],
    customerNotes: [{
        text: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: Date,
        isRead: Boolean
    }],
    
    // Quality Control
    qualityChecks: [{
        checkType: String,
        passed: Boolean,
        checkedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        checkedAt: Date,
        notes: String,
        photos: [String]
    }],
    
    // Cancellation/Return
    cancellation: {
        reason: String,
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        requestedAt: Date,
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        approvedAt: Date,
        refundAmount: Number,
        notes: String
    },
    returnInfo: {
        reason: String,
        authorizationNumber: String,
        requestedAt: Date,
        pickupDate: Date,
        pickupAddress: String,
        returnedBy: String,
        receivedAt: Date,
        receivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        condition: String,
        restockingFee: Number,
        notes: String
    },
    
    // Metadata
    tags: [String],
    version: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true
});

// Pre-save middleware
shipmentSchema.pre('save', async function(next) {
    if (!this.shipmentNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const count = await mongoose.model('Shipment').countDocuments();
        const modePrefix = this.mode === 'Sea Freight' ? 'SEA' :
                          this.mode === 'Air Freight' ? 'AIR' :
                          this.mode === 'Inland Trucking' ? 'TRK' : 'MLT';
        this.shipmentNumber = `${modePrefix}-${year}${month}-${(count + 1).toString().padStart(6, '0')}`;
    }
    
    if (!this.trackingNumber) {
        const random = Math.random().toString(36).substring(2, 10).toUpperCase();
        this.trackingNumber = `TRK-${random}`;
    }
    
    // Calculate totals
    if (this.packages && this.packages.length > 0) {
        this.totalPackages = this.packages.reduce((sum, pkg) => sum + pkg.quantity, 0);
        this.totalWeight = this.packages.reduce((sum, pkg) => sum + (pkg.weight * pkg.quantity), 0);
        this.totalVolume = this.packages.reduce((sum, pkg) => sum + (pkg.volume * pkg.quantity), 0);
    }
    
    // Calculate costs
    if (this.costs && this.costs.length > 0) {
        this.totalCost = this.costs.reduce((sum, cost) => sum + cost.amount, 0);
        this.totalPaid = this.costs
            .filter(cost => cost.paymentStatus === 'Paid')
            .reduce((sum, cost) => sum + cost.amount, 0);
        this.balanceDue = this.totalCost - this.totalPaid;
        
        if (this.totalPaid === 0) {
            this.paymentStatus = 'Unpaid';
        } else if (this.totalPaid >= this.totalCost) {
            this.paymentStatus = 'Paid';
        } else if (this.totalPaid > 0 && this.totalPaid < this.totalCost) {
            this.paymentStatus = 'Partially Paid';
        }
    }
    
    this.lastUpdated = new Date();
    next();
});

// Instance methods
shipmentSchema.methods.updateStatus = function(status, userId, location, description) {
    this.status = status;
    this.currentMilestone = status;
    
    this.milestones.push({
        status,
        location: location || this.transport?.currentLocation?.address || 'Unknown',
        description,
        updatedBy: userId,
        timestamp: new Date()
    });
    
    this.trackingUpdates.push({
        location: location || this.transport?.currentLocation?.address || 'Unknown',
        status,
        description,
        timestamp: new Date(),
        createdBy: userId
    });
    
    switch(status) {
        case 'Picked Up from Warehouse':
            this.origin.departureDate = new Date();
            break;
        case 'Delivered':
            this.actualDeliveryDate = new Date();
            break;
        case 'Customs Cleared':
            if (this.customsInfo) {
                this.customsInfo.clearanceDate = new Date();
            }
            break;
    }
};

shipmentSchema.methods.addTrackingUpdate = function(location, status, description, userId) {
    this.trackingUpdates.push({
        location,
        status,
        description,
        timestamp: new Date(),
        createdBy: userId
    });
    
    if (this.transport) {
        this.transport.currentLocation = {
            address: location,
            lastUpdated: new Date()
        };
    }
};

shipmentSchema.methods.addCost = function(costData) {
    this.costs.push(costData);
    this.totalCost = this.costs.reduce((sum, cost) => sum + cost.amount, 0);
    this.totalPaid = this.costs
        .filter(cost => cost.paymentStatus === 'Paid')
        .reduce((sum, cost) => sum + cost.amount, 0);
    this.balanceDue = this.totalCost - this.totalPaid;
};

shipmentSchema.methods.isOnTrack = function() {
    const delayedStatuses = ['On Hold', 'Cancelled', 'Returned'];
    if (delayedStatuses.includes(this.status)) return false;
    
    if (this.transport?.estimatedArrival) {
        const now = new Date();
        if (this.transport.estimatedArrival < now && this.status !== 'Delivered') {
            return false;
        }
    }
    
    return true;
};

shipmentSchema.methods.getETA = function() {
    return this.transport?.estimatedArrival || this.promisedDeliveryDate;
};

shipmentSchema.methods.getProgressPercentage = function() {
    const statusOrder = [
        'Pending',
        'Picked Up from Warehouse',
        'Departed Port of Origin',
        'In Transit (Sea Freight)',
        'Arrived at Destination Port',
        'Customs Cleared',
        'Out for Delivery',
        'Delivered'
    ];
    
    const currentIndex = statusOrder.indexOf(this.status);
    if (currentIndex === -1) return 0;
    return Math.round((currentIndex / (statusOrder.length - 1)) * 100);
};

shipmentSchema.methods.getCustomerTimeline = function() {
    return this.milestones
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(m => ({
            status: m.status,
            location: m.location,
            date: m.timestamp,
            description: m.description
        }));
};

// Indexes
shipmentSchema.index({ shipmentNumber: 1 });
shipmentSchema.index({ trackingNumber: 1 });
shipmentSchema.index({ bookingId: 1 });
shipmentSchema.index({ status: 1 });
shipmentSchema.index({ mode: 1 });
shipmentSchema.index({ shipmentType: 1 });
shipmentSchema.index({ 'origin.country': 1, 'destination.country': 1 });
shipmentSchema.index({ 'transport.estimatedArrival': 1 });
shipmentSchema.index({ paymentStatus: 1 });
shipmentSchema.index({ createdDate: -1 });
shipmentSchema.index({ assignedTo: 1 });

module.exports = mongoose.model('Shipment', shipmentSchema);