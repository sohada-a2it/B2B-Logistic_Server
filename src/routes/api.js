const express = require("express");
const router = express.Router();
const userController = require("../controller/userController"); 
const { protect, adminOnly } = require("../middleware/AuthVerifyMiddleWare"); 
const bookingController = require('../controller/bookingController');
const shipmentController = require('../controller/shipmentController');
const { body } = require('express-validator');
// ==================== PUBLIC ROUTES (No Authentication Needed) ==================== 
router.post("/login", userController.loginUser);  //all roles can login through this route
router.post("/customer/register", userController.registerCustomerAndSendOTP);  // customer  
router.post("/customer/verify-otp", userController.verifyCustomerOTP); 
router.post("/customer/resend-otp", userController.resendOTP);  
router.post("/admin/setup", userController.createAdmin); //Initial Admin Setup(First Time Only) 
router.post("/forgot-password", userController.forgotPassword); // Password reset (All Roles)
router.post("/reset-password", userController.resetPassword);  // Password reset (All Roles)       

// ==================== PROTECTED ROUTES (Authentication Needed) ====================
// COMMON ROUTES (All Authenticated Users)
router.get("/getUserprofile", protect, userController.getUserProfile);
router.put("/updateUserprofile", protect, userController.updateProfile);
router.post("/change-password", protect, userController.changePassword);
router.post("/logout", protect, userController.logoutUser);

// ==================== ADMIN ONLY ROUTES ====================
// Staff Management
router.post("/admin/staff/create", protect, adminOnly, userController.createStaff);

// User Management
router.get("/admin/users", protect, adminOnly, userController.getAllUsers);
router.get("/admin/users/role/:role", protect, adminOnly, userController.getUsersByRole);
router.get("/admin/getUsers/:userId", protect, adminOnly, userController.getUserById);
router.put("/admin/updateUsers/:userId", protect, adminOnly, userController.updateUser);
router.delete("/admin/users/:userId", protect, adminOnly, userController.deleteUser);

// booking
// Validation rules for creating/updating booking
// ==================== Validation rules ====================
const bookingValidationRules = [
    body('shipmentDetails.shipmentType')
        .isIn(['air_freight', 'sea_freight', 'express_courier'])
        .withMessage('Invalid shipment type'),
    body('shipmentDetails.origin')
        .isIn(['China Warehouse', 'Thailand Warehouse'])
        .withMessage('Invalid origin'),
    body('shipmentDetails.destination')
        .isIn(['USA', 'UK', 'Canada'])
        .withMessage('Invalid destination'),
    body('deliveryAddress.consigneeName')
        .notEmpty()
        .withMessage('Consignee name is required'),
    body('deliveryAddress.addressLine1')
        .notEmpty()
        .withMessage('Delivery address is required'),
    body('shipmentDetails.cargoDetails')
        .isArray({ min: 1 })
        .withMessage('At least one cargo item is required')
];

// ==================== Public Routes ==================== 
router.get('/booking/:trackingNumber', bookingController.trackBooking); 
// ==================== Protected Routes ====================  
router.get('/all-bookings',protect ,bookingController.getBookings); 
router.post('/create-bookings',protect, bookingValidationRules, bookingController.createBooking);   
router.get('/stats/dashboard',protect, adminOnly, bookingController.getBookingStats); 
router.post('/bulk-booking-update',protect, adminOnly, bookingController.bulkUpdateBookings);  
router.get('/getBooking-by-id/:id',protect, bookingController.getBookingById);
router.put('/updateBooking-by-id/:id',protect, adminOnly, bookingController.updateBooking);
router.delete('/booking/:id/hard-delete', protect, adminOnly, bookingController.hardDeleteBooking);
router.delete('/booking/bulk-hard-delete', protect, adminOnly, bookingController.bulkHardDeleteBookings);

// Soft delete and restore routes
router.delete('/booking/:id', protect, bookingController.deleteBooking); // Soft delete
router.post('/booking/:id/restore', protect, bookingController.restoreBooking);
router.get('/booking/deleted/trash', protect, bookingController.getDeletedBookings);
router.delete('/booking/empty-trash', protect, adminOnly, bookingController.emptyTrash);
router.patch('/booking/:id/status',protect, adminOnly, bookingController.updateBookingStatus); 
router.post('/booking/:id/assign',protect, adminOnly, bookingController.assignBooking); 
router.post('/booking/:id/notes',protect, bookingController.addBookingNote); 
router.post('/booking/:id/cancel',protect, bookingController.cancelBooking); 
router.get('/booking/:id/timeline',protect, bookingController.getBookingTimeline);
 
// shipment
// ==================== PUBLIC ROUTES ==================== 
router.get('/shipping/:trackingNumber',protect, shipmentController.trackShipment);  
router.get('/shipping/stats/dashboard',protect, adminOnly, shipmentController.getShipmentStats); 
router.get('/getshipping/',protect, shipmentController.getAllShipments);  
router.post('/createShipment',protect, adminOnly, shipmentController.createShipment);  
router.get('/shipping/:id', shipmentController.getShipmentById);
router.put('/shipping/:id', adminOnly, shipmentController.updateShipment);
router.delete('/shipping/:id', adminOnly, shipmentController.deleteShipment); 
router.patch('/shipping/:id/status', adminOnly, shipmentController.updateShipmentStatus); 
router.post('/shipping/:id/tracking', adminOnly, shipmentController.addTrackingUpdate); 
router.post('/shipping/:id/costs',protect, adminOnly, shipmentController.addCost); 
router.post('/shipping/:id/assign',protect, adminOnly, shipmentController.assignShipment); 
router.post('/shipping/:id/documents',protect, adminOnly, shipmentController.addDocument); 
router.post('/shipping/:id/notes/internal',protect, adminOnly, shipmentController.addInternalNote);
router.post('/shipping/:id/notes/customer',protect, shipmentController.addCustomerNote); 
router.get('/shipping/:id/timeline',protect, shipmentController.getShipmentTimeline); 
router.post('/shipping/:id/cancel',protect, shipmentController.cancelShipment);
module.exports = router;