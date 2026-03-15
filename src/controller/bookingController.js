// controllers/bookingController.js

const Booking = require('../models/bookingModel');
const Shipment = require('../models/shipmentModel');
const Invoice = require('../models/invoiceModel');
const User = require('../models/userModel');
const { sendEmail } = require('../utils/emailService');
const { generateTrackingNumber } = require('../utils/trackingGenerator');
const mongoose = require('mongoose')
// ========== HELPER FUNCTIONS ==========

// Generate shipment number
async function generateShipmentNumber() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    const count = await Shipment.countDocuments({
        shipmentNumber: new RegExp(`^SHP-${year}${month}`)
    });
    
    return `SHP-${year}${month}-${(count + 1).toString().padStart(5, '0')}`;
}

// Calculate customer total spent
const calculateCustomerTotalSpent = async (customerId) => {
    try {
        const result = await Booking.aggregate([
            { 
                $match: { 
                    customer: customerId,
                    status: 'delivered',
                    invoiceId: { $ne: null }
                } 
            },
            {
                $lookup: {
                    from: 'invoices',
                    localField: 'invoiceId',
                    foreignField: '_id',
                    as: 'invoice'
                }
            },
            { $unwind: '$invoice' },
            {
                $group: {
                    _id: null,
                    totalSpent: { $sum: '$invoice.totalAmount' }
                }
            }
        ]);

        return result.length > 0 ? result[0].totalSpent : 0;
    } catch (error) {
        console.error('Calculate total spent error:', error);
        return 0;
    }
};

// Calculate progress percentage
// const calculateProgress = (status) => {
//     const statusOrder = [
//         'booking_requested',
//         'price_quoted',
//         'booking_confirmed',
//         'pending',
//         'picked_up_from_warehouse',
//         'departed_port_of_origin',
//         'in_transit_sea_freight',
//         'arrived_at_destination_port',
//         'customs_cleared',
//         'out_for_delivery',
//         'delivered'
//     ];

//     const index = statusOrder.indexOf(status);
//     if (index === -1) return 0;
//     return Math.round((index / (statusOrder.length - 1)) * 100);
// };

// ========== 1. CREATE BOOKING (Customer) ==========
// controllers/bookingController.js - Fixed version

