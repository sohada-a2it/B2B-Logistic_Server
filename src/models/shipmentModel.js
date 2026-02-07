// models/shipmentModel.js
const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema({
  // ==================== BASIC INFORMATION ====================
  shipmentNumber: {
    type: String,
    required: [true, 'Shipment number is required'],
    unique: true,
    trim: true
  },
  trackingNumber: {
    type: String,
    unique: true,
    trim: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Customer is required']
  },
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  customerEmail: {
    type: String,
    required: [true, 'Customer email is required'],
    lowercase: true,
    trim: true
  },
  
  // ==================== SHIPMENT TYPE & DETAILS ====================
  shipmentType: {
    type: String,
    enum: ['Air Freight', 'Sea Freight', 'Express Courier', 'Land Transport'],
    required: [true, 'Shipment type is required'],
    default: 'Sea Freight'
  },
  shippingMode: {
    type: String,
    enum: ['DDP', 'DDU', 'EXW', 'FOB', 'CIF'],
    default: 'DDP'
  },
  
  // ==================== ORIGIN & DESTINATION ====================
  origin: {
    country: {
      type: String,
      enum: ['China', 'Thailand', 'Vietnam', 'India', 'Other'],
      required: [true, 'Origin country is required']
    },
    warehouse: {
      type: String,
      enum: ['China Warehouse', 'Thailand Warehouse', 'Vietnam Warehouse', 'Other'],
      required: [true, 'Origin warehouse is required']
    },
    city: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    }
  },
  
  destination: {
    country: {
      type: String,
      enum: ['USA', 'UK', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'Other'],
      required: [true, 'Destination country is required']
    },
    port: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      required: [true, 'Destination city is required'],
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    postalCode: {
      type: String,
      trim: true
    }
  },
  
  // ==================== CARGO DETAILS ====================
  cargoDetails: {
    numberOfCartons: {
      type: Number,
      required: [true, 'Number of cartons is required'],
      min: 1
    },
    totalWeight: {
      type: Number, // in kg
      required: [true, 'Total weight is required'],
      min: 0.1
    },
    totalVolume: {
      type: Number, // in CBM
      required: [true, 'Total volume is required'],
      min: 0.001
    },
    productCategory: {
      type: String,
      enum: ['Electronics', 'Textiles', 'Machinery', 'Furniture', 'Food', 'Chemicals', 'Automotive', 'Pharmaceuticals', 'Other'],
      required: [true, 'Product category is required']
    },
    description: {
      type: String,
      trim: true
    },
    dimensions: {
      length: Number, // in cm
      width: Number,  // in cm
      height: Number, // in cm
      unit: {
        type: String,
        enum: ['cm', 'm', 'in', 'ft'],
        default: 'cm'
      }
    }
  },
  
  // ==================== CONTAINER/AIRWAY DETAILS ====================
  containerDetails: {
    containerId: {
      type: String,
      trim: true
    },
    containerType: {
      type: String,
      enum: ['20FT', '40FT', '40FT HC', '45FT HC', 'LCL', 'Airway Bill']
    },
    airwayBillNumber: {
      type: String,
      trim: true
    },
    vesselFlightNumber: {
      type: String,
      trim: true
    }
  },
  
  // ==================== DATES ====================
  bookingDate: {
    type: Date,
    default: Date.now
  },
  estimatedDeparture: {
    type: Date
  },
  actualDeparture: {
    type: Date
  },
  estimatedArrival: {
    type: Date
  },
  actualArrival: {
    type: Date
  },
  deliveryDate: {
    type: Date
  },
  
  // ==================== STATUS & MILESTONES ====================
  currentStatus: {
    type: String,
    enum: [
      'Booking Requested',
      'Confirmed',
      'Received at Warehouse',
      'Consolidation in Progress',
      'Loaded in Container/Flight',
      'In Transit',
      'Arrived at Destination',
      'Customs Clearance',
      'Out for Delivery',
      'Delivered',
      'Cancelled',
      'On Hold'
    ],
    default: 'Booking Requested'
  },
  
  milestones: [{
    status: {
      type: String,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    location: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // ==================== ASSIGNED STAFF ====================
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedOperator: {
    type: String,
    trim: true
  },
  
  // ==================== PICKUP & DELIVERY ====================
  pickupRequired: {
    type: Boolean,
    default: false
  },
  pickupDetails: {
    date: Date,
    time: String,
    address: String,
    contactPerson: String,
    contactPhone: String
  },
  
  deliveryDetails: {
    date: Date,
    time: String,
    address: String,
    contactPerson: String,
    contactPhone: String,
    deliveryNotes: String
  },
  
  // ==================== FINANCIAL DETAILS ====================
  quotationAmount: {
    type: Number,
    default: 0
  },
  invoiceAmount: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    enum: ['USD', 'GBP', 'CAD', 'EUR', 'THB', 'CNY'],
    default: 'USD'
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Quoted', 'Invoiced', 'Partially Paid', 'Paid', 'Overdue'],
    default: 'Pending'
  },
  
  // ==================== DOCUMENTS ====================
  documents: [{
    documentType: {
      type: String,
      enum: ['Commercial Invoice', 'Packing List', 'Shipping Label', 'Customs Document', 'Bill of Lading', 'Airway Bill', 'Certificate of Origin', 'Insurance', 'Other']
    },
    documentName: String,
    documentUrl: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // ==================== WAREHOUSE DETAILS ====================
  warehouse: {
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse'
    },
    locationCode: String,
    receivingDate: Date,
    storageLocation: String
  },
  
  // ==================== CUSTOMS & COMPLIANCE ====================
  customsInfo: {
    hsCode: String,
    value: Number,
    dutiesPaid: {
      type: Boolean,
      default: false
    },
    clearanceDate: Date,
    clearanceNotes: String
  },
  
  // ==================== NOTES & COMMUNICATION ====================
  internalNotes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  customerNotes: String,
  
  // ==================== SYSTEM FIELDS ====================
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster queries
shipmentSchema.index({ shipmentNumber: 1 }, { unique: true });
shipmentSchema.index({ trackingNumber: 1 }, { unique: true, sparse: true });
shipmentSchema.index({ customer: 1 });
shipmentSchema.index({ currentStatus: 1 });
shipmentSchema.index({ 'origin.country': 1, 'destination.country': 1 });
shipmentSchema.index({ bookingDate: -1 });
shipmentSchema.index({ assignedTo: 1 });

// Pre-save middleware to generate shipment number
// models/shipmentModel.js - pre-save middleware আপডেট করুন

// পরিবর্তন করুন এই অংশ:
shipmentSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Generate shipment number: SH-YYYYMMDD-XXXXX
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    this.shipmentNumber = `SH-${year}${month}${day}-${randomNum}`;
    
    // Generate tracking number if not provided
    if (!this.trackingNumber) {
      this.trackingNumber = `TRK-${year}${month}${day}-${Math.floor(100000 + Math.random() * 900000)}`;
    }
  }
  this.lastUpdated = new Date();
  next();
});

// পরিবর্তন করুন এভাবে:
shipmentSchema.pre('validate', function(next) {
  // Only generate for new documents
  if (this.isNew) {
    // Generate shipment number: SH-YYYYMMDD-XXXXX
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    this.shipmentNumber = `SH-${year}${month}${day}-${randomNum}`;
    
    // Generate tracking number
    this.trackingNumber = `TRK-${year}${month}${day}-${Math.floor(100000 + Math.random() * 900000)}`;
  }
  next();
});

shipmentSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Method to add milestone
shipmentSchema.methods.addMilestone = function(status, location, notes, updatedBy) {
  this.milestones.push({
    status,
    location,
    notes,
    updatedBy,
    date: new Date()
  });
  this.currentStatus = status;
  return this.save();
};

// Method to check if shipment belongs to customer
shipmentSchema.methods.isCustomerShipment = function(customerId) {
  return this.customer.toString() === customerId.toString();
};

module.exports = mongoose.model('Shipment', shipmentSchema);