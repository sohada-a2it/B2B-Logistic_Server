// B2B-Logistic_Server/src/routes/quoteRoutes.js

const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// ========== Email Transporter ==========
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// ========== Simple Quote ID Generator (crypto ছাড়া) ==========
const generateQuoteId = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  return `QTE-${year}${month}${day}-${random}`;
};

// ========== Admin Email Template ==========
const getAdminEmailTemplate = (data, quoteId) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .quote-badge { background: #e2e8f0; display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 14px; margin: 10px 0; }
        .info-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .info-row { display: flex; margin-bottom: 10px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 5px; }
        .info-label { width: 120px; font-weight: bold; color: #4b5563; }
        .info-value { flex: 1; color: #1e293b; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚚 New Quote Request</h1>
        </div>
        <div class="content">
          <div style="text-align: center; margin-bottom: 20px;">
            <span class="quote-badge">Quote ID: ${quoteId}</span>
          </div>
          
          <h3>📋 Shipment Details</h3>
          <div class="info-box">
            <div class="info-row">
              <span class="info-label">From:</span>
              <span class="info-value">${data.origin}</span>
            </div>
            <div class="info-row">
              <span class="info-label">To:</span>
              <span class="info-value">${data.destination}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Freight Type:</span>
              <span class="info-value">${data.freightType}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Weight:</span>
              <span class="info-value">${data.weight}</span>
            </div>
            ${data.dimensions ? `
            <div class="info-row">
              <span class="info-label">Dimensions:</span>
              <span class="info-value">${data.dimensions}</span>
            </div>` : ''}
          </div>

          <h3>👤 Customer Information</h3>
          <div class="info-box">
            <div class="info-row">
              <span class="info-label">Name:</span>
              <span class="info-value">${data.name}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Email:</span>
              <span class="info-value">${data.email}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Phone:</span>
              <span class="info-value">${data.phone}</span>
            </div>
            ${data.company ? `
            <div class="info-row">
              <span class="info-label">Company:</span>
              <span class="info-value">${data.company}</span>
            </div>` : ''}
            <div class="info-row">
              <span class="info-label">Address:</span>
              <span class="info-value">${data.address}</span>
            </div>
          </div>

          ${data.instructions ? `
          <h3>📝 Special Instructions</h3>
          <div class="info-box">
            <p style="margin: 0;">${data.instructions}</p>
          </div>` : ''}
        </div>
        <div class="footer">
          <p>Received: ${new Date().toLocaleString()}</p>
          <p>Please respond within 24 hours</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ========== Customer Email Template ==========
const getCustomerEmailTemplate = (data, quoteId) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { background: #10b981; color: white; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .success-icon { text-align: center; font-size: 48px; margin: 20px 0; }
        .quote-badge { background: #e2e8f0; display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 14px; margin: 10px 0; }
        .message-box { background: #d1fae5; border: 1px solid #a7f3d0; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
        .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✓ Quote Request Received!</h1>
        </div>
        <div class="content">
          <div class="success-icon">✅</div>
          
          <div class="message-box">
            <h2 style="margin: 0; color: #065f46;">Thank You, ${data.name}!</h2>
            <p style="margin: 10px 0 0 0;">We've received your quote request and will get back to you within 24 hours.</p>
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <span class="quote-badge">Reference: ${quoteId}</span>
          </div>

          <h3>📋 Request Summary</h3>
          <div class="summary-box">
            <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
            <p><strong>Freight Type:</strong> ${data.freightType}</p>
            <p><strong>Weight:</strong> ${data.weight}</p>
            ${data.dimensions ? `<p><strong>Dimensions:</strong> ${data.dimensions}</p>` : ''}
          </div>

          <p style="text-align: center; color: #4b5563;">
            We'll contact you at:<br>
            📧 ${data.email}<br>
            📞 ${data.phone}
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} B2B Logistics. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ========== Main API Route ==========
router.post('/request-quote', async (req, res) => {
  console.log('\n=== 📨 NEW QUOTE REQUEST RECEIVED ===');
  console.log('Time:', new Date().toLocaleString());
  
  try {
    const formData = req.body;
    
    // Log received data
    console.log('📋 Form Data Received:');
    console.log('  - Name:', formData.name);
    console.log('  - Email:', formData.email);
    console.log('  - Phone:', formData.phone);
    console.log('  - Origin:', formData.origin);
    console.log('  - Destination:', formData.destination);
    console.log('  - Freight Type:', formData.freightType);
    console.log('  - Weight:', formData.weight);
    
    // Basic validation
    if (!formData.name || !formData.email || !formData.phone) {
      console.log('❌ Validation Failed: Missing name/email/phone');
      return res.status(400).json({
        success: false,
        message: 'Name, email and phone are required'
      });
    }

    if (!formData.origin || !formData.destination || !formData.freightType || !formData.weight) {
      console.log('❌ Validation Failed: Missing shipment details');
      return res.status(400).json({
        success: false,
        message: 'Please fill all shipment details'
      });
    }

    // Generate quote ID
    const quoteId = generateQuoteId();
    console.log('✅ Quote ID Generated:', quoteId);

    // Create email transporter
    console.log('🔧 Creating email transporter...');
    const transporter = createTransporter();
    
    // Verify transporter
    await transporter.verify();
    console.log('✅ SMTP Connection Verified');

    // Send email to admin
    console.log('📧 Sending email to ADMIN...');
    console.log('  From:', process.env.SMTP_USER);
    console.log('  To:', process.env.ADMIN_EMAIL || process.env.SMTP_USER);
    console.log('  Subject:', `🚚 New Quote Request - ${quoteId} - ${formData.origin} to ${formData.destination}`);
    
    const adminInfo = await transporter.sendMail({
      from: `"B2B Logistics" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
      replyTo: formData.email,
      subject: `🚚 New Quote Request - ${quoteId} - ${formData.origin} to ${formData.destination}`,
      html: getAdminEmailTemplate(formData, quoteId)
    });
    
    console.log('✅ Admin email sent! Message ID:', adminInfo.messageId);

    // Send confirmation email to customer
    console.log('📧 Sending email to CUSTOMER...');
    console.log('  To:', formData.email);
    
    const customerInfo = await transporter.sendMail({
      from: `"B2B Logistics" <${process.env.SMTP_USER}>`,
      to: formData.email,
      subject: `Quote Request Received - ${quoteId}`,
      html: getCustomerEmailTemplate(formData, quoteId)
    });
    
    console.log('✅ Customer email sent! Message ID:', customerInfo.messageId);
    console.log('🎉 ALL EMAILS SENT SUCCESSFULLY!\n');

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Quote request sent successfully',
      quoteId: quoteId
    });

  } catch (error) {
    console.error('\n❌ ERROR SENDING EMAILS:');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Code:', error.code);
    console.error('Command:', error.command);
    console.error('Response:', error.response);
    console.error('Stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to send email. Please try again.'
    });
  }
});

module.exports = router;