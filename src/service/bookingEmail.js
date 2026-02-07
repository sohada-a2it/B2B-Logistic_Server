const nodemailer = require('nodemailer');
const { SHIPMENT_TYPES, SHIPMENT_STATUS } = require('../constants/productConstants');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

exports.sendBookingConfirmation = async ({ booking, customer, charges }) => {
  try {
    const mailOptions = {
      from: `"Logistics System" <${process.env.SMTP_USER}>`,
      to: customer.email,
      subject: `Booking Confirmation: ${booking.bookingNumber}`,
      html: generateBookingConfirmationEmail(booking, customer, charges)
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`Booking confirmation email sent to ${customer.email}`);
  } catch (error) {
    console.error('Error sending booking confirmation email:', error);
    // Don't throw error - email failure shouldn't stop booking creation
  }
};

exports.sendQuotationEmail = async ({ to, quotation, customerName }) => {
  try {
    const mailOptions = {
      from: `"Logistics System" <${process.env.SMTP_USER}>`,
      to: to,
      subject: `Quotation: ${quotation.quotationNumber}`,
      html: generateQuotationEmail(quotation, customerName)
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`Quotation email sent to ${to}`);
  } catch (error) {
    console.error('Error sending quotation email:', error);
  }
};

exports.sendStatusUpdateEmail = async ({ 
  to, 
  bookingNumber, 
  trackingNumber, 
  status, 
  previousStatus, 
  notes,
  estimatedArrival 
}) => {
  try {
    const mailOptions = {
      from: `"Logistics System" <${process.env.SMTP_USER}>`,
      to: to,
      subject: `Status Update: ${bookingNumber}`,
      html: generateStatusUpdateEmail(
        bookingNumber, 
        trackingNumber, 
        status, 
        previousStatus, 
        notes,
        estimatedArrival
      )
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`Status update email sent to ${to}`);
  } catch (error) {
    console.error('Error sending status update email:', error);
  }
};

exports.sendInvoiceEmail = async ({ to, invoice, booking }) => {
  try {
    const mailOptions = {
      from: `"Logistics System" <${process.env.SMTP_USER}>`,
      to: to,
      subject: `Invoice: ${invoice.invoiceNumber}`,
      html: generateInvoiceEmail(invoice, booking)
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`Invoice email sent to ${to}`);
  } catch (error) {
    console.error('Error sending invoice email:', error);
  }
};

