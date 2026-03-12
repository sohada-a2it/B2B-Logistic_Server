// models/damageReportModel.js
const mongoose = require('mongoose');

const damageReportSchema = new mongoose.Schema({
    reportNumber: {
        type: String,
        required: true,
        unique: true
    },
    receiptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WarehouseReceipt',
        required: true
    },
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true
    },
    condition: {
        type: String,
        enum: ['Minor Damage', 'Major Damage', 'Partial', 'Shortage'],
        required: true
    },
    findings: String,
    details: [{
        packageIndex: Number,
        condition: String,
        passed: Number,
        failed: Number,
        notes: String
    }],
    photos: [String],
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reportedAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['pending_review', 'approved', 'rejected', 'disposed', 'returned'],
        default: 'pending_review'
    },
    disposition: {
        type: String,
        enum: [ 'quarantine',    // কোয়ারেন্টাইনে রাখুন
            'scrap',         // স্ক্র্যাপ
            'return',        // সাপ্লায়ারে ফেরত
            'rework',        // মেরামত
            'insurance',     // ইন্স্যুরেন্স ক্লেইম
            'restock' ],
        default: 'quarantine'
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: Date,
    reviewNotes: String,
    location: {
        zone: String,
        aisle: String,
        rack: String,
        bin: String
    },
    insuranceClaim: {
        filed: { type: Boolean, default: false },
        claimNumber: String,
        amount: Number,
        status: String
    }
}, {
    timestamps: true
});

// Generate report number before saving
damageReportSchema.pre('save', async function(next) {
    if (this.isNew && !this.reportNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        
        const count = await this.constructor.countDocuments({
            reportNumber: new RegExp(`^DAM-${year}${month}`)
        });
        
        this.reportNumber = `DAM-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
    }
    next();
});

module.exports = mongoose.model('DamageReport', damageReportSchema);