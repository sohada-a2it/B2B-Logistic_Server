const DamageReport = require('../models/damageReportModel');
const WarehouseReceipt = require('../models/warehouseReceiptModel');
const Shipment = require('../models/shipmentModel');
const mongoose = require('mongoose');

// ============================================
// ✅ 1. GET ALL DAMAGE REPORTS (with filters)
// ============================================
exports.getAllDamageReports = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status, 
            condition,
            startDate,
            endDate,
            search 
        } = req.query;

        let query = {};

        // Filter by status
        if (status) {
            query.status = status;
        }

        // Filter by condition
        if (condition) {
            query.condition = condition;
        }

        // Filter by date range
        if (startDate || endDate) {
            query.reportedAt = {};
            if (startDate) {
                query.reportedAt.$gte = new Date(startDate);
            }
            if (endDate) {
                query.reportedAt.$lte = new Date(endDate);
            }
        }

        // Search by report number or tracking number
        if (search) {
            const receipts = await WarehouseReceipt.find({
                'shipmentId.trackingNumber': { $regex: search, $options: 'i' }
            }).select('_id');
            
            query.$or = [
                { reportNumber: { $regex: search, $options: 'i' } },
                { receiptId: { $in: receipts.map(r => r._id) } }
            ];
        }

        const damageReports = await DamageReport.find(query)
            .populate('receiptId', 'receiptNumber storageLocation')
            .populate('shipmentId', 'trackingNumber shipmentNumber status')
            .populate('reportedBy', 'firstName lastName email')
            .populate('reviewedBy', 'firstName lastName email')
            .sort({ reportedAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await DamageReport.countDocuments(query);

        // Get statistics
        const stats = await DamageReport.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalValue: { $sum: '$insuranceClaim.amount' }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: damageReports,
            stats,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ Get damage reports error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ============================================
// ✅ 2. GET SINGLE DAMAGE REPORT BY ID
// ============================================
exports.getDamageReportById = async (req, res) => {
    try {
        const { id } = req.params;

        const damageReport = await DamageReport.findById(id)
            .populate({
                path: 'receiptId',
                populate: {
                    path: 'packages'
                }
            })
            .populate('shipmentId')
            .populate('reportedBy', 'firstName lastName email')
            .populate('reviewedBy', 'firstName lastName email');

        if (!damageReport) {
            return res.status(404).json({
                success: false,
                message: 'Damage report not found'
            });
        }

        res.status(200).json({
            success: true,
            data: damageReport
        });

    } catch (error) {
        console.error('❌ Get damage report error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ============================================
// ✅ 3. UPDATE DAMAGE REPORT STATUS
// ============================================
exports.updateDamageReportStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reviewNotes, disposition } = req.body;

        const damageReport = await DamageReport.findById(id);

        if (!damageReport) {
            return res.status(404).json({
                success: false,
                message: 'Damage report not found'
            });
        }

        // Update fields
        if (status) damageReport.status = status;
        if (reviewNotes) damageReport.reviewNotes = reviewNotes;
        if (disposition) damageReport.disposition = disposition;
        
        damageReport.reviewedBy = req.user._id;
        damageReport.reviewedAt = new Date();

        await damageReport.save();

        // If status is 'approved' or 'rejected', update shipment
        if (status === 'approved' || status === 'rejected') {
            await Shipment.findByIdAndUpdate(damageReport.shipmentId, {
                'damageReport.status': status,
                'damageReport.reviewedAt': new Date(),
                'damageReport.reviewedBy': req.user._id
            });
        }

        res.status(200).json({
            success: true,
            message: 'Damage report updated successfully',
            data: damageReport
        });

    } catch (error) {
        console.error('❌ Update damage report error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ============================================
// ✅ 4. ADD INSURANCE CLAIM
// ============================================
exports.addInsuranceClaim = async (req, res) => {
    try {
        const { id } = req.params;
        const { claimNumber, amount, status } = req.body;

        const damageReport = await DamageReport.findById(id);

        if (!damageReport) {
            return res.status(404).json({
                success: false,
                message: 'Damage report not found'
            });
        }

        damageReport.insuranceClaim = {
            filed: true,
            claimNumber,
            amount,
            status: status || 'pending'
        };

        await damageReport.save();

        res.status(200).json({
            success: true,
            message: 'Insurance claim added successfully',
            data: damageReport
        });

    } catch (error) {
        console.error('❌ Add insurance claim error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ============================================
// ✅ 5. GET DAMAGE REPORT STATISTICS
// ============================================
exports.getDamageReportStats = async (req, res) => {
    try {
        const stats = await DamageReport.aggregate([
            {
                $facet: {
                    byStatus: [
                        { $group: {
                            _id: '$status',
                            count: { $sum: 1 },
                            totalValue: { $sum: '$insuranceClaim.amount' }
                        }}
                    ],
                    byCondition: [
                        { $group: {
                            _id: '$condition',
                            count: { $sum: 1 }
                        }}
                    ],
                    byDisposition: [
                        { $group: {
                            _id: '$disposition',
                            count: { $sum: 1 }
                        }}
                    ],
                    monthly: [
                        {
                            $group: {
                                _id: {
                                    year: { $year: '$reportedAt' },
                                    month: { $month: '$reportedAt' }
                                },
                                count: { $sum: 1 },
                                totalValue: { $sum: '$insuranceClaim.amount' }
                            }
                        },
                        { $sort: { '_id.year': -1, '_id.month': -1 } },
                        { $limit: 12 }
                    ]
                }
            }
        ]);

        const totalReports = await DamageReport.countDocuments();
        const pendingReview = await DamageReport.countDocuments({ status: 'pending_review' });

        res.status(200).json({
            success: true,
            data: {
                total: totalReports,
                pendingReview,
                ...stats[0]
            }
        });

    } catch (error) {
        console.error('❌ Get damage stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ============================================
// ✅ 6. DELETE DAMAGE REPORT (Admin only)
// ============================================
exports.deleteDamageReport = async (req, res) => {
    try {
        const { id } = req.params;

        const damageReport = await DamageReport.findById(id);

        if (!damageReport) {
            return res.status(404).json({
                success: false,
                message: 'Damage report not found'
            });
        }

        // Remove reference from shipment
        await Shipment.findByIdAndUpdate(damageReport.shipmentId, {
            $unset: { damageReportId: 1 }
        });

        await damageReport.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Damage report deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete damage report error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ============================================
// ✅ 7. BULK UPDATE DAMAGE REPORTS
// ============================================
exports.bulkUpdateDamageReports = async (req, res) => {
    try {
        const { reportIds, status, disposition, reviewNotes } = req.body;

        if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide report IDs array'
            });
        }

        const updateData = {
            reviewedBy: req.user._id,
            reviewedAt: new Date()
        };

        if (status) updateData.status = status;
        if (disposition) updateData.disposition = disposition;
        if (reviewNotes) updateData.reviewNotes = reviewNotes;

        const result = await DamageReport.updateMany(
            { _id: { $in: reportIds } },
            { $set: updateData }
        );

        // Update related shipments
        if (status) {
            const reports = await DamageReport.find({ _id: { $in: reportIds } });
            for (const report of reports) {
                await Shipment.findByIdAndUpdate(report.shipmentId, {
                    'damageReport.status': status
                });
            }
        }

        res.status(200).json({
            success: true,
            message: `Updated ${result.modifiedCount} damage reports`,
            data: result
        });

    } catch (error) {
        console.error('❌ Bulk update error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ============================================
// ✅ 8. EXPORT DAMAGE REPORTS
// ============================================
exports.exportDamageReports = async (req, res) => {
    try {
        const { format = 'csv', startDate, endDate, status } = req.query;

        let query = {};
        if (status) query.status = status;
        if (startDate || endDate) {
            query.reportedAt = {};
            if (startDate) query.reportedAt.$gte = new Date(startDate);
            if (endDate) query.reportedAt.$lte = new Date(endDate);
        }

        const reports = await DamageReport.find(query)
            .populate('shipmentId', 'trackingNumber')
            .populate('reportedBy', 'firstName lastName')
            .lean();

        if (format === 'csv') {
            // Create CSV
            const fields = [
                'Report Number', 'Tracking Number', 'Condition', 
                'Findings', 'Status', 'Disposition', 'Reported By',
                'Reported Date', 'Insurance Claim'
            ];

            const csvData = reports.map(r => [
                r.reportNumber,
                r.shipmentId?.trackingNumber || 'N/A',
                r.condition,
                r.findings || '',
                r.status,
                r.disposition,
                r.reportedBy ? `${r.reportedBy.firstName} ${r.reportedBy.lastName}` : 'N/A',
                new Date(r.reportedAt).toLocaleDateString(),
                r.insuranceClaim?.filed ? 'Yes' : 'No'
            ]);

            const csv = [
                fields.join(','),
                ...csvData.map(row => row.join(','))
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=damage-reports.csv');
            return res.send(csv);
        }

        res.status(200).json({
            success: true,
            data: reports
        });

    } catch (error) {
        console.error('❌ Export error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};