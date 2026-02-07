const mongoose = require('mongoose');
const { 
  SHIPMENT_TYPES, 
  PRODUCT_TYPES, 
  PACKAGE_TYPES, 
  SHIPPING_MODES, 
  BOOKING_STATUS,
  COUNTRIES,
  CURRENCIES 
} = require('../constants/productConstants');

const bookingSchema = new mongoose.Schema({
  // Booking Information
  bookingNumber: {
    type: String,
    unique: true,
    required: true,
    default: () => `BK${Date.now()}${Math.floor(Math.random() * 1000)}`
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  
  // Shipment Type
  shipmentType: {
    type: String,
    enum: Object.values(SHIPMENT_TYPES),
    required: true
  },
  
  // Origin & Destination
  originCountry: {
    type: String,
    enum: Object.values(COUNTRIES),
    required: true
  },
  originWarehouse: {
    type: String,
    required: true,
    enum: ['CHINA_WAREHOUSE', 'THAILAND_WAREHOUSE']
  },
  destinationCountry: {
    type: String,
    enum: Object.values(COUNTRIES),
    required: true
  },
  destinationAddress: {
    type: String,
    required: true
  },
  
  // Cargo Details
  productType: {
    type: String,
    enum: Object.values(PRODUCT_TYPES),
    required: true
  },
  packageType: {
    type: String,
    enum: Object.values(PACKAGE_TYPES),
    required: true
  },
  cargoDetails: {
    numberOfCartons: {
      type: Number,
      required: true,
      min: 1
    },
    weight: {
      type: Number,
      required: true,
      min: 0.1
    },
    volume: {
      type: Number,
      required: true,
      min: 0.01
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    description: String,
    hazardous: {
      type: Boolean,
      default: false
    },
    temperatureControlled: {
      type: Boolean,
      default: false
    }
  },
  
  // Shipping Options
  shippingMode: {
    type: String,
    enum: Object.values(SHIPPING_MODES),
    default: SHIPPING_MODES.DDU
  },
  pickupRequired: {
    type: Boolean,
    default: false
  },
  pickupAddress: String,
  pickupDate: Date,
  
  // Financial Details
  quotation: {
    freightCost: {
      type: Number,
      default: 0
    },
    handlingFee: {
      type: Number,
      default: 0
    },
    warehouseFee: {
      type: Number,
      default: 0
    },
    customsFee: {
      type: Number,
      default: 0
    },
    insuranceFee: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      enum: Object.values(CURRENCIES),
      default: CURRENCIES.USD
    }
  },
  
  // Status & Tracking
  status: {
    type: String,
    enum: Object.values(BOOKING_STATUS),
    default: BOOKING_STATUS.REQUESTED
  },
  trackingNumber: String,
  
  // Dates
  estimatedDeparture: Date,
  estimatedArrival: Date,
  bookingDate: {
    type: Date,
    default: Date.now
  },
  
  // References
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  containerId: String,
  airwayBillNumber: String,
  
  // Documents
  documents: [{
    name: String,
    type: String,
    url: String,
    uploadedBy: mongoose.Schema.Types.ObjectId,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadata
  notes: String,
  specialInstructions: String,
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

// Indexes for better query performance
bookingSchema.index({ bookingNumber: 1 });
bookingSchema.index({ customer: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ shipmentType: 1 });
bookingSchema.index({ originCountry: 1, destinationCountry: 1 });
bookingSchema.index({ createdAt: -1 });

// Pre-save middleware
bookingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-calculate total amount
  if (this.quotation) {
    this.quotation.totalAmount = 
      this.quotation.freightCost +
      this.quotation.handlingFee +
      this.quotation.warehouseFee +
      this.quotation.customsFee +
      this.quotation.insuranceFee;
  }
  
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);