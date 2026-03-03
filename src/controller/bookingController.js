// controllers/bookingController.js

const Booking = require('../models/bookingModel');
const Shipment = require('../models/shipmentModel');
const Invoice = require('../models/invoiceModel');
const User = require('../models/userModel');
const { sendEmail } = require('../utils/emailService');
const { generateTrackingNumber } = require('../utils/trackingGenerator');

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
const calculateProgress = (status) => {
    const statusOrder = [
        'booking_requested',
        'price_quoted',
        'booking_confirmed',
        'pending',
        'picked_up_from_warehouse',
        'departed_port_of_origin',
        'in_transit_sea_freight',
        'arrived_at_destination_port',
        'customs_cleared',
        'out_for_delivery',
        'delivered'
    ];

    const index = statusOrder.indexOf(status);
    if (index === -1) return 0;
    return Math.round((index / (statusOrder.length - 1)) * 100);
};

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
                    acceptUrl: `${process.env.FRONTEND_URL}/customer/bookings/${booking._id}/accept`,
                    rejectUrl: `${process.env.FRONTEND_URL}/customer/bookings/${booking._id}/reject`,
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

        // ===== STEP 1: CREATE SHIPMENT =====
        console.log('6. Creating shipment automatically...');
        
        let shipment = null;
        try {
            const shipmentNumber = await generateShipmentNumber();
            
            // Prepare packages from package details
            const packages = (booking.shipmentDetails?.packageDetails || []).map(item => ({
                packageType: item.packagingType || 'Carton',
                quantity: item.quantity || 0,
                description: item.description || '',
                weight: item.weight || 0,
                volume: item.volume || 0,
                dimensions: item.dimensions || {
                    length: 0,
                    width: 0,
                    height: 0,
                    unit: 'cm'
                },
                productCategory: item.productCategory,
                hsCode: item.hsCode,
                value: item.value,
                condition: 'Good'
            }));

            const shipmentData = {
                shipmentNumber: shipmentNumber,
                trackingNumber: trackingNumber,
                bookingId: booking._id,
                customerId: booking.customer._id,
                
                shipmentClassification: booking.shipmentClassification,
                
                shipmentDetails: {
                    origin: booking.shipmentDetails?.origin,
                    destination: booking.shipmentDetails?.destination,
                    shippingMode: booking.shipmentDetails?.shippingMode
                },
                
                sender: booking.sender,
                receiver: booking.receiver,
                courier: booking.courier,
                
                packages: packages,
                
                status: 'pending',
                createdBy: req.user._id,
                
                milestones: [{
                    status: 'pending',
                    location: booking.sender?.address?.country || 'Warehouse',
                    description: 'Shipment created from confirmed booking',
                    updatedBy: req.user._id,
                    timestamp: new Date()
                }]
            };

            shipment = await Shipment.create(shipmentData);
            
            booking.shipmentId = shipment._id;
            await booking.save();
            
            console.log('   ✅ Shipment created successfully:', {
                id: shipment._id,
                number: shipment.shipmentNumber,
                tracking: shipment.trackingNumber
            });

            // Notify warehouse staff
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
                        expectedDate: new Date().toLocaleDateString(),
                        shipmentUrl: `${process.env.FRONTEND_URL}/warehouse/shipments/${shipment._id}`
                    }
                }).catch(err => console.log('   ⚠️ Warehouse email error:', err.message));
            }

        } catch (shipmentError) {
            console.error('❌ Shipment creation error:', shipmentError);
        }

        // ===== STEP 2: CREATE INVOICE =====
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

        // ===== STEP 3: Send Emails =====
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
        console.log('Sending email to receiver...');

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
        } else {
            console.log('⚠️ No receiver email found for booking:', booking.bookingNumber);
        }

        // Admin Emails
       // Get all active admin users
const admins = await User.find({ role: 'admin', isActive: true });

// Prepare recipients - combine admin emails with SMTP email
let allRecipients = admins.map(a => a.email);

// Add SMTP email (support@cargologisticscompany.com)
if (process.env.SMTP_USER) {
    allRecipients.push(process.env.SMTP_USER);
}

// Remove duplicates
allRecipients = [...new Set(allRecipients)];

if (allRecipients.length > 0) {
    await sendEmail({
        to: allRecipients,  // এখন এখানে অ্যাডমিন ইমেইল এবং SMTP ইমেইল দুটোই আছে
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

// ========== 14. TRACK BY NUMBER (Public) ==========
exports.trackByNumber = async (req, res) => {
    try {
        const { trackingNumber } = req.params;

        console.log('Searching for tracking number:', trackingNumber);

        let booking = await Booking.findOne({ trackingNumber })
            .populate({
                path: 'shipmentId',
                select: 'status milestones currentLocation transport trackingNumber'
            })
            .select('bookingNumber status shipmentDetails timeline courier currentLocation sender receiver');

        if (!booking) {
            console.log('Not found in Booking, trying Shipment...');
            
            const shipment = await Shipment.findOne({ trackingNumber })
                .populate('bookingId', 'bookingNumber sender receiver')
                .select('bookingId status milestones transport trackingNumber');

            if (!shipment) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Tracking number not found' 
                });
            }

            booking = await Booking.findById(shipment.bookingId)
                .select('bookingNumber sender receiver shipmentDetails');
        }

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Tracking information not found' 
            });
        }

        const shipment = await Shipment.findOne({ trackingNumber })
            .select('status milestones currentLocation transport actualDeliveryDate');

        const timeline = (shipment?.milestones || booking.timeline || []).map(entry => ({
            status: entry.status,
            location: entry.location || 'Unknown',
            description: entry.description,
            date: entry.timestamp,
            formattedDate: new Date(entry.timestamp).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short'
            })
        }));

        const progress = calculateProgress(shipment?.status || booking.status);

        const trackingInfo = {
            trackingNumber: trackingNumber,
            bookingNumber: booking.bookingNumber,
            status: shipment?.status || booking.status,
            sender: {
                name: booking.sender?.name,
                address: booking.sender?.address
            },
            receiver: {
                name: booking.receiver?.name,
                address: booking.receiver?.address
            },
            origin: booking.shipmentDetails?.origin || 'Unknown',
            destination: booking.shipmentDetails?.destination || 'Unknown',
            currentLocation: shipment?.currentLocation?.location || booking.currentLocation?.location || 'Unknown',
            estimatedDelivery: shipment?.transport?.estimatedArrival || booking.courier?.estimatedDeliveryDate || null,
            actualDelivery: shipment?.actualDeliveryDate || null,
            progress: progress,
            timeline: timeline.sort((a, b) => b.date - a.date),
            lastUpdate: timeline.length > 0 ? timeline[0].formattedDate : 'No updates yet',
            courier: booking.courier
        };

        res.status(200).json({
            success: true,
            data: trackingInfo
        });

    } catch (error) {
        console.error('Track by number error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

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