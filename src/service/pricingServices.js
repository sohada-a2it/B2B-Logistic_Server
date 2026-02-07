const { PRODUCT_TYPES, COUNTRIES } = require('../constants/productConstants');

exports.calculateShippingCost = (bookingData) => {
  return calculateProductBasedCharges(bookingData);
};

const calculateProductBasedCharges = (bookingData) => {
  let charges = {
    handlingFee: 150,
    warehouseFee: 0,
    insuranceFee: 0,
    otherCharges: 0,
    pickupFee: 0,
    deliveryFee: 0
  };
  
  // Base freight calculation
  const baseRatePerKg = {
    'AIR_FREIGHT': 5.5,
    'SEA_FREIGHT': 1.2,
    'EXPRESS_COURIER': 8.0
  };
  
  const baseRatePerCbm = {
    'AIR_FREIGHT': 1800,
    'SEA_FREIGHT': 120,
    'EXPRESS_COURIER': 2200
  };
  
  const freightByWeight = bookingData.totalWeight * baseRatePerKg[bookingData.shipmentType];
  const freightByVolume = bookingData.totalVolume * baseRatePerCbm[bookingData.shipmentType];
  
  // Use whichever is higher (chargeable weight)
  const freightCost = Math.max(freightByWeight, freightByVolume);
  
  // Product type based surcharges
  switch (bookingData.productType) {
    case 'HAZARDOUS':
      charges.handlingFee += 200;
      charges.insuranceFee = bookingData.totalValue ? bookingData.totalValue * 0.02 : freightCost * 0.1;
      charges.otherCharges += 100; // DG handling
      break;
    case 'TEMPERATURE_CONTROLLED':
      charges.warehouseFee += 300;
      charges.otherCharges += 150; // Temperature monitoring
      break;
    case 'FRAGILE':
      charges.handlingFee += 100;
      break;
    case 'HIGH_VALUE':
      charges.insuranceFee = bookingData.totalValue ? bookingData.totalValue * 0.015 : freightCost * 0.08;
      break;
    case 'OVERSIZED':
      charges.handlingFee += 250;
      break;
    case 'PERISHABLE':
      charges.warehouseFee += 200;
      charges.otherCharges += 100; // Expedited handling
      break;
  }
  
  // Package type based charges
  switch (bookingData.packageType) {
    case 'WOODEN_CRATE':
      charges.otherCharges += 50;
      break;
    case 'PALLET':
      charges.warehouseFee += 25;
      break;
    case 'DRUM':
      charges.handlingFee += 75;
      break;
    case 'CYLINDER':
      charges.handlingFee += 60;
      break;
  }
  
  // Route based surcharges
  const routeSurcharge = {
    'CHINA_USA': 1.0,
    'CHINA_UK': 1.1,
    'CHINA_CANADA': 1.05,
    'THAILAND_USA': 1.05,
    'THAILAND_UK': 1.0,
    'THAILAND_CANADA': 1.0
  };
  
  const routeKey = `${bookingData.originCountry}_${bookingData.destinationCountry}`;
  const routeMultiplier = routeSurcharge[routeKey] || 1.0;
  
  // Pickup and delivery charges
  if (bookingData.pickupRequired) {
    charges.pickupFee = 75;
  }
  
  if (bookingData.deliveryRequired) {
    charges.deliveryFee = 100;
  }
  
  // Customs fee (fixed percentage)
  const customsFee = freightCost * 0.08;
  
  // Calculate total
  const totalAmount = freightCost * routeMultiplier +
    charges.handlingFee +
    charges.warehouseFee +
    charges.insuranceFee +
    customsFee +
    charges.pickupFee +
    charges.deliveryFee +
    charges.otherCharges -
    (bookingData.discount || 0);
  
  return {
    freightCost: parseFloat((freightCost * routeMultiplier).toFixed(2)),
    handlingFee: charges.handlingFee,
    warehouseFee: charges.warehouseFee,
    customsFee: parseFloat(customsFee.toFixed(2)),
    insuranceFee: parseFloat(charges.insuranceFee.toFixed(2)),
    pickupFee: charges.pickupFee,
    deliveryFee: charges.deliveryFee,
    otherCharges: charges.otherCharges,
    discount: bookingData.discount || 0,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    currency: bookingData.currency || 'USD'
  };
};

// Additional pricing utilities
exports.calculateChargeableWeight = (weight, volume) => {
  // For air freight: 1 CBM = 167 kg
  // For sea freight: 1 CBM = 1000 kg
  const chargeableWeight = Math.max(weight, volume * 167); // Using air freight ratio
  return parseFloat(chargeableWeight.toFixed(2));
};

exports.getFuelSurcharge = (shipmentType) => {
  const surcharges = {
    'AIR_FREIGHT': 0.12, // 12%
    'SEA_FREIGHT': 0.08, // 8%
    'EXPRESS_COURIER': 0.15 // 15%
  };
  return surcharges[shipmentType] || 0.1;
};

exports.calculateInsurance = (declaredValue, productType) => {
  let insuranceRate = 0.005; // 0.5% default
  
  if (productType === 'HAZARDOUS') insuranceRate = 0.02; // 2%
  if (productType === 'HIGH_VALUE') insuranceRate = 0.015; // 1.5%
  if (productType === 'FRAGILE') insuranceRate = 0.008; // 0.8%
  
  return declaredValue * insuranceRate;
};

module.exports.calculateProductBasedCharges = calculateProductBasedCharges;