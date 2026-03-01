// src/service/emailService.js
const nodemailer = require("nodemailer");

console.log("📧 Email Service Loading...");

class EmailService {
  constructor() {
    console.log("\n🔍 Checking SMTP Configuration:");
    console.log("SMTP_HOST:", process.env.SMTP_HOST || 'Not set');
    console.log("SMTP_USER:", process.env.SMTP_USER || 'Not set');
    console.log("SMTP_PASS length:", process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 'Not set');
    
    this.mode = this.detectMode();
    this.transporter = null;
    
    if (this.mode === 'production') {
      this.initializeSMTP();
    } else {
      console.log("🛠️ Running in DEVELOPMENT mode");
    }
  }

  detectMode() {
    // যদি সব config থাকে এবং development না হয়
    if (process.env.SMTP_HOST && 
        process.env.SMTP_USER && 
        process.env.SMTP_PASS &&
        process.env.NODE_ENV === 'production') {
      return 'production';
    }
    return 'development';
  }

  initializeSMTP() {
    try {
      console.log("\n🚀 Initializing REAL SMTP Connection...");
      
      // Special handling for password with special characters
      const smtpConfig = {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS  // Password as is
        },
        tls: {
          rejectUnauthorized: false
        },
        debug: true,
        logger: false
      };

      console.log("📋 SMTP Config Summary:");
      console.log("   Host:", smtpConfig.host);
      console.log("   Port:", smtpConfig.port);
      console.log("   Secure:", smtpConfig.secure);
      console.log("   User:", smtpConfig.auth.user);
      console.log("   Pass Length:", smtpConfig.auth.pass.length, "characters");

      this.transporter = nodemailer.createTransport(smtpConfig);
      
      // Test connection
      this.testConnection();
      
    } catch (error) {
      console.error("❌ Failed to initialize SMTP:", error.message);
      this.mode = 'development';
    }
  }

  async testConnection() {
    try {
      console.log("🔄 Testing SMTP connection...");
      await this.transporter.verify();
      console.log("✅ SMTP Connection verified successfully!");
    } catch (error) {
      console.error("❌ SMTP Connection failed:", error.message);
      console.error("Full error:", error);
      this.mode = 'development';
      this.transporter = null;
    }
  }

  async sendRegistrationOTP(email, otp, name = "User") {
    console.log(`\n📨 Registration OTP Request:`);
    console.log(`   Email: ${email}`);
    console.log(`   OTP: ${otp}`);
    console.log(`   Name: ${name}`);
    console.log(`   Mode: ${this.mode}`);

    // Always log OTP for reference
    console.log(`🔑 OTP for ${email}: ${otp}`);

    // Development mode - just log
    if (this.mode === 'development' || !this.transporter) {
      console.log("\n" + "=".repeat(70));
      console.log("📧 DEVELOPMENT MODE - EMAIL LOG");
      console.log("=".repeat(70));
      console.log("To:", email);
      console.log("Subject: Your OTP Code - B2B Logistics");
      console.log("OTP:", otp);
      console.log("Expires in: 10 minutes");
      console.log("=".repeat(70));
      
      return {
        success: true,
        mode: 'development',
        otp: otp,
        message: "OTP logged to console (Development mode)"
      };
    }

    // Production mode - send real email
    try {
      const html = this.createRegistrationHTML(otp, name);
      const text = this.createRegistrationText(otp, name);
      
      const mailOptions = {
        from: `"B2B Logistics" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Your OTP Code: ${otp} - B2B Logistics Registration`,
        html: html,
        text: text,
        headers: {
          'X-Priority': '1',
          'Importance': 'high'
        }
      };

      console.log("📤 Sending real email...");
      const result = await this.transporter.sendMail(mailOptions);
      
      console.log("✅ Email sent successfully!");
      console.log("   Message ID:", result.messageId);
      console.log("   Response:", result.response || "Sent");
      
      return {
        success: true,
        mode: 'production',
        messageId: result.messageId,
        message: "OTP sent to email"
      };
      
    } catch (error) {
      console.error("❌ Email sending failed:", error.message);
      console.log(`🔑 Fallback - OTP for ${email}: ${otp}`);
      
      return {
        success: true,
        mode: 'fallback',
        otp: otp,
        error: error.message,
        message: "Email failed, OTP available in response"
      };
    }
  }

  createRegistrationHTML(otp, name) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Registration OTP</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
          .header { background: #4CAF50; color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .otp-box { 
            background: #f8f9fa; 
            padding: 25px; 
            text-align: center; 
            font-size: 36px; 
            font-weight: bold; 
            letter-spacing: 15px; 
            margin: 25px 0;
            border: 3px dashed #4CAF50;
            border-radius: 10px;
            font-family: 'Courier New', monospace;
          }
          .footer { 
            background: #f1f1f1; 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
            border-top: 1px solid #ddd;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">B2B Logistics</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Registration Verification</p>
          </div>
          <div class="content">
            <p>Hello <strong>${name}</strong>,</p>
            <p>Your verification code for B2B Logistics registration is:</p>
            
            <div class="otp-box">
              ${otp}
            </div>
            
            <p style="text-align: center; color: #666;">
              ⏰ This code expires in <strong>10 minutes</strong>
            </p>
            
            <p style="color: #dc3545; font-weight: bold; background: #ffe6e6; padding: 10px; border-radius: 5px; border-left: 4px solid #dc3545;">
              ⚠️ SECURITY: Never share this code with anyone.
            </p>
            
            <p>If you didn't request this registration, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} B2B Logistics. All rights reserved.</p>
            <p style="font-size: 11px; color: #999;">This is an automated message. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  createRegistrationText(otp, name) {
    return `
B2B Logistics - Registration OTP

Hello ${name},

Your One-Time Password (OTP) for registration is: ${otp}

This OTP will expire in 10 minutes.

⚠️ SECURITY: Never share this OTP with anyone.

If you didn't request this registration, please ignore this email.

© ${new Date().getFullYear()} B2B Logistics
    `;
  }

  // Other email functions (simplified)
  async sendPasswordResetOTP(email, otp, name = "User") {
    console.log(`\n📨 Password Reset OTP for ${email}: ${otp}`);
    
    if (this.mode === 'development' || !this.transporter) {
      console.log("📧 Development mode - OTP logged");
      return { success: true, mode: 'development', otp: otp };
    }
    
    try {
      await this.transporter.sendMail({
        from: `"B2B Logistics" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Password Reset OTP: ${otp}`,
        text: `Password reset OTP: ${otp}. Expires in 10 minutes.`
      });
      return { success: true, mode: 'production' };
    } catch (error) {
      console.error("Password reset email failed:", error.message);
      return { success: true, mode: 'fallback', otp: otp };
    }
  }

  async sendWelcomeEmail(email, name) {
    console.log(`\n📨 Welcome email for: ${name} <${email}>`);
    
    if (this.mode === 'development' || !this.transporter) {
      return { success: true, mode: 'development' };
    }
    
    try {
      await this.transporter.sendMail({
        from: `"B2B Logistics" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Welcome to B2B Logistics, ${name}!`,
        text: `Welcome ${name}! Your account is now active.`
      });
      return { success: true, mode: 'production' };
    } catch (error) {
      console.error("Welcome email failed:", error.message);
      return { success: false, mode: 'error' };
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

// Export functions
module.exports = {
  sendRegistrationOTPEmail: (email, otp, name) => 
    emailService.sendRegistrationOTP(email, otp, name),
  sendPasswordResetOTPEmail: (email, otp, name) => 
    emailService.sendPasswordResetOTP(email, otp, name),
  sendWelcomeEmail: (email, name) => 
    emailService.sendWelcomeEmail(email, name)
};
const warehouseTemplates = {
    'shipment-received-warehouse': (data) => ({
        subject: '📦 Your Shipment Has Reached Our Warehouse',
        html: `
            <h2>Hello ${data.customerName},</h2>
            <p>Good news! Your shipment has arrived at our warehouse.</p>
            
            <h3>Shipment Details:</h3>
            <ul>
                <li><strong>Tracking Number:</strong> ${data.trackingNumber}</li>
                <li><strong>Receipt Number:</strong> ${data.receiptNumber}</li>
                <li><strong>Received Date:</strong> ${data.receivedDate}</li>
                <li><strong>Packages:</strong> ${data.packages}</li>
                <li><strong>Condition:</strong> ${data.condition}</li>
            </ul>
            
            <p>Next step: Your shipment will be processed and consolidated for shipping.</p>
            
            <p>
                <a href="${data.trackingUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Track Your Shipment
                </a>
            </p>
            
            <p>Thank you for choosing Cargo Logistics!</p>
        `
    }),

    'warehouse-receipt-notification': (data) => ({
        subject: '📦 Shipment Received at Warehouse',
        html: `
            <h2>Warehouse Receipt Generated</h2>
            
            <p><strong>Tracking Number:</strong> ${data.trackingNumber}</p>
            <p><strong>Customer:</strong> ${data.customerName}</p>
            <p><strong>Receipt Number:</strong> ${data.receiptNumber}</p>
            <p><strong>Warehouse:</strong> ${data.warehouseId}</p>
            
            <p>
                <a href="${data.dashboardUrl}">View in Dashboard</a>
            </p>
        `
    }),

    'consolidation-ready': (data) => ({
        subject: '🚢 Consolidation Ready for Departure',
        html: `
            <h2>Consolidation Ready for Departure</h2>
            
            <p><strong>Consolidation Number:</strong> ${data.consolidationNumber}</p>
            <p><strong>Container Number:</strong> ${data.containerNumber}</p>
            <p><strong>Total Shipments:</strong> ${data.totalShipments}</p>
            
            <p>
                <a href="${data.dashboardUrl}">View Consolidation Details</a>
            </p>
        `
    }),

    'shipment-departed': (data) => ({
        subject: '🚢 Your Shipment Is On The Way!',
        html: `
            <h2>Hello ${data.customerName},</h2>
            <p>Great news! Your shipment has departed and is now in transit.</p>
            
            <h3>Shipment Details:</h3>
            <ul>
                <li><strong>Tracking Number:</strong> ${data.trackingNumber}</li>
                <li><strong>Transport Mode:</strong> ${data.transportMode}</li>
                <li><strong>Estimated Arrival:</strong> ${data.estimatedArrival}</li>
            </ul>
            
            <p>
                <a href="${data.trackingUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Track Your Shipment
                </a>
            </p>
            
            <p>We'll keep you updated on the progress!</p>
        `
    })
};