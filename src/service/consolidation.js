const ConsolidationQueue = require('../models/consolidationQueueModel');

exports.addToConsolidationQueue = async (shipment, warehouseId, userId) => {

    // 🔥 NEW STRUCTURE SUPPORT
    const shipmentType = shipment.shipmentType || shipment.shipmentClassification?.mainType;
    const shipmentSubType = shipment.shipmentSubType || shipment.shipmentClassification?.subType;

    if (!shipmentType || !shipmentSubType) {
        throw new Error("Shipment type or subtype missing. Cannot generate consolidation group.");
    }

    const existing = await ConsolidationQueue.findOne({
        shipmentId: shipment._id,
        status: { $in: ['pending', 'assigned'] }
    });

    if (existing) return existing;

    const queueItem = await ConsolidationQueue.create({
        shipmentId: shipment._id,
        warehouseId,
        customerId: shipment.customerId,
        trackingNumber: shipment.trackingNumber,

        origin: shipment.shipmentDetails?.origin || shipment.origin,
        destination: shipment.shipmentDetails?.destination || shipment.destination,
        destinationCountry: shipment.receiver?.address?.country,

        shipmentType,
        shipmentSubType,

        totalWeight: shipment.shipmentDetails?.totalWeight || shipment.totalWeight,
        totalVolume: shipment.shipmentDetails?.totalVolume || shipment.totalVolume,
        totalPackages: shipment.shipmentDetails?.totalPackages || shipment.totalPackages,

        addedBy: userId
    });

    return queueItem;
};