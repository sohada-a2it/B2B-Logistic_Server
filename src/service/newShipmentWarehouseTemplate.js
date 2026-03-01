// utils/emailTemplates/newShipmentWarehouseTemplate.js

const newShipmentWarehouseTemplate = (data) => {
    const {
        trackingNumber,
        customerName,
        origin,
        destination,
        packages,
        totalWeight,
        totalVolume,
        shipmentType,
        bookingNumber,
        expectedDate,
        shipmentUrl,
        warehouseDashboardUrl
    } = data;

    // Format shipment type for display
    const shipmentTypeDisplay = {
        air_freight: 'Air Freight',
        sea_freight: 'Sea Freight',
        road_freight: 'Road Freight',
        rail_freight: 'Rail Freight'
    }[shipmentType] || shipmentType;

    return {
        subject: `📦 New Shipment Ready for Warehouse - ${trackingNumber}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                    }
                    .header {
                        background-color: #2563eb;
                        color: white;
                        padding: 20px;
                        text-align: center;
                        border-radius: 8px 8px 0 0;
                    }
                    .content {
                        background-color: #f9fafb;
                        padding: 30px;
                        border: 1px solid #e5e7eb;
                        border-top: none;
                        border-radius: 0 0 8px 8px;
                    }
                    .shipment-details {
                        background-color: white;
                        padding: 20px;
                        border-radius: 8px;
                        margin: 20px 0;
                        border: 1px solid #e5e7eb;
                    }
                    .detail-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 10px 0;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    .detail-row:last-child {
                        border-bottom: none;
                    }
                    .label {
                        font-weight: bold;
                        color: #4b5563;
                    }
                    .value {
                        color: #1f2937;
                    }
                    .badge {
                        background-color: #dbeafe;
                        color: #1e40af;
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 14px;
                        display: inline-block;
                    }
                    .button {
                        background-color: #2563eb;
                        color: white;
                        padding: 12px 24px;
                        text-decoration: none;
                        border-radius: 6px;
                        display: inline-block;
                        margin: 10px 5px;
                        font-weight: bold;
                    }
                    .button:hover {
                        background-color: #1d4ed8;
                    }
                    .button-secondary {
                        background-color: #10b981;
                    }
                    .footer {
                        margin-top: 30px;
                        text-align: center;
                        color: #6b7280;
                        font-size: 14px;
                    }
                    .highlight {
                        background-color: #fef3c7;
                        padding: 15px;
                        border-radius: 8px;
                        border-left: 4px solid #f59e0b;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📦 New Shipment Ready for Processing</h1>
                </div>
                
                <div class="content">
                    <p>Hello Warehouse Team,</p>
                    
                    <p>A new shipment has been confirmed and is ready for warehouse receipt. Please process this shipment at your earliest convenience.</p>
                    
                    <div class="badge">Priority: Standard</div>
                    
                    <div class="shipment-details">
                        <h2 style="margin-top: 0; color: #2563eb;">Shipment Details</h2>
                        
                        <div class="detail-row">
                            <span class="label">Tracking Number:</span>
                            <span class="value"><strong>${trackingNumber}</strong></span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="label">Booking Number:</span>
                            <span class="value">${bookingNumber || 'N/A'}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="label">Customer:</span>
                            <span class="value">${customerName}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="label">Shipment Type:</span>
                            <span class="value">${shipmentTypeDisplay}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="label">Origin:</span>
                            <span class="value">${origin}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="label">Destination:</span>
                            <span class="value">${destination}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="label">Expected at Warehouse:</span>
                            <span class="value">${expectedDate}</span>
                        </div>
                    </div>
                    
                    <div class="shipment-details">
                        <h2 style="margin-top: 0; color: #2563eb;">Cargo Details</h2>
                        
                        <div class="detail-row">
                            <span class="label">Total Packages:</span>
                            <span class="value"><strong>${packages}</strong> cartons</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="label">Total Weight:</span>
                            <span class="value"><strong>${totalWeight}</strong> kg</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="label">Total Volume:</span>
                            <span class="value"><strong>${totalVolume}</strong> cbm</span>
                        </div>
                    </div>
                    
                    <div class="highlight">
                        <p style="margin: 0; font-weight: bold;">⚠️ Required Actions:</p>
                        <ul style="margin-bottom: 0;">
                            <li>Schedule receiving slot</li>
                            <li>Prepare warehouse space</li>
                            <li>Arrange inspection team</li>
                            <li>Update WMS when received</li>
                        </ul>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${shipmentUrl}" class="button">🔍 View Shipment Details</a>
                        <a href="${warehouseDashboardUrl}" class="button button-secondary">📊 Go to Warehouse Dashboard</a>
                    </div>
                    
                    <div style="background-color: #e6f7ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; color: #0066cc;">
                            <strong>📋 Quick Actions:</strong><br>
                            • Click "View Shipment Details" to process this shipment<br>
                            • Update status to "Received at Warehouse" when cargo arrives<br>
                            • Complete inspection within 24 hours of receipt<br>
                            • Notify operations when ready for consolidation
                        </p>
                    </div>
                    
                    <div class="footer">
                        <p>This is an automated notification from Cargo Logistics Warehouse Management System.</p>
                        <p>© ${new Date().getFullYear()} Cargo Logistics. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };
};

module.exports = newShipmentWarehouseTemplate;