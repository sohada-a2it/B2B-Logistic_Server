// B2B-Logistic_Server/src/routes/contactRoutes.js

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

// ========== Contact ID Generator ==========
const generateContactId = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `CON-${year}${month}${day}-${random}`;
};

// ========== Admin Email Template ==========
const getAdminEmailTemplate = (data, contactId) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { background: #f97316; color: white; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .contact-badge { background: #e2e8f0; display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 14px; margin: 10px 0; }
        .info-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .info-row { display: flex; margin-bottom: 10px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 5px; }
        .info-label { width: 140px; font-weight: bold; color: #4b5563; }
        .info-value { flex: 1; color: #1e293b; }
        .message-box { background: #fef3c7; border-left: 4px solid #f97316; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📬 New Contact Form Submission</h1>
        </div>
        <div class="content">
          <div style="text-align: center; margin-bottom: 20px;">
            <span class="contact-badge">Contact ID: ${contactId}</span>
          </div>
          
          <h3>👤 Contact Information</h3>
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
            <div class="info-row">
              <span class="info-label">Inquiry Type:</span>
              <span class="info-value">${data.inquiryType}</span>
            </div>
          </div>

          <h3>📝 Message</h3>
          <div class="message-box">
            <p style="margin: 0; white-space: pre-wrap;">${data.message}</p>
          </div>
        </div>
        <div class="footer">
          <p>Received: ${new Date().toLocaleString()}</p>
          <p>Please respond within 24-48 hours</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ========== Customer Auto-Reply Template ==========
const getCustomerEmailTemplate = (data, contactId) => {
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
        .contact-badge { background: #e2e8f0; display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 14px; margin: 10px 0; }
        .message-box { background: #d1fae5; border: 1px solid #a7f3d0; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✓ Message Received!</h1>
        </div>
        <div class="content">
          <div class="success-icon">✅</div>
          
          <div class="message-box">
            <h2 style="margin: 0; color: #065f46;">Thank You, ${data.name}!</h2>
            <p style="margin: 10px 0 0 0;">We've received your message and will get back to you within 24-48 hours.</p>
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <span class="contact-badge">Reference: ${contactId}</span>
          </div>

          <h3>📋 Message Summary</h3>
          <p><strong>Inquiry Type:</strong> ${data.inquiryType}</p>
          <p><strong>Message:</strong> ${data.message.substring(0, 100)}${data.message.length > 100 ? '...' : ''}</p>

          <p style="text-align: center; color: #4b5563; margin-top: 20px;">
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

// ========== Contact Form Route ==========
router.post('/contact', async (req, res) => {
  console.log('\n=== 📬 NEW CONTACT FORM SUBMISSION ===');
  console.log('Time:', new Date().toLocaleString());
  
  try {
    const formData = req.body;
    
    // Log received data
    console.log('📋 Form Data Received:');
    console.log('  - Name:', formData.name);
    console.log('  - Email:', formData.email);
    console.log('  - Phone:', formData.phone);
    console.log('  - Inquiry Type:', formData.inquiryType);
    console.log('  - Message Length:', formData.message?.length || 0, 'chars');
    
    // Basic validation
    if (!formData.name || !formData.email || !formData.phone || !formData.message || !formData.inquiryType) {
      console.log('❌ Validation Failed: Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Generate contact ID
    const contactId = generateContactId();
    console.log('✅ Contact ID Generated:', contactId);

    // Create email transporter
    console.log('🔧 Creating email transporter...');
    const transporter = createTransporter();
    
    // Verify transporter
    await transporter.verify();
    console.log('✅ SMTP Connection Verified');

    // Send email to admin
    console.log('📧 Sending email to ADMIN...');
    console.log('  To:', process.env.ADMIN_EMAIL || process.env.SMTP_USER);
    
    const adminInfo = await transporter.sendMail({
      from: `"B2B Logistics Contact" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
      replyTo: formData.email,
      subject: `📬 New Contact Form - ${contactId} - ${formData.inquiryType}`,
      html: getAdminEmailTemplate(formData, contactId)
    });
    
    console.log('✅ Admin email sent! Message ID:', adminInfo.messageId);

    // Send auto-reply to customer
    console.log('📧 Sending auto-reply to CUSTOMER...');
    console.log('  To:', formData.email);
    
    const customerInfo = await transporter.sendMail({
      from: `"B2B Logistics Support" <${process.env.SMTP_USER}>`,
      to: formData.email,
      subject: `We received your message - ${contactId}`,
      html: getCustomerEmailTemplate(formData, contactId)
    });
    
    console.log('✅ Auto-reply sent! Message ID:', customerInfo.messageId);
    console.log('🎉 CONTACT FORM PROCESSED SUCCESSFULLY!\n');

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      contactId: contactId
    });

  } catch (error) {
    console.error('\n❌ ERROR SENDING CONTACT FORM:');
    console.error('Error Message:', error.message);
    console.error('Error Code:', error.code);
    
    res.status(500).json({
      success: false,
      message: 'Failed to send message. Please try again.'
    });
  }
});

module.exports = router;