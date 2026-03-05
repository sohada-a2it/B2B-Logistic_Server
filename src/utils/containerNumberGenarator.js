// utils/generators.js

/**
 * Generate container number based on type
 * @param {string} type - Container type (20ft, 40ft, 40ft HC, etc.)
 * @returns {string} Generated container number
 */
exports.generateContainerNumber = (type = '20ft') => {
    const prefixes = {
        '20ft': 'MSKU',
        '40ft': 'SCXU',
        '40ft HC': 'HJCU',
        '45ft': 'TGHU',
        'LCL': 'LCL'
    };
    
    const prefix = prefixes[type] || 'CNTR';
    const year = new Date().getFullYear().toString().slice(-2);
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    
    // Format: PREFIX + YYMM + 6-digit random
    // Example: MSKU2403123456
    return `${prefix}${year}${month}${random}`;
};

/**
 * Generate unique seal number
 * @returns {string} Generated seal number
 */
exports.generateSealNumber = () => {
    const year = new Date().getFullYear().toString().slice(-2);
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const day = String(new Date().getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    
    // Format: YYMMDD + 5-digit random
    // Example: 24031512345
    return `${year}${month}${day}${random}`;
};

/**
 * Generate consolidation number
 * @param {string} mainType - Main shipment type
 * @param {string} destination - Destination
 * @returns {string} Generated consolidation number
 */
exports.generateConsolidationNumber = (mainType, destination) => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    
    const typeCode = {
        'sea_freight': 'SEA',
        'air_freight': 'AIR',
        'inland_trucking': 'INL',
        'multimodal': 'MLT'
    }[mainType] || 'GEN';
    
    const destCode = destination?.substring(0, 3).toUpperCase() || 'INT';
    
    // Format: CN-YYYYMM-TYPE-DEST-RANDOM
    // Example: CN-202403-SEA-USA-123
    return `CN-${year}${month}-${typeCode}-${destCode}-${random}`;
};

/**
 * Validate if container number is unique
 * @param {string} containerNumber - Container number to check
 * @param {Model} model - Mongoose model to check against
 * @returns {Promise<boolean>} True if unique
 */
exports.isContainerNumberUnique = async (containerNumber, model) => {
    const existing = await model.findOne({ containerNumber });
    return !existing;
};

/**
 * Generate unique container number (with uniqueness check)
 * @param {string} type - Container type
 * @param {Model} model - Mongoose model
 * @returns {Promise<string>} Unique container number
 */
exports.generateUniqueContainerNumber = async (type, model) => {
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
        const containerNumber = exports.generateContainerNumber(type);
        const isUnique = await exports.isContainerNumberUnique(containerNumber, model);
        
        if (isUnique) {
            return containerNumber;
        }
        
        attempts++;
    }
    
    // Fallback: add timestamp
    return `${exports.generateContainerNumber(type)}-${Date.now()}`;
};