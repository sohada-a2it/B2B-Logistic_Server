const Booking = require('../models/bookingModel');
const Shipment = require('../models/shipmentModel');
const Invoice = require('../models/invoiceModel');
const User = require('../models/userModel');
const { sendEmail } = require('../utils/emailService');  
const { generateTrackingNumber } = require('../utils/trackingGenerator'); 

// ========== 1. CREATE BOOKING (Customer) ==========
exports.createBooking = async (req, res) => {
    try {
        const bookingData = {
            ...req.body,
            customer: req.user._id,
            createdBy: req.user._id,
            status: 'booking_requested',
            pricingStatus: 'pending',
            timeline: [{
                status: 'booking_requested',
                description: 'Booking request submitted',
                updatedBy: req.user._id,
                timestamp: new Date()
            }]
        };

        const booking = new Booking(bookingData);
        await booking.save();
        
        // Populate customer info
        await booking.populate('customer', 'firstName lastName email companyName phone');

        // Send email to ALL Admins
        const admins = await User.find({ role: 'admin', isActive: true });
        const adminEmails = admins.map(admin => admin.email);

        await sendEmail({
            to: adminEmails,
            subject: '🚨 New Booking Request Received',
            template: 'new-booking-notification',
            data: {
                bookingNumber: booking.bookingNumber,
                customerName: booking.customer.companyName || `${booking.customer.firstName} ${booking.customer.lastName}`,
                origin: booking.shipmentDetails.origin,
                destination: booking.shipmentDetails.destination,
                totalCartons: booking.shipmentDetails.totalCartons,
                totalWeight: booking.shipmentDetails.totalWeight,
                bookingUrl: `${process.env.FRONTEND_URL}/admin/bookings/${booking._id}`,
                requestedDate: new Date().toLocaleString()
            }
        });

        // Send confirmation to Customer
        await sendEmail({
            to: booking.customer.email,
            subject: '✅ Booking Request Received - Cargo Logistics',
            template: 'booking-received',
            data: {
                bookingNumber: booking.bookingNumber,
                customerName: booking.customer.firstName,
                origin: booking.shipmentDetails.origin,
                destination: booking.shipmentDetails.destination,
                dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`,
                supportEmail: process.env.SUPPORT_EMAIL
            }
        });

        res.status(201).json({
            success: true,
            message: 'Booking request submitted successfully',
            data: {
                bookingNumber: booking.bookingNumber,
                status: booking.status,
                _id: booking._id
            }
        });

    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== 2. GET ALL BOOKINGS (Admin) ==========
exports.getAllBookings = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        
        let query = {};
        if (status) query.status = status;
        
        // If customer, only show their bookings
        if (req.user.role === 'customer') {
            query.customer = req.user._id;
        }
        
        const bookings = await Booking.find(query)
            .populate('customer', 'firstName lastName companyName email phone')
            .populate('quotedPrice.quotedBy', 'firstName lastName')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await Booking.countDocuments(query);
        
        res.status(200).json({
            success: true,
            data: bookings,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
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

        // Update with price quote
        booking.quotedPrice = {
            amount,
            currency,
            breakdown: breakdown || {
                freightCost: 0,
                handlingFee: 0,
                warehouseFee: 0,
                customsFee: 0,
                insurance: 0,
                otherCharges: 0
            },
            quotedBy: req.user._id,
            quotedAt: new Date(),
            validUntil: validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
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
        await sendEmail({
            to: booking.customer.email,
            subject: '💰 Price Quote Ready for Your Booking',
            template: 'price-quote-ready',
            data: {
                bookingNumber: booking.bookingNumber,
                customerName: booking.customer.firstName,
                quotedAmount: amount,
                currency: currency,
                validUntil: booking.quotedPrice.validUntil,
                breakdown: breakdown,
                acceptUrl: `${process.env.FRONTEND_URL}/customer/bookings/${booking._id}/accept`,
                rejectUrl: `${process.env.FRONTEND_URL}/customer/bookings/${booking._id}/reject`,
                dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`
            }
        });

        res.status(200).json({
            success: true,
            message: 'Price quote sent to customer',
            data: booking
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// controllers/bookingController.js - আপডেটেড acceptQuote ফাংশন

// ========== 5. CUSTOMER ACCEPT QUOTE ==========  
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
        console.log('3. Customer email:', booking.customer.email);

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
        booking.confirmedAt = new Date();
        
        // Generate tracking number with error handling
        let trackingNumber;
        try {
            trackingNumber = await generateTrackingNumber();
            console.log('4. Tracking number generated:', trackingNumber);
        } catch (tnError) {
            console.error('Tracking number error:', tnError);
            trackingNumber = `CLC${Date.now()}${Math.floor(Math.random() * 1000)}`;
        }
        
        booking.trackingNumber = trackingNumber;
        
        booking.addTimelineEntry(
            'booking_confirmed',
            `Customer accepted quote. Booking confirmed. Tracking: ${trackingNumber}`,
            req.user._id
        );

        await booking.save();
        console.log('5. Booking saved successfully');

        // ===== STEP 1: CREATE SHIPMENT (AUTOMATICALLY) =====
        console.log('6. Creating shipment automatically...');
        
        let shipment = null;
        try {
            // Generate shipment number
            const shipmentNumber = await generateShipmentNumber();
            
            // Prepare packages from cargo details
            const packages = (booking.shipmentDetails?.cargoDetails || []).map(item => ({
                packageType: 'Carton',
                quantity: item.cartons || 0,
                description: item.description || '',
                weight: item.weight || 0,
                volume: item.volume || 0,
                condition: 'Good'
            }));

            // Create shipment data
            const shipmentData = {
                shipmentNumber: shipmentNumber,
                trackingNumber: trackingNumber,
                bookingId: booking._id,
                customerId: booking.customer._id,
                shipmentDetails: {
                    shipmentType: booking.shipmentDetails?.shipmentType || 'air_freight',
                    origin: booking.shipmentDetails?.origin || '',
                    destination: booking.shipmentDetails?.destination || '',
                    shippingMode: booking.shipmentDetails?.shippingMode || 'DDP'
                },
                pickupAddress: booking.pickupAddress || {
                    consigneeName: booking.customer?.firstName + ' ' + booking.customer?.lastName,
                    companyName: booking.customer?.companyName || '',
                    phone: booking.customer?.phone || '',
                    email: booking.customer?.email || '',
                    addressLine1: '',
                    city: '',
                    state: '',
                    country: '',
                    postalCode: ''
                },
                deliveryAddress: booking.deliveryAddress || {
                    consigneeName: booking.consigneeName || '',
                    companyName: booking.companyName || '',
                    phone: booking.phone || '',
                    email: booking.email || '',
                    addressLine1: '',
                    city: '',
                    state: '',
                    country: '',
                    postalCode: ''
                },
                packages: packages,
                status: 'pending',
                createdBy: req.user._id,
                milestones: [{
                    status: 'pending',
                    location: booking.shipmentDetails?.origin || 'Warehouse',
                    description: 'Shipment created from confirmed booking',
                    updatedBy: req.user._id,
                    timestamp: new Date()
                }]
            };

            // Create shipment in database
            shipment = await Shipment.create(shipmentData);
            
            // Update booking with shipment reference
            booking.shipmentId = shipment._id;
            await booking.save();
            
            console.log('   ✅ Shipment created successfully:', {
                id: shipment._id,
                number: shipment.shipmentNumber,
                tracking: shipment.trackingNumber
            });

            // ===== ওয়্যারহাউস ট্রিগার - স্টেপ ১: ওয়্যারহাউস স্টাফ খুঁজে বের করা =====
            console.log('   🔔 Triggering warehouse notifications...');
            
            // Find all warehouse staff
            const warehouseStaff = await User.find({ 
                role: 'warehouse', 
                isActive: true 
            });
            
            if (warehouseStaff.length > 0) {
                console.log(`   📋 Found ${warehouseStaff.length} warehouse staff`);
                
                // Send email to ALL warehouse staff
                await sendEmail({
                    to: warehouseStaff.map(w => w.email),
                    subject: '📦 New Shipment Ready for Warehouse Processing',
                    template: 'new-shipment-warehouse',
                    data: {
                        trackingNumber: trackingNumber,
                        customerName: booking.customer?.companyName || booking.customer?.firstName || 'Customer',
                        origin: booking.shipmentDetails?.origin || 'N/A',
                        destination: booking.shipmentDetails?.destination || 'N/A',
                        packages: packages.length,
                        totalWeight: booking.shipmentDetails?.totalWeight || 0,
                        totalVolume: booking.shipmentDetails?.totalVolume || 0,
                        shipmentType: booking.shipmentDetails?.shipmentType || 'N/A',
                        bookingNumber: booking.bookingNumber,
                        expectedDate: new Date().toLocaleDateString(),
                        shipmentUrl: `${process.env.FRONTEND_URL}/warehouse/shipments/${shipment._id}`,
                        warehouseDashboardUrl: `${process.env.FRONTEND_URL}/warehouse/dashboard`
                    }
                }).catch(err => console.log('   ⚠️ Warehouse email error:', err.message));

                // ===== ওয়্যারহাউস ট্রিগার - স্টেপ ২: ওয়্যারহাউস ড্যাশবোর্ডে নোটিফিকেশন =====
                // (এটা রিয়েল-টাইম নোটিফিকেশনের জন্য - যদি Socket.IO ব্যবহার করেন)
                if (req.io) {
                    req.io.to('warehouse').emit('new-shipment-ready', {
                        shipmentId: shipment._id,
                        trackingNumber: trackingNumber,
                        customerName: booking.customer?.companyName || booking.customer?.firstName,
                        message: 'New shipment ready for warehouse receipt'
                    });
                    console.log('   🔔 Real-time notification sent to warehouse dashboard');
                }
                
                // ===== ওয়্যারহাউস ট্রিগার - স্টেপ ৩: ওয়্যারহাউস লিডকে SMS (যদি কনফিগার করা থাকে) =====
                // এটা ঐচ্ছিক - যদি SMS সার্ভিস থাকে
                /*
                const warehouseLead = warehouseStaff.find(w => w.isLead === true);
                if (warehouseLead && warehouseLead.phone) {
                    await sendSMS({
                        to: warehouseLead.phone,
                        message: `New shipment ${trackingNumber} ready for warehouse. Customer: ${booking.customer?.companyName || booking.customer?.firstName}`
                    });
                }
                */
                
                console.log('   ✅ Warehouse notifications sent successfully');
            } else {
                console.log('   ⚠️ No active warehouse staff found');
                
                // Fallback: Send to admins if no warehouse staff
                const admins = await User.find({ role: 'admin', isActive: true });
                if (admins.length > 0) {
                    await sendEmail({
                        to: admins.map(a => a.email),
                        subject: '⚠️ New Shipment - No Warehouse Staff Found',
                        template: 'new-shipment-admin-fallback',
                        data: {
                            trackingNumber: trackingNumber,
                            customerName: booking.customer?.companyName || booking.customer?.firstName,
                            shipmentUrl: `${process.env.FRONTEND_URL}/admin/shipments/${shipment._id}`
                        }
                    });
                }
            }

        } catch (shipmentError) {
            console.error('❌ Shipment creation error:', shipmentError);
            // Continue even if shipment fails - booking is already confirmed
        }

        // ===== STEP 2: CREATE INVOICE WITH AUTO-GENERATED NUMBER =====
        console.log('7. Creating invoice with auto-generated number...');

        let invoice = null;
        try {
            // Check if Invoice model exists
            if (!Invoice) {
                throw new Error('Invoice model not found');
            }

            const breakdown = booking.quotedPrice?.breakdown || {};
            
            // Prepare charges array from breakdown with exact enum values
            const charges = [];
            
            // Map breakdown fields to exact enum values
            if (breakdown.freightCost && breakdown.freightCost > 0) {
                charges.push({
                    description: 'Ocean/Air freight transportation charges',
                    type: 'Freight Cost',
                    amount: breakdown.freightCost,
                    currency: booking.quotedPrice?.currency || 'USD'
                });
            }
            
            if (breakdown.handlingFee && breakdown.handlingFee > 0) {
                charges.push({
                    description: 'Cargo handling and processing fee',
                    type: 'Handling Fee',
                    amount: breakdown.handlingFee,
                    currency: booking.quotedPrice?.currency || 'USD'
                });
            }
            
            if (breakdown.warehouseFee && breakdown.warehouseFee > 0) {
                charges.push({
                    description: 'Warehouse storage and consolidation fee',
                    type: 'Warehouse Fee',
                    amount: breakdown.warehouseFee,
                    currency: booking.quotedPrice?.currency || 'USD'
                });
            }
            
            if (breakdown.customsFee && breakdown.customsFee > 0) {
                charges.push({
                    description: 'Customs clearance and processing fee',
                    type: 'Customs Processing',
                    amount: breakdown.customsFee,
                    currency: booking.quotedPrice?.currency || 'USD'
                });
            }
            
            if (breakdown.insurance && breakdown.insurance > 0) {
                charges.push({
                    description: 'Cargo insurance coverage',
                    type: 'Insurance',
                    amount: breakdown.insurance,
                    currency: booking.quotedPrice?.currency || 'USD'
                });
            }
            
            if (breakdown.documentationFee && breakdown.documentationFee > 0) {
                charges.push({
                    description: 'Documentation and paperwork fee',
                    type: 'Documentation Fee',
                    amount: breakdown.documentationFee,
                    currency: booking.quotedPrice?.currency || 'USD'
                });
            }
            
            if (breakdown.fuelSurcharge && breakdown.fuelSurcharge > 0) {
                charges.push({
                    description: 'Fuel surcharge',
                    type: 'Fuel Surcharge',
                    amount: breakdown.fuelSurcharge,
                    currency: booking.quotedPrice?.currency || 'USD'
                });
            }
            
            if (breakdown.pickupFee && breakdown.pickupFee > 0) {
                charges.push({
                    description: 'Pickup fee from origin',
                    type: 'Pickup Fee',
                    amount: breakdown.pickupFee,
                    currency: booking.quotedPrice?.currency || 'USD'
                });
            }
            
            if (breakdown.deliveryFee && breakdown.deliveryFee > 0) {
                charges.push({
                    description: 'Final delivery fee to destination',
                    type: 'Delivery Fee',
                    amount: breakdown.deliveryFee,
                    currency: booking.quotedPrice?.currency || 'USD'
                });
            }
            
            if (breakdown.otherCharges && breakdown.otherCharges > 0) {
                charges.push({
                    description: 'Other miscellaneous charges',
                    type: 'Other',
                    amount: breakdown.otherCharges,
                    currency: booking.quotedPrice?.currency || 'USD'
                });
            }

            // If no charges from breakdown, create a default charge
            if (charges.length === 0 && booking.quotedPrice?.amount) {
                charges.push({
                    description: 'Total shipping cost including all services',
                    type: 'Freight Cost',
                    amount: booking.quotedPrice.amount,
                    currency: booking.quotedPrice.currency || 'USD'
                });
            }

            // Calculate subtotal
            const subtotal = charges.reduce((sum, charge) => sum + charge.amount, 0);

            // Prepare invoice data
            const invoiceData = {
                bookingId: booking._id,
                shipmentId: shipment?._id,
                customerId: booking.customer._id,
                customerInfo: {
                    companyName: booking.customer.companyName || '',
                    contactPerson: `${booking.customer.firstName || ''} ${booking.customer.lastName || ''}`.trim(),
                    email: booking.customer.email,
                    phone: booking.customer.phone || '',
                    address: booking.deliveryAddress?.addressLine1 || '',
                    vatNumber: ''
                },
                invoiceDate: new Date(),
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
                charges: charges,
                subtotal: subtotal,
                taxAmount: 0,
                taxRate: 0,
                discountAmount: 0,
                totalAmount: subtotal,
                currency: booking.quotedPrice?.currency || 'USD',
                paymentStatus: 'pending',
                status: 'draft',
                paymentTerms: 'Due within 30 days',
                createdBy: req.user._id
            };

            console.log('   Invoice data prepared:', {
                chargesCount: invoiceData.charges.length,
                chargeTypes: invoiceData.charges.map(c => c.type),
                subtotal: invoiceData.subtotal,
                totalAmount: invoiceData.totalAmount
            });

            // Save to database
            invoice = await Invoice.create(invoiceData);
            
            // Update booking with invoice reference
            booking.invoiceId = invoice._id;
            await booking.save();
            
            console.log('   ✅ Invoice created with auto-generated number:', {
                id: invoice._id,
                number: invoice.invoiceNumber,
                amount: invoice.totalAmount,
                paymentStatus: invoice.paymentStatus
            });

        } catch (invoiceError) {
            console.error('❌ Invoice creation error:', {
                message: invoiceError.message,
                code: invoiceError.code,
                name: invoiceError.name
            });
            
            // Handle duplicate key error specifically
            if (invoiceError.code === 11000 && invoiceError.keyPattern?.invoiceNumber) {
                console.log('⚠️ Duplicate invoice number detected, retrying with timestamp...');
                
                // Retry with timestamp-based number
                const timestamp = Date.now().toString().slice(-6);
                const date = new Date();
                const year = date.getFullYear().toString().slice(-2);
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                
                invoiceData.invoiceNumber = `INV-${year}${month}-${timestamp}`;
                
                // Try again
                invoice = await Invoice.create(invoiceData);
                
                // Update booking with invoice reference
                booking.invoiceId = invoice._id;
                await booking.save();
                
                console.log('   ✅ Invoice created on retry:', invoice.invoiceNumber);
            }
            
            // Continue even if invoice fails - booking is already confirmed
        }

        // ===== STEP 3: Send Confirmation Emails =====
        console.log('8. Sending confirmation emails...');

        // Customer Email
        if (booking.customer?.email) {
            await sendEmail({
                to: booking.customer.email,
                subject: '🎉 Booking Confirmed! - Cargo Logistics',
                template: 'booking-confirmed-customer',
                data: {
                    customerName: booking.customer.firstName || 'Customer',
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
                    estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()
                }
            }).catch(err => console.log('Customer email error:', err.message));
        }

        // Admin Emails
        const admins = await User.find({ role: 'admin', isActive: true });
        if (admins.length > 0) {
            await sendEmail({
                to: admins.map(a => a.email),
                subject: '✅ Booking Confirmed - Action Required',
                template: 'booking-confirmed-admin',
                data: {
                    bookingNumber: booking.bookingNumber,
                    customerName: booking.customer?.companyName || booking.customer?.firstName || 'Customer',
                    trackingNumber: trackingNumber,
                    origin: booking.shipmentDetails?.origin || 'N/A',
                    destination: booking.shipmentDetails?.destination || 'N/A',
                    shipmentUrl: `${process.env.FRONTEND_URL}/admin/shipments/${shipment?._id || ''}`,
                    invoiceUrl: `${process.env.FRONTEND_URL}/admin/invoices/${invoice?._id || ''}`,
                    invoiceNumber: invoice?.invoiceNumber || 'N/A'
                }
            }).catch(err => console.log('Admin email error:', err.message));
        }

        // ===== STEP 4: Return Success Response =====
        console.log('9. ✅ Accept quote completed successfully');
        
        res.status(200).json({
            success: true,
            message: 'Booking confirmed successfully. Shipment and invoice created. Warehouse notified.',
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
                    status: shipment.status,
                    warehouseNotified: true
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
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

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

// Make sure this helper function exists at the top of your file or before using it

// Generate invoice number
async function generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    const count = await Invoice.countDocuments({
        invoiceNumber: new RegExp(`^INV-${year}${month}`)
    });
    
    const sequence = (count + 1).toString().padStart(5, '0');
    return `INV-${year}${month}-${sequence}`;
}

// ========== 6. CUSTOMER REJECT QUOTE ==========
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

        // Security check
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

        // Customer rejected
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

        // Notify all admins
        const admins = await User.find({ role: 'admin', isActive: true });
        
        if (admins.length > 0) {
            await sendEmail({
                to: admins.map(admin => admin.email),
                subject: '❌ Quote Rejected by Customer',
                template: 'quote-rejected',
                data: {
                    bookingNumber: booking.bookingNumber,
                    customerName: booking.customer.companyName || `${booking.customer.firstName} ${booking.customer.lastName}`,
                    reason: reason || 'No reason provided',
                    dashboardUrl: `${process.env.FRONTEND_URL}/admin/bookings/${booking._id}`
                }
            });
        }

        // Send confirmation to customer
        await sendEmail({
            to: booking.customer.email,
            subject: 'Quote Rejection Confirmed',
            template: 'booking-rejected-customer',
            data: {
                bookingNumber: booking.bookingNumber,
                customerName: booking.customer.firstName,
                reason: reason || 'No reason provided',
                dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`,
                supportEmail: process.env.SUPPORT_EMAIL
            }
        });

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

// ========== 7. CANCEL BOOKING (Customer/Admin) ==========
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

        // Check permission
        if (req.user.role === 'customer' && booking.customer._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
            });
        }

        // Can only cancel if not already confirmed/shipped
        if (booking.status === 'booking_confirmed') {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot cancel confirmed booking. Please contact support.' 
            });
        }

        booking.status = 'cancelled';
        booking.cancelledAt = new Date();
        booking.cancellationReason = reason;
        
        booking.addTimelineEntry(
            'cancelled',
            `Booking cancelled. Reason: ${reason || 'Not specified'}`,
            req.user._id
        );

        await booking.save();

        // If cancelled by customer
        if (req.user.role === 'customer') {
            const admins = await User.find({ role: 'admin', isActive: true });
            
            if (admins.length > 0) {
                await sendEmail({
                    to: admins.map(a => a.email),
                    subject: '🚫 Booking Cancelled by Customer',
                    template: 'booking-cancelled',
                    data: {
                        bookingNumber: booking.bookingNumber,
                        customerName: booking.customer.companyName || `${booking.customer.firstName} ${booking.customer.lastName}`,
                        reason: reason || 'No reason provided',
                        dashboardUrl: `${process.env.FRONTEND_URL}/admin/bookings/${booking._id}`
                    }
                });
            }

            // Send confirmation to customer
            await sendEmail({
                to: booking.customer.email,
                subject: 'Your Booking Has Been Cancelled',
                template: 'booking-cancelled-customer',
                data: {
                    bookingNumber: booking.bookingNumber,
                    customerName: booking.customer.firstName,
                    reason: reason || 'No reason provided',
                    dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`,
                    supportEmail: process.env.SUPPORT_EMAIL
                }
            });

        } else {
            // If cancelled by admin, notify customer
            await sendEmail({
                to: booking.customer.email,
                subject: 'Your Booking Has Been Cancelled',
                template: 'booking-cancelled-customer',
                data: {
                    bookingNumber: booking.bookingNumber,
                    customerName: booking.customer.firstName,
                    reason: reason || 'Cancelled by administrator',
                    dashboardUrl: `${process.env.FRONTEND_URL}/customer/dashboard`,
                    supportEmail: process.env.SUPPORT_EMAIL
                }
            });
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

// controllers/bookingController.js - এটা যোগ করুন

// ========== GET MY BOOKINGS (Customer) ==========
exports.getMyBookings = async (req, res) => {
    try {
        const { 
            status, 
            page = 1, 
            limit = 10,
            sort = '-createdAt'
        } = req.query;

        // Build query - only show logged in customer's bookings
        let query = { 
            customer: req.user._id 
        };

        // Filter by status if provided
        if (status) {
            query.status = status;
        }

        // Get total count for pagination
        const total = await Booking.countDocuments(query);

        // Get bookings with pagination
        const bookings = await Booking.find(query)
            .populate('quotedPrice.quotedBy', 'firstName lastName')
            .populate('shipmentId', 'trackingNumber status')
            .populate('invoiceId', 'invoiceNumber totalAmount paymentStatus')
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        // Calculate summary statistics for customer
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

// ========== GET MY BOOKING BY ID (Customer) ==========
exports.getMyBookingById = async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findOne({
            _id: id,
            customer: req.user._id  // Ensure it belongs to this customer
        })
        .populate('quotedPrice.quotedBy', 'firstName lastName')
        .populate('shipmentId', 'trackingNumber status milestones transport')
        .populate('invoiceId', 'invoiceNumber totalAmount currency paymentStatus dueDate')
        .populate('timeline.updatedBy', 'firstName lastName role');

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        // Calculate days since booking
        const daysSinceBooking = Math.floor(
            (Date.now() - new Date(booking.createdAt)) / (1000 * 60 * 60 * 24)
        );

        // Check if quote is still valid
        const isQuoteValid = booking.isQuoteValid ? booking.isQuoteValid() : false;

        // Get estimated delivery if shipment exists
        let estimatedDelivery = null;
        if (booking.shipmentId && booking.shipmentId.transport) {
            estimatedDelivery = booking.shipmentId.transport.estimatedArrival;
        }

        res.status(200).json({
            success: true,
            data: {
                booking,
                additionalInfo: {
                    daysSinceBooking,
                    isQuoteValid,
                    estimatedDelivery,
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

// ========== GET MY BOOKING TIMELINE ==========
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

        // Format timeline for better display
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

// ========== GET MY BOOKING INVOICES ==========
exports.getMyBookingInvoices = async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findOne({
            _id: id,
            customer: req.user._id
        }).populate({
            path: 'invoiceId',
            select: 'invoiceNumber totalAmount currency paymentStatus dueDate createdAt'
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
        console.error('Get booking invoices error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// ========== GET BOOKING QUOTE DETAILS ==========
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

        // Check if quote is valid
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

// ========== GET MY BOOKINGS SUMMARY (Dashboard) ==========
exports.getMyBookingsSummary = async (req, res) => {
    try {
        const userId = req.user._id;

        // Get recent bookings (last 5)
        const recentBookings = await Booking.find({ customer: userId })
            .sort('-createdAt')
            .limit(5)
            .select('bookingNumber status createdAt shipmentDetails.totalCartons');

        // Get counts by status
        const statusCounts = await Booking.aggregate([
            { $match: { customer: userId } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get pending quote
        const pendingQuote = await Booking.findOne({
            customer: userId,
            pricingStatus: 'quoted',
            customerResponse: { $ne: 'accepted' }
        })
        .sort('-quotedPrice.quotedAt')
        .select('bookingNumber quotedPrice');

        // Get active shipment (if any)
        const activeShipment = await Booking.findOne({
            customer: userId,
            status: 'booking_confirmed',
            shipmentId: { $ne: null }
        })
        .populate('shipmentId', 'trackingNumber status currentMilestone')
        .sort('-confirmedAt');

        // Format status counts
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

// ========== HELPER FUNCTIONS ==========

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

// ========== DOWNLOAD BOOKING DOCUMENT ==========
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

        // Find document in booking documents array
        const document = booking.documents?.id(documentId);
        
        if (!document) {
            return res.status(404).json({ 
                success: false, 
                message: 'Document not found' 
            });
        }

        // TODO: Implement actual file download
        // For now, return document info
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
// ========== TRACK BY NUMBER (Public) ==========
exports.trackByNumber = async (req, res) => {
    try {
        const { trackingNumber } = req.params;

        console.log('Searching for tracking number:', trackingNumber);

        // First try to find in Booking
        let booking = await Booking.findOne({ trackingNumber })
            .populate({
                path: 'shipmentId',
                select: 'status milestones currentMilestone transport trackingNumber'
            })
            .select('bookingNumber status shipmentDetails timeline trackingNumber');

        // If not found in Booking, try Shipment
        if (!booking) {
            console.log('Not found in Booking, trying Shipment...');
            
            const shipment = await Shipment.findOne({ trackingNumber })
                .populate('bookingId', 'bookingNumber customer')
                .select('bookingId status milestones transport trackingNumber');

            if (!shipment) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Tracking number not found' 
                });
            }

            // Get booking info from shipment
            booking = await Booking.findById(shipment.bookingId)
                .select('bookingNumber customer shipmentDetails');
        }

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Tracking information not found' 
            });
        }

        // Get shipment details
        const shipment = await Shipment.findOne({ trackingNumber })
            .select('status milestones currentMilestone transport actualDeliveryDate');

        // Format timeline for display
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

        // Calculate progress percentage
        const progress = calculateProgress(shipment?.status || booking.status);

        // Prepare response
        const trackingInfo = {
            trackingNumber: trackingNumber,
            bookingNumber: booking.bookingNumber,
            status: shipment?.status || booking.status,
            origin: booking.shipmentDetails?.origin || 'Unknown',
            destination: booking.shipmentDetails?.destination || 'Unknown',
            currentLocation: shipment?.transport?.currentLocation?.address || 'Unknown',
            estimatedDelivery: shipment?.transport?.estimatedArrival || null,
            actualDelivery: shipment?.actualDeliveryDate || null,
            progress: progress,
            timeline: timeline.sort((a, b) => b.date - a.date),
            lastUpdate: timeline.length > 0 ? timeline[0].formattedDate : 'No updates yet'
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

// Helper function to calculate progress percentage
const calculateProgress = (status) => {
    const statusOrder = [
        'booking_requested',
        'price_quoted',
        'booking_confirmed',
        'pending',
        'received_at_warehouse',
        'consolidation_in_progress',
        'loaded_in_container',
        'in_transit',
        'arrived_at_destination',
        'customs_clearance',
        'out_for_delivery',
        'delivered'
    ];

    const index = statusOrder.indexOf(status);
    if (index === -1) return 0;
    return Math.round((index / (statusOrder.length - 1)) * 100);
};