exports.createBooking = async (req, res) => {
    try {
        console.log('📥 Received booking data:', JSON.stringify(req.body, null, 2));

        const {
            customer,
            shipmentClassification,
            serviceType,
            shipmentDetails,
            dates,
            payment,
            sender,
            receiver,
            courier,
            status,
            pricingStatus,
            timeline
        } = req.body;

        // Validate required fields
        if (!shipmentDetails?.origin) {
            return res.status(400).json({
                success: false,
                error: 'Origin is required'
            });
        }
        
        if (!shipmentDetails?.destination) {
            return res.status(400).json({
                success: false,
                error: 'Destination is required'
            });
        }

        // Calculate totals from package details
        let totalPackages = 0;
        let totalWeight = 0;
        let totalVolume = 0;

        if (shipmentDetails?.packageDetails && shipmentDetails.packageDetails.length > 0) {
            totalPackages = shipmentDetails.packageDetails.length;
            totalWeight = shipmentDetails.packageDetails.reduce(
                (sum, item) => sum + (item.weight * item.quantity), 0
            );
            totalVolume = shipmentDetails.packageDetails.reduce(
                (sum, item) => sum + (item.volume * item.quantity), 0
            );
        }

        const bookingData = {
            customer: customer || req.user?._id,
            createdBy: req.user?._id || customer,
            
            shipmentClassification: shipmentClassification || {
                mainType: 'air_freight',
                subType: 'air_freight'
            },
            
            serviceType: serviceType || 'standard',
            
            shipmentDetails: {
                origin: shipmentDetails?.origin,
                destination: shipmentDetails?.destination,
                shippingMode: shipmentDetails?.shippingMode || 'DDU',
                packageDetails: shipmentDetails?.packageDetails || [],
                totalPackages,
                totalWeight,
                totalVolume,
                specialInstructions: shipmentDetails?.specialInstructions || '',
                referenceNumber: shipmentDetails?.referenceNumber || ''
            },
            
            dates: {
                requested: new Date(),
                estimatedDeparture: dates?.estimatedDeparture,
                estimatedArrival: dates?.estimatedArrival
            },
            
            payment: {
                mode: payment?.mode || 'bank_transfer',
                currency: payment?.currency || 'USD'
            },
            
            sender: sender || {},
            receiver: receiver || {},
            
            courier: courier || {
                company: 'Cargo Logistics Group',
                serviceType: serviceType || 'standard'
            },
            
            status: status || 'booking_requested',
            pricingStatus: pricingStatus || 'pending',
            shipmentStatus: 'pending',
            
            timeline: timeline || [{
                status: 'booking_requested',
                description: 'Booking request submitted',
                updatedBy: req.user?._id || customer,
                timestamp: new Date()
            }]
        };

        console.log('📦 Saving booking data:', JSON.stringify(bookingData, null, 2));

        const booking = new Booking(bookingData);
        await booking.save();
        
        // Populate customer info
        await booking.populate('customer', 'firstName lastName email companyName phone');

       // Send email to ALL Admins AND SMTP Email
const admins = await User.find({ role: 'admin', isActive: true });
const adminEmails = admins.map(admin => admin.email);

// Combine admin emails with SMTP email
let allRecipients = [...adminEmails];

// Add the SMTP email (support@cargologisticscompany.com)
if (process.env.SMTP_USER) {
    allRecipients.push(process.env.SMTP_USER);
}

// Remove duplicates (in case support email is also in admin list)
allRecipients = [...new Set(allRecipients)];

if (allRecipients.length > 0) {
    await sendEmail({
        to: allRecipients,  // Now contains both admin emails AND SMTP email
        subject: '🚨 New Booking Request Received',
        template: 'new-booking-notification',
        data: {
            bookingNumber: booking.bookingNumber,
            customerName: booking.sender?.name || 'Customer',
            origin: booking.shipmentDetails?.origin || 'N/A',
            destination: booking.shipmentDetails?.destination || 'N/A',
            totalPackages: booking.shipmentDetails?.totalPackages || 0,
            totalWeight: booking.shipmentDetails?.totalWeight || 0,
            bookingUrl: `${process.env.FRONTEND_URL}/admin/bookings/${booking._id}`,
            requestedDate: new Date().toLocaleString()
        }
    }).catch(err => console.error('Email error:', err));
    
    console.log('✅ Email sent to:', allRecipients);
}

        // Send confirmation to Customer
        if (booking.sender?.email) {
            await sendEmail({
                to: booking.sender.email,
                subject: '✅ Booking Request Received - Cargo Logistics',
                template: 'booking-received',
                data: {
                    bookingNumber: booking.bookingNumber,
                    customerName: booking.sender?.name,
                    origin: booking.sender?.address?.country,
                    destination: booking.receiver?.address?.country,
                    dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`,
                    supportEmail: process.env.SUPPORT_EMAIL
                }
            }).catch(err => console.error('Email error:', err));
        }

        res.status(201).json({
            success: true,
            message: 'Booking request submitted successfully',
            data: {
                bookingNumber: booking.bookingNumber,
                trackingNumber: booking.trackingNumber,
                status: booking.status,
                _id: booking._id
            }
        });

    } catch (error) {
        console.error('❌ Create booking error:', error);
        console.error('Error details:', error.message);
        
        // Check for validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 2. GET ALL BOOKINGS (Admin) ==========
exports.getAllBookings = async (req, res) => {
    try {
        const { status, page = 1, limit = 20, sort = '-createdAt' } = req.query;
        
        let query = {};
        if (status) query.status = status;
        
        // If customer, only show their bookings
        if (req.user.role === 'customer') {
            query.customer = req.user._id;
        }
        
        const bookings = await Booking.find(query)
            .populate('customer', 'firstName lastName companyName email phone')
            .populate('quotedPrice.quotedBy', 'firstName lastName')
            .populate('shipmentId', 'trackingNumber status')
            .populate('invoiceId', 'invoiceNumber totalAmount paymentStatus')
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));
            
        const total = await Booking.countDocuments(query);
        
        res.status(200).json({
            success: true,
            data: bookings,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get all bookings error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 3. GET SINGLE BOOKING ==========
exports.getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const booking = await Booking.findById(id)
            .populate('customer', 'firstName lastName companyName email phone address')
            .populate('quotedPrice.quotedBy', 'firstName lastName email')
            .populate('shipmentId')
            .populate('invoiceId')
            .populate('timeline.updatedBy', 'firstName lastName role');
            
        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }
        
        // Check permission (customer can only see their own)
        if (req.user.role === 'customer' && booking.customer._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
            });
        }
        
        res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.error('Get booking by id error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 4. UPDATE PRICE QUOTE (Admin) ==========
exports.updatePriceQuote = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, currency, breakdown, validUntil, notes } = req.body;

        const booking = await Booking.findById(id)
            .populate('customer', 'email firstName lastName companyName');

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        if (booking.status !== 'booking_requested') {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot update price for this booking status' 
            });
        }

        // Update with price quote - Schema অনুযায়ী
        booking.quotedPrice = {
            amount,
            currency,
            breakdown: breakdown || {
                baseRate: 0,
                weightCharge: 0,
                fuelSurcharge: 0,
                residentialSurcharge: 0,
                insurance: 0,
                tax: 0,
                otherCharges: 0
            },
            quotedBy: req.user._id,
            quotedAt: new Date(),
            validUntil: validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            notes
        };
        
        booking.pricingStatus = 'quoted';
        booking.status = 'price_quoted';
        
        booking.addTimelineEntry(
            'price_quoted',
            `Price quoted: ${currency} ${amount}`,
            req.user._id,
            { amount, currency }
        );

        await booking.save();

        // Send email to Customer
        if (booking.customer?.email) {
            await sendEmail({
                to: booking.customer.email,
                subject: '💰 Price Quote Ready for Your Booking',
                template: 'price-quote-ready',
                data: {
                    bookingNumber: booking.bookingNumber,
                    customerName: booking.customer.firstName || 'Customer',
                    quotedAmount: amount,
                    currency: currency,
                    validUntil: booking.quotedPrice.validUntil,
                    breakdown: breakdown,
                    acceptUrl: `${process.env.FRONTEND_URL}/booking/${booking._id}/accept`,
                    rejectUrl: `${process.env.FRONTEND_URL}/booking/${booking._id}/reject`,
                    dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`
                }
            });
        }

        res.status(200).json({
            success: true,
            message: 'Price quote sent to customer',
            data: booking
        });

    } catch (error) {
        console.error('Update price quote error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 5. ACCEPT QUOTE (Customer) ==========
// controllers/bookingController.js - সম্পূর্ণ আপডেটেড Shipment Creation অংশ

exports.acceptQuote = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        console.log('🚀 ===== ACCEPT QUOTE STARTED =====');
        console.log('1. Booking ID:', id);
        
        const booking = await Booking.findById(id)
            .populate('customer', 'email firstName lastName companyName phone');

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        console.log('2. Booking found:', booking.bookingNumber);
        console.log('3. Customer email:', booking.customer?.email);

        // Security check
        if (booking.customer._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'You can only accept your own bookings' 
            });
        }

        if (booking.pricingStatus !== 'quoted') {
            return res.status(400).json({ 
                success: false, 
                message: 'No active price quote found' 
            });
        }

        // Check if quote is still valid
        if (!booking.isQuoteValid()) {
            booking.pricingStatus = 'expired';
            await booking.save();
            return res.status(400).json({ 
                success: false, 
                message: 'Price quote has expired' 
            });
        }

        // Update booking
        booking.customerResponse = {
            status: 'accepted',
            respondedAt: new Date(),
            notes: notes,
            ipAddress: req.ip
        };
        
        booking.pricingStatus = 'accepted';
        booking.status = 'booking_confirmed';
        booking.dates.confirmed = new Date();
        
        // Generate tracking number
        let trackingNumber;
        try {
            trackingNumber = await generateTrackingNumber();
            console.log('4. Tracking number generated:', trackingNumber);
        } catch (tnError) {
            console.error('Tracking number error:', tnError);
            trackingNumber = `TRK${Date.now()}${Math.floor(Math.random() * 1000)}`;
        }
        
        booking.trackingNumber = trackingNumber;
        
        booking.addTimelineEntry(
            'booking_confirmed',
            `Customer accepted quote. Booking confirmed. Tracking: ${trackingNumber}`,
            req.user._id
        );

        await booking.save();
        console.log('5. Booking saved successfully');

        // ===== STEP 1: CREATE SHIPMENT (COMPLETE DATA) =====
        console.log('6. Creating shipment with complete booking data...');
        
        let shipment = null;
        try {
            const shipmentNumber = await generateShipmentNumber();
            
            // Log booking data for debugging
            console.log('📋 Booking Data Summary:', {
                bookingNumber: booking.bookingNumber,
                shipmentClassification: booking.shipmentClassification,
                shipmentDetails: {
                    origin: booking.shipmentDetails?.origin,
                    destination: booking.shipmentDetails?.destination,
                    shippingMode: booking.shipmentDetails?.shippingMode,
                    totalPackages: booking.shipmentDetails?.totalPackages,
                    totalWeight: booking.shipmentDetails?.totalWeight,
                    totalVolume: booking.shipmentDetails?.totalVolume
                },
                packageCount: booking.shipmentDetails?.packageDetails?.length || 0
            });

            // Prepare packages from booking's packageDetails - সব তথ্য সংরক্ষণ
            const packages = (booking.shipmentDetails?.packageDetails || []).map(item => ({
                description: item.description || '',
                packagingType: item.packagingType || 'carton',
                quantity: item.quantity || 1,
                weight: item.weight || 0,
                volume: item.volume || 0,
                dimensions: {
                    length: item.dimensions?.length || 0,
                    width: item.dimensions?.width || 0,
                    height: item.dimensions?.height || 0,
                    unit: item.dimensions?.unit || 'cm'
                },
                productCategory: item.productCategory || 'Others',
                hsCode: item.hsCode || '',
                value: {
                    amount: item.value?.amount || 0,
                    currency: item.value?.currency || 'USD'
                },
                hazardous: item.hazardous || false,
                temperatureControlled: {
                    required: item.temperatureControlled?.required || false,
                    minTemp: item.temperatureControlled?.minTemp || null,
                    maxTemp: item.temperatureControlled?.maxTemp || null
                },
                condition: 'Good'
            }));

            console.log(`   ✅ Prepared ${packages.length} packages with complete data`);

            // Prepare complete shipment data - Booking-এর সব তথ্য ব্যবহার করে
            const shipmentData = {
                // Required fields
                shipmentNumber: shipmentNumber,
                trackingNumber: trackingNumber,
                bookingId: booking._id,
                customerId: booking.customer._id,
                createdBy: req.user._id,
                
                // Shipment Classification - সম্পূর্ণ Booking থেকে
                shipmentClassification: {
                    mainType: booking.shipmentClassification?.mainType || 'air_freight',
                    subType: booking.shipmentClassification?.subType || 'air_freight'
                },
                
                // Shipment Details - সম্পূর্ণ Booking থেকে
                shipmentDetails: {
                    origin: booking.shipmentDetails?.origin || '',
                    destination: booking.shipmentDetails?.destination || '',
                    shippingMode: booking.shipmentDetails?.shippingMode || 'DDU',
                    totalPackages: booking.shipmentDetails?.totalPackages || packages.length,
                    totalWeight: booking.shipmentDetails?.totalWeight || 0,
                    totalVolume: booking.shipmentDetails?.totalVolume || 0
                },
                
                // Packages - সম্পূর্ণ ডাটা সহ
                packages: packages,
                
                // Sender Information - সম্পূর্ণ Booking থেকে
                sender: {
                    name: booking.sender?.name || '',
                    companyName: booking.sender?.companyName || '',
                    email: booking.sender?.email || '',
                    phone: booking.sender?.phone || '',
                    address: {
                        addressLine1: booking.sender?.address?.addressLine1 || '',
                        addressLine2: booking.sender?.address?.addressLine2 || '',
                        city: booking.sender?.address?.city || '',
                        state: booking.sender?.address?.state || '',
                        country: booking.sender?.address?.country || '',
                        postalCode: booking.sender?.address?.postalCode || ''
                    }
                },
                
                // Receiver Information - সম্পূর্ণ Booking থেকে
                receiver: {
                    name: booking.receiver?.name || '',
                    companyName: booking.receiver?.companyName || '',
                    email: booking.receiver?.email || '',
                    phone: booking.receiver?.phone || '',
                    address: {
                        addressLine1: booking.receiver?.address?.addressLine1 || '',
                        addressLine2: booking.receiver?.address?.addressLine2 || '',
                        city: booking.receiver?.address?.city || '',
                        state: booking.receiver?.address?.state || '',
                        country: booking.receiver?.address?.country || '',
                        postalCode: booking.receiver?.address?.postalCode || ''
                    },
                    isResidential: booking.receiver?.isResidential || false
                },
                
                // Courier Information - সম্পূর্ণ Booking থেকে
                courier: {
                    company: booking.courier?.company || 'Cargo Logistics Group',
                    serviceType: booking.courier?.serviceType || booking.serviceType || 'standard'
                },
                
                // Dates - সম্পূর্ণ Booking থেকে
                dates: {
                    estimatedDeparture: booking.dates?.estimatedDeparture || null,
                    estimatedArrival: booking.dates?.estimatedArrival || null
                },
                
                // Status
                status: 'pending',
                
                // Transport Details - Booking থেকে নেওয়া (যদি থাকে)
                transport: {
                    estimatedDeparture: booking.dates?.estimatedDeparture,
                    estimatedArrival: booking.dates?.estimatedArrival
                },
                
                // Milestones
                milestones: [{
                    status: 'pending',
                    location: booking.sender?.address?.country || 'Warehouse',
                    description: 'Shipment created from confirmed booking',
                    updatedBy: req.user._id,
                    timestamp: new Date()
                }],
                
                // Reference fields
                bookingNumber: booking.bookingNumber,
                serviceType: booking.serviceType
            };

            console.log('   Creating shipment with complete data...');
            
            shipment = await Shipment.create(shipmentData);
            
            console.log('   ✅ Shipment created successfully:', {
                id: shipment._id,
                number: shipment.shipmentNumber,
                tracking: shipment.trackingNumber,
                packages: shipment.packages?.length,
                totalWeight: shipment.shipmentDetails?.totalWeight
            });
            
            // Update booking with shipment ID
            booking.shipmentId = shipment._id;
            await booking.save();
            
            console.log('   ✅ Booking updated with shipment ID');

            // Notify warehouse staff (optional)
            try {
                const warehouseStaff = await User.find({ 
                    role: 'warehouse', 
                    isActive: true 
                });
                
                if (warehouseStaff.length > 0) {
                    await sendEmail({
                        to: warehouseStaff.map(w => w.email),
                        subject: '📦 New Shipment Ready for Warehouse Processing',
                        template: 'new-shipment-warehouse',
                        data: {
                            trackingNumber: trackingNumber,
                            customerName: booking.sender?.name || 'Customer',
                            origin: booking.shipmentDetails?.origin || 'N/A',
                            destination: booking.shipmentDetails?.destination || 'N/A',
                            packages: packages.length,
                            totalWeight: booking.shipmentDetails?.totalWeight || 0,
                            totalVolume: booking.shipmentDetails?.totalVolume || 0,
                            shipmentType: booking.shipmentClassification?.mainType || 'N/A',
                            bookingNumber: booking.bookingNumber,
                            expectedDate: new Date(booking.dates?.estimatedArrival || Date.now()).toLocaleDateString(),
                            shipmentUrl: `${process.env.FRONTEND_URL}/warehouse/shipments/${shipment._id}`
                        }
                    }).catch(err => console.log('   ⚠️ Warehouse email error:', err.message));
                }
            } catch (staffError) {
                console.log('   ⚠️ Error notifying warehouse staff:', staffError.message);
            }

        } catch (shipmentError) {
            console.error('❌ Shipment creation error:', shipmentError);
            
            if (shipmentError.name === 'ValidationError') {
                console.error('   Validation errors:');
                Object.keys(shipmentError.errors).forEach(key => {
                    console.error(`   - ${key}: ${shipmentError.errors[key].message}`);
                    console.error(`     Value:`, shipmentError.errors[key].value);
                });
            }
            
            if (shipmentError.code === 11000) {
                console.error('   Duplicate key error:', shipmentError.keyValue);
            }
        }

        // ===== STEP 2: CREATE INVOICE (আগের মতই) =====
        console.log('7. Creating invoice...');

        let invoice = null;
        try {
            const breakdown = booking.quotedPrice?.breakdown || {};
            
            const charges = [];
            
            const chargeMappings = [
                { field: 'baseRate', description: 'Base shipping rate', type: 'Freight Cost' },
                { field: 'weightCharge', description: 'Weight-based charge', type: 'Weight Charge' },
                { field: 'fuelSurcharge', description: 'Fuel surcharge', type: 'Fuel Surcharge' },
                { field: 'residentialSurcharge', description: 'Residential delivery surcharge', type: 'Residential Surcharge' },
                { field: 'insurance', description: 'Cargo insurance', type: 'Insurance' },
                { field: 'tax', description: 'Tax/VAT', type: 'Tax' },
                { field: 'otherCharges', description: 'Other miscellaneous charges', type: 'Other' }
            ];

            chargeMappings.forEach(mapping => {
                if (breakdown[mapping.field] && breakdown[mapping.field] > 0) {
                    charges.push({
                        description: mapping.description,
                        type: mapping.type,
                        amount: breakdown[mapping.field],
                        currency: booking.quotedPrice?.currency || 'USD'
                    });
                }
            });

            if (charges.length === 0 && booking.quotedPrice?.amount) {
                charges.push({
                    description: 'Total shipping cost including all services',
                    type: 'Freight Cost',
                    amount: booking.quotedPrice.amount,
                    currency: booking.quotedPrice.currency || 'USD'
                });
            }

            const subtotal = charges.reduce((sum, charge) => sum + charge.amount, 0);

            const invoiceData = {
                bookingId: booking._id,
                shipmentId: shipment?._id,
                customerId: booking.customer._id,
                
                customerInfo: {
                    companyName: booking.sender?.companyName || '',
                    contactPerson: booking.sender?.name || '',
                    email: booking.sender?.email,
                    phone: booking.sender?.phone || '',
                    address: booking.sender?.address?.addressLine1 || ''
                },
                
                invoiceDate: new Date(),
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                
                charges: charges,
                subtotal: subtotal,
                totalAmount: subtotal,
                
                currency: booking.quotedPrice?.currency || 'USD',
                paymentStatus: 'pending',
                status: 'draft',
                paymentTerms: 'Due within 30 days',
                
                createdBy: req.user._id
            };

            invoice = await Invoice.create(invoiceData);
            
            booking.invoiceId = invoice._id;
            await booking.save();
            
            console.log('   ✅ Invoice created:', {
                id: invoice._id,
                number: invoice.invoiceNumber,
                amount: invoice.totalAmount
            });

        } catch (invoiceError) {
            console.error('❌ Invoice creation error:', invoiceError.message);
        }

        // ===== STEP 3: Send Emails (আগের মতই) =====
        console.log('8. Sending confirmation emails...');

        // Customer Email
        if (booking.sender?.email) {
            await sendEmail({
                to: booking.sender.email,
                subject: '🎉 Booking Confirmed! - Cargo Logistics',
                template: 'booking-confirmed-customer',
                data: {
                    customerName: booking.sender?.name || 'Customer',
                    bookingNumber: booking.bookingNumber,
                    trackingNumber: trackingNumber,
                    quotedAmount: booking.quotedPrice?.amount || 0,
                    currency: booking.quotedPrice?.currency || 'USD',
                    trackingUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tracking/${trackingNumber}`,
                    invoiceUrl: `${process.env.FRONTEND_URL}/customer/invoices/${invoice?._id || ''}`,
                    invoiceNumber: invoice?.invoiceNumber || 'N/A',
                    dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`,
                    origin: booking.shipmentDetails?.origin || 'N/A',
                    destination: booking.shipmentDetails?.destination || 'N/A',
                    estimatedDelivery: booking.dates?.estimatedArrival ? 
                        new Date(booking.dates.estimatedArrival).toLocaleDateString() : 
                        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()
                }
            }).catch(err => console.log('Customer email error:', err.message));
        }

        // Receiver Email
        if (booking.receiver?.email) {
            try {
                await sendEmail({
                    to: booking.receiver.email,
                    subject: '📦 Your Shipment is Confirmed - Cargo Logistics',
                    template: 'receiver-shipment-confirmed',
                    data: {
                        receiverName: booking.receiver.name || 'Valued Customer',
                        receiverCompany: booking.receiver.companyName || '',
                        senderName: booking.sender?.name || 'Our Customer',
                        senderCompany: booking.sender?.companyName || '',
                        senderCountry: booking.sender?.address?.country || 'Unknown',
                        bookingNumber: booking.bookingNumber,
                        trackingNumber: trackingNumber,
                        origin: booking.shipmentDetails?.origin || 'Origin',
                        destination: booking.shipmentDetails?.destination || 'Destination',
                        totalPackages: booking.shipmentDetails?.totalPackages || 0,
                        totalWeight: booking.shipmentDetails?.totalWeight || 0,
                        estimatedDelivery: booking.dates?.estimatedArrival ? 
                            new Date(booking.dates.estimatedArrival).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            }) : 
                            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            }),
                        trackingUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tracking/${trackingNumber}`,
                        supportEmail: process.env.SUPPORT_EMAIL || 'support@cargologistics.com'
                    }
                });
                console.log('✅ Receiver email sent successfully to:', booking.receiver.email);
            } catch (emailError) {
                console.error('❌ Failed to send receiver email:', emailError.message);
            }
        }

        // Admin Emails
        const admins = await User.find({ role: 'admin', isActive: true });
        let allRecipients = admins.map(a => a.email);
        
        if (process.env.SMTP_USER) {
            allRecipients.push(process.env.SMTP_USER);
        }
        
        allRecipients = [...new Set(allRecipients)];

        if (allRecipients.length > 0) {
            await sendEmail({
                to: allRecipients,
                subject: '✅ Booking Confirmed - Action Required',
                template: 'booking-confirmed-admin',
                data: {
                    bookingNumber: booking.bookingNumber,
                    customerName: booking.sender?.name || 'Customer',
                    trackingNumber: trackingNumber,
                    origin: booking.shipmentDetails?.origin || 'N/A',
                    destination: booking.shipmentDetails?.destination || 'N/A',
                    shipmentUrl: `${process.env.FRONTEND_URL}/admin/shipments/${shipment?._id || ''}`,
                    invoiceUrl: `${process.env.FRONTEND_URL}/admin/invoices/${invoice?._id || ''}`,
                    invoiceNumber: invoice?.invoiceNumber || 'N/A'
                }
            }).catch(err => console.log('Admin email error:', err.message));
            
            console.log('✅ Booking confirmation email sent to:', allRecipients);
        }

        console.log('9. ✅ Accept quote completed successfully');
        
        res.status(200).json({
            success: true,
            message: 'Booking confirmed successfully. Shipment and invoice created.',
            data: {
                booking: {
                    _id: booking._id,
                    bookingNumber: booking.bookingNumber,
                    status: booking.status,
                    trackingNumber: booking.trackingNumber,
                    shipmentId: booking.shipmentId,
                    invoiceId: booking.invoiceId
                },
                shipment: shipment ? {
                    _id: shipment._id,
                    shipmentNumber: shipment.shipmentNumber,
                    trackingNumber: shipment.trackingNumber,
                    status: shipment.status
                } : null,
                invoice: invoice ? {
                    _id: invoice._id,
                    invoiceNumber: invoice.invoiceNumber,
                    totalAmount: invoice.totalAmount,
                    currency: invoice.currency
                } : null
            }
        });

    } catch (error) {
        console.error('❌ FATAL ERROR:', error);
        console.error('Error stack:', error.stack);
        
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 6. REJECT QUOTE (Customer) ==========
exports.rejectQuote = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const booking = await Booking.findById(id)
            .populate('customer', 'email firstName lastName companyName');

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        if (booking.customer._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
            });
        }

        if (booking.pricingStatus !== 'quoted') {
            return res.status(400).json({ 
                success: false, 
                message: 'No active price quote found' 
            });
        }

        booking.customerResponse = {
            status: 'rejected',
            respondedAt: new Date(),
            notes: reason,
            ipAddress: req.ip
        };
        
        booking.pricingStatus = 'rejected';
        booking.status = 'rejected';
        
        booking.addTimelineEntry(
            'rejected',
            `Customer rejected quote. Reason: ${reason || 'Not specified'}`,
            req.user._id
        );

        await booking.save();

        // Get all active admin users
const admins = await User.find({ role: 'admin', isActive: true });

// Prepare recipients - combine admin emails with SMTP email
let allRecipients = admins.map(admin => admin.email);

// Add SMTP email (support@cargologisticscompany.com)
if (process.env.SMTP_USER) {
    allRecipients.push(process.env.SMTP_USER);
}

// Remove duplicates
allRecipients = [...new Set(allRecipients)];

if (allRecipients.length > 0) {
    await sendEmail({
        to: allRecipients,  // অ্যাডমিন + SMTP ইমেইল
        subject: '❌ Quote Rejected by Customer',
        template: 'quote-rejected',
        data: {
            bookingNumber: booking.bookingNumber,
            customerName: booking.sender?.name || 'Customer',
            reason: reason || 'No reason provided',
            dashboardUrl: `${process.env.FRONTEND_URL}/admin/bookings/${booking._id}`
        }
    }).catch(err => console.log('Quote rejection email error:', err.message));
    
    console.log('✅ Quote rejection email sent to:', allRecipients);
}

        if (booking.sender?.email) {
            await sendEmail({
                to: booking.sender.email,
                subject: 'Quote Rejection Confirmed',
                template: 'booking-rejected-customer',
                data: {
                    bookingNumber: booking.bookingNumber,
                    customerName: booking.sender?.name,
                    reason: reason || 'No reason provided',
                    dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`,
                    supportEmail: process.env.SUPPORT_EMAIL
                }
            });
        }

        res.status(200).json({
            success: true,
            message: 'Quote rejected successfully',
            data: {
                bookingNumber: booking.bookingNumber,
                status: booking.status
            }
        });

    } catch (error) {
        console.error('Reject quote error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 7. CANCEL BOOKING ==========
exports.cancelBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const booking = await Booking.findById(id)
            .populate('customer', 'email firstName lastName companyName');

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        if (req.user.role === 'customer' && booking.customer._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
            });
        }

        if (booking.status === 'booking_confirmed') {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot cancel confirmed booking. Please contact support.' 
            });
        }

        booking.status = 'cancelled';
        booking.dates.cancelled = new Date();
        booking.cancellationReason = reason;
        
        booking.addTimelineEntry(
            'cancelled',
            `Booking cancelled. Reason: ${reason || 'Not specified'}`,
            req.user._id
        );

        await booking.save();

        if (req.user.role === 'customer') {
            const admins = await User.find({ role: 'admin', isActive: true });
            
            if (admins.length > 0) {
                await sendEmail({
                    to: admins.map(a => a.email),
                    subject: '🚫 Booking Cancelled by Customer',
                    template: 'booking-cancelled',
                    data: {
                        bookingNumber: booking.bookingNumber,
                        customerName: booking.sender?.name || 'Customer',
                        reason: reason || 'No reason provided',
                        dashboardUrl: `${process.env.FRONTEND_URL}/admin/bookings/${booking._id}`
                    }
                });
            }

            if (booking.sender?.email) {
                await sendEmail({
                    to: booking.sender.email,
                    subject: 'Your Booking Has Been Cancelled',
                    template: 'booking-cancelled-customer',
                    data: {
                        bookingNumber: booking.bookingNumber,
                        customerName: booking.sender?.name,
                        reason: reason || 'No reason provided',
                        dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`,
                        supportEmail: process.env.SUPPORT_EMAIL
                    }
                });
            }
        }

        res.status(200).json({
            success: true,
            message: 'Booking cancelled successfully',
            data: {
                bookingNumber: booking.bookingNumber,
                status: booking.status
            }
        });

    } catch (error) {
        console.error('Cancel booking error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========== 8. GET MY BOOKINGS (Customer) ==========
exports.getMyBookings = async (req, res) => {
    try {
        const { status, page = 1, limit = 10, sort = '-createdAt' } = req.query;

        let query = { customer: req.user._id };
        if (status) query.status = status;

        const total = await Booking.countDocuments(query);

        const bookings = await Booking.find(query)
            .populate('quotedPrice.quotedBy', 'firstName lastName')
            .populate('shipmentId', 'trackingNumber status')
            .populate('invoiceId', 'invoiceNumber totalAmount paymentStatus')
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const summary = {
            total: total,
            activeBookings: await Booking.countDocuments({ 
                customer: req.user._id,
                status: { $in: ['booking_requested', 'price_quoted', 'booking_confirmed'] }
            }),
            completedBookings: await Booking.countDocuments({ 
                customer: req.user._id,
                status: 'delivered' 
            }),
            pendingQuotes: await Booking.countDocuments({ 
                customer: req.user._id,
                pricingStatus: 'quoted',
                customerResponse: { $ne: 'accepted' }
            }),
            totalSpent: await calculateCustomerTotalSpent(req.user._id)
        };

        res.status(200).json({
            success: true,
            summary,
            data: bookings,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Get my bookings error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 9. GET MY BOOKING BY ID (Customer) ==========
exports.getMyBookingById = async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findOne({
            _id: id,
            customer: req.user._id
        })
        .populate('quotedPrice.quotedBy', 'firstName lastName')
        .populate('shipmentId')
        .populate('invoiceId')
        .populate('timeline.updatedBy', 'firstName lastName role');

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        const daysSinceBooking = Math.floor(
            (Date.now() - new Date(booking.createdAt)) / (1000 * 60 * 60 * 24)
        );

        const isQuoteValid = booking.isQuoteValid ? booking.isQuoteValid() : false;

        res.status(200).json({
            success: true,
            data: {
                booking,
                additionalInfo: {
                    daysSinceBooking,
                    isQuoteValid,
                    canAccept: booking.pricingStatus === 'quoted' && isQuoteValid,
                    canCancel: ['booking_requested', 'price_quoted'].includes(booking.status)
                }
            }
        });

    } catch (error) {
        console.error('Get my booking by id error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 10. GET MY BOOKING TIMELINE ==========
exports.getMyBookingTimeline = async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findOne({
            _id: id,
            customer: req.user._id
        })
        .select('bookingNumber status timeline createdAt updatedAt');

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        const timeline = booking.timeline.map(entry => ({
            status: entry.status,
            description: entry.description,
            date: entry.timestamp,
            formattedDate: new Date(entry.timestamp).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short'
            })
        }));

        res.status(200).json({
            success: true,
            data: {
                bookingNumber: booking.bookingNumber,
                currentStatus: booking.status,
                timeline: timeline.sort((a, b) => b.date - a.date)
            }
        });

    } catch (error) {
        console.error('Get booking timeline error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 11. GET MY BOOKING INVOICE ==========
exports.getMyBookingInvoice = async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findOne({
            _id: id,
            customer: req.user._id
        }).populate({
            path: 'invoiceId',
            select: 'invoiceNumber totalAmount currency paymentStatus dueDate createdAt charges'
        });

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        if (!booking.invoiceId) {
            return res.status(404).json({ 
                success: false, 
                message: 'No invoice found for this booking' 
            });
        }

        res.status(200).json({
            success: true,
            data: booking.invoiceId
        });

    } catch (error) {
        console.error('Get booking invoice error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 12. GET BOOKING QUOTE DETAILS ==========
exports.getMyBookingQuote = async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findOne({
            _id: id,
            customer: req.user._id
        })
        .populate('quotedPrice.quotedBy', 'firstName lastName email')
        .select('bookingNumber quotedPrice pricingStatus customerResponse');

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        if (!booking.quotedPrice || booking.pricingStatus === 'pending') {
            return res.status(404).json({ 
                success: false, 
                message: 'Quote not yet available for this booking' 
            });
        }

        const isValid = booking.isQuoteValid ? booking.isQuoteValid() : 
            (booking.quotedPrice.validUntil && new Date() <= booking.quotedPrice.validUntil);

        res.status(200).json({
            success: true,
            data: {
                bookingNumber: booking.bookingNumber,
                pricingStatus: booking.pricingStatus,
                quotedPrice: booking.quotedPrice,
                customerResponse: booking.customerResponse,
                isValid,
                timeRemaining: isValid ? 
                    Math.floor((booking.quotedPrice.validUntil - Date.now()) / (1000 * 60 * 60 * 24)) : 0
            }
        });

    } catch (error) {
        console.error('Get booking quote error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 13. GET MY BOOKINGS SUMMARY (Dashboard) ==========
exports.getMyBookingsSummary = async (req, res) => {
    try {
        const userId = req.user._id;

        const recentBookings = await Booking.find({ customer: userId })
            .sort('-createdAt')
            .limit(5)
            .select('bookingNumber status createdAt shipmentDetails.totalPackages sender receiver');

        const statusCounts = await Booking.aggregate([
            { $match: { customer: userId } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const pendingQuote = await Booking.findOne({
            customer: userId,
            pricingStatus: 'quoted',
            customerResponse: { $ne: 'accepted' }
        })
        .sort('-quotedPrice.quotedAt')
        .select('bookingNumber quotedPrice');

        const activeShipment = await Booking.findOne({
            customer: userId,
            status: 'booking_confirmed',
            shipmentId: { $ne: null }
        })
        .populate('shipmentId', 'trackingNumber status currentLocation')
        .sort('-confirmedAt');

        const statusSummary = {
            total: 0,
            requested: 0,
            quoted: 0,
            confirmed: 0,
            delivered: 0,
            cancelled: 0
        };

        statusCounts.forEach(item => {
            statusSummary.total += item.count;
            if (item._id === 'booking_requested') statusSummary.requested = item.count;
            if (item._id === 'price_quoted') statusSummary.quoted = item.count;
            if (item._id === 'booking_confirmed') statusSummary.confirmed = item.count;
            if (item._id === 'delivered') statusSummary.delivered = item.count;
            if (item._id === 'cancelled') statusSummary.cancelled = item.count;
        });

        res.status(200).json({
            success: true,
            data: {
                summary: statusSummary,
                recentBookings,
                pendingQuote: pendingQuote || null,
                activeShipment: activeShipment || null
            }
        });

    } catch (error) {
        console.error('Get bookings summary error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};
// ========== 1. GET ALL INVOICES (Admin Only) ==========
exports.getAllInvoices = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status, 
            paymentStatus,
            customerId,
            startDate,
            endDate,
            sort = '-createdAt' 
        } = req.query;

        // Build filter query
        let filter = {};
        
        if (status) filter.status = status;
        if (paymentStatus) filter.paymentStatus = paymentStatus;
        if (customerId) filter.customerId = customerId;
        
        // Date range filter
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // Get total count
        const total = await Invoice.countDocuments(filter);

        // Get invoices with pagination
        const invoices = await Invoice.find(filter)
            .populate('customerId', 'firstName lastName companyName email phone')
            .populate('bookingId', 'bookingNumber')
            .populate('createdBy', 'firstName lastName')
            .populate('updatedBy', 'firstName lastName')
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        // Calculate summary
        const summary = await Invoice.aggregate([
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$totalAmount' },
                    paidAmount: {
                        $sum: {
                            $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0]
                        }
                    },
                    pendingAmount: {
                        $sum: {
                            $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$totalAmount', 0]
                        }
                    },
                    overdueAmount: {
                        $sum: {
                            $cond: [{ $eq: ['$paymentStatus', 'overdue'] }, '$totalAmount', 0]
                        }
                    },
                    count: { $sum: 1 },
                    paidCount: {
                        $sum: {
                            $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0]
                        }
                    },
                    pendingCount: {
                        $sum: {
                            $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0]
                        }
                    },
                    overdueCount: {
                        $sum: {
                            $cond: [{ $eq: ['$paymentStatus', 'overdue'] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: invoices,
            summary: summary[0] || {
                totalAmount: 0,
                paidAmount: 0,
                pendingAmount: 0,
                overdueAmount: 0,
                count: 0,
                paidCount: 0,
                pendingCount: 0,
                overdueCount: 0
            },
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Get all invoices error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 2. GET INVOICE BY ID ==========
exports.getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;

        const invoice = await Invoice.findById(id)
            .populate('customerId', 'firstName lastName companyName email phone address')
            .populate('bookingId')
            .populate('shipmentId')
            .populate('createdBy', 'firstName lastName email')
            .populate('updatedBy', 'firstName lastName email');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Check permission (customer can only see their own)
        if (req.user.role === 'customer' && invoice.customerId._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only view your own invoices.'
            });
        }

        res.status(200).json({
            success: true,
            data: invoice
        });

    } catch (error) {
        console.error('Get invoice by id error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 3. GET INVOICES BY CUSTOMER ==========
// backend/controllers/invoiceController.js

exports.getInvoicesByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    
    let query = {};
    
    // চেক করুন customerId MongoDB ObjectId কিনা
    const isValidObjectId = mongoose.Types.ObjectId.isValid(customerId);
    
    if (isValidObjectId) {
      // যদি ObjectId হয়, তাহলে ObjectId হিসেবে ব্যবহার করুন
      query.customerId = customerId;
    } else {
      // যদি স্ট্রিং হয়, তাহলে স্ট্রিং হিসেবে ব্যবহার করুন
      // অথবা অন্য কোন ফিল্ডে খুঁজুন (যেমন: customerCode, customerNumber)
      query.$or = [
        { customerCode: customerId },
        { customerNumber: customerId },
        { 'customerInfo.customerId': customerId }
      ];
    }
    
    if (status) {
      query.status = status;
    }
    
    const invoices = await Invoice.find(query)
      .populate('customerId', 'name email companyName')
      .populate('bookingId')
      .populate('shipmentId')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Invoice.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get invoices by customer error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ========== 4. UPDATE INVOICE ==========
exports.updateInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Check if invoice exists
        const invoice = await Invoice.findById(id);
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Remove fields that shouldn't be updated directly
        delete updateData._id;
        delete updateData.invoiceNumber;
        delete updateData.createdAt;
        delete updateData.createdBy;

        // Recalculate totals if charges updated
        if (updateData.charges) {
            const { subtotal, taxAmount, totalAmount } = calculateTotals(
                updateData.charges,
                updateData.taxRate || invoice.taxRate,
                updateData.discountAmount || invoice.discountAmount
            );
            updateData.subtotal = subtotal;
            updateData.taxAmount = taxAmount;
            updateData.totalAmount = totalAmount;
        }

        updateData.updatedBy = req.user._id;
        updateData.updatedAt = new Date();

        const updatedInvoice = await Invoice.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).populate('customerId', 'firstName lastName companyName email');

        res.status(200).json({
            success: true,
            message: 'Invoice updated successfully',
            data: updatedInvoice
        });

    } catch (error) {
        console.error('Update invoice error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 5. DELETE INVOICE ==========
exports.deleteInvoice = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if invoice exists
        const invoice = await Invoice.findById(id);
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Check if invoice can be deleted (only draft or cancelled)
        if (!['draft', 'cancelled'].includes(invoice.status)) {
            return res.status(400).json({
                success: false,
                message: 'Only draft or cancelled invoices can be deleted'
            });
        }

        // Remove reference from booking
        await Booking.findByIdAndUpdate(invoice.bookingId, {
            $unset: { invoiceId: 1 }
        });

        // Delete invoice
        await Invoice.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Invoice deleted successfully'
        });

    } catch (error) {
        console.error('Delete invoice error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 6. MARK INVOICE AS PAID ==========
exports.markAsPaid = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentMethod, paymentReference, notes } = req.body;

        const invoice = await Invoice.findById(id);
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        if (invoice.paymentStatus === 'paid') {
            return res.status(400).json({
                success: false,
                message: 'Invoice is already marked as paid'
            });
        }

        invoice.markAsPaid(paymentMethod, paymentReference, req.user._id);
        
        if (notes) {
            invoice.notes = notes;
        }

        await invoice.save();

        // Send email notification to customer
        try {
            const customer = await User.findById(invoice.customerId);
            if (customer?.email) {
                await sendEmail({
                    to: customer.email,
                    subject: '✅ Payment Received - Invoice ' + invoice.invoiceNumber,
                    template: 'payment-received',
                    data: {
                        customerName: customer.firstName || 'Customer',
                        invoiceNumber: invoice.invoiceNumber,
                        amount: invoice.totalAmount,
                        currency: invoice.currency,
                        paymentDate: new Date().toLocaleDateString(),
                        invoiceUrl: `${process.env.FRONTEND_URL}/customer/invoices/${invoice._id}`
                    }
                });
            }
        } catch (emailError) {
            console.error('Payment email error:', emailError);
        }

        res.status(200).json({
            success: true,
            message: 'Invoice marked as paid',
            data: invoice
        });

    } catch (error) {
        console.error('Mark as paid error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 7. SEND INVOICE EMAIL ==========
exports.sendInvoiceEmail = async (req, res) => {
    try {
        const { id } = req.params;
        const { email, message } = req.body;

        const invoice = await Invoice.findById(id)
            .populate('customerId', 'firstName lastName email companyName');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        const recipientEmail = email || invoice.customerId?.email;
        
        if (!recipientEmail) {
            return res.status(400).json({
                success: false,
                message: 'No email address provided or found'
            });
        }

        // Send email
        await sendEmail({
            to: recipientEmail,
            subject: `🧾 Invoice ${invoice.invoiceNumber} from Cargo Logistics`,
            template: 'invoice-email',
            data: {
                customerName: invoice.customerId?.firstName || 'Customer',
                invoiceNumber: invoice.invoiceNumber,
                amount: invoice.totalAmount,
                currency: invoice.currency,
                dueDate: invoice.dueDate,
                invoiceUrl: `${process.env.FRONTEND_URL}/invoices/${invoice._id}`,
                pdfUrl: invoice.pdfUrl,
                message: message || 'Please find your invoice attached.',
                companyName: 'Cargo Logistics'
            }
        });

        // Update invoice
        invoice.emailSent = true;
        invoice.emailSentAt = new Date();
        invoice.emailedTo = invoice.emailedTo || [];
        invoice.emailedTo.push(recipientEmail);
        invoice.status = 'sent';
        await invoice.save();

        res.status(200).json({
            success: true,
            message: 'Invoice email sent successfully'
        });

    } catch (error) {
        console.error('Send invoice email error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 8. GET INVOICE STATS (Admin Dashboard) ==========
exports.getInvoiceStats = async (req, res) => {
    try {
        const stats = await Invoice.aggregate([
            {
                $facet: {
                    // Status breakdown
                    statusBreakdown: [
                        {
                            $group: {
                                _id: '$paymentStatus',
                                count: { $sum: 1 },
                                total: { $sum: '$totalAmount' }
                            }
                        }
                    ],
                    
                    // Monthly revenue
                    monthlyRevenue: [
                        {
                            $match: {
                                paymentStatus: 'paid',
                                paymentDate: { $exists: true }
                            }
                        },
                        {
                            $group: {
                                _id: {
                                    year: { $year: '$paymentDate' },
                                    month: { $month: '$paymentDate' }
                                },
                                total: { $sum: '$totalAmount' },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { '_id.year': -1, '_id.month': -1 } },
                        { $limit: 12 }
                    ],
                    
                    // Overdue invoices
                    overdueInvoices: [
                        {
                            $match: {
                                paymentStatus: 'pending',
                                dueDate: { $lt: new Date() }
                            }
                        },
                        {
                            $count: 'count'
                        }
                    ],
                    
                    // Total statistics
                    totals: [
                        {
                            $group: {
                                _id: null,
                                totalInvoices: { $sum: 1 },
                                totalAmount: { $sum: '$totalAmount' },
                                paidAmount: {
                                    $sum: {
                                        $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0]
                                    }
                                },
                                pendingAmount: {
                                    $sum: {
                                        $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$totalAmount', 0]
                                    }
                                },
                                overdueAmount: {
                                    $sum: {
                                        $cond: [{ $eq: ['$paymentStatus', 'overdue'] }, '$totalAmount', 0]
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                statusBreakdown: stats[0].statusBreakdown,
                monthlyRevenue: stats[0].monthlyRevenue,
                overdueCount: stats[0].overdueInvoices[0]?.count || 0,
                totals: stats[0].totals[0] || {
                    totalInvoices: 0,
                    totalAmount: 0,
                    paidAmount: 0,
                    pendingAmount: 0,
                    overdueAmount: 0
                }
            }
        });

    } catch (error) {
        console.error('Get invoice stats error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 9. GENERATE INVOICE PDF ==========
exports.generateInvoicePDF = async (req, res) => {
    try {
        const { id } = req.params;

        const invoice = await Invoice.findById(id)
            .populate('customerId', 'firstName lastName companyName email phone address')
            .populate('bookingId', 'bookingNumber sender receiver shipmentDetails');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Generate PDF URL (implement with PDF library)
        const pdfUrl = await generateInvoicePDF(invoice);

        // Update invoice with PDF URL
        invoice.pdfUrl = pdfUrl;
        await invoice.save();

        res.status(200).json({
            success: true,
            data: { pdfUrl }
        });

    } catch (error) {
        console.error('Generate PDF error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 10. BULK UPDATE INVOICES ==========
exports.bulkUpdateInvoices = async (req, res) => {
    try {
        const { invoiceIds, updateData } = req.body;

        if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide invoice IDs array'
            });
        }

        // Remove fields that shouldn't be bulk updated
        delete updateData._id;
        delete updateData.invoiceNumber;
        delete updateData.createdAt;
        delete updateData.createdBy;

        updateData.updatedBy = req.user._id;
        updateData.updatedAt = new Date();

        const result = await Invoice.updateMany(
            { _id: { $in: invoiceIds } },
            { $set: updateData },
            { runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: `Updated ${result.modifiedCount} invoices successfully`,
            data: result
        });

    } catch (error) {
        console.error('Bulk update error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 11. GET RECENT INVOICES ==========
exports.getRecentInvoices = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const invoices = await Invoice.find()
            .populate('customerId', 'firstName lastName companyName')
            .populate('bookingId', 'bookingNumber')
            .sort('-createdAt')
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: invoices
        });

    } catch (error) {
        console.error('Get recent invoices error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 12. GET INVOICE BY BOOKING ID ==========
exports.getInvoiceByBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const invoice = await Invoice.findOne({ bookingId })
            .populate('customerId', 'firstName lastName companyName email')
            .populate('bookingId');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'No invoice found for this booking'
            });
        }

        res.status(200).json({
            success: true,
            data: invoice
        });

    } catch (error) {
        console.error('Get invoice by booking error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 13. GET INVOICE BY SHIPMENT ID ==========
exports.getInvoiceByShipment = async (req, res) => {
    try {
        const { shipmentId } = req.params;

        const invoice = await Invoice.findOne({ shipmentId })
            .populate('customerId', 'firstName lastName companyName email')
            .populate('bookingId');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'No invoice found for this shipment'
            });
        }

        res.status(200).json({
            success: true,
            data: invoice
        });

    } catch (error) {
        console.error('Get invoice by shipment error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// Helper function to calculate totals
const calculateTotals = (charges, taxRate, discountAmount) => {
    const subtotal = charges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount - (discountAmount || 0);
    
    return { subtotal, taxAmount, totalAmount };
};
// ========== 14. TRACK BY NUMBER (Public) ==========
// controllers/trackingController.js

exports.trackByNumber = async (req, res) => {
    try {
        const { trackingNumber } = req.params;

        console.log('🔍 Searching for tracking number:', trackingNumber);

        // ===== 1. প্রথমে Shipment-এ খুঁজুন =====
        let shipment = await Shipment.findOne({ trackingNumber })
            .populate({
                path: 'bookingId',
                select: 'bookingNumber sender receiver payment shipmentClassification courier'
            })
            .populate('customerId', 'companyName firstName lastName email phone')
            .populate('consolidationId')
            .lean();

        // ===== 2. Shipment না পেলে Booking-এ খুঁজুন =====
        if (!shipment) {
            console.log('📦 Not found in Shipment, trying Booking...');
            
            const booking = await Booking.findOne({ trackingNumber })
                .populate('customer', 'companyName firstName lastName email phone')
                .populate('shipmentId')
                .lean();

            if (booking) {
                // Booking থেকে shipment বানান
                shipment = {
                    ...booking,
                    shipmentNumber: booking.bookingNumber,
                    customerId: booking.customer,
                    packages: booking.shipmentDetails?.packageDetails || [],
                    milestones: booking.timeline || []
                };
            }
        }

        if (!shipment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Tracking number not found' 
            });
        }

        // ===== 3. প্যাকেজ ডিটেইলস ক্যালকুলেট =====
        let totalPackages = 0;
        let totalWeight = 0;
        let totalVolume = 0;
        let packageDetails = [];

        // Shipment থেকে packages নিন
        if (shipment.packages && shipment.packages.length > 0) {
            shipment.packages.forEach((pkg, index) => {
                const quantity = pkg.quantity || 1;
                totalPackages += quantity;
                totalWeight += (pkg.weight || 0) * quantity;
                totalVolume += (pkg.volume || 0) * quantity;
                
                packageDetails.push({
                    id: index + 1,
                    description: pkg.description || 'N/A',
                    type: pkg.packagingType || 'Carton',
                    quantity: quantity,
                    weight: pkg.weight || 0,
                    volume: pkg.volume || 0,
                    dimensions: pkg.dimensions ? 
                        `${pkg.dimensions.length} × ${pkg.dimensions.width} × ${pkg.dimensions.height} ${pkg.dimensions.unit || 'cm'}` : 
                        'N/A',
                    productCategory: pkg.productCategory || 'General',
                    hazardous: pkg.hazardous ? 'Yes' : 'No',
                    temperatureControlled: pkg.temperatureControlled?.required ? 'Yes' : 'No',
                    condition: pkg.condition || 'Good'
                });
            });
        } 
        // Booking থেকে packageDetails নিন
        else if (shipment.shipmentDetails?.packageDetails) {
            shipment.shipmentDetails.packageDetails.forEach((pkg, index) => {
                const quantity = pkg.quantity || 1;
                totalPackages += quantity;
                totalWeight += (pkg.weight || 0) * quantity;
                totalVolume += (pkg.volume || 0) * quantity;
                
                packageDetails.push({
                    id: index + 1,
                    description: pkg.description || 'N/A',
                    type: pkg.packagingType || 'Carton',
                    quantity: quantity,
                    weight: pkg.weight || 0,
                    volume: pkg.volume || 0,
                    dimensions: pkg.dimensions ? 
                        `${pkg.dimensions.length} × ${pkg.dimensions.width} × ${pkg.dimensions.height} ${pkg.dimensions.unit || 'cm'}` : 
                        'N/A',
                    productCategory: pkg.productCategory || 'General',
                    hazardous: pkg.hazardous ? 'Yes' : 'No',
                    temperatureControlled: pkg.temperatureControlled?.required ? 'Yes' : 'No'
                });
            });
        }

        // ===== 4. টাইমলাইন তৈরি করুন =====
        const timeline = [];
        
        // Shipment milestones থেকে
        if (shipment.milestones && shipment.milestones.length > 0) {
            shipment.milestones.forEach(entry => {
                timeline.push({
                    status: entry.status,
                    location: entry.location || 'Unknown',
                    description: entry.description || getStatusDescription(entry.status),
                    date: entry.timestamp,
                    formattedDate: new Date(entry.timestamp).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    })
                });
            });
        }
        
        // Booking timeline থেকে
        if (shipment.timeline && shipment.timeline.length > 0) {
            shipment.timeline.forEach(entry => {
                timeline.push({
                    status: entry.status,
                    location: entry.location || 'Unknown',
                    description: entry.description || getStatusDescription(entry.status),
                    date: entry.timestamp,
                    formattedDate: new Date(entry.timestamp).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    })
                });
            });
        }

        // টাইমলাইন সর্ট করুন (নতুন প্রথমে)
        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

        // ===== 5. কনসলিডেশন তথ্য =====
        let consolidationInfo = null;
        if (shipment.consolidationId) {
            const consolidation = shipment.consolidationId;
            consolidationInfo = {
                number: consolidation.consolidationNumber,
                containerNumber: consolidation.containerNumber,
                containerType: consolidation.containerType,
                sealNumber: consolidation.sealNumber,
                originWarehouse: consolidation.originWarehouse,
                destinationPort: consolidation.destinationPort,
                estimatedDeparture: consolidation.estimatedDeparture,
                status: consolidation.status
            };
        }

        // ===== 6. প্রগ্রেস ক্যালকুলেট =====
        const progress = calculateProgress(shipment.status);

        // ===== 7. ফাইনাল ট্র্যাকিং ডেটা =====
        const trackingInfo = {
            // বেসিক তথ্য
            trackingNumber: shipment.trackingNumber,
            shipmentNumber: shipment.shipmentNumber || shipment.bookingNumber,
            bookingNumber: shipment.bookingId?.bookingNumber || shipment.bookingNumber,
            
            // স্ট্যাটাস
            status: shipment.status,
            statusDisplay: formatStatus(shipment.status),
            progress: progress,
            
            // রুট
            origin: shipment.shipmentDetails?.origin || shipment.origin || 'Unknown',
            destination: shipment.shipmentDetails?.destination || shipment.destination || 'Unknown',
            currentLocation: shipment.transport?.currentLocation?.location || 
                            shipment.currentLocation?.location || 
                            timeline[0]?.location || 
                            'Unknown',
            
            // তারিখ
            lastUpdate: timeline.length > 0 ? timeline[0].formattedDate : 'No updates yet',
            estimatedDeparture: shipment.dates?.estimatedDeparture || 
                               shipment.transport?.estimatedDeparture || 
                               shipment.shipmentDetails?.estimatedDeparture,
            estimatedArrival: shipment.dates?.estimatedArrival || 
                             shipment.transport?.estimatedArrival || 
                             shipment.courier?.estimatedDeliveryDate,
            actualDelivery: shipment.dates?.delivered || 
                           shipment.courier?.actualDeliveryDate,
            
            // ===== শিপমেন্ট ডিটেইলস (এখন দেখাবে) =====
            shipmentDetails: {
                totalPackages: totalPackages,
                totalWeight: totalWeight,
                totalVolume: totalVolume,
                shippingMode: shipment.shipmentDetails?.shippingMode || 
                             shipment.shippingMode || 
                             'DDU',
                serviceType: shipment.courier?.serviceType || 
                            shipment.serviceType || 
                            'standard'
            },
            
            // ===== প্যাকেজ ডিটেইলস (এখন দেখাবে) =====
            packages: packageDetails,
            
            // ===== কন্টেইনার তথ্য =====
            container: shipment.containerInfo ? {
                number: shipment.containerInfo.containerNumber,
                type: shipment.containerInfo.containerType,
                seal: shipment.containerInfo.sealNumber
            } : null,
            
            // ===== কনসলিডেশন তথ্য =====
            consolidation: consolidationInfo,
            
            // ===== ট্রান্সপোর্ট তথ্য =====
            transport: shipment.transport ? {
                carrier: shipment.transport.carrierName,
                vessel: shipment.transport.vesselName,
                flight: shipment.transport.flightNumber,
                voyage: shipment.transport.voyageNumber
            } : null,
            
            // ===== সেন্ডার/রিসিভার =====
            sender: shipment.sender || shipment.bookingId?.sender || null,
            receiver: shipment.receiver || shipment.bookingId?.receiver || null,
            
            // ===== কাস্টমার =====
            customer: shipment.customerId ? {
                name: shipment.customerId.companyName || 
                      `${shipment.customerId.firstName || ''} ${shipment.customerId.lastName || ''}`.trim(),
                email: shipment.customerId.email,
                phone: shipment.customerId.phone
            } : null,
            
            // ===== টাইমলাইন =====
            timeline: timeline,
            
            // ===== ডকুমেন্টস =====
            documents: shipment.documents || [],
            
            // ===== কস্ট তথ্য =====
            costs: shipment.costs || []
        };

        res.status(200).json({
            success: true,
            data: trackingInfo
        });

    } catch (error) {
        console.error('❌ Track by number error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ==================== হেল্পার ফাংশন ====================

function calculateProgress(status) {
    const order = [
        'pending',
        'picked_up_from_warehouse',
        'received_at_warehouse',
        'consolidated',
        'departed_port_of_origin',
        'in_transit_sea_freight',
        'arrived_at_destination_port',
        'customs_cleared',
        'out_for_delivery',
        'delivered'
    ];
    
    const index = order.indexOf(status);
    if (index === -1) return 0;
    return Math.round((index / (order.length - 1)) * 100);
}

function formatStatus(status) {
    if (!status) return 'Unknown';
    return status.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function getStatusDescription(status) {
    const descriptions = {
        'pending': 'Shipment created and pending processing',
        'picked_up_from_warehouse': 'Package picked up from warehouse',
        'received_at_warehouse': 'Package received at warehouse',
        'consolidated': 'Shipment consolidated with other cargo',
        'departed_port_of_origin': 'Vessel/flight departed from origin port',
        'in_transit_sea_freight': 'Shipment in transit',
        'arrived_at_destination_port': 'Arrived at destination port',
        'customs_cleared': 'Customs clearance completed',
        'out_for_delivery': 'Out for delivery',
        'delivered': 'Successfully delivered',
        'on_hold': 'Shipment on hold',
        'cancelled': 'Shipment cancelled',
        'returned': 'Shipment returned to sender'
    };
    return descriptions[status] || `Status updated to ${formatStatus(status)}`;
}

// ========== 15. UPDATE DELIVERY STATUS ==========
exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, location, description } = req.body;

        const booking = await Booking.findById(id);

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        booking.updateDeliveryStatus(status, location, req.user._id);

        if (description) {
            booking.addTimelineEntry(
                status,
                description,
                req.user._id,
                { location }
            );
        }

        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Delivery status updated successfully',
            data: {
                currentLocation: booking.currentLocation,
                status: booking.status
            }
        });

    } catch (error) {
        console.error('Update delivery status error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 16. DOWNLOAD BOOKING DOCUMENT ==========
exports.downloadBookingDocument = async (req, res) => {
    try {
        const { id, documentId } = req.params;

        const booking = await Booking.findOne({
            _id: id,
            customer: req.user._id
        });

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        const document = booking.documents?.id(documentId);
        
        if (!document) {
            return res.status(404).json({ 
                success: false, 
                message: 'Document not found' 
            });
        }

        res.status(200).json({
            success: true,
            message: 'Document download will be implemented',
            data: document
        });

    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 17. ADD DOCUMENT TO BOOKING ==========
exports.addDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, url } = req.body;

        const booking = await Booking.findById(id);

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        if (!booking.documents) {
            booking.documents = [];
        }

        booking.documents.push({
            type,
            url,
            uploadedAt: new Date(),
            uploadedBy: req.user._id
        });

        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Document added successfully',
            data: booking.documents
        });

    } catch (error) {
        console.error('Add document error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

module.exports = exports;