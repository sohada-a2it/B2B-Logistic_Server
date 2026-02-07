const Booking = require('../models/bookingModel');

exports.generateBookingNumber = async (shipmentType) => {
  const prefix = {
    'AIR_FREIGHT': 'AB',
    'SEA_FREIGHT': 'SB',
    'EXPRESS_COURIER': 'EB'
  }[shipmentType] || 'GB';
  
  const year = new Date().getFullYear().toString().slice(-2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
  
  const lastBooking = await Booking.findOne({
    bookingNumber: new RegExp(`^${prefix}${year}${month}`)
  }).sort({ bookingNumber: -1 });
  
  let sequence = 1;
  if (lastBooking && lastBooking.bookingNumber) {
    const lastSeq = parseInt(lastBooking.bookingNumber.slice(-4)) || 0;
    sequence = lastSeq + 1;
  }
  
  return `${prefix}${year}${month}${sequence.toString().padStart(4, '0')}`;
};