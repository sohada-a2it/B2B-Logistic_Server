import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ভ্যালিডেশন ফাংশন
function validateFormData(data) {
  const errors = {};

  if (!data.origin) errors.origin = 'Origin is required';
  if (!data.destination) errors.destination = 'Destination is required';
  if (!data.freightType) errors.freightType = 'Freight type is required';
  if (!data.weight?.trim()) errors.weight = 'Weight is required';
  if (!data.name?.trim()) errors.name = 'Name is required';
  if (!data.address?.trim()) errors.address = 'Address is required';
  
  if (!data.email?.trim()) {
    errors.email = 'Email is required';
  } else if (!/\S+@\S+\.\S+/.test(data.email)) {
    errors.email = 'Invalid email format';
  }

  if (!data.phone?.trim()) {
    errors.phone = 'Phone is required';
  }

  if (!data.agreeToTerms) {
    errors.agreeToTerms = 'You must agree to terms';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

// অ্যাডমিন ইমেল টেমপ্লেট
const getAdminEmailTemplate = (data) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Quote Request</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 3px; border-radius: 20px; }
        .content { background: white; border-radius: 18px; padding: 30px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #764ba2; margin: 0; font-size: 28px; }
        .badge { background: #f0f0f0; display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 14px; color: #666; margin-top: 10px; }
        .section { margin-bottom: 30px; }
        .section-title { color: #764ba2; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; margin-bottom: 20px; font-size: 20px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .info-item { background: #f8f9fa; padding: 12px 15px; border-radius: 10px; }
        .info-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
        .info-value { font-size: 16px; font-weight: 600; color: #333; }
        .instructions-box { background: #fff3e0; padding: 20px; border-radius: 10px; border-left: 4px solid #ff9800; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #f0f0f0; color: #999; font-size: 14px; }
        .status-badge { background: #4CAF50; color: white; padding: 8px 16px; border-radius: 20px; display: inline-block; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="content">
          <div class="header">
            <h1>🚚 New Quote Request</h1>
            <div class="badge">Received: ${new Date().toLocaleString()}</div>
          </div>

          <div class="section">
            <h2 class="section-title">📦 Shipment Details</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Origin</div>
                <div class="info-value">${data.origin}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Destination</div>
                <div class="info-value">${data.destination}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Freight Type</div>
                <div class="info-value">${data.freightType}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Weight</div>
                <div class="info-value">${data.weight}</div>
              </div>
              ${data.dimensions ? `
              <div class="info-item">
                <div class="info-label">Dimensions</div>
                <div class="info-value">${data.dimensions}</div>
              </div>
              ` : ''}
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">👤 Contact Information</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Name</div>
                <div class="info-value">${data.name}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Email</div>
                <div class="info-value">${data.email}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Phone</div>
                <div class="info-value">${data.phone}</div>
              </div>
              ${data.company ? `
              <div class="info-item">
                <div class="info-label">Company</div>
                <div class="info-value">${data.company}</div>
              </div>
              ` : ''}
              <div class="info-item" style="grid-column: span 2;">
                <div class="info-label">Address</div>
                <div class="info-value">${data.address}</div>
              </div>
            </div>
          </div>

          ${data.instructions ? `
          <div class="section">
            <h2 class="section-title">📝 Special Instructions</h2>
            <div class="instructions-box">
              ${data.instructions}
            </div>
          </div>
          ` : ''}

          <div class="footer">
            <div class="status-badge">Quote ID: ${data.quoteId}</div>
            <p style="margin-top: 20px;">This request requires your attention. Please respond within 24 hours.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

// কাস্টমার ইমেল টেমপ্লেট
const getCustomerEmailTemplate = (data) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Quote Request Received</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 3px; border-radius: 20px; }
        .content { background: white; border-radius: 18px; padding: 30px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #764ba2; margin: 0; font-size: 28px; }
        .badge { background: #f0f0f0; display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 14px; color: #666; margin-top: 10px; }
        .message-box { background: #e8f5e9; padding: 20px; border-radius: 10px; text-align: center; margin: 30px 0; }
        .checkmark { font-size: 48px; color: #4CAF50; margin-bottom: 10px; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #f0f0f0; color: #999; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="content">
          <div class="header">
            <h1>✓ Quote Request Received!</h1>
            <div class="badge">Reference: ${data.quoteId}</div>
          </div>

          <div class="message-box">
            <div class="checkmark">✅</div>
            <h2 style="margin: 10px 0; color: #2e7d32;">Thank You, ${data.name}!</h2>
            <p style="font-size: 16px;">We've received your quote request and will get back to you within 24 hours.</p>
          </div>

          <div style="margin: 30px 0;">
            <h3 style="color: #764ba2;">What happens next?</h3>
            <ol style="padding-left: 20px;">
              <li style="margin-bottom: 10px;">Our logistics expert will review your requirements</li>
              <li style="margin-bottom: 10px;">We'll calculate the best shipping rates</li>
              <li style="margin-bottom: 10px;">You'll receive a detailed quote via email and phone</li>
            </ol>
          </div>

          <div style="background: #f3e5f5; padding: 20px; border-radius: 10px;">
            <h4 style="margin: 0 0 10px 0; color: #764ba2;">Summary of your request:</h4>
            <p><strong>From:</strong> ${data.origin} → <strong>To:</strong> ${data.destination}</p>
            <p><strong>Freight Type:</strong> ${data.freightType}</p>
            <p><strong>Weight:</strong> ${data.weight}</p>
          </div>

          <div class="footer">
            <p>Need to update your request? Reply to this email or contact our support team.</p>
            <p style="margin-top: 10px;">© ${new Date().getFullYear()} B2B Logistics. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

export async function POST(request) {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate form data
    const { isValid, errors } = validateFormData(body);
    
    if (!isValid) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    // Generate quote ID
    const quoteId = 'Q' + Date.now().toString().slice(-8);

    // Send email to admin
    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
      replyTo: body.email,
      subject: `🚚 New Quote Request - ${quoteId} - ${body.origin} to ${body.destination}`,
      html: getAdminEmailTemplate({ ...body, quoteId }),
    });

    // Send confirmation email to customer
    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: body.email,
      subject: `Quote Request Received - ${quoteId}`,
      html: getCustomerEmailTemplate({ ...body, quoteId }),
    });

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Quote request submitted successfully',
      quoteId: quoteId
    });

  } catch (error) {
    console.error('Quote request error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to send email. Please try again.'
      },
      { status: 500 }
    );
  }
}