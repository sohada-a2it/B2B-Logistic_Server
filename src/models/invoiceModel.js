const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({ 
    
    // Invoice Number - Auto generated
    invoiceNumber: {
        type: String,
        sparse: true,
        unique: true,
        trim: true
    },
    
    // References
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment'
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Customer Info (snapshot)
    customerInfo: {
        companyName: String,
        contactPerson: String,
        email: String,
        phone: String,
        address: String,
        vatNumber: String
    },
    
    // Invoice Details
    invoiceDate: {
        type: Date,
        default: Date.now
    },
    dueDate: {
        type: Date,
        required: true
    },
    
    // Charges Breakdown
    charges: [{
        description: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: [
                'Freight Cost',
                'Handling Fee',
                'Warehouse Fee',
                'Customs Processing',
                'Documentation Fee',
                'Insurance',
                'Fuel Surcharge',
                'Pickup Fee',
                'Delivery Fee',
                'Other'
            ],
            required: true
        },
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
        notes: String
    }],
    
    // Totals
    subtotal: {
        type: Number,
        required: true,
        default: 0
    },
    taxAmount: {
        type: Number,
        default: 0
    },
    taxRate: {
        type: Number,
        default: 0
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true,
        default: 0
    },
    currency: {
        type: String,
        enum: ['USD', 'GBP', 'CAD', 'THB', 'CNY'],
        default: 'USD'
    },
    
    // Payment
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'overdue', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['Bank Transfer', 'Credit Card', 'Cash', 'Cheque']
    },
    paymentDate: Date,
    paymentReference: String,
    
    // PDF
    pdfUrl: {
        type: String,
        default: ''
    },
    
    // Terms
    paymentTerms: {
        type: String,
        default: 'Due within 30 days'
    },
    notes: String,
    termsAndConditions: String,
    
    // Status
    status: {
        type: String,
        enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
        default: 'draft'
    },
    
    // Email tracking
    emailSent: {
        type: Boolean,
        default: false
    },
    emailSentAt: Date,
    emailedTo: [String],
    
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

// Pre-save middleware - Auto generate invoice number
invoiceSchema.pre('save', async function(next) {
    try {
        // Generate invoice number if it doesn't exist
        if (!this.invoiceNumber) {
            const date = new Date();
            const year = date.getFullYear().toString().slice(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            
            // Count existing invoices with this month prefix
            const count = await mongoose.model('Invoice').countDocuments({
                invoiceNumber: new RegExp(`^INV-${year}${month}`)
            });
            
            // Generate unique invoice number: INV-YYMM-XXXXX
            this.invoiceNumber = `INV-${year}${month}-${(count + 1).toString().padStart(5, '0')}`;
            
            console.log('✅ Auto-generated invoice number:', this.invoiceNumber);
        }
        
        // Calculate totals if charges exist
        if (this.charges && this.charges.length > 0) {
            this.subtotal = this.charges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
            this.totalAmount = this.subtotal - (this.discountAmount || 0) + (this.taxAmount || 0);
        }
        
        next();
    } catch (error) {
        console.error('❌ Invoice pre-save error:', error);
        next(error);
    }
});

// Methods
invoiceSchema.methods.markAsPaid = function(paymentMethod, paymentReference, userId) {
    this.paymentStatus = 'paid';
    this.status = 'paid';
    this.paymentMethod = paymentMethod;
    this.paymentReference = paymentReference;
    this.paymentDate = new Date();
    this.updatedBy = userId;
};

invoiceSchema.methods.markAsSent = function(emailedTo) {
    this.status = 'sent';
    this.emailSent = true;
    this.emailSentAt = new Date();
    if (emailedTo) {
        this.emailedTo = emailedTo;
    }
};

// Indexes
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ bookingId: 1 });
invoiceSchema.index({ customerId: 1, createdAt: -1 });
invoiceSchema.index({ paymentStatus: 1, dueDate: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);