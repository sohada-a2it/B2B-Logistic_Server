// utils/emailService.js
const nodemailer = require('nodemailer');
const path = require('path');

// Create transporter for Hostinger
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100
});

// Verify connection configuration
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ SMTP Connection Error:', {
            message: error.message,
            code: error.code,
            command: error.command
        });
    } else {
        console.log('✅ SMTP Server is ready to send emails');
        console.log(`📧 From: ${process.env.EMAIL_FROM}`);
        console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
    }
});

// Helper function to format currency
const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount || 0);
};

// Helper function to format date
const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Email templates
const templates = {
    // ========== BOOKING TEMPLATES ==========
    'new-booking-notification': (data) => ({
        subject: `🚨 New Booking Request - ${data.bookingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px 20px; border-radius: 0 0 10px 10px; }
                    .info-box { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 5px; }
                    .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
                    .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📦 New Booking Request</h1>
                    </div>
                    <div class="content">
                        <h2>Hello Admin Team,</h2>
                        <p>A new booking request has been received and requires your attention.</p>
                        
                        <div class="info-box">
                            <h3>Booking Details:</h3>
                            <p><strong>Booking Number:</strong> ${data.bookingNumber}</p>
                            <p><strong>Customer:</strong> ${data.customerName}</p>
                            <p><strong>Origin:</strong> ${data.origin}</p>
                            <p><strong>Destination:</strong> ${data.destination}</p>
                            <p><strong>Shipment Type:</strong> ${data.shipmentType || 'Not specified'}</p>
                            <p><strong>Total Cartons:</strong> ${data.totalCartons}</p>
                            <p><strong>Total Weight:</strong> ${data.totalWeight} kg</p>
                            <p><strong>Total Volume:</strong> ${data.totalVolume || 0} m³</p>
                            <p><strong>Requested Date:</strong> ${formatDate(data.requestedDate)}</p>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.bookingUrl}" class="button">🔍 View Booking Details</a>
                        </div>
                        
                        <p><strong>Next Steps:</strong> Please review the booking details and provide a price quote within 24 hours.</p>
                    </div>
                    <div class="footer">
                        <p>© ${new Date().getFullYear()} B2B Logistics. All rights reserved.</p>
                        <p>This is an automated message, please do not reply directly.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    'booking-received': (data) => ({
        subject: `✅ Booking Request Received - ${data.bookingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .info-box { background: white; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 5px; }
                    .button { display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>✅ Booking Request Received!</h1>
                    </div>
                    <div class="content">
                        <h2>Dear ${data.customerName},</h2>
                        <p>Thank you for choosing B2B Logistics. Your booking request has been received successfully.</p>
                        
                        <div class="info-box">
                            <h3>Booking Summary:</h3>
                            <p><strong>Booking Number:</strong> ${data.bookingNumber}</p>
                            <p><strong>Origin:</strong> ${data.origin}</p>
                            <p><strong>Destination:</strong> ${data.destination}</p>
                            <p><strong>Total Items:</strong> ${data.totalCartons} cartons</p>
                            <p><strong>Total Weight:</strong> ${data.totalWeight} kg</p>
                        </div>
                        
                        <p><strong>What's Next?</strong></p>
                        <ul>
                            <li>Our logistics team will review your request within 24 hours</li>
                            <li>You'll receive a price quote via email</li>
                            <li>Review and accept the quote to confirm your booking</li>
                        </ul>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.dashboardUrl}" class="button">📊 Track Booking Status</a>
                        </div>
                        
                        <p>For any questions, please contact our support team at <a href="mailto:${data.supportEmail}">${data.supportEmail}</a></p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // ========== QUOTE TEMPLATES ==========
    'price-quote-ready': (data) => ({
        subject: `💰 Price Quote Ready - ${data.bookingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .quote-box { background: white; border: 2px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 10px; }
                    .price { font-size: 32px; color: #28a745; font-weight: bold; text-align: center; margin: 20px 0; }
                    .button-accept { background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-right: 10px; display: inline-block; }
                    .button-reject { background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    td { padding: 10px; border-bottom: 1px solid #ddd; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>💰 Your Price Quote is Ready!</h1>
                    </div>
                    <div class="content">
                        <h2>Dear ${data.customerName},</h2>
                        <p>We have prepared a price quote for your booking <strong>${data.bookingNumber}</strong>.</p>
                        
                        <div class="quote-box">
                            <div class="price">${formatCurrency(data.quotedAmount, data.currency)}</div>
                            
                            <h3>Cost Breakdown:</h3>
                            <table>
                                <tr>
                                    <td>Freight Cost</td>
                                    <td align="right">${formatCurrency(data.breakdown?.freightCost || 0, data.currency)}</td>
                                </tr>
                                <tr>
                                    <td>Handling Fee</td>
                                    <td align="right">${formatCurrency(data.breakdown?.handlingFee || 0, data.currency)}</td>
                                </tr>
                                <tr>
                                    <td>Warehouse Fee</td>
                                    <td align="right">${formatCurrency(data.breakdown?.warehouseFee || 0, data.currency)}</td>
                                </tr>
                                <tr>
                                    <td>Customs Fee</td>
                                    <td align="right">${formatCurrency(data.breakdown?.customsFee || 0, data.currency)}</td>
                                </tr>
                                ${data.breakdown?.insurance > 0 ? `
                                <tr>
                                    <td>Insurance</td>
                                    <td align="right">${formatCurrency(data.breakdown.insurance, data.currency)}</td>
                                </tr>` : ''}
                                ${data.breakdown?.otherCharges > 0 ? `
                                <tr>
                                    <td>Other Charges</td>
                                    <td align="right">${formatCurrency(data.breakdown.otherCharges, data.currency)}</td>
                                </tr>` : ''}
                                <tr style="font-weight: bold; border-top: 2px solid #333;">
                                    <td>Total</td>
                                    <td align="right">${formatCurrency(data.quotedAmount, data.currency)}</td>
                                </tr>
                            </table>
                            
                            <p><strong>Valid Until:</strong> ${formatDate(data.validUntil)}</p>
                            ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.acceptUrl}" class="button-accept">✅ Accept Quote</a>
                            <a href="${data.rejectUrl}" class="button-reject">❌ Reject Quote</a>
                        </div>
                        
                        <p><strong>Please note:</strong> The quote will expire on ${formatDate(data.validUntil)}. Make sure to respond before then.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    'quote-rejected': (data) => ({
        subject: `❌ Quote Rejected - ${data.bookingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>❌ Quote Rejected</h1>
                    </div>
                    <div class="content">
                        <h2>Hello Admin Team,</h2>
                        <p>The customer has rejected the quote for booking <strong>${data.bookingNumber}</strong>.</p>
                        
                        <p><strong>Customer:</strong> ${data.customerName}</p>
                        <p><strong>Reason:</strong> ${data.reason}</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.dashboardUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">View Booking</a>
                        </div>
                        
                        <p>Please contact the customer to understand their concerns and possibly provide a revised quote.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    'quote-rejected-customer': (data) => ({
        subject: `Quote Rejection Confirmed - ${data.bookingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #6c757d 0%, #5a6268 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Quote Rejection Confirmed</h1>
                    </div>
                    <div class="content">
                        <h2>Dear ${data.customerName},</h2>
                        <p>You have successfully rejected the quote for booking <strong>${data.bookingNumber}</strong>.</p>
                        
                        <p><strong>Reason provided:</strong> ${data.reason}</p>
                        
                        <p>What would you like to do next?</p>
                        <ul>
                            <li>Request a new quote with different terms</li>
                            <li>Create a new booking with different specifications</li>
                            <li>Contact our support team for assistance</li>
                        </ul>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.dashboardUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
                        </div>
                        
                        <p>Need help? Contact us at <a href="mailto:${data.supportEmail}">${data.supportEmail}</a></p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // ========== CONFIRMATION TEMPLATES ==========
    'booking-confirmed-customer': (data) => ({
        subject: `🎉 Booking Confirmed! - ${data.bookingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .tracking-box { background: #e8f5e9; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0; }
                    .tracking-number { font-size: 24px; font-weight: bold; color: #28a745; letter-spacing: 2px; }
                    .button { display: inline-block; padding: 12px 24px; margin: 10px; text-decoration: none; border-radius: 5px; font-weight: bold; }
                    .button-primary { background: #28a745; color: white; }
                    .button-secondary { background: #ffc107; color: #333; }
                    .button-info { background: #17a2b8; color: white; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 Booking Confirmed!</h1>
                    </div>
                    <div class="content">
                        <h2>Congratulations ${data.customerName}!</h2>
                        <p>Your booking has been confirmed and is now being processed.</p>
                        
                        <div class="tracking-box">
                            <p style="margin: 0; color: #666;">Your Tracking Number</p>
                            <div class="tracking-number">${data.trackingNumber}</div>
                            <p style="margin: 5px 0 0; color: #666;">Save this number to track your shipment</p>
                        </div>
                        
                        <h3>Booking Summary:</h3>
                        <p><strong>Booking Number:</strong> ${data.bookingNumber}</p>
                        <p><strong>Total Amount:</strong> ${formatCurrency(data.quotedAmount, data.currency)}</p>
                        <p><strong>Invoice Number:</strong> ${data.invoiceNumber || 'Processing'}</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.trackingUrl}" class="button button-info">🔍 Track Shipment</a>
                            <a href="${data.invoiceUrl}" class="button button-secondary">💰 View Invoice</a>
                            <a href="${data.dashboardUrl}" class="button button-primary">📊 Dashboard</a>
                        </div>
                        
                        <p><strong>What's Next?</strong> Your shipment is being prepared. You'll receive updates at every stage of the journey.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    'booking-confirmed-admin': (data) => ({
        subject: `✅ Booking Confirmed - Action Required - ${data.bookingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>✅ Booking Confirmed</h1>
                    </div>
                    <div class="content">
                        <h2>Hello Team,</h2>
                        <p>A booking has been confirmed and requires attention.</p>
                        
                        <p><strong>Booking Number:</strong> ${data.bookingNumber}</p>
                        <p><strong>Customer:</strong> ${data.customerName}</p>
                        <p><strong>Tracking Number:</strong> ${data.trackingNumber}</p>
                        <p><strong>Origin:</strong> ${data.origin}</p>
                        <p><strong>Destination:</strong> ${data.destination}</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.shipmentUrl}" style="background: #17a2b8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 5px;">📦 Manage Shipment</a>
                            <a href="${data.invoiceUrl}" style="background: #ffc107; color: #333; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 5px;">💰 View Invoice</a>
                        </div>
                        
                        <p><strong>Action Required:</strong> Please assign this to operations team for processing.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    'new-shipment-notification': (data) => ({
        subject: `📦 New Shipment Ready for Processing - ${data.trackingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #17a2b8 0%, #138496 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📦 New Shipment Ready</h1>
                    </div>
                    <div class="content">
                        <h2>Hello Operations Team,</h2>
                        <p>A new shipment is ready for processing.</p>
                        
                        <p><strong>Tracking Number:</strong> ${data.trackingNumber}</p>
                        <p><strong>Customer:</strong> ${data.customerName}</p>
                        <p><strong>Origin:</strong> ${data.origin}</p>
                        <p><strong>Destination:</strong> ${data.destination}</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.shipmentUrl}" style="background: #17a2b8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Start Processing</a>
                        </div>
                        
                        <p>Please begin the pickup and consolidation process.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    'invoice-generated': (data) => ({
        subject: `🧾 Invoice Generated - ${data.invoiceNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🧾 New Invoice Generated</h1>
                    </div>
                    <div class="content">
                        <h2>Hello Finance Team,</h2>
                        <p>A new invoice has been generated.</p>
                        
                        <p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
                        <p><strong>Booking Number:</strong> ${data.bookingNumber}</p>
                        <p><strong>Total Amount:</strong> ${formatCurrency(data.totalAmount, data.currency)}</p>
                        <p><strong>Due Date:</strong> ${formatDate(data.dueDate)}</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.invoiceUrl}" style="background: #ffc107; color: #333; padding: 12px 24px; text-decoration: none; border-radius: 5px;">View Invoice</a>
                        </div>
                        
                        <p>Please process this invoice for payment tracking.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),
    // ========== RECEIVER TEMPLATES ==========
    'receiver-shipment-confirmed': (data) => ({
        subject: `📦 Your Shipment is Confirmed - ${data.trackingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        line-height: 1.6; 
                        color: #333; 
                        margin: 0; 
                        padding: 0;
                        background-color: #f5f5f5;
                    }
                    .container { 
                        max-width: 600px; 
                        margin: 20px auto; 
                        background: white;
                        border-radius: 10px;
                        overflow: hidden;
                        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                    }
                    .header { 
                        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
                        color: white; 
                        padding: 30px 20px; 
                        text-align: center; 
                    }
                    .header h1 { 
                        margin: 0; 
                        font-size: 28px; 
                        font-weight: 600; 
                    }
                    .header p { 
                        margin: 10px 0 0; 
                        opacity: 0.9; 
                        font-size: 16px; 
                    }
                    .content { 
                        padding: 30px; 
                        background: white; 
                    }
                    .greeting { 
                        font-size: 18px; 
                        margin-bottom: 20px; 
                    }
                    .greeting strong { 
                        color: #2563eb; 
                    }
                    .info-box { 
                        background: #f8fafc; 
                        border-left: 4px solid #2563eb; 
                        padding: 20px; 
                        margin: 25px 0; 
                        border-radius: 0 8px 8px 0; 
                    }
                    .info-box h3 { 
                        margin: 0 0 15px; 
                        color: #2563eb; 
                        font-size: 18px; 
                    }
                    .info-grid { 
                        display: grid; 
                        grid-template-columns: 1fr 1fr; 
                        gap: 15px; 
                    }
                    .info-item { 
                        margin-bottom: 10px; 
                    }
                    .info-item .label { 
                        font-size: 12px; 
                        color: #64748b; 
                        text-transform: uppercase; 
                        letter-spacing: 0.5px; 
                        margin-bottom: 4px; 
                    }
                    .info-item .value { 
                        font-size: 16px; 
                        font-weight: 600; 
                        color: #1e293b; 
                    }
                    .tracking-section { 
                        text-align: center; 
                        margin: 30px 0; 
                        padding: 20px; 
                        background: linear-gradient(135deg, #f0f9ff 0%, #e6f2ff 100%); 
                        border-radius: 8px; 
                    }
                    .tracking-number { 
                        font-size: 24px; 
                        font-weight: 700; 
                        color: #2563eb; 
                        letter-spacing: 1px; 
                        margin: 10px 0; 
                        padding: 10px; 
                        background: white; 
                        border-radius: 5px; 
                        display: inline-block; 
                        border: 1px solid #2563eb;
                    }
                    .tracking-button { 
                        display: inline-block; 
                        background-color: #2563eb; 
                        color: white; 
                        text-decoration: none; 
                        padding: 14px 32px; 
                        border-radius: 5px; 
                        font-weight: 600; 
                        margin: 15px 0; 
                        transition: background-color 0.3s; 
                    }
                    .tracking-button:hover { 
                        background-color: #1d4ed8; 
                    }
                    .package-summary { 
                        margin: 25px 0; 
                        border: 1px solid #e2e8f0; 
                        border-radius: 8px; 
                        overflow: hidden; 
                    }
                    .package-header { 
                        background-color: #f1f5f9; 
                        padding: 12px 15px; 
                        font-weight: 600; 
                        color: #2563eb; 
                    }
                    .package-content { 
                        padding: 15px; 
                        display: flex; 
                        justify-content: space-between; 
                        flex-wrap: wrap; 
                    }
                    .package-stat { 
                        text-align: center; 
                        flex: 1; 
                        min-width: 100px; 
                    }
                    .package-stat .number { 
                        font-size: 22px; 
                        font-weight: 700; 
                        color: #2563eb; 
                    }
                    .package-stat .label { 
                        font-size: 12px; 
                        color: #64748b; 
                    }
                    .address-section { 
                        margin: 20px 0; 
                        padding: 15px; 
                        background-color: #f8fafc; 
                        border-radius: 8px; 
                    }
                    .address-grid { 
                        display: grid; 
                        grid-template-columns: 1fr 1fr; 
                        gap: 20px; 
                    }
                    .address-box { 
                        padding: 10px; 
                    }
                    .address-box h4 { 
                        color: #2563eb; 
                        margin: 0 0 10px; 
                        font-size: 16px; 
                    }
                    .address-box p { 
                        margin: 5px 0; 
                        color: #475569; 
                    }
                    .footer { 
                        background-color: #f8fafc; 
                        padding: 30px; 
                        text-align: center; 
                        border-top: 1px solid #e2e8f0; 
                    }
                    .footer p { 
                        margin: 5px 0; 
                        color: #64748b; 
                        font-size: 14px; 
                    }
                    .footer .company { 
                        font-weight: 600; 
                        color: #2563eb; 
                    }
                    .divider { 
                        height: 1px; 
                        background-color: #e2e8f0; 
                        margin: 25px 0; 
                    }
                    .note { 
                        background-color: #fff7ed; 
                        border-left: 4px solid #f97316; 
                        padding: 12px 15px; 
                        margin: 20px 0; 
                        font-size: 14px; 
                        color: #9a3412; 
                    }
                    @media only screen and (max-width: 480px) {
                        .content { padding: 20px 15px; }
                        .info-grid { grid-template-columns: 1fr; }
                        .address-grid { grid-template-columns: 1fr; }
                        .tracking-number { font-size: 20px; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <!-- Header -->
                    <div class="header">
                        <h1>📦 Shipment Confirmed!</h1>
                        <p>A package is on its way to you</p>
                    </div>

                    <!-- Content -->
                    <div class="content">
                        <!-- Greeting -->
                        <div class="greeting">
                            Hello <strong>${data.receiverName}</strong>,
                        </div>
                        
                        <p style="font-size: 16px; color: #475569;">
                            ${data.senderName} has sent a shipment to you through <strong>Cargo Logistics Group</strong>. 
                            Your package has been confirmed and is being prepared for delivery.
                        </p>

                        <!-- Tracking Section -->
                        <div class="tracking-section">
                            <div style="font-size: 14px; color: #475569; margin-bottom: 10px;">
                                Your Tracking Number
                            </div>
                            <div class="tracking-number">
                                ${data.trackingNumber}
                            </div>
                            <div>
                                <a href="${data.trackingUrl}" class="tracking-button">
                                    🔍 Track Your Shipment
                                </a>
                            </div>
                            <p style="font-size: 13px; color: #64748b; margin-top: 10px;">
                                Click above to see real-time updates
                            </p>
                        </div>

                        <!-- Shipment Information -->
                        <div class="info-box">
                            <h3>📋 Shipment Details</h3>
                            <div class="info-grid">
                                <div class="info-item">
                                    <div class="label">Booking Number</div>
                                    <div class="value">${data.bookingNumber}</div>
                                </div>
                                <div class="info-item">
                                    <div class="label">Estimated Delivery</div>
                                    <div class="value">${data.estimatedDelivery}</div>
                                </div>
                                <div class="info-item">
                                    <div class="label">Origin</div>
                                    <div class="value">${data.origin}</div>
                                </div>
                                <div class="info-item">
                                    <div class="label">Destination</div>
                                    <div class="value">${data.destination}</div>
                                </div>
                            </div>
                        </div>

                        <!-- Package Summary -->
                        <div class="package-summary">
                            <div class="package-header">
                                📦 Package Summary
                            </div>
                            <div class="package-content">
                                <div class="package-stat">
                                    <div class="number">${data.totalPackages}</div>
                                    <div class="label">Packages</div>
                                </div>
                                <div class="package-stat">
                                    <div class="number">${data.totalWeight} kg</div>
                                    <div class="label">Total Weight</div>
                                </div>
                                <div class="package-stat">
                                    <div class="number">${data.totalVolume} m³</div>
                                    <div class="label">Total Volume</div>
                                </div>
                            </div>
                        </div>

                        <!-- Addresses -->
                        <div class="address-section">
                            <h4 style="color: #2563eb; margin-bottom: 15px;">📍 Delivery Information</h4>
                            <div class="address-grid">
                                <!-- From (Sender) -->
                                <div class="address-box">
                                    <h4>From:</h4>
                                    <p><strong>${data.senderName}</strong></p>
                                    ${data.senderCompany ? `<p>${data.senderCompany}</p>` : ''}
                                    <p>${data.senderCountry}</p>
                                </div>
                                
                                <!-- To (Receiver - You) -->
                                <div class="address-box">
                                    <h4>To:</h4>
                                    <p><strong>${data.receiverName}</strong></p>
                                    ${data.receiverCompany ? `<p>${data.receiverCompany}</p>` : ''}
                                    <p>${data.destination}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Important Note -->
                        <div class="note">
                            <strong>📌 Please Note:</strong> You may need to be available to sign for this package. 
                            Delivery times are estimates and may vary based on customs clearance and local conditions.
                        </div>

                        <!-- What to Expect -->
                        <div style="margin: 25px 0;">
                            <h4 style="color: #2563eb; margin-bottom: 15px;">⏳ What to Expect</h4>
                            <ul style="list-style: none; padding: 0;">
                                <li style="margin-bottom: 10px; display: flex; align-items: center;">
                                    <span style="background: #2563eb; color: white; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; font-size: 12px;">1</span>
                                    <span>Shipment processing at origin warehouse</span>
                                </li>
                                <li style="margin-bottom: 10px; display: flex; align-items: center;">
                                    <span style="background: #2563eb; color: white; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; font-size: 12px;">2</span>
                                    <span>In transit to destination country</span>
                                </li>
                                <li style="margin-bottom: 10px; display: flex; align-items: center;">
                                    <span style="background: #2563eb; color: white; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; font-size: 12px;">3</span>
                                    <span>Customs clearance (if applicable)</span>
                                </li>
                                <li style="margin-bottom: 10px; display: flex; align-items: center;">
                                    <span style="background: #2563eb; color: white; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; font-size: 12px;">4</span>
                                    <span>Out for delivery to your address</span>
                                </li>
                            </ul>
                        </div>

                        <div class="divider"></div>

                        <!-- Need Help -->
                        <div style="text-align: center;">
                            <p style="color: #475569;">
                                <strong>Need assistance?</strong><br>
                                Contact our support team at 
                                <a href="mailto:${data.supportEmail}" style="color: #2563eb; text-decoration: none;">
                                    ${data.supportEmail}
                                </a>
                            </p>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="footer">
                        <div class="company">Cargo Logistics Group</div>
                        <p>Delivering Excellence Worldwide 🌍</p>
                        <p style="font-size: 12px; margin-top: 20px;">
                            This email was sent regarding a shipment to you.<br>
                            &copy; ${new Date().getFullYear()} Cargo Logistics Group. All rights reserved.
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),
    // ========== CANCELLATION TEMPLATES ==========
    'booking-cancelled': (data) => ({
        subject: `🚫 Booking Cancelled - ${data.bookingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🚫 Booking Cancelled</h1>
                    </div>
                    <div class="content">
                        <h2>Hello Team,</h2>
                        <p>Booking <strong>${data.bookingNumber}</strong> has been cancelled.</p>
                        
                        <p><strong>Customer:</strong> ${data.customerName}</p>
                        <p><strong>Reason:</strong> ${data.reason}</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.dashboardUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">View Details</a>
                        </div>
                        
                        <p>Please update your records accordingly.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    'booking-cancelled-customer': (data) => ({
        subject: `Your Booking Has Been Cancelled - ${data.bookingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #6c757d 0%, #5a6268 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Booking Cancellation Confirmed</h1>
                    </div>
                    <div class="content">
                        <h2>Dear ${data.customerName},</h2>
                        <p>Your booking <strong>${data.bookingNumber}</strong> has been cancelled.</p>
                        
                        <p><strong>Reason:</strong> ${data.reason}</p>
                        
                        <p>What would you like to do next?</p>
                        <ul>
                            <li>Create a new booking with different requirements</li>
                            <li>Contact support if you need assistance</li>
                            <li>View your booking history in dashboard</li>
                        </ul>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.dashboardUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
                        </div>
                        
                        <p>Need help? Contact us at <a href="mailto:${data.supportEmail}">${data.supportEmail}</a></p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // ========== TRACKING TEMPLATES ==========
    'tracking-update': (data) => ({
        subject: `📍 Shipment Update - ${data.trackingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #17a2b8 0%, #138496 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .status-box { background: white; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📍 Shipment Status Update</h1>
                    </div>
                    <div class="content">
                        <h2>Dear ${data.customerName},</h2>
                        <p>Your shipment status has been updated.</p>
                        
                        <div class="status-box">
                            <p><strong>Tracking Number:</strong> ${data.trackingNumber}</p>
                            <p><strong>New Status:</strong> ${data.status}</p>
                            <p><strong>Location:</strong> ${data.location}</p>
                            <p><strong>Description:</strong> ${data.description}</p>
                            <p><strong>Time:</strong> ${formatDate(data.timestamp)}</p>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${data.trackingUrl}" style="background: #17a2b8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Track Shipment</a>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    })
};

// Send email function with retry logic
const sendEmail = async ({ to, subject, template, data }, retries = 3) => {
    try {
        // Validate inputs
        if (!to || !template) {
            throw new Error('Missing required fields: to and template are required');
        }

        // Get template
        const templateFn = templates[template];
        if (!templateFn) {
            throw new Error(`Template "${template}" not found. Available templates: ${Object.keys(templates).join(', ')}`);
        }
        
        const emailContent = templateFn(data);
        
        // Prepare email options
        const mailOptions = {
            from: `"${process.env.EMAIL_FROM_NAME || 'B2B Logistics'}" <${process.env.EMAIL_FROM || 'noreply@b2blogistics.com'}>`,
            to: Array.isArray(to) ? to.join(', ') : to,
            replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM,
            subject: emailContent.subject || subject,
            html: emailContent.html
        };
        
        // Send email with retry logic
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                const info = await transporter.sendMail(mailOptions);
                console.log(`✅ Email sent successfully:`, {
                    template,
                    to: Array.isArray(to) ? to.length + ' recipients' : to,
                    messageId: info.messageId,
                    attempt: i + 1
                });
                return {
                    success: true,
                    messageId: info.messageId,
                    template,
                    to
                };
            } catch (err) {
                lastError = err;
                console.log(`⚠️ Email send attempt ${i + 1} failed:`, err.message);
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Exponential backoff
                }
            }
        }
        
        throw lastError;
        
    } catch (error) {
        console.error('❌ Email send error:', {
            template,
            to: Array.isArray(to) ? to.length + ' recipients' : to,
            error: error.message
        });
        
        // Log to database or monitoring service in production
        // await logEmailError({ to, template, error: error.message });
        
        return {
            success: false,
            error: error.message,
            template,
            to
        };
    }
};

// Bulk email sending
const sendBulkEmail = async (emails, template, data) => {
    const results = {
        success: [],
        failed: []
    };

    for (const email of emails) {
        try {
            const result = await sendEmail({
                to: email,
                template,
                data: { ...data, recipientEmail: email }
            });
            
            if (result.success) {
                results.success.push(email);
            } else {
                results.failed.push({ email, error: result.error });
            }
        } catch (error) {
            results.failed.push({ email, error: error.message });
        }
    }

    console.log(`📧 Bulk email sent: ${results.success.length} successful, ${results.failed.length} failed`);
    return results;
};

// Test email function with detailed reporting
const testEmailConnection = async () => {
    console.log('🔍 Testing email configuration...');
    
    const testResults = {
        smtp: { status: 'pending' },
        templates: {}
    };

    // Test SMTP connection
    try {
        await transporter.verify();
        testResults.smtp = { status: '✅ OK', message: 'SMTP connection successful' };
        console.log('✅ SMTP connection verified');
    } catch (error) {
        testResults.smtp = { status: '❌ Failed', error: error.message };
        console.error('❌ SMTP connection failed:', error.message);
    }

    // Test sending a real email
    if (process.env.NODE_ENV !== 'production') {
        try {
            const testEmail = process.env.SMTP_USER || process.env.TEST_EMAIL;
            if (testEmail) {
                console.log(`📧 Sending test email to ${testEmail}...`);
                
                const result = await sendEmail({
                    to: testEmail,
                    subject: 'SMTP Test Email',
                    template: 'booking-received',
                    data: {
                        customerName: 'Test User',
                        bookingNumber: 'TEST-001',
                        origin: 'Test Origin',
                        destination: 'Test Destination',
                        totalCartons: 5,
                        totalWeight: 100,
                        dashboardUrl: process.env.FRONTEND_URL,
                        supportEmail: process.env.SUPPORT_EMAIL || 'support@b2blogistics.com'
                    }
                });

                testResults.testEmail = result;
                
                if (result.success) {
                    console.log('✅ Test email sent successfully');
                } else {
                    console.error('❌ Test email failed:', result.error);
                }
            }
        } catch (error) {
            console.error('❌ Test email error:', error.message);
        }
    }

    // Test all templates
    console.log('📋 Testing all email templates...');
    const templateNames = Object.keys(templates);
    
    for (const templateName of templateNames) {
        try {
            const templateFn = templates[templateName];
            const result = templateFn({
                bookingNumber: 'TEST-001',
                customerName: 'Test Customer',
                origin: 'Test Origin',
                destination: 'Test Destination',
                totalCartons: 5,
                totalWeight: 100,
                requestedDate: new Date(),
                bookingUrl: '#',
                dashboardUrl: '#',
                supportEmail: 'test@example.com',
                quotedAmount: 1500,
                currency: 'USD',
                breakdown: {
                    freightCost: 1000,
                    handlingFee: 200,
                    warehouseFee: 150,
                    customsFee: 150
                },
                validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                acceptUrl: '#',
                rejectUrl: '#',
                trackingNumber: 'CLC12345678',
                trackingUrl: '#',
                invoiceUrl: '#',
                invoiceNumber: 'INV-001',
                customerEmail: 'test@example.com',
                reason: 'Test reason'
            });
            
            testResults.templates[templateName] = { 
                status: '✅ OK',
                subject: result.subject 
            };
        } catch (error) {
            testResults.templates[templateName] = { 
                status: '❌ Failed', 
                error: error.message 
            };
        }
    }

    console.log('📊 Test Results:', JSON.stringify(testResults, null, 2));
    return testResults;
};

// Email queue for handling high volume
class EmailQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    add(emailJob) {
        this.queue.push(emailJob);
        this.process();
    }

    async process() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const job = this.queue.shift();
            try {
                await sendEmail(job);
            } catch (error) {
                console.error('Queue email failed:', error);
                // Requeue with max retry logic
                if (job.retries < 3) {
                    this.queue.push({ ...job, retries: (job.retries || 0) + 1 });
                }
            }
            // Small delay between emails
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.isProcessing = false;
    }
}

const emailQueue = new EmailQueue();

module.exports = { 
    sendEmail, 
    testEmailConnection, 
    sendBulkEmail,
    emailQueue,
    templates 
};