// Email template generators
const generateBookingConfirmationEmail = (booking, customer, charges) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007bff; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .details { background: #f8f9fa; padding: 15px; border-radius: 5px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        .status-badge { 
          display: inline-block; 
          padding: 5px 10px; 
          background: #28a745; 
          color: white; 
          border-radius: 15px; 
          font-size: 12px; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Confirmation</h1>
        </div>
        <div class="content">
          <p>Dear ${customer.contactPerson},</p>
          <p>Your booking has been successfully created. Here are the details:</p>
          
          <div class="details">
            <h3>Booking Details</h3>
            <p><strong>Booking Number:</strong> ${booking.bookingNumber}</p>
            <p><strong>Tracking Number:</strong> ${booking.trackingNumber}</p>
            <p><strong>Status:</strong> <span class="status-badge">${SHIPMENT_STATUS[booking.status]}</span></p>
            
            <h3>Shipment Details</h3>
            <p><strong>Shipment Type:</strong> ${SHIPMENT_TYPES[booking.shipmentType]}</p>
            <p><strong>From:</strong> ${booking.originCity}, ${booking.originCountry}</p>
            <p><strong>To:</strong> ${booking.destinationCity}, ${booking.destinationCountry}</p>
            
            <h3>Financial Summary</h3>
            <p><strong>Total Amount:</strong> ${booking.currency} ${booking.totalAmount.toFixed(2)}</p>
            <p><strong>Payment Status:</strong> ${booking.paymentStatus}</p>
          </div>
          
          <p>You can track your shipment using this tracking number: <strong>${booking.trackingNumber}</strong></p>
          
          <p>Thank you for choosing our services!</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
          <p>&copy; ${new Date().getFullYear()} Logistics System. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const generateQuotationEmail = (quotation, customerName) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #17a2b8; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th, .table td { padding: 10px; border: 1px solid #ddd; text-align: left; }
        .table th { background: #f8f9fa; }
        .total { font-weight: bold; font-size: 18px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Shipping Quotation</h1>
        </div>
        <div class="content">
          <p>Dear ${customerName},</p>
          <p>Please find below your shipping quotation:</p>
          
          <table class="table">
            <tr>
              <th>Quotation Number</th>
              <td>${quotation.quotationNumber}</td>
            </tr>
            <tr>
              <th>Valid Until</th>
              <td>${new Date(quotation.expiryDate).toLocaleDateString()}</td>
            </tr>
            <tr>
              <th>Freight Cost</th>
              <td>${quotation.currency} ${quotation.freightCost.toFixed(2)}</td>
            </tr>
            <tr>
              <th>Handling Fee</th>
              <td>${quotation.currency} ${quotation.handlingFee.toFixed(2)}</td>
            </tr>
            <tr>
              <th>Customs Fee</th>
              <td>${quotation.currency} ${quotation.customsFee.toFixed(2)}</td>
            </tr>
            <tr>
              <th>Insurance</th>
              <td>${quotation.currency} ${quotation.insuranceFee.toFixed(2)}</td>
            </tr>
            <tr>
              <th class="total">Total Amount</th>
              <td class="total">${quotation.currency} ${quotation.totalAmount.toFixed(2)}</td>
            </tr>
          </table>
          
          <p>This quotation is valid until ${new Date(quotation.expiryDate).toLocaleDateString()}.</p>
          <p>To proceed with this quotation, please reply to this email or contact our sales team.</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
          <p>&copy; ${new Date().getFullYear()} Logistics System. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const generateStatusUpdateEmail = (bookingNumber, trackingNumber, status, previousStatus, notes, estimatedArrival) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #6c757d; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .status-update { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .status-badge { 
          display: inline-block; 
          padding: 8px 15px; 
          background: #007bff; 
          color: white; 
          border-radius: 20px; 
          font-weight: bold; 
          margin: 5px 0; 
        }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Shipment Status Update</h1>
        </div>
        <div class="content">
          <p>Your shipment status has been updated.</p>
          
          <div class="status-update">
            <p><strong>Booking Number:</strong> ${bookingNumber}</p>
            <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
            <p><strong>Previous Status:</strong> ${SHIPMENT_STATUS[previousStatus] || previousStatus}</p>
            <p><strong>New Status:</strong> <span class="status-badge">${SHIPMENT_STATUS[status] || status}</span></p>
            ${estimatedArrival ? `<p><strong>Estimated Arrival:</strong> ${new Date(estimatedArrival).toLocaleDateString()}</p>` : ''}
            ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
          </div>
          
          <p>You can track your shipment using this link: 
            <a href="${process.env.APP_URL}/track/${trackingNumber}">Track Shipment</a>
          </p>
          
          <p>Thank you for choosing our services!</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
          <p>&copy; ${new Date().getFullYear()} Logistics System. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const generateInvoiceEmail = (invoice, booking) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th, .table td { padding: 10px; border: 1px solid #ddd; text-align: left; }
        .table th { background: #f8f9fa; }
        .total { font-weight: bold; font-size: 18px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Invoice</h1>
        </div>
        <div class="content">
          <p>Dear Valued Customer,</p>
          <p>Please find attached your invoice for the below shipment:</p>
          
          <table class="table">
            <tr>
              <th>Invoice Number</th>
              <td>${invoice.invoiceNumber}</td>
            </tr>
            <tr>
              <th>Booking Number</th>
              <td>${booking.bookingNumber}</td>
            </tr>
            <tr>
              <th>Tracking Number</th>
              <td>${booking.trackingNumber}</td>
            </tr>
            <tr>
              <th>Invoice Date</th>
              <td>${new Date(invoice.createdAt).toLocaleDateString()}</td>
            </tr>
            <tr>
              <th>Due Date</th>
              <td>${new Date(invoice.dueDate).toLocaleDateString()}</td>
            </tr>
            <tr>
              <th class="total">Total Amount Due</th>
              <td class="total">${invoice.currency} ${invoice.totalAmount.toFixed(2)}</td>
            </tr>
          </table>
          
          <p>Please make payment by ${new Date(invoice.dueDate).toLocaleDateString()}.</p>
          <p>Payment can be made via bank transfer or credit card through our portal.</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
          <p>&copy; ${new Date().getFullYear()} Logistics System. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};