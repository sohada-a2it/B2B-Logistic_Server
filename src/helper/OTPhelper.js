const nodemailer = require("nodemailer");

const createTransporter = () => {
  // Development mode: Use console log instead of real email
  if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_USER) {
    return {
      sendMail: async (mailOptions) => {
        console.log("\n" + "=".repeat(50));
        console.log("📧 DEVELOPMENT MODE: EMAIL WOULD BE SENT");
        console.log("=".repeat(50));
        console.log("To:", mailOptions.to);
        console.log("Subject:", mailOptions.subject);
        console.log("OTP:", mailOptions.html.match(/\b\d{6}\b/)?.[0] || "Not found");
        console.log("-".repeat(50));
        return { messageId: "dev-mode" };
      }
    };
  }
  
  // Production mode: Send real email
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send Registration OTP Email
const sendRegistrationOTPEmail = async (email, otp, name = "User") => {
  try {
    const transporter = createTransporter();
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Registration OTP</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px; background: #f9f9f9; }
          .otp-box { 
            background: #fff; 
            padding: 20px; 
            text-align: center; 
            font-size: 32px; 
            font-weight: bold; 
            letter-spacing: 10px; 
            margin: 20px 0;
            border: 2px dashed #4CAF50;
            border-radius: 10px;
          }
          .footer { 
            margin-top: 20px; 
            padding: 15px; 
            background: #eee; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Complete Your Registration</h1>
          </div>
          <div class="content">
            <p>Hello <strong>${name}</strong>,</p>
            <p>Thank you for registering with us! Please use the OTP below to complete your registration:</p>
            
            <div class="otp-box">
              ${otp}
            </div>
            
            <p>This OTP will expire in <strong>10 minutes</strong>.</p>
            <p>If you didn't request this registration, please ignore this email.</p>
            <p style="color: red; font-weight: bold;">⚠️ Do not share this OTP with anyone.</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} Your App Name. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const mailOptions = {
      from: `"Your App" <${process.env.EMAIL_USER || "noreply@yourapp.com"}>`,
      to: email,
      subject: 'Your Registration OTP Code',
      html: html
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log(`Registration OTP sent to ${email}`);
    return true;
    
  } catch (error) {
    console.error("Error sending registration OTP email:", error);
    // In development, don't fail if email doesn't send
    if (process.env.NODE_ENV === 'development') {
      console.log(`DEV: OTP for ${email} is: ${otp}`);
      return true;
    }
    throw new Error("Failed to send OTP email");
  }
};

// Send Password Reset OTP Email
const sendPasswordResetOTPEmail = async (email, otp, name = "User") => {
  try {
    const transporter = createTransporter();
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; text-align: center;">Password Reset OTP</h2>
        <p>Hello ${name},</p>
        <p>Use this OTP to reset your password:</p>
        <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; margin: 20px 0;">
          ${otp}
        </div>
        <p>This OTP expires in 10 minutes.</p>
      </div>
    `;
    
    const mailOptions = {
      from: `"Your App" <${process.env.EMAIL_USER || "noreply@yourapp.com"}>`,
      to: email,
      subject: 'Password Reset OTP',
      html: html
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`Password reset OTP sent to ${email}`);
    return true;
    
  } catch (error) {
    console.error("Error sending password reset OTP email:", error);
    throw error;
  }
};

// Send Welcome Email
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"Your App" <${process.env.EMAIL_USER || "noreply@yourapp.com"}>`,
      to: email,
      subject: 'Welcome to Our Platform! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">Welcome ${name}!</h2>
          <p>Your account has been successfully verified and is now active.</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email}`);
    
  } catch (error) {
    console.error("Error sending welcome email:", error);
    // Don't throw error for welcome email
  }
};

module.exports = {
  sendRegistrationOTPEmail,
  sendPasswordResetOTPEmail,
  sendWelcomeEmail
};