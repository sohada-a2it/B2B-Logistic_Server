// utils/trackingGenerator.js

const Booking = require('../models/bookingModel');
const Shipment = require('../models/shipmentModel');

const generateTrackingNumber = async () => {
    try {
        const prefix = 'CLC-';
        
        // Simple random generator
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        
        // Generate: CLC + 2 letters + 4 numbers + 2 letters
        // Example: CLC AB 1234 XY
        
        let trackingNumber = prefix;
        
        // Add 2 random letters
        for (let i = 0; i < 2; i++) {
            trackingNumber += letters[Math.floor(Math.random() * letters.length)];
        }
        
        // Add 4 random numbers
        for (let i = 0; i < 4; i++) {
            trackingNumber += numbers[Math.floor(Math.random() * numbers.length)];
        }
        
        // Add 2 random letters
        for (let i = 0; i < 2; i++) {
            trackingNumber += letters[Math.floor(Math.random() * letters.length)];
        }
        
        console.log('Generated tracking:', trackingNumber);
        
        // Check if exists
        const existingBooking = await Booking.findOne({ trackingNumber });
        const existingShipment = await Shipment.findOne({ trackingNumber });
        
        if (!existingBooking && !existingShipment) {
            return trackingNumber;
        }
        
        // If exists, try again
        console.log('Duplicate found, retrying...');
        return generateTrackingNumber();
        
    } catch (error) {
        console.error('Error:', error);
        return `CLC-${Date.now()}`;
    }
};

module.exports = {
    generateTrackingNumber
